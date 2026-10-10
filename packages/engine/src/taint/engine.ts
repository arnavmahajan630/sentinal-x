import type { FileRow } from '../indexer/load';
import type {
  CallIR,
  FileIR,
  FnIR,
  InputIR,
  InputSource,
  LinkedCall,
  Loc,
  MongoOpIR,
  ResponseIR,
  ValueSrc,
} from '../indexer/types';
import { isSanitizerExpression, isSanitizerName } from '../indexer/context';

export interface TaintHop {
  fnId: string;
  fnName: string;
  via: string;
  loc?: Loc;
  sanitized?: boolean;
  sanitizer?: string;
}

export interface TaintSink {
  kind: 'model' | 'response' | 'eval' | 'child_process';
  target: string;
  op: string;
  fnId: string;
  argSources: string[];
  queryShape?: unknown;
  select?: string[];
  loc?: Loc;
}

export interface TaintFlow {
  inputId: string;
  canonical: string;
  source: InputSource;
  path: string;
  hops: TaintHop[];
  sink: TaintSink;
  status: 'tainted' | 'possible' | 'sanitized';
  sanitizer?: string;
}

export interface FnEdgeTaint {
  fromFnId: string;
  toFnId: string;
  argSources: string[];
  via: string;
  tainted: boolean;
  possible: boolean;
  sanitized: boolean;
  sanitizer?: string;
  line?: number;
}

export interface SinkEdgeTaint {
  fnId: string;
  sinkType: 'model' | 'response' | 'eval' | 'child_process';
  sinkTarget: string;
  op: string;
  argSources: string[];
  queryShape?: unknown;
  tainted: boolean;
  possible: boolean;
  sanitized: boolean;
  sanitizer?: string;
  line?: number;
  col?: number;
}

export interface TaintAnalysisResult {
  flows: TaintFlow[];
  fnEdges: FnEdgeTaint[];
  sinkEdges: SinkEdgeTaint[];
}

export const canonicalOf = (i: InputIR): string =>
  i.canonical ?? `req.${i.source}${i.path ? '.' + i.path : ''}`;

export const DANGEROUS_CALLS = /^(eval|Function|exec|spawn|execSync|execFile|fork)$/;

function leafFnName(fnId: string): string {
  const base = fnId.split('#')[1] ?? fnId;
  return base.split('.').pop()!.replace(/@\d+:\d+$/, '');
}

interface FnContext {
  fn: FnIR;
  file: string;
  calls: LinkedCall[];
  mongoOps: MongoOpIR[];
  responses: ResponseIR[];
}

interface VarState {
  tainted: boolean;
  possible: boolean;
  sanitized: boolean;
  sanitizer?: string;
  originCanonical?: string;
}

export class TaintEngine {
  private fnMap = new Map<string, FnContext>();
  private allInputs: InputIR[] = [];

  constructor(files: FileRow[]) {
    for (const r of files) {
      if (!r.ir) continue;
      this.allInputs.push(...r.ir.inputs);
      const linkedCalls = r.linked?.calls ?? [];
      const callsByFn = new Map<string, LinkedCall[]>();
      for (const c of linkedCalls) {
        callsByFn.set(c.fnId, [...(callsByFn.get(c.fnId) ?? []), c]);
      }
      for (const fn of r.ir.functions) {
        this.fnMap.set(fn.id, {
          fn,
          file: r.path,
          calls: callsByFn.get(fn.id) ?? [],
          mongoOps: r.ir.mongoOps.filter((o) => o.fnId === fn.id),
          responses: r.ir.responses.filter((resp) => resp.fnId === fn.id),
        });
      }
    }
  }

