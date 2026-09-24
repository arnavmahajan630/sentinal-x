import { Node, SyntaxKind } from 'ts-morph';
import type { Ctx } from '../context';
import type { AuthzIR, FileIR, ValueSrc } from '../types';

const ROLE_RE =
  /(^|\.)(role|roles|isAdmin|admin|isStaff|isSuperuser|permissions?|scopes?|level|userType)$/i;
const ADMIN_FLAG_RE = /(^|\.)(isAdmin|admin|isStaff|isSuperuser)$/i;
const READ_WRITE_OPS =
  /^(find|findOne|findById|findByIdAnd\w+|findOneAnd\w+|update\w*|delete\w*|remove|count\w*|exists|replaceOne|aggregate)$/;

type Auth = Extract<ValueSrc, { kind: 'authctx' }>;

function findGuards(ctx: Ctx, node: Node): AuthzIR['guards'] {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (
      Node.isIfStatement(cur) &&
      cur.getExpression().getPos() <= node.getPos() &&
      node.getEnd() <= cur.getExpression().getEnd()
    ) {
      for (const branch of [cur.getThenStatement(), cur.getElseStatement()]) {
        if (!branch) continue;
        let found: AuthzIR['guards'];
        const visit = (x: Node) => {
          if (found) return;
          if (Node.isThrowStatement(x)) found = { action: 'throw' };
          else if (Node.isCallExpression(x)) {
            const c = x.getExpression();
            const a0 = x.getArguments()[0];
            if (
              Node.isPropertyAccessExpression(c) &&
              (c.getName() === 'status' || c.getName() === 'sendStatus') &&
              a0 &&
              Node.isNumericLiteral(a0)
            ) {
              const n = Number(a0.getText());
              if (n >= 400) found = { status: n, action: 'respond' };
            } else if (Node.isIdentifier(c) && c.getText() === 'next' && x.getArguments().length)
              found = { action: 'next' };
          }
        };
        visit(branch);
        branch.forEachDescendant((d, t) => {
          if (found) t.stop();
          else visit(d);
        });
        if (found) return found;
      }
      return undefined;
    }
    cur = cur.getParent();
  }
  void ctx;
  return undefined;
}

export function extractAuthz(ctx: Ctx, ir: FileIR): void {
  const out: AuthzIR[] = [];
  const seenReads = new Set<string>();
  const push = (n: Node, kind: AuthzIR['kind'], operands?: AuthzIR['operands']) => {
    const rec: AuthzIR = {
      fnId: ctx.reqOwner(n)?.id ?? ctx.moduleFnId(),
      kind,
      expr: ctx.text(n, 160),
      loc: ctx.loc(n),
    };
    if (operands) rec.operands = operands;
    if (kind === 'ownership-compare' || kind === 'role-check') {
      const g = findGuards(ctx, n);
      if (g) rec.guards = g;
    }
    out.push(rec);
  };
  const auth = (s: ValueSrc): s is Auth => s.kind === 'authctx';

  for (const n of ctx.sf.getDescendants()) {
    // comparisons
    if (Node.isBinaryExpression(n)) {
      const k = n.getOperatorToken().getKind();
      if (
        k === SyntaxKind.EqualsEqualsEqualsToken ||
        k === SyntaxKind.EqualsEqualsToken ||
        k === SyntaxKind.ExclamationEqualsEqualsToken ||
        k === SyntaxKind.ExclamationEqualsToken
      ) {
        const l = ctx.srcOf(n.getLeft());
        const r = ctx.srcOf(n.getRight());
        if (auth(l) !== auth(r)) {
          const a = (auth(l) ? l : r) as Auth;
          const other = auth(l) ? r : l;
          if (ROLE_RE.test(a.path)) push(n, 'role-check', { auth: a.path, other });
          else if (other.kind !== 'literal') push(n, 'ownership-compare', { auth: a.path, other });
        }
      }
    } else if (Node.isCallExpression(n)) {
      const c = n.getExpression();
      if (Node.isPropertyAccessExpression(c)) {
        const name = c.getName();
        const arg0 = n.getArguments()[0];
        if ((name === 'equals' || name === 'isEqual') && arg0) {
          const l = ctx.srcOf(c.getExpression());
          const r = ctx.srcOf(arg0);
          if (auth(l) !== auth(r)) {
            const a = (auth(l) ? l : r) as Auth;
            push(n, 'ownership-compare', { auth: a.path, other: auth(l) ? r : l });
          }
        } else if (name === 'includes' && arg0) {
          const recv = ctx.unwrap(c.getExpression());
          const argSrc = ctx.srcOf(arg0);
          const recvSrc = ctx.srcOf(recv);
          if (auth(argSrc) && ROLE_RE.test(argSrc.path) && Node.isArrayLiteralExpression(recv)) {
            push(n, 'role-check', {
              auth: argSrc.path,
              other: { kind: 'other', text: ctx.text(recv, 60) },
            });
          } else if (auth(recvSrc) && ROLE_RE.test(recvSrc.path)) {
            push(n, 'role-check', { auth: recvSrc.path, other: ctx.srcOf(arg0) });
          }
        }
      }
    }

    // auth-context reads + bare admin-flag checks
    if (Node.isPropertyAccessExpression(n) || Node.isElementAccessExpression(n)) {
      const p = n.getParent();
      if (
        p &&
        (Node.isPropertyAccessExpression(p) || Node.isElementAccessExpression(p)) &&
        p.getExpression() === n
      )
        continue;
      const target =
        p &&
        Node.isCallExpression(p) &&
        p.getExpression() === n &&
        Node.isPropertyAccessExpression(n)
          ? n.getExpression()
          : n;
      if (
        p &&
        Node.isBinaryExpression(p) &&
        p.getLeft() === n &&
        p.getOperatorToken().getKind() === SyntaxKind.EqualsToken
      )
        continue;
      const s = ctx.srcOf(target);
      if (!auth(s)) continue;
      const fnId = ctx.reqOwner(n)?.id ?? ctx.moduleFnId();
      const key = `${fnId}:${s.path}`;
      if (!seenReads.has(key)) {
        seenReads.add(key);
        out.push({ fnId, kind: 'auth-context-read', expr: `req.${s.path}`, loc: ctx.loc(n) });
      }
      if (
        ADMIN_FLAG_RE.test(s.path) &&
        p &&
        (Node.isPrefixUnaryExpression(p) ||
          Node.isIfStatement(p) ||
          Node.isConditionalExpression(p))
      ) {
        push(n, 'role-check', { auth: s.path, other: { kind: 'literal', value: true } });
      }
    }
  }

  // user-scoped queries (reads/updates/deletes filtered by the authenticated user)
  const findAuth = (
    v: ValueSrc | undefined,
    key = '',
  ): { path: string; key: string } | undefined => {
    if (!v) return undefined;
    if (v.kind === 'authctx') return { path: v.path, key };
    if (v.kind === 'object') {
      for (const [k, x] of Object.entries(v.keys)) {
        const f = findAuth(x, k);
        if (f) return f;
      }
    }
    return undefined;
  };
  for (const op of ir.mongoOps) {
    if (op.instance || !READ_WRITE_OPS.test(op.op)) continue;
    const f = findAuth(op.queryShape);
    if (f) {
      out.push({
        fnId: op.fnId,
        kind: 'user-scoped-query',
        expr: `${op.receiver}.${op.op}({… ${f.key}: req.${f.path} …})`,
        operands: { auth: f.path, other: { kind: 'var', name: f.key } },
        loc: op.loc,
      });
    }
  }
  ir.authz.push(...out);
}
