import { Node, SyntaxKind } from 'ts-morph';
import type { Ctx } from '../context';
import type { FileIR } from '../types';

const RES_METHODS = new Set([
  'json',
  'jsonp',
  'send',
  'render',
  'end',
  'sendFile',
  'download',
  'redirect',
  'sendStatus',
  'write',
]);

export function extractResponses(ctx: Ctx, ir: FileIR): void {
  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const method = callee.getName();
    if (!RES_METHODS.has(method)) continue;

    // walk the chain down to the root; collect .status(N)
    let status: number | undefined;
    let cur: Node = ctx.unwrap(callee.getExpression());
    let chained = false;
    for (;;) {
      if (Node.isCallExpression(cur)) {
        const c = cur.getExpression();
        if (Node.isPropertyAccessExpression(c)) {
          if (c.getName() === 'status') {
            const a = cur.getArguments()[0];
            if (a && Node.isNumericLiteral(a)) status = Number(a.getText());
            chained = true;
          }
          cur = ctx.unwrap(c.getExpression());
          continue;
        }
        break;
      }
      if (Node.isPropertyAccessExpression(cur)) {
        cur = ctx.unwrap(cur.getExpression());
        continue;
      }
      break;
    }
    if (!Node.isIdentifier(cur)) continue;
    if (!(ctx.isResName(cur, cur.getText()) || /^res(ponse|p)?$/i.test(cur.getText()))) continue;

    const args = call.getArguments();
    if (method === 'sendStatus' && args[0] && Node.isNumericLiteral(args[0]))
      status = Number(args[0].getText());
    ir.responses.push({
      fnId: ctx.reqOwner(call)?.id ?? ctx.moduleFnId(),
      method: chained ? `status.${method}` : method,
      args: method === 'sendStatus' ? [] : args.slice(0, 3).map((a) => ctx.srcOf(a)),
      status,
      loc: ctx.loc(call),
    });
  }
}
