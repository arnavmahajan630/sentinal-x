import { Node, SyntaxKind } from 'ts-morph';
import type { CallExpression } from 'ts-morph';
import { inputsOf } from '../context';
import type { Ctx } from '../context';
import type { FileIR, ModelFieldIR, MongoOpIR, ValueSrc } from '../types';
import { modelNameOf } from './imports';

const STATIC_OPS = new Set([
  'find',
  'findOne',
  'findById',
  'findByIdAndUpdate',
  'findByIdAndDelete',
  'findByIdAndRemove',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndRemove',
  'findOneAndReplace',
  'update',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'remove',
  'create',
  'insertMany',
  'insertOne',
  'aggregate',
  'countDocuments',
  'estimatedDocumentCount',
  'count',
  'exists',
  'distinct',
  'bulkWrite',
  'findAndModify',
]);
const INSTANCE_OPS = new Set([
  'save',
  'deleteOne',
  'remove',
  'updateOne',
  'replaceOne',
  'populate',
]);
const NOT_MODELS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'Date',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Array',
  'Object',
  'RegExp',
  'URL',
  'URLSearchParams',
  'Buffer',
  'Response',
  'Request',
  'Headers',
  'Function',
  'Proxy',
  'Uint8Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'Schema',
  'Router',
  'Server',
  'FormData',
  'Blob',
  'File',
  'EventEmitter',
  'ObjectId',
  'Decimal128',
  'AbortController',
]);

/** unwrap wrappers up to the node that "holds" the result: `const x = await <expr>` → x */
function resultVarOf(ctx: Ctx, top: Node): string | undefined {
  let cur: Node = top;
  let p = cur.getParent();
  while (
    p &&
    (Node.isAwaitExpression(p) ||
      Node.isParenthesizedExpression(p) ||
      Node.isAsExpression(p) ||
      Node.isNonNullExpression(p))
  ) {
    cur = p;
    p = cur.getParent();
  }
  if (p && Node.isVariableDeclaration(p) && Node.isIdentifier(p.getNameNode()))
    return p.getNameNode().getText();
  if (
    p &&
    Node.isBinaryExpression(p) &&
    p.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
    p.getRight() === cur
  ) {
    const l = p.getLeft();
    if (Node.isIdentifier(l)) return l.getText();
  }
  void ctx;
  return undefined;
}

function parseSelect(ctx: Ctx, arg: Node | undefined): string[] {
  if (!arg) return [];
  const u = ctx.unwrap(arg);
  const s = ctx.strOf(u);
  if (s !== undefined) return s.split(/[\s,]+/).filter(Boolean);
  if (Node.isObjectLiteralExpression(u)) {
    const out: string[] = [];
    for (const p of u.getProperties()) {
      if (!Node.isPropertyAssignment(p)) continue;
      const v = p.getInitializer()?.getText();
      const k = p.getName().replace(/^['"]|['"]$/g, '');
      out.push(v === '0' || v === 'false' ? `-${k}` : k);
    }
    return out;
  }
  return [];
}

export function extractMongoOps(ctx: Ctx, ir: FileIR): void {
  const emit = (call: Node, receiver: string, op: string, args: Node[], instance: boolean) => {
    // chain
    const chain: string[] = [];
    const select: string[] = [];
    const chainInputs: string[] = [];
    let top: Node = call;
    for (;;) {
      const p = top.getParent();
      if (p && Node.isPropertyAccessExpression(p) && p.getExpression() === top) {
        const pc = p.getParent();
        if (pc && Node.isCallExpression(pc) && pc.getExpression() === p) {
          const name = p.getName();
          chain.push(name);
          if (name === 'select' || name === 'projection')
            select.push(...parseSelect(ctx, pc.getArguments()[0]));
          for (const a of pc.getArguments()) inputsOf(ctx.srcOf(a), chainInputs);
          top = pc;
          continue;
        }
      }
      break;
    }
    if ((op === 'find' || op === 'findOne' || op === 'findById') && args[1])
      select.push(...parseSelect(ctx, args[1]));
    const argSrcs: ValueSrc[] = args.map((a) => ctx.srcOf(a));
    const argSources = [...new Set([...argSrcs.flatMap((s) => inputsOf(s)), ...chainInputs])];
    const rec: MongoOpIR = {
      fnId: ctx.reqOwner(call)?.id ?? ctx.moduleFnId(),
      receiver,
      op,
      args: argSrcs.slice(0, 4),
      argSources,
      chain,
      loc: ctx.loc(call),
    };
    if (instance) rec.instance = true;
    if (argSrcs[0]) rec.queryShape = argSrcs[0];
    if (select.length) rec.select = select;
    const rv = resultVarOf(ctx, top);
    if (rv) rec.resultVar = rv;
    ir.mongoOps.push(rec);
  };

  const calls = ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression);
  const instanceCandidates: { call: CallExpression; recv: string; op: string }[] = [];

  for (const call of calls) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const op = callee.getName();
    const recv = ctx.unwrap(callee.getExpression());
    if (STATIC_OPS.has(op)) {
      let receiver: string | undefined;
      if (
        Node.isIdentifier(recv) &&
        /^[A-Z]/.test(recv.getText()) &&
        !NOT_MODELS.has(recv.getText())
      ) {
        receiver = recv.getText();
      } else if (Node.isPropertyAccessExpression(recv)) {
        const last = recv.getName();
        if (/^[A-Z]/.test(last) || /[mM]odel$/.test(last)) receiver = ctx.text(recv, 60);
      } else if (Node.isCallExpression(recv)) {
        const rc = recv.getExpression().getText();
        const a0 = recv.getArguments()[0];
        if (/(^|\.)model$/.test(rc) && a0 && ctx.strOf(a0) !== undefined)
          receiver = `mongoose.model(${ctx.strOf(a0)})`;
        else if (/\.collection$/.test(rc) && a0 && ctx.strOf(a0) !== undefined)
          receiver = `collection:${ctx.strOf(a0)}`;
      }
      if (receiver) emit(call, receiver, op, call.getArguments(), false);
    }
    if (INSTANCE_OPS.has(op) && Node.isIdentifier(recv) && /^[a-z_$]/.test(recv.getText())) {
      instanceCandidates.push({ call, recv: recv.getText(), op });
    }
  }

  // `new Model(...)` bound to a variable
  for (const n of ctx.sf.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    const c = n.getExpression();
    if (!Node.isIdentifier(c) || !/^[A-Z]/.test(c.getText()) || NOT_MODELS.has(c.getText()))
      continue;
    if (/(Error|Exception)$/.test(c.getText())) continue;
    if (!resultVarOf(ctx, n)) continue;
    emit(n, c.getText(), 'new', n.getArguments(), false);
  }

  // instance ops only when the receiver is a variable holding a model result in the same function
  for (const { call, recv, op } of instanceCandidates) {
    const owner = ctx.reqOwner(call)?.id ?? ctx.moduleFnId();
    if (ir.mongoOps.some((o) => o.fnId === owner && o.resultVar === recv)) {
      emit(call, recv, op, call.getArguments(), true);
    }
  }
}

