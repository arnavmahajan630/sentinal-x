import { Node, SyntaxKind } from 'ts-morph';
import { maskPreview } from '../context';
import type { Ctx } from '../context';
import type { FileIR, JwtOpIR } from '../types';

function secretSource(ctx: Ctx, node: Node | undefined, flags: string[]): JwtOpIR['secretSource'] {
  if (!node) return { kind: 'none' };
  const u = ctx.unwrap(node);
  const lit = ctx.strOf(u);
  if (lit !== undefined) {
    flags.push('hardcoded-secret');
    return { kind: 'literal', preview: maskPreview(lit), len: lit.length };
  }
  if (Node.isBinaryExpression(u)) {
    const k = u.getOperatorToken().getKind();
    if (k === SyntaxKind.BarBarToken || k === SyntaxKind.QuestionQuestionToken) {
      const left = secretSource(ctx, u.getLeft(), []);
      const right = ctx.strOf(u.getRight());
      if (left.kind === 'env' && right !== undefined) flags.push('literal-fallback');
      if (left.kind === 'env') return left;
    }
  }
  const t = u.getText();
  const m = /^process\.env\.(\w+)$/.exec(t) ?? /^process\.env\[['"](\w+)['"]\]$/.exec(t);
  if (m) return { kind: 'env', name: m[1]! };
  return { kind: 'var', name: ctx.text(u, 60) };
}

export function extractJwt(ctx: Ctx, ir: FileIR): void {
  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    let op: string | undefined;
    if (Node.isPropertyAccessExpression(callee)) {
      const recv = callee.getExpression();
      if (Node.isIdentifier(recv) && ctx.jwtLocals.has(recv.getText())) op = callee.getName();
    } else if (Node.isIdentifier(callee)) {
      op = ctx.jwtNamed.get(callee.getText());
    }
    if (op === 'jwtVerify') op = 'verify';
    if (op !== 'sign' && op !== 'verify' && op !== 'decode') continue;

    const args = call.getArguments();
    const flags: string[] = [];
    const rec: JwtOpIR = {
      fnId: ctx.reqOwner(call)?.id ?? ctx.moduleFnId(),
      op,
      secretSource: op === 'decode' ? { kind: 'none' } : secretSource(ctx, args[1], flags),
      flags,
      loc: ctx.loc(call),
    };
    if (op === 'decode') flags.push('decode-only');

    const optsNode = args[2] ? ctx.unwrap(args[2]) : undefined;
    const props = new Map<string, Node | undefined>();
    if (optsNode && Node.isObjectLiteralExpression(optsNode)) {
      for (const p of optsNode.getProperties()) {
        if (Node.isPropertyAssignment(p)) props.set(p.getName(), p.getInitializer());
        else if (Node.isShorthandPropertyAssignment(p)) props.set(p.getName(), p.getNameNode());
      }
    }
    if (op === 'sign') {
      const e = props.get('expiresIn');
      rec.expiresIn = e ? (ctx.strOf(e) ?? e.getText()) : null;
    }
    const algs: string[] = [];
    const a1 = props.get('algorithm');
    const aN = props.get('algorithms');
    if (a1) algs.push(ctx.strOf(a1) ?? a1.getText());
    if (aN && Node.isArrayLiteralExpression(ctx.unwrap(aN))) {
      for (const e of (ctx.unwrap(aN) as any).getElements()) algs.push(ctx.strOf(e) ?? e.getText());
    }
    if (algs.length) rec.algorithms = algs;
    if (algs.some((a) => a.toLowerCase() === 'none')) flags.push('algorithm-none');
    if (props.get('ignoreExpiration')?.getText() === 'true') flags.push('ignoreExpiration');
    ir.jwtOps.push(rec);
  }
}
