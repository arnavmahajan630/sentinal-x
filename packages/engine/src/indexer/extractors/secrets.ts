import { Node, SyntaxKind } from 'ts-morph';
import { entropy, maskPreview } from '../context';
import type { Ctx } from '../context';
import type { FileIR, SecretIR } from '../types';

export const SECRET_NAME_RE =
  /(secret|passw(or)?d|pwd|token|api[_-]?key|apikey|private[_-]?key|credential|salt|auth[_-]?key)/i;
const PLACEHOLDER_RE =
  /^(authorization|bearer|content-type|password|passwd|token|secret|jwt|x-auth-token|undefined|null|none|string|bcrypt)$/i;
const KNOWN_TOKENS: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, 'aws-access-key'],
  [/sk-[A-Za-z0-9]{20,}/, 'api-key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'github-token'],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'slack-token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private-key'],
];
const CONN_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@]+@/i; // scheme://user:pass@host

export function classifySecret(name: string, v: string): SecretIR['kind'] | undefined {
  if (v.length < 6) return undefined;
  for (const [re] of KNOWN_TOKENS) if (re.test(v)) return 'known-token';
  if (CONN_RE.test(v)) return 'connection-string';
  if (SECRET_NAME_RE.test(name) && !PLACEHOLDER_RE.test(v) && !(v.length > 25 && /\s/.test(v))) {
    if (v.toLowerCase().replace(/[^a-z]/g, '') === name.toLowerCase().replace(/[^a-z]/g, ''))
      return undefined;
    if (entropy(v) >= 2 || v.length >= 12) return 'hardcoded-secret';
  }
  return undefined;
}

export function toSecret(
  kind: SecretIR['kind'],
  name: string,
  v: string,
  loc: SecretIR['loc'],
): SecretIR {
  return { kind, name, preview: maskPreview(v), len: v.length, entropy: entropy(v), loc };
}

export function extractEnvAndSecrets(ctx: Ctx, ir: FileIR): void {
  // ─ env reads ─
  const seen = new Set<string>();
  const addEnv = (name: string, node: Node, hasDefault: boolean) => {
    const fnId = ctx.reqOwner(node)?.id ?? ctx.moduleFnId();
    const key = `${fnId}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    ir.envReads.push({ name, fnId, hasDefault, loc: ctx.loc(node) });
  };
  for (const n of ctx.sf.getDescendants()) {
    if (Node.isPropertyAccessExpression(n) && n.getExpression().getText() === 'process.env') {
      addEnv(n.getName(), n, hasDefaultAround(n));
    } else if (Node.isElementAccessExpression(n) && n.getExpression().getText() === 'process.env') {
      const k = n.getArgumentExpression();
      const v = k ? ctx.strOf(k) : undefined;
      if (v) addEnv(v, n, hasDefaultAround(n));
    } else if (Node.isVariableDeclaration(n)) {
      const nn = n.getNameNode();
      const init = n.getInitializer();
      if (init && Node.isObjectBindingPattern(nn) && init.getText() === 'process.env') {
        for (const el of nn.getElements())
          addEnv(
            el.getPropertyNameNode()?.getText() ?? el.getNameNode().getText(),
            el,
            !!el.getInitializer(),
          );
      }
    }
  }

  // ─ hard-coded secrets in string literals ─
  const literals = [
    ...ctx.sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
    ...ctx.sf.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral),
  ];
  const locs = new Set<string>();
  for (const lit of literals) {
    if (Node.isImportDeclaration(lit.getParent()) || Node.isExportDeclaration(lit.getParent()))
      continue;
    const v = lit.getLiteralText();
    if (v.length < 6) continue;
    const name = contextName(ctx, lit);
    const kind = classifySecret(name ?? '', v);
    if (!kind) continue;
    const key = `${lit.getStartLineNumber()}:${lit.getStart()}`;
    if (locs.has(key)) continue;
    locs.add(key);
    ir.secrets.push(toSecret(kind, name ?? kind, v, ctx.loc(lit)));
  }
}

function hasDefaultAround(n: Node): boolean {
  const p = n.getParent();
  if (p && Node.isBinaryExpression(p) && p.getLeft() === n) {
    const k = p.getOperatorToken().getKind();
    return k === SyntaxKind.BarBarToken || k === SyntaxKind.QuestionQuestionToken;
  }
  return false;
}

/** what is this string literal being assigned to / used as? */
function contextName(ctx: Ctx, lit: Node): string | undefined {
  const p = lit.getParent();
  if (!p) return undefined;
  if (Node.isPropertyAssignment(p) && p.getInitializer() === lit)
    return p.getName().replace(/^['"]|['"]$/g, '');
  if (Node.isVariableDeclaration(p) && p.getInitializer() === lit) return p.getName();
  if (Node.isBinaryExpression(p)) {
    const k = p.getOperatorToken().getKind();
    if (k === SyntaxKind.EqualsToken && p.getRight() === lit)
      return p.getLeft().getText().split('.').pop();
    if (
      (k === SyntaxKind.BarBarToken || k === SyntaxKind.QuestionQuestionToken) &&
      p.getRight() === lit
    ) {
      const l = p.getLeft().getText();
      const m = /process\.env\.(\w+)|process\.env\[['"](\w+)['"]\]/.exec(l);
      if (m) return m[1] ?? m[2];
    }
  }
  if (Node.isCallExpression(p)) {
    const callee = p.getExpression();
    const idx = p.getArguments().indexOf(lit as any);
    if (
      idx === 1 &&
      Node.isPropertyAccessExpression(callee) &&
      Node.isIdentifier(callee.getExpression()) &&
      ctx.jwtLocals.has(callee.getExpression().getText())
    ) {
      return 'jwt-secret';
    }
    if (idx === 1 && Node.isIdentifier(callee) && ctx.jwtNamed.has(callee.getText()))
      return 'jwt-secret';
  }
  return undefined;
}
