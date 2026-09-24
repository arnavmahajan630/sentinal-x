import { Node, SyntaxKind } from 'ts-morph';
import type { Ctx } from '../context';
import type { CallIR, FileIR, FnTraits } from '../types';

const AUTH_ERR = new Set([401, 403]);
const AUTH_HEADER_RE = /^(authorization|x-auth-token|x-access-token|x-api-key)$/i;
const TOKEN_COOKIE_RE = /^(token|jwt|accessToken|access_token|session|auth)$/i;

export function extractFunctions(ctx: Ctx, ir: FileIR): void {
  for (const [node, info] of ctx.fns) {
    const scope = ctx.scopes.get(node)!;
    const traits: FnTraits = {
      readsAuthHeader: false,
      callsJwtVerify: false,
      setsReqUser: false,
      sendsAuthError: false,
      callsNext: false,
      usesReqRes: !!(scope.reqName && scope.resName),
    };
    const calls: CallIR[] = [];
    const nextName = scope.nextName ?? 'next';

    ctx.own(node, (n) => {
      if (Node.isPropertyAccessExpression(n)) {
        const name = n.getName();
        if (AUTH_HEADER_RE.test(name)) traits.readsAuthHeader = true;
        else if (TOKEN_COOKIE_RE.test(name) && /cookies$/.test(n.getExpression().getText())) {
          traits.readsAuthHeader = true;
        }
      } else if (Node.isElementAccessExpression(n)) {
        const k = n.getArgumentExpression();
        const v = k ? ctx.strOf(k) : undefined;
        if (v && AUTH_HEADER_RE.test(v) && /headers$/.test(n.getExpression().getText()))
          traits.readsAuthHeader = true;
        if (v && TOKEN_COOKIE_RE.test(v) && /cookies$/.test(n.getExpression().getText()))
          traits.readsAuthHeader = true;
      } else if (Node.isBinaryExpression(n)) {
        const k = n.getOperatorToken().getKind();
        if (k === SyntaxKind.EqualsToken) {
          const s = ctx.srcOf(n.getLeft());
          if (s.kind === 'authctx') traits.setsReqUser = true;
        }
      } else if (Node.isCallExpression(n)) {
        const callee = n.getExpression();
        const args = n.getArguments();
        const calleeText = callee.getText();
        const isProp = Node.isPropertyAccessExpression(callee);
        const name = isProp ? callee.getName() : calleeText;
        const object = isProp ? ctx.text(callee.getExpression(), 60) : undefined;

        // traits
        if (Node.isIdentifier(callee) && callee.getText() === nextName) traits.callsNext = true;
        if (isProp) {
          const recv = callee.getExpression();
          if (
            (name === 'get' || name === 'header') &&
            args[0] &&
            AUTH_HEADER_RE.test(ctx.strOf(args[0]) ?? '') &&
            Node.isIdentifier(recv) &&
            ctx.isReqName(recv, recv.getText())
          ) {
            traits.readsAuthHeader = true;
          }
          if (
            (name === 'verify' || name === 'jwtVerify') &&
            Node.isIdentifier(recv) &&
            ctx.jwtLocals.has(recv.getText())
          ) {
            traits.callsJwtVerify = true;
          }
          if (name === 'status' || name === 'sendStatus') {
            const code =
              args[0] && Node.isNumericLiteral(args[0]) ? Number(args[0].getText()) : undefined;
            if (code && AUTH_ERR.has(code) && isResChain(ctx, callee.getExpression()))
              traits.sendsAuthError = true;
          }
        } else if (Node.isIdentifier(callee)) {
          const imported = ctx.jwtNamed.get(callee.getText());
          if (imported === 'verify' || imported === 'jwtVerify') traits.callsJwtVerify = true;
        }

        // call list (skip requires, console, and framework responses on `res`)
        if (calleeText === 'require' || /^console\./.test(calleeText)) return;
        if (isProp && isResChain(ctx, callee.getExpression())) return;
        if (calls.length < 200) {
          calls.push({
            callee: ctx.text(callee, 80),
            object,
            name: name.length > 60 ? name.slice(0, 60) : name,
            loc: ctx.loc(n),
          });
        }
      } else if (Node.isNewExpression(n)) {
        const callee = n.getExpression();
        if (calls.length < 200) {
          calls.push({
            callee: `new ${ctx.text(callee, 70)}`,
            name: callee.getText().split('.').pop() ?? callee.getText(),
            loc: ctx.loc(n),
          });
        }
      }
    });

    ir.functions.push({
      id: info.id,
      name: info.name,
      parent: info.parent,
      params: (node as any).getParameters().map((p: any) => ctx.text(p.getNameNode(), 40)),
      async: !!(node as any).isAsync?.(),
      calls,
      traits,
      loc: ctx.loc(node),
    });
  }
}

/** is `n` the `res` object (or a `res.status(..)` style chain rooted at it)? */
export function isResChain(ctx: Ctx, n: Node): boolean {
  let cur = ctx.unwrap(n);
  for (;;) {
    if (Node.isCallExpression(cur)) cur = ctx.unwrap(cur.getExpression());
    else if (Node.isPropertyAccessExpression(cur)) cur = ctx.unwrap(cur.getExpression());
    else break;
  }
  return (
    Node.isIdentifier(cur) &&
    (ctx.isResName(cur, cur.getText()) || /^res(ponse)?$/i.test(cur.getText()))
  );
}
