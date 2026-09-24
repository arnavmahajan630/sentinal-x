import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { InputSource, Loc, RefIR, ValueSrc } from './types';

export type FnNode = Node; // FunctionDeclaration | FunctionExpression | ArrowFunction | MethodDeclaration

const INPUT_SOURCES = new Set<InputSource>(['params', 'query', 'body', 'headers', 'cookies']);
const AUTH_ROOTS = new Set([
  'user',
  'userId',
  'auth',
  'session',
  'currentUser',
  'account',
  'token',
]);
const CONVERSIONS = new Set(['String', 'Number', 'parseInt', 'parseFloat', 'ObjectId', 'Boolean']);
const CONV_METHODS = new Set(['toString', 'trim', 'toLowerCase', 'toUpperCase', 'valueOf']);
const WRAPPER_RE = /^(async\w*|catch\w*|wrap\w*|\w*handler|try\w*|safe\w*|\w*wrapper)$/i;
const SECRET_KEY_RE =
  /(secret|passw(or)?d|pwd|token|api[_-]?key|apikey|private[_-]?key|auth|credential|salt)/i;

export const isFnNode = (n: Node): boolean =>
  Node.isFunctionDeclaration(n) ||
  Node.isFunctionExpression(n) ||
  Node.isArrowFunction(n) ||
  Node.isMethodDeclaration(n);

export interface FnInfo {
  id: string;
  name: string;
  parent?: string;
  node: FnNode;
}

export interface FnScope {
  reqName?: string;
  resName?: string;
  nextName?: string;
  /** var → what it aliases (input / authctx), built from const-ish declarations in the fn body */
  aliases: Map<string, ValueSrc>;
}

export const canonicalInput = (s: Extract<ValueSrc, { kind: 'input' }>): string =>
  `req.${s.source}${s.path ? '.' + s.path : ''}`;

/** all canonical input refs reachable (directly) from a ValueSrc */
export function inputsOf(v: ValueSrc | undefined, out: string[] = []): string[] {
  if (!v) return out;
  switch (v.kind) {
    case 'input':
      out.push(canonicalInput(v));
      break;
    case 'object':
      Object.values(v.keys).forEach((k) => inputsOf(k, out));
      break;
    case 'spread':
      inputsOf(v.of, out);
      break;
  }
  return out;
}

export function entropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

export const maskPreview = (s: string): string => (s.length <= 2 ? '***' : s.slice(0, 2) + '***');

export class Ctx {
  readonly fns = new Map<Node, FnInfo>();
  readonly scopes = new Map<Node, FnScope>();
  private constStrings = new Map<string, string>();
  /** local names bound to the jsonwebtoken package (default/namespace) and named imports local→imported */
  readonly jwtLocals = new Set<string>();
  readonly jwtNamed = new Map<string, string>();

  constructor(
    readonly file: string,
    readonly sf: SourceFile,
  ) {
    this.collectFunctions();
    this.collectConsts();
    this.collectJwtBindings();
    this.buildScopes();
  }

  private collectJwtBindings() {
    const isJwt = (m: string) => m === 'jsonwebtoken' || m === 'jose' || m === 'express-jwt';
    for (const imp of this.sf.getImportDeclarations()) {
      if (!isJwt(imp.getModuleSpecifierValue())) continue;
      const d = imp.getDefaultImport()?.getText();
      const ns = imp.getNamespaceImport()?.getText();
      if (d) this.jwtLocals.add(d);
      if (ns) this.jwtLocals.add(ns);
      for (const n of imp.getNamedImports()) {
        this.jwtNamed.set(n.getAliasNode()?.getText() ?? n.getName(), n.getName());
      }
    }
    for (const call of this.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const c = call.getExpression();
      const a = call.getArguments()[0];
      if (!Node.isIdentifier(c) || c.getText() !== 'require' || !a) continue;
      const mod = this.strOf(a);
      if (!mod || !isJwt(mod)) continue;
      const decl = call.getParent();
      if (!decl || !Node.isVariableDeclaration(decl)) continue;
      const nn = decl.getNameNode();
      if (Node.isIdentifier(nn)) this.jwtLocals.add(nn.getText());
      else if (Node.isObjectBindingPattern(nn)) {
        for (const el of nn.getElements()) {
          this.jwtNamed.set(
            el.getNameNode().getText(),
            el.getPropertyNameNode()?.getText() ?? el.getNameNode().getText(),
          );
        }
      }
    }
  }