  analyze(): TaintAnalysisResult {
    const flows: TaintFlow[] = [];
    const fnEdges: FnEdgeTaint[] = [];
    const sinkEdges: SinkEdgeTaint[] = [];

    for (const input of this.allInputs) {
      const canonical = canonicalOf(input);
      const entryCtx = this.fnMap.get(input.fnId);
      if (!entryCtx) continue;

      const initialHops: TaintHop[] = [
        {
          fnId: entryCtx.fn.id,
          fnName: leafFnName(entryCtx.fn.id),
          via: input.boundTo.length ? `read (bound to ${input.boundTo.join(', ')})` : 'read',
          loc: input.loc,
        },
      ];

      const initialVarState = new Map<string, VarState>();
      for (const b of input.boundTo) {
        initialVarState.set(b, {
          tainted: true,
          possible: false,
          sanitized: false,
          originCanonical: canonical,
        });
      }

      this.propagate(
        input,
        canonical,
        entryCtx.fn.id,
        initialVarState,
        initialHops,
        false,
        undefined,
        new Set([entryCtx.fn.id]),
        flows,
        fnEdges,
        sinkEdges,
        0,
      );
    }

    return { flows, fnEdges, sinkEdges };
  }

  private propagate(
    input: InputIR,
    canonical: string,
    fnId: string,
    varState: Map<string, VarState>,
    currentHops: TaintHop[],
    pathSanitized: boolean,
    pathSanitizer: string | undefined,
    visited: Set<string>,
    flows: TaintFlow[],
    fnEdges: FnEdgeTaint[],
    sinkEdges: SinkEdgeTaint[],
    depth: number,
  ): void {
    if (depth > 8) return;
    const ctx = this.fnMap.get(fnId);
    if (!ctx) return;

    // 1. Apply local variable assignments & guards in this function
    const localVars = new Map<string, VarState>(varState);

    // If function called a sanitizer guard on a known variable (e.g. validator.isMongoId(id))
    for (const s of ctx.fn.sanitizers ?? []) {
      if (s.target && localVars.has(s.target)) {
        localVars.set(s.target, {
          tainted: false,
          possible: false,
          sanitized: true,
          sanitizer: s.name,
          originCanonical: canonical,
        });
      }
    }

    // Process local variable assignments
    for (const a of ctx.fn.varAssignments ?? []) {
      const state = this.evalValueSrc(a.value, localVars, canonical);
      if (state.tainted || state.possible || state.sanitized) {
        localVars.set(a.varName, state);
      }
    }

    // 2. Check direct Mongo operations in this function
    for (const op of ctx.mongoOps) {
      const opState = this.checkOpTaint(op, localVars, canonical);
      if (opState.reaches) {
        const isSanitized = pathSanitized || opState.sanitized;
        const sanitizer = opState.sanitizer ?? pathSanitizer;
        const status = isSanitized ? 'sanitized' : opState.possible ? 'possible' : 'tainted';

        const sink: TaintSink = {
          kind: 'model',
          target: op.receiver,
          op: op.op,
          fnId,
          argSources: [canonical],
          queryShape: op.queryShape,
          select: op.select,
          loc: op.loc,
        };

        flows.push({
          inputId: input.id,
          canonical,
          source: input.source,
          path: input.path,
          hops: [...currentHops],
          sink,
          status,
          sanitizer,
        });

        sinkEdges.push({
          fnId,
          sinkType: 'model',
          sinkTarget: op.receiver,
          op: op.op,
          argSources: [canonical],
          queryShape: op.queryShape,
          tainted: status === 'tainted',
          possible: status === 'possible',
          sanitized: status === 'sanitized',
          sanitizer,
          line: op.loc.line,
          col: op.loc.col,
        });
      }
    }

    // 3. Check Response sinks in this function (res.send, res.json, res.render)
    for (const resp of ctx.responses) {
      let respReaches = false;
      let respSanitized = false;
      let respSanitizer: string | undefined;

      for (const arg of resp.args) {
        const s = this.evalValueSrc(arg, localVars, canonical);
        if (s.tainted) {
          respReaches = true;
          if (s.sanitized) {
            respSanitized = true;
            respSanitizer = s.sanitizer;
          }
        }
      }

      if (respReaches) {
        const isSanitized = pathSanitized || respSanitized;
        const sanitizer = respSanitizer ?? pathSanitizer;
        const status = isSanitized ? 'sanitized' : 'tainted';
        const sinkName = `res.${resp.method.split('.').pop() ?? 'send'}`;

        flows.push({
          inputId: input.id,
          canonical,
          source: input.source,
          path: input.path,
          hops: [...currentHops],
          sink: {
            kind: 'response',
            target: sinkName,
            op: resp.method,
            fnId,
            argSources: [canonical],
            loc: resp.loc,
          },
          status,
          sanitizer,
        });

        sinkEdges.push({
          fnId,
          sinkType: 'response',
          sinkTarget: sinkName,
          op: resp.method,
          argSources: [canonical],
          tainted: status === 'tainted',
          possible: false,
          sanitized: status === 'sanitized',
          sanitizer,
          line: resp.loc.line,
          col: resp.loc.col,
        });
      }
    }

    // 4. Check Dangerous calls (eval, exec, spawn) in this function
    for (const call of ctx.fn.calls) {
      const isDangerous =
        DANGEROUS_CALLS.test(call.name) ||
        DANGEROUS_CALLS.test(call.callee) ||
        (call.object === 'child_process' && DANGEROUS_CALLS.test(call.name));
      if (!isDangerous) continue;

      let callReaches = false;
      let callSanitized = false;
      let callSanitizer: string | undefined;

      for (const arg of call.args ?? []) {
        const s = this.evalValueSrc(arg, localVars, canonical);
        if (s.tainted) {
          callReaches = true;
          if (s.sanitized) {
            callSanitized = true;
            callSanitizer = s.sanitizer;
          }
        }
      }

      if (callReaches) {
        const isSanitized = pathSanitized || callSanitized;
        const sanitizer = callSanitizer ?? pathSanitizer;
        const status = isSanitized ? 'sanitized' : 'tainted';
        const sinkTarget = call.name === 'eval' ? 'eval' : 'child_process';

        flows.push({
          inputId: input.id,
          canonical,
          source: input.source,
          path: input.path,
          hops: [...currentHops],
          sink: {
            kind: sinkTarget === 'eval' ? 'eval' : 'child_process',
            target: sinkTarget,
            op: call.name,
            fnId,
            argSources: [canonical],
            loc: call.loc,
          },
          status,
          sanitizer,
        });

        sinkEdges.push({
          fnId,
          sinkType: sinkTarget === 'eval' ? 'eval' : 'child_process',
          sinkTarget,
          op: call.name,
          argSources: [canonical],
          tainted: status === 'tainted',
          possible: false,
          sanitized: status === 'sanitized',
          sanitizer,
          line: call.loc.line,
          col: call.loc.col,
        });
      }
    }

    // 5. Inter-procedural propagation: traverse outgoing calls to helper functions
    for (const call of ctx.calls) {
      if (call.resolved.kind !== 'fn') continue;
      const calleeId = call.resolved.fnId;
      if (visited.has(calleeId)) continue;

      const calleeCtx = this.fnMap.get(calleeId);
      if (!calleeCtx) continue;

      // Check which arguments carry taint into callee
      const calleeVarState = new Map<string, VarState>();
      let callReaches = false;
      let callPossible = false;
      let callSanitized = false;
      let callSanitizer: string | undefined;
      let firstArgIndex = 0;

      const args = call.args ?? [];
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        const s = this.evalValueSrc(arg, localVars, canonical);
        if (s.tainted || s.possible || s.sanitized) {
          if (!callReaches) firstArgIndex = i;
          callReaches = true;
          if (s.possible) callPossible = true;
          if (s.sanitized) {
            callSanitized = true;
            callSanitizer = s.sanitizer;
          }
          const paramName = calleeCtx.fn.params[i];
          if (paramName) {
            calleeVarState.set(paramName, s);
          }
        }
      }

      if (!callReaches) continue;

      const edgeSanitized = pathSanitized || callSanitized;
      const edgeSanitizer = callSanitizer ?? pathSanitizer;
      const via = `call arg${firstArgIndex}`;

      fnEdges.push({
        fromFnId: fnId,
        toFnId: calleeId,
        argSources: [canonical],
        via,
        tainted: !edgeSanitized && !callPossible,
        possible: callPossible,
        sanitized: edgeSanitized,
        sanitizer: edgeSanitizer,
        line: call.loc.line,
      });

      const nextHops: TaintHop[] = [
        ...currentHops,
        {
          fnId: calleeId,
          fnName: leafFnName(calleeId),
          via,
          loc: call.loc,
          sanitized: edgeSanitized,
          sanitizer: edgeSanitizer,
        },
      ];

      const nextVisited = new Set(visited);
      nextVisited.add(calleeId);

      this.propagate(
        input,
        canonical,
        calleeId,
        calleeVarState,
        nextHops,
        edgeSanitized,
        edgeSanitizer,
        nextVisited,
        flows,
        fnEdges,
        sinkEdges,
        depth + 1,
      );
    }
  }

  private evalValueSrc(
    v: ValueSrc | undefined,
    localVars: Map<string, VarState>,
    canonical: string,
  ): VarState {
    if (!v) return { tainted: false, possible: false, sanitized: false };

    if (v.sanitized) {
      return {
        tainted: false,
        possible: false,
        sanitized: true,
        sanitizer: v.sanitizer,
        originCanonical: canonical,
      };
    }

    if (v.kind === 'input') {
      const match = `req.${v.source}${v.path ? '.' + v.path : ''}` === canonical;
      return {
        tainted: match && !v.sanitized,
        possible: false,
        sanitized: match && !!v.sanitized,
        sanitizer: v.sanitizer,
        originCanonical: canonical,
      };
    }

    if (v.kind === 'var') {
      const ex = localVars.get(v.name);
      if (ex) return ex;
      return { tainted: false, possible: false, sanitized: false };
    }

    if (v.kind === 'object') {
      let anyTainted = false;
      let anyPossible = false;
      let anySanitized = false;
      let sanitizer: string | undefined;
      for (const val of Object.values(v.keys)) {
        const s = this.evalValueSrc(val, localVars, canonical);
        if (s.tainted) anyTainted = true;
        if (s.possible) anyPossible = true;
        if (s.sanitized) {
          anySanitized = true;
          sanitizer = s.sanitizer;
        }
      }
      return {
        tainted: anyTainted,
        possible: anyPossible,
        sanitized: anySanitized,
        sanitizer,
        originCanonical: canonical,
      };
    }

    if (v.kind === 'spread') {
      const s = this.evalValueSrc(v.of, localVars, canonical);
      return {
        tainted: false,
        possible: s.tainted || s.possible,
        sanitized: s.sanitized,
        sanitizer: s.sanitizer,
        originCanonical: canonical,
      };
    }

    if (v.kind === 'call') {
      const hasInput = (v.inputs ?? []).includes(canonical);
      if (v.sanitized) {
        return {
          tainted: false,
          possible: false,
          sanitized: true,
          sanitizer: v.sanitizer,
          originCanonical: canonical,
        };
      }
      return {
        tainted: false,
        possible: hasInput,
        sanitized: false,
        originCanonical: canonical,
      };
    }

    if (v.kind === 'other') {
      const hasInput = (v.inputs ?? []).includes(canonical);
      return {
        tainted: false,
        possible: hasInput,
        sanitized: false,
        originCanonical: canonical,
      };
    }

    return { tainted: false, possible: false, sanitized: false };
  }

  private checkOpTaint(
    op: MongoOpIR,
    localVars: Map<string, VarState>,
    canonical: string,
  ): { reaches: boolean; possible: boolean; sanitized: boolean; sanitizer?: string } {
    // 1. Direct argSources from IR
    if (op.argSources.includes(canonical)) {
      return { reaches: true, possible: false, sanitized: false };
    }

    // 2. QueryShape or args
    let reaches = false;
    let possible = false;
    let sanitized = false;
    let sanitizer: string | undefined;

    const allArgs = op.queryShape ? [op.queryShape, ...op.args] : op.args;
    for (const a of allArgs) {
      const s = this.evalValueSrc(a, localVars, canonical);
      if (s.tainted || s.possible || s.sanitized) {
        reaches = true;
        if (s.possible) possible = true;
        if (s.sanitized) {
          sanitized = true;
          sanitizer = s.sanitizer;
        }
      }
    }

    return { reaches, possible, sanitized, sanitizer };
  }
}

export function analyzeTaint(files: FileRow[]): TaintAnalysisResult {
  return new TaintEngine(files).analyze();
}