// ─── models ──────────────────────────────────────────────────────────────────
function typeName(ctx: Ctx, n: Node): string | undefined {
  const u = ctx.unwrap(n);
  if (Node.isIdentifier(u)) return u.getText();
  if (Node.isPropertyAccessExpression(u)) return u.getName();
  if (Node.isStringLiteral(u)) return u.getLiteralText();
  return undefined;
}

function parseFields(ctx: Ctx, obj: Node, prefix: string, out: ModelFieldIR[], depth = 0): void {
  if (!Node.isObjectLiteralExpression(obj) || depth > 4) return;
  for (const p of obj.getProperties()) {
    if (!Node.isPropertyAssignment(p)) continue;
    const key = p.getName().replace(/^['"]|['"]$/g, '');
    const init = p.getInitializer();
    if (!init) continue;
    const u = ctx.unwrap(init);
    const field: ModelFieldIR = { name: prefix + key };
    if (Node.isObjectLiteralExpression(u)) {
      const props = new Map(
        u
          .getProperties()
          .filter(Node.isPropertyAssignment)
          .map((x) => [x.getName(), x.getInitializer()]),
      );
      const t = props.get('type');
      if (t) {
        const tu = ctx.unwrap(t);
        if (Node.isArrayLiteralExpression(tu)) {
          const first = tu.getElements()[0];
          field.type = `Array<${first ? (typeName(ctx, first) ?? 'Object') : 'any'}>`;
        } else field.type = typeName(ctx, tu);
        const ref = props.get('ref');
        if (ref) field.ref = ctx.strOf(ref) ?? typeName(ctx, ref);
        const sel = props.get('select')?.getText();
        if (sel === 'false') field.select = false;
        if (props.get('required')?.getText() === 'true') field.required = true;
        if (props.get('unique')?.getText() === 'true') field.unique = true;
        out.push(field);
      } else {
        field.type = 'Object';
        out.push(field);
        parseFields(ctx, u, `${prefix}${key}.`, out, depth + 1);
      }
    } else if (Node.isArrayLiteralExpression(u)) {
      const first = u.getElements()[0];
      if (first && Node.isObjectLiteralExpression(ctx.unwrap(first))) {
        field.type = 'Array<Object>';
        out.push(field);
        parseFields(ctx, ctx.unwrap(first), `${prefix}${key}.`, out, depth + 1);
      } else {
        field.type = `Array<${first ? (typeName(ctx, first) ?? 'any') : 'any'}>`;
        out.push(field);
      }
    } else {
      field.type = typeName(ctx, u);
      out.push(field);
    }
  }
}

export function extractModels(ctx: Ctx, ir: FileIR): void {
  const schemaByVar = new Map<string, Node>();
  const schemaFrom = (init: Node): Node | undefined => {
    const u = ctx.unwrap(init);
    if (
      (Node.isNewExpression(u) || Node.isCallExpression(u)) &&
      /(^|\.)Schema$/.test(u.getExpression().getText())
    ) {
      return u.getArguments()[0];
    }
    return undefined;
  };
  for (const d of ctx.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = d.getInitializer();
    if (!init) continue;
    const s = schemaFrom(init);
    if (s) schemaByVar.set(d.getName(), s);
  }

  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = modelNameOf(ctx, call);
    if (!name || !/(^|\.)model$/.test(call.getExpression().getText())) continue;
    const schemaArg = call.getArguments()[1];
    let obj: Node | undefined;
    if (schemaArg) {
      const u = ctx.unwrap(schemaArg);
      obj = Node.isIdentifier(u) ? schemaByVar.get(u.getText()) : schemaFrom(u);
    }
    const fields: ModelFieldIR[] = [];
    if (obj) parseFields(ctx, ctx.unwrap(obj), '', fields);

    let varName: string | undefined;
    let cur: Node = call;
    let p = cur.getParent();
    while (
      p &&
      (Node.isBinaryExpression(p) || Node.isParenthesizedExpression(p) || Node.isAsExpression(p))
    ) {
      cur = p;
      p = cur.getParent();
    }
    if (p && Node.isVariableDeclaration(p) && Node.isIdentifier(p.getNameNode()))
      varName = p.getName();
    ir.models.push({ name, varName, fields, loc: ctx.loc(call) });
  }
}
