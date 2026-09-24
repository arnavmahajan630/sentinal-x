import { Node, SyntaxKind } from 'ts-morph';
import type { Ctx } from '../context';
import type { ExportIR, FileIR, ImportIR } from '../types';

export function modelNameOf(ctx: Ctx, expr: Node): string | undefined {
  const u = ctx.unwrap(expr);
  if (Node.isBinaryExpression(u))
    return modelNameOf(ctx, u.getRight()) ?? modelNameOf(ctx, u.getLeft());
  if (Node.isCallExpression(u)) {
    const c = u.getExpression().getText();
    if (/(^|\.)model$/.test(c) && u.getArguments()[0]) return ctx.strOf(u.getArguments()[0]!);
  }
  return undefined;
}

export function extractImports(ctx: Ctx, ir: FileIR): void {
  // ESM
  for (const imp of ctx.sf.getImportDeclarations()) {
    const rec: ImportIR = {
      module: imp.getModuleSpecifierValue(),
      style: 'esm',
      default: imp.getDefaultImport()?.getText(),
      namespace: imp.getNamespaceImport()?.getText(),
      names: imp.getNamedImports().map((n) => ({
        imported: n.getName(),
        local: n.getAliasNode()?.getText() ?? n.getName(),
      })),
      loc: ctx.loc(imp),
    };
    ir.imports.push(rec);
  }
  // CJS require()
  for (const call of ctx.sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const arg = call.getArguments()[0];
    if (!Node.isIdentifier(callee) || callee.getText() !== 'require' || !arg) continue;
    const module = ctx.strOf(arg);
    if (module === undefined) continue;
    const rec: ImportIR = { module, style: 'cjs', names: [], loc: ctx.loc(call) };
    const parent = call.getParent();
    if (parent && Node.isVariableDeclaration(parent) && parent.getInitializer() === call) {
      const nn = parent.getNameNode();
      if (Node.isIdentifier(nn)) rec.default = nn.getText();
      else if (Node.isObjectBindingPattern(nn)) {
        for (const el of nn.getElements()) {
          rec.names.push({
            imported: el.getPropertyNameNode()?.getText() ?? el.getNameNode().getText(),
            local: el.getNameNode().getText(),
          });
        }
      }
    } else if (
      parent &&
      Node.isPropertyAccessExpression(parent) &&
      parent.getExpression() === call
    ) {
      const decl = parent.getParent();
      if (decl && Node.isVariableDeclaration(decl) && Node.isIdentifier(decl.getNameNode())) {
        rec.names.push({ imported: parent.getName(), local: decl.getNameNode().getText() });
      }
    }
    ir.imports.push(rec);
  }
}

export function extractExports(ctx: Ctx, ir: FileIR): void {
  const sf = ctx.sf;
  const push = (e: ExportIR) => ir.exports.push(e);
  const fnIdOfNode = (n?: Node) => (n ? ctx.fns.get(ctx.unwrap(n))?.id : undefined);
  const describe = (name: string, expr: Node | undefined, style: 'esm' | 'cjs', at: Node) => {
    const u = expr ? ctx.unwrap(expr) : undefined;
    push({
      name,
      local: u && Node.isIdentifier(u) ? u.getText() : undefined,
      fnId: fnIdOfNode(u),
      modelName: u ? modelNameOf(ctx, u) : undefined,
      style,
      loc: ctx.loc(at),
    });
  };

  // ESM
  for (const st of sf.getStatements()) {
    if (Node.isExportAssignment(st)) {
      describe('default', st.getExpression(), 'esm', st);
    } else if (Node.isFunctionDeclaration(st) && st.isExported()) {
      const name = st.isDefaultExport() ? 'default' : (st.getName() ?? 'default');
      push({ name, local: st.getName(), fnId: fnIdOfNode(st), style: 'esm', loc: ctx.loc(st) });
    } else if (Node.isClassDeclaration(st) && st.isExported()) {
      push({
        name: st.isDefaultExport() ? 'default' : (st.getName() ?? 'default'),
        local: st.getName(),
        style: 'esm',
        loc: ctx.loc(st),
      });
    } else if (Node.isVariableStatement(st) && st.isExported()) {
      for (const d of st.getDeclarations()) {
        const nn = d.getNameNode();
        if (Node.isIdentifier(nn)) describe(nn.getText(), d.getInitializer(), 'esm', d);
        if (Node.isIdentifier(nn)) ir.exports[ir.exports.length - 1]!.local = nn.getText();
      }
    } else if (Node.isExportDeclaration(st)) {
      const from = st.getModuleSpecifierValue();
      const named = st.getNamedExports();
      if (from && !named.length && !st.getNamespaceExport()) {
        push({ name: '*', from, style: 'esm', loc: ctx.loc(st) } as ExportIR);
      }
      for (const n of named) {
        push({
          name: n.getAliasNode()?.getText() ?? n.getName(),
          local: n.getName(),
          from,
          style: 'esm',
          loc: ctx.loc(st),
        } as ExportIR);
      }
    }
  }

  // CJS
  for (const st of sf.getStatements()) {
    if (!Node.isExpressionStatement(st)) continue;
    const e = st.getExpression();
    if (!Node.isBinaryExpression(e) || e.getOperatorToken().getKind() !== SyntaxKind.EqualsToken)
      continue;
    const left = e.getLeft().getText();
    const right = ctx.unwrap(e.getRight());
    if (left === 'module.exports') {
      if (Node.isObjectLiteralExpression(right)) {
        for (const p of right.getProperties()) {
          if (Node.isShorthandPropertyAssignment(p)) {
            push({ name: p.getName(), local: p.getName(), style: 'cjs', loc: ctx.loc(p) });
          } else if (Node.isPropertyAssignment(p)) {
            describe(p.getName(), p.getInitializer(), 'cjs', p);
          } else if (Node.isMethodDeclaration(p)) {
            push({ name: p.getName(), fnId: fnIdOfNode(p), style: 'cjs', loc: ctx.loc(p) });
          }
        }
      } else describe('default', right, 'cjs', st);
    } else {
      const m = /^(?:module\.)?exports\.(\w+)$/.exec(left);
      if (m) describe(m[1]!, right, 'cjs', st);
    }
  }
}

export function extractRouterDecls(ctx: Ctx, ir: FileIR): void {
  const expressLocals = new Set<string>();
  const routerCtors = new Set<string>();
  for (const imp of ir.imports) {
    if (imp.module !== 'express') continue;
    if (imp.default) expressLocals.add(imp.default);
    if (imp.namespace) expressLocals.add(imp.namespace);
    for (const n of imp.names) if (n.imported === 'Router') routerCtors.add(n.local);
  }
  for (const decl of ctx.sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    const nn = decl.getNameNode();
    if (!init || !Node.isIdentifier(nn)) continue;
    const u = ctx.unwrap(init);
    if (!Node.isCallExpression(u)) continue;
    const callee = u.getExpression().getText();
    let kind: 'app' | 'router' | undefined;
    if (
      expressLocals.has(callee) ||
      callee === 'express' ||
      /^require\(['"]express['"]\)$/.test(callee)
    )
      kind = 'app';
    else if (
      routerCtors.has(callee) ||
      callee === 'Router' ||
      [...expressLocals].some((l) => callee === `${l}.Router`) ||
      /^(express\.Router|require\(['"]express['"]\)\.Router)$/.test(callee)
    ) {
      kind = 'router';
    }
    if (kind) ir.routers.push({ name: nn.getText(), kind, loc: ctx.loc(decl) });
  }
}
