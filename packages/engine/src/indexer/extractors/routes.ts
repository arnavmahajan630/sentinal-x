import { Node, SyntaxKind } from 'ts-morph';
import type { CallExpression } from 'ts-morph';
import type { Ctx } from '../context';
import type { FileIR, HttpMethod, MountIR, RefIR, RouteIR } from '../types';

const METHODS: Record<string, HttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  all: 'ALL',
  options: 'OPTIONS',
  head: 'HEAD',
};
const ROUTER_NAME_RE = /^(app|router|server|routes?)$|(Router|Routes?)$/;

function receiverName(ctx: Ctx, ir: FileIR, recv: Node): string | undefined {
  const u = ctx.unwrap(recv);
  let name: string | undefined;
  if (Node.isIdentifier(u)) name = u.getText();
  else if (
    Node.isPropertyAccessExpression(u) &&
    u.getExpression().getKind() === SyntaxKind.ThisKeyword
  ) {
    name = u.getName();
  }
  if (!name) return undefined;
  if (ir.routers.some((r) => r.name === name) || ROUTER_NAME_RE.test(name)) return name;
  return undefined;
}

function isPathish(ctx: Ctx, n: Node): boolean {
  const u = ctx.unwrap(n);
  if (ctx.strOf(u) !== undefined) return true;
  if (Node.isRegularExpressionLiteral(u)) return true;
  if (Node.isArrayLiteralExpression(u)) return u.getElements().every((e) => isPathish(ctx, e));
  if (Node.isTemplateExpression(u)) return true;
  if (Node.isBinaryExpression(u) && u.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    return isPathish(ctx, u.getLeft()) || isPathish(ctx, u.getRight());
  }
  return false;
}

function flattenRefs(ctx: Ctx, args: Node[]): RefIR[] {
  const out: RefIR[] = [];
  for (const a of args) {
    const u = ctx.unwrap(a);
    if (Node.isArrayLiteralExpression(u)) out.push(...flattenRefs(ctx, u.getElements()));
    else out.push(ctx.refOf(u));
  }
  return out;
}

export function extractRoutes(ctx: Ctx, ir: FileIR): void {
  let dynamicSeen = false;

  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();

    // dynamic loaders: require(<non-literal>) / readdirSync
    if (Node.isIdentifier(callee) && callee.getText() === 'require') {
      const a = call.getArguments()[0];
      if (a && ctx.strOf(a) === undefined) dynamicSeen = true;
    }
    if (
      Node.isPropertyAccessExpression(callee) &&
      /^(readdirSync|readdir|globSync|glob)$/.test(callee.getName())
    ) {
      dynamicSeen = true;
    }

    if (!Node.isPropertyAccessExpression(callee)) continue;
    const method = callee.getName();
    const args = call.getArguments();
    const order = callee.getNameNode().getStart();

    if (method === 'use') {
      const recv = receiverName(ctx, ir, callee.getExpression());
      if (!recv || !args.length) continue;
      let pathInfo: { paths: string[]; dynamic: boolean } | undefined;
      let rest = args;
      if (isPathish(ctx, args[0]!)) {
        pathInfo = ctx.pathsOf(args[0]!);
        if (Node.isRegularExpressionLiteral(ctx.unwrap(args[0]!)))
          pathInfo = { paths: [], dynamic: true };
        rest = args.slice(1);
      }
      const refs = flattenRefs(ctx, rest);
      if (!refs.length) continue;
      const paths = pathInfo ? (pathInfo.paths.length ? pathInfo.paths : ['']) : [undefined];
      for (const p of paths) {
        const m: MountIR = {
          router: recv,
          path: p,
          args: refs,
          order,
          loc: ctx.loc(call),
        };
        if (pathInfo?.dynamic) {
          m.dynamic = true;
          dynamicSeen = true;
        }
        ir.mounts.push(m);
      }
      continue;
    }

    const http = METHODS[method];
    if (!http) continue;

    // receiver: direct, or `<router>.route('/x')` chain (possibly through earlier chained verbs)
    let recvName: string | undefined;
    let pathNode: Node | undefined;
    let handlerArgs: Node[] = args;
    let cur: Node = ctx.unwrap(callee.getExpression());
    while (
      Node.isCallExpression(cur) &&
      Node.isPropertyAccessExpression(cur.getExpression()) &&
      METHODS[(cur.getExpression() as any).getName()]
    ) {
      cur = ctx.unwrap((cur.getExpression() as any).getExpression());
    }
    if (
      Node.isCallExpression(cur) &&
      Node.isPropertyAccessExpression(cur.getExpression()) &&
      (cur.getExpression() as any).getName() === 'route'
    ) {
      const rc = cur as CallExpression;
      recvName = receiverName(ctx, ir, (rc.getExpression() as any).getExpression());
      pathNode = rc.getArguments()[0];
    } else {
      recvName = receiverName(ctx, ir, callee.getExpression());
      pathNode = args[0];
      handlerArgs = args.slice(1);
      // express settings getter: app.get('port')
      if (method === 'get' && args.length === 1) continue;
    }
    if (!recvName || !pathNode || !handlerArgs.length) continue;
    const refs = flattenRefs(ctx, handlerArgs).filter((r) => r.kind !== 'unknown');
    if (!refs.length) continue;
    const handler = refs[refs.length - 1]!;
    const middleware = refs.slice(0, -1);

    const isRegex = Node.isRegularExpressionLiteral(ctx.unwrap(pathNode));
    const pi = isRegex ? { paths: [], dynamic: true } : ctx.pathsOf(pathNode);
    const paths = pi.paths.length ? pi.paths : [''];
    for (const p of paths) {
      const nameLoc = ctx.loc(callee.getNameNode());
      const r: RouteIR = {
        method: http,
        path: p,
        router: recvName,
        handler,
        middleware,
        order,
        loc: call.getStartLineNumber() === nameLoc.line ? ctx.loc(call) : nameLoc,
      };
      if (pi.dynamic) {
        r.dynamic = true;
        dynamicSeen = true;
      }
      ir.routes.push(r);
    }
  }

  ir.routes.sort((a, b) => a.order - b.order);
  ir.mounts.sort((a, b) => a.order - b.order);
  if (dynamicSeen) ir.flags.push('dynamic-registration');

  // routers referenced but never declared here (e.g. `app` passed as a param) → implicit decls
  for (const name of new Set([
    ...ir.routes.map((r) => r.router),
    ...ir.mounts.map((m) => m.router),
  ])) {
    if (!ir.routers.some((r) => r.name === name)) {
      ir.routers.push({
        name,
        kind: /^(app|server)$/.test(name) ? 'app' : 'router',
        implicit: true,
        loc:
          ir.routes.find((r) => r.router === name)?.loc ??
          ir.mounts.find((m) => m.router === name)!.loc,
      });
    }
  }
}
