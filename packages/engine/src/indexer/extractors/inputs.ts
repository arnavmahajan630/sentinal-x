import { Node, SyntaxKind } from 'ts-morph';
import { canonicalInput } from '../context';
import type { Ctx } from '../context';
import type { FileIR, InputIR, InputSource, ValueSrc } from '../types';

type InputSrc = Extract<ValueSrc, { kind: 'input' }>;
const SOURCES = new Set<InputSource>(['params', 'query', 'body', 'headers', 'cookies']);

export function extractInputs(ctx: Ctx, ir: FileIR): void {
  const map = new Map<string, InputIR>();
  const handled = new Set<Node>();

  const add = (node: Node, s: InputSrc, boundTo?: string) => {
    const owner = ctx.reqOwner(node)?.id ?? ctx.moduleFnId();
    const id = `${owner}:${canonicalInput(s)}`;
    let rec = map.get(id);
    if (!rec) {
      rec = { id, fnId: owner, source: s.source, path: s.path, boundTo: [], loc: ctx.loc(node) };
      map.set(id, rec);
    }
    if (boundTo && !rec.boundTo.includes(boundTo)) rec.boundTo.push(boundTo);
  };

  // 1) destructuring: const { id } = req.params / const { params, body } = req
  for (const decl of ctx.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nn = decl.getNameNode();
    const init = decl.getInitializer();
    if (!init || !Node.isObjectBindingPattern(nn)) continue;
    const base = ctx.unwrap(init);
    const scopeOwner = ctx.reqOwner(decl);
    const reqName = scopeOwner ? ctx.scopes.get(scopeOwner.node)?.reqName : undefined;
    if (Node.isIdentifier(base) && base.getText() === reqName) {
      handled.add(init);
      for (const el of nn.getElements()) {
        const key = el.getPropertyNameNode()?.getText() ?? el.getNameNode().getText();
        if (SOURCES.has(key as InputSource)) {
          add(
            decl,
            { kind: 'input', source: key as InputSource, path: '' },
            el.getNameNode().getText(),
          );
        }
      }
      continue;
    }
    const src = ctx.srcOf(init);
    if (src.kind !== 'input') continue;
    handled.add(init);
    for (const el of nn.getElements()) {
      const local = el.getNameNode().getText();
      const key = el.getPropertyNameNode()?.getText() ?? local;
      if (el.getDotDotDotToken()) add(decl, src, local);
      else add(decl, { ...src, path: src.path ? `${src.path}.${key}` : key }, local);
    }
  }

  // 2) member-chain tops + req.get()/req.header()
  for (const n of ctx.sf.getDescendants()) {
    if (Node.isPropertyAccessExpression(n) || Node.isElementAccessExpression(n)) {
      const p = n.getParent();
      if (
        p &&
        (Node.isPropertyAccessExpression(p) || Node.isElementAccessExpression(p)) &&
        p.getExpression() === n
      )
        continue;
      if (handled.has(n)) continue;
      let target: Node = n;
      if (
        p &&
        Node.isCallExpression(p) &&
        p.getExpression() === n &&
        Node.isPropertyAccessExpression(n)
      ) {
        // req.get('x') is handled as a call below; otherwise strip the method: req.body.items.map(...)
        const recv = n.getExpression();
        if (
          Node.isIdentifier(recv) &&
          ctx.isReqName(recv, recv.getText()) &&
          /^(get|header)$/.test(n.getName())
        )
          continue;
        target = n.getExpression();
      }
      const s = ctx.srcOf(target);
      if (s.kind === 'input') add(n, s);
    } else if (Node.isCallExpression(n)) {
      const c = n.getExpression();
      if (Node.isPropertyAccessExpression(c) && /^(get|header)$/.test(c.getName())) {
        const s = ctx.srcOf(n);
        if (s.kind === 'input') add(n, s);
      }
    }
  }

  // 3) alias variables → boundTo
  for (const [fnNode, info] of ctx.fns) {
    const scope = ctx.scopes.get(fnNode)!;
    for (const [name, src] of scope.aliases) {
      if (src.kind !== 'input') continue;
      const owner = scope.reqName ? info.id : (ctx.reqOwner(fnNode)?.id ?? info.id);
      const rec = map.get(`${owner}:${canonicalInput(src)}`);
      if (rec && !rec.boundTo.includes(name)) rec.boundTo.push(name);
    }
  }

  ir.inputs.push(...map.values());
}