  // ─── basic helpers ─────────────────────────────────────────────────────────
  loc(n: Node): Loc {
    const p = this.sf.getLineAndColumnAtPos(n.getStart());
    return { file: this.file, line: p.line, col: p.column, endLine: n.getEndLineNumber() };
  }

  text(n: Node, max = 120): string {
    const t = n.getText().replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  moduleFnId = () => `${this.file}#<module>`;

  unwrap(n: Node): Node {
    let cur = n;
    for (;;) {
      if (
        Node.isParenthesizedExpression(cur) ||
        Node.isAwaitExpression(cur) ||
        Node.isAsExpression(cur) ||
        Node.isNonNullExpression(cur) ||
        Node.isTypeAssertion(cur) ||
        Node.isSatisfiesExpression(cur)
      ) {
        cur = cur.getExpression();
      } else return cur;
    }
  }

  /** literal string of a string-ish node, resolving same-file `const` strings & simple concatenation */
  strOf(n: Node): string | undefined {
    const u = this.unwrap(n);
    if (Node.isStringLiteral(u) || Node.isNoSubstitutionTemplateLiteral(u))
      return u.getLiteralText();
    if (Node.isIdentifier(u)) return this.constStrings.get(u.getText());
    if (Node.isBinaryExpression(u) && u.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
      const l = this.strOf(u.getLeft());
      const r = this.strOf(u.getRight());
      return l !== undefined && r !== undefined ? l + r : undefined;
    }
    if (Node.isTemplateExpression(u)) {
      let out = u.getHead().getLiteralText();
      for (const span of u.getTemplateSpans()) {
        const v = this.strOf(span.getExpression());
        if (v === undefined) return undefined;
        out += v + span.getLiteral().getLiteralText();
      }
      return out;
    }
    return undefined;
  }

  // ─── functions ─────────────────────────────────────────────────────────────
  enclosingFn(n: Node): FnInfo | undefined {
    let cur: Node | undefined = n.getParent();
    while (cur) {
      const f = this.fns.get(cur);
      if (f) return f;
      cur = cur.getParent();
    }
    return undefined;
  }

  fnIdOf(n: Node): string {
    return this.enclosingFn(n)?.id ?? this.moduleFnId();
  }

  /** nearest enclosing fn that owns a `req`-like param (closures attribute to their handler) */
  reqOwner(n: Node): FnInfo | undefined {
    let cur: Node | undefined = n.getParent();
    let nearest: FnInfo | undefined;
    while (cur) {
      const f = this.fns.get(cur);
      if (f) {
        nearest ??= f;
        if (this.scopes.get(cur)?.reqName) return f;
      }
      cur = cur.getParent();
    }
    return nearest;
  }

  private collectFunctions() {
    const used = new Map<string, number>();
    const nodes = this.sf.getDescendants().filter(isFnNode);
    for (const n of nodes) {
      const loc = this.sf.getLineAndColumnAtPos(n.getStart());
      let name = this.nameFor(n);
      const anon = `anon@${loc.line}:${loc.column}`;
      if (!name) name = anon;
      else if (used.has(name)) name = `${name}@${loc.line}:${loc.column}`;
      used.set(name, 1);
      this.fns.set(n, { id: `${this.file}#${name}`, name, node: n });
    }
    for (const [n, info] of this.fns) {
      const p = this.enclosingFnNodeOf(n);
      if (p) info.parent = this.fns.get(p)?.id;
    }
  }

  private enclosingFnNodeOf(n: Node): Node | undefined {
    let cur = n.getParent();
    while (cur) {
      if (isFnNode(cur)) return cur;
      cur = cur.getParent();
    }
    return undefined;
  }

  private nameFor(n: Node): string | undefined {
    if (Node.isFunctionDeclaration(n))
      return n.getName() ?? (n.isDefaultExport() ? 'default' : undefined);
    if (Node.isMethodDeclaration(n)) {
      const own = n.getName();
      const holder = n.getParent();
      if (Node.isClassDeclaration(holder) || Node.isClassExpression(holder)) {
        return `${holder.getName() ?? 'class'}.${own}`;
      }
      if (Node.isObjectLiteralExpression(holder)) {
        const obj = this.objectName(holder);
        return obj ? `${obj}.${own}` : own;
      }
      return own;
    }
    // arrow / function expression
    const parent = n.getParent();
    if (!parent) return undefined;
    if (Node.isFunctionExpression(n) && n.getName()) return n.getName();
    if (Node.isVariableDeclaration(parent)) return parent.getName();
    if (Node.isPropertyAssignment(parent)) {
      const obj = Node.isObjectLiteralExpression(parent.getParent())
        ? this.objectName(parent.getParent() as any)
        : undefined;
      const key = parent.getName();
      return obj ? `${obj}.${key}` : key;
    }
    if (
      Node.isBinaryExpression(parent) &&
      parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken
    ) {
      const left = parent.getLeft().getText();
      if (left === 'module.exports') return 'module.exports';
      const m = /^(?:module\.)?exports\.(\w+)$/.exec(left);
      if (m) return m[1];
      return left.length <= 60 ? left : undefined;
    }
    if (Node.isExportAssignment(parent)) return 'default';
    if (Node.isPropertyDeclaration(parent)) return parent.getName();
    return undefined;
  }

  private objectName(obj: Node): string | undefined {
    const p = obj.getParent();
    if (p && Node.isVariableDeclaration(p)) return p.getName();
    if (p && Node.isBinaryExpression(p)) {
      const l = p.getLeft().getText();
      if (l === 'module.exports') return 'module.exports';
      return l.length <= 40 ? l : undefined;
    }
    if (p && Node.isExportAssignment(p)) return 'default';
    return undefined;
  }

  private collectConsts() {
    for (const decl of this.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const init = decl.getInitializer();
      const nameNode = decl.getNameNode();
      if (!init || !Node.isIdentifier(nameNode)) continue;
      const list = decl.getParent();
      if (!Node.isVariableDeclarationList(list) || !(list.getFlags() & 2 /* Const */)) continue;
      if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init)) {
        this.constStrings.set(nameNode.getText(), init.getLiteralText());
      }
    }
  }

  // ─── scopes (req/res names + aliases) ──────────────────────────────────────
  private buildScopes() {
    for (const [node, info] of this.fns) {
      const params = (node as any).getParameters?.() ?? [];
      const names: string[] = params.map((p: any) => p.getNameNode().getText());
      const scope: FnScope = { aliases: new Map() };
      const looksReq = (s?: string, p?: any) =>
        !!s &&
        (/^_?req(uest)?$/i.test(s) || /\bRequest\b/.test(p?.getTypeNode?.()?.getText() ?? ''));
      const looksRes = (s?: string) => !!s && /^_?res(p|ponse)?$/i.test(s);
      if (names.length === 4 && looksReq(names[1], params[1]) && looksRes(names[2])) {
        scope.reqName = names[1];
        scope.resName = names[2];
        scope.nextName = names[3];
      } else if (looksReq(names[0], params[0])) {
        scope.reqName = names[0];
        if (looksRes(names[1])) scope.resName = names[1];
        if (names[2]) scope.nextName = names[2];
      }
      this.scopes.set(node, scope);
      void info;
    }
    // aliases need all scopes (reqName) ready first
    for (const [node] of this.fns) this.buildAliases(node);
  }

  /** visit a function's own body, not descending into nested functions (fn === module → whole file minus fns) */
  own(fn: Node, cb: (n: Node) => void) {
    fn.forEachDescendant((n, t) => {
      if (isFnNode(n)) {
        t.skip();
        return;
      }
      cb(n);
    });
  }

  private buildAliases(fn: Node) {
    const scope = this.scopes.get(fn)!;
    const reassigned = new Set<string>();
    const decls: Node[] = [];
    this.own(fn, (n) => {
      if (Node.isBinaryExpression(n)) {
        const k = n.getOperatorToken().getKind();
        const l = n.getLeft();
        if (
          k >= SyntaxKind.FirstAssignment &&
          k <= SyntaxKind.LastAssignment &&
          Node.isIdentifier(l)
        ) {
          reassigned.add(l.getText());
        }
      } else if (Node.isVariableDeclaration(n)) decls.push(n);
    });
    for (const d of decls) {
      if (!Node.isVariableDeclaration(d)) continue;
      const init = d.getInitializer();
      if (!init) continue;
      const nameNode = d.getNameNode();
      if (Node.isIdentifier(nameNode)) {
        const name = nameNode.getText();
        if (reassigned.has(name)) continue;
        const src = this.srcOf(init, scope);
        if (src.kind === 'input' || src.kind === 'authctx') scope.aliases.set(name, src);
      } else if (Node.isObjectBindingPattern(nameNode)) {
        const base = this.unwrap(init);
        const isReq = Node.isIdentifier(base) && base.getText() === scope.reqName;
        const src = isReq ? undefined : this.srcOf(init, scope);
        for (const el of nameNode.getElements()) {
          const local = el.getNameNode();
          if (!Node.isIdentifier(local) || reassigned.has(local.getText())) continue;
          const key = el.getPropertyNameNode()?.getText() ?? local.getText();
          if (el.getDotDotDotToken()) {
            if (src) scope.aliases.set(local.getText(), src);
            continue;
          }
          if (isReq) {
            if (INPUT_SOURCES.has(key as InputSource)) {
              scope.aliases.set(local.getText(), {
                kind: 'input',
                source: key as InputSource,
                path: '',
              });
            } else if (AUTH_ROOTS.has(key))
              scope.aliases.set(local.getText(), { kind: 'authctx', path: key });
          } else if (src?.kind === 'input') {
            scope.aliases.set(local.getText(), {
              ...src,
              path: src.path ? `${src.path}.${key}` : key,
            });
          } else if (src?.kind === 'authctx') {
            scope.aliases.set(local.getText(), { kind: 'authctx', path: `${src.path}.${key}` });
          }
        }
      }
    }
  }

  private lexicalScopes(n: Node): FnScope[] {
    const out: FnScope[] = [];
    let cur: Node | undefined = n;
    while (cur) {
      const s = this.scopes.get(cur);
      if (s) out.push(s);
      cur = cur.getParent();
    }
    return out;
  }

  isReqName(n: Node, name: string): boolean {
    return this.lexicalScopes(n).some((s) => s.reqName === name);
  }
  isResName(n: Node, name: string): boolean {
    return this.lexicalScopes(n).some((s) => s.resName === name);
  }

  lookupAlias(n: Node, name: string): ValueSrc | undefined {
    for (const s of this.lexicalScopes(n)) {
      const a = s.aliases.get(name);
      if (a) return a;
    }
    return undefined;
  }

  // ─── value sources ─────────────────────────────────────────────────────────
  /** segments of a member chain rooted at an identifier; strips a trailing method name when it is a callee */
  chainOf(n: Node): { root: string; rootNode: Node; segs: string[] } | undefined {
    const segs: string[] = [];
    let cur = this.unwrap(n);
    if (Node.isCallExpression(cur)) return undefined;
    for (;;) {
      if (Node.isPropertyAccessExpression(cur)) {
        segs.unshift(cur.getName());
        cur = this.unwrap(cur.getExpression());
      } else if (Node.isElementAccessExpression(cur)) {
        const arg = cur.getArgumentExpression();
        const k = arg ? this.strOf(arg) : undefined;
        segs.unshift(k ?? '*');
        cur = this.unwrap(cur.getExpression());
      } else break;
    }
    if (!Node.isIdentifier(cur) && cur.getKind() !== SyntaxKind.ThisKeyword) return undefined;
    return { root: cur.getText(), rootNode: cur, segs };
  }

  srcOf(node: Node, scope?: FnScope, keyName?: string, depth = 0): ValueSrc {
    const n = this.unwrap(node);
    const text = this.text(n, 80);
    if (depth > 4) return { kind: 'other', text };

    if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) {
      const v = n.getLiteralText();
      if (keyName && SECRET_KEY_RE.test(keyName)) return { kind: 'literal', value: maskPreview(v) };
      return { kind: 'literal', value: v.length > 60 ? v.slice(0, 60) : v };
    }
    if (Node.isNumericLiteral(n)) return { kind: 'literal', value: Number(n.getText()) };
    if (n.getKind() === SyntaxKind.TrueKeyword) return { kind: 'literal', value: true };
    if (n.getKind() === SyntaxKind.FalseKeyword) return { kind: 'literal', value: false };
    if (n.getKind() === SyntaxKind.NullKeyword) return { kind: 'literal', value: null };

    if (Node.isObjectLiteralExpression(n)) {
      const keys: Record<string, ValueSrc> = {};
      let count = 0;
      for (const p of n.getProperties()) {
        if (++count > 30) break;
        if (Node.isPropertyAssignment(p)) {
          const k = p
            .getNameNode()
            .getText()
            .replace(/^['"]|['"]$/g, '');
          const init = p.getInitializer();
          keys[k] = init ? this.srcOf(init, scope, k, depth + 1) : { kind: 'other', text: '' };
        } else if (Node.isShorthandPropertyAssignment(p)) {
          const k = p.getName();
          keys[k] = this.srcOf(p.getNameNode(), scope, k, depth + 1);
        } else if (Node.isSpreadAssignment(p)) {
          keys[`...${this.text(p.getExpression(), 30)}`] = {
            kind: 'spread',
            of: this.srcOf(p.getExpression(), scope, undefined, depth + 1),
          };
        } else keys[this.text(p, 20)] = { kind: 'other', text: this.text(p, 40) };
      }
      return { kind: 'object', keys };
    }

    if (Node.isIdentifier(n)) {
      const a = this.lookupAlias(n, n.getText());
      if (a) return a;
      return { kind: 'var', name: n.getText() };
    }

    if (Node.isPropertyAccessExpression(n) || Node.isElementAccessExpression(n)) {
      const chain = this.chainOf(n);
      if (chain) {
        const { root, segs, rootNode } = chain;
        // req.<src>...
        if (
          this.isReqName(rootNode, root) ||
          (/^req(uest)?$/i.test(root) && !this.lookupAlias(rootNode, root))
        ) {
          const first = segs[0];
          if (first && INPUT_SOURCES.has(first as InputSource)) {
            return { kind: 'input', source: first as InputSource, path: segs.slice(1).join('.') };
          }
          if (first && AUTH_ROOTS.has(first)) return { kind: 'authctx', path: segs.join('.') };
        }
        // res.locals.user
        if (
          this.isResName(rootNode, root) &&
          segs[0] === 'locals' &&
          segs[1] &&
          AUTH_ROOTS.has(segs[1])
        ) {
          return { kind: 'authctx', path: segs.slice(1).join('.') };
        }
        // alias.member → extend
        const alias = this.lookupAlias(rootNode, root);
        if (alias?.kind === 'input') {
          return { ...alias, path: [alias.path, ...segs].filter(Boolean).join('.') };
        }
        if (alias?.kind === 'authctx')
          return { kind: 'authctx', path: [alias.path, ...segs].join('.') };
        return { kind: 'var', name: text };
      }
      return { kind: 'other', text, inputs: this.inputsIn(n) };
    }

    if (Node.isCallExpression(n)) {
      const callee = n.getExpression();
      const args = n.getArguments();
      // req.get('x') / req.header('x')
      if (Node.isPropertyAccessExpression(callee) && args[0]) {
        const recv = callee.getExpression();
        const m = callee.getName();
        if (
          Node.isIdentifier(recv) &&
          this.isReqName(recv, recv.getText()) &&
          (m === 'get' || m === 'header')
        ) {
          const k = this.strOf(args[0]);
          return { kind: 'input', source: 'headers', path: (k ?? '*').toLowerCase() };
        }
      }
      // String(x), Number(x), ObjectId(x), new ObjectId(x) handled in NewExpression
      if (Node.isIdentifier(callee) && CONVERSIONS.has(callee.getText()) && args[0]) {
        return this.srcOf(args[0], scope, keyName, depth + 1);
      }
      if (Node.isPropertyAccessExpression(callee)) {
        const m = callee.getName();
        if (CONV_METHODS.has(m))
          return this.srcOf(callee.getExpression(), scope, keyName, depth + 1);
        if (m === 'ObjectId' && args[0]) return this.srcOf(args[0], scope, keyName, depth + 1);
      }
      return { kind: 'call', text, inputs: this.inputsIn(n) };
    }

    if (Node.isNewExpression(n)) {
      const callee = n.getExpression().getText();
      const args = n.getArguments();
      if (/ObjectId$/.test(callee) && args[0])
        return this.srcOf(args[0], scope, keyName, depth + 1);
      return { kind: 'call', text, inputs: this.inputsIn(n) };
    }

    return { kind: 'other', text, inputs: this.inputsIn(n) };
  }

  /** canonical inputs appearing anywhere in a subtree (used to keep flow hints through transformations) */
  inputsIn(n: Node): string[] | undefined {
    const out = new Set<string>();
    const visit = (x: Node) => {
      if (
        Node.isPropertyAccessExpression(x) ||
        Node.isElementAccessExpression(x) ||
        Node.isIdentifier(x)
      ) {
        const p = x.getParent();
        const isInner =
          p &&
          (Node.isPropertyAccessExpression(p) || Node.isElementAccessExpression(p)) &&
          p.getExpression() === x;
        if (!isInner) {
          const s = this.srcOf(x);
          if (s.kind === 'input') out.add(canonicalInput(s));
        }
      }
    };
    n.forEachDescendant((d, t) => {
      if (isFnNode(d)) t.skip();
      else visit(d);
    });
    return out.size ? [...out] : undefined;
  }

  // ─── refs ──────────────────────────────────────────────────────────────────
  pathsOf(node: Node): { paths: string[]; dynamic: boolean } {
    const u = this.unwrap(node);
    if (Node.isArrayLiteralExpression(u)) {
      const paths: string[] = [];
      let dynamic = false;
      for (const e of u.getElements()) {
        const r = this.pathsOf(e);
        paths.push(...r.paths);
        dynamic ||= r.dynamic;
      }
      return { paths, dynamic };
    }
    const s = this.strOf(u);
    if (s !== undefined) return { paths: [s], dynamic: false };
    return { paths: [], dynamic: true };
  }

  refOf(node: Node): RefIR {
    const u = this.unwrap(node);
    const loc = this.loc(u);
    const text = this.text(u);
    if (isFnNode(u)) return { text, kind: 'inline', fnId: this.fns.get(u)?.id, loc };
    if (Node.isIdentifier(u)) return { text, kind: 'ident', loc };
    if (Node.isPropertyAccessExpression(u)) return { text, kind: 'member', loc };
    if (Node.isCallExpression(u)) {
      const callee = u.getExpression();
      const calleeText = callee.getText();
      const last = calleeText.split('.').pop() ?? calleeText;
      const args = u.getArguments();
      const fnArg = args.find((a) => {
        const x = this.unwrap(a);
        return isFnNode(x) || Node.isIdentifier(x) || Node.isPropertyAccessExpression(x);
      });
      if (fnArg && WRAPPER_RE.test(last)) {
        const inner = this.refOf(fnArg);
        return { ...inner, wrapper: calleeText };
      }
      return {
        text,
        kind: 'call',
        factory: calleeText.length > 60 ? calleeText.slice(0, 60) : calleeText,
        args: args.map((a) => this.text(a, 60)),
        loc,
      };
    }
    return { text, kind: 'unknown', loc };
  }
}
