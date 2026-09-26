---
type: secret-exposure
title: Hardcoded and exposed secrets
kind: vulnerability
agent: dataflow
owasp: A04:2025
cwe: [798, 259, 312, 540]
severityBase: high
verifierTemplate: null
verification: undecided
factQueries: [getSecrets, getJwtUsage, getDependency]
signals: [secret:hardcoded, secret:connection-string-credentials, secret:env-file-committed]
requires: []
summary: Credentials, API keys, signing secrets or connection strings with passwords are written in source code or a committed .env file.
---

## Threat
Secrets in source control leak to everyone with repository access, CI logs and forks, and persist in history even after removal. Hardcoded database passwords, API keys, private keys and JWT secrets allow direct access to data stores and third-party services and enable token forgery.

## Preconditions
1. `getSecrets` returns a secret with `source: code` (hardcoded literal or known token pattern), a connection string with credentials, or an environment secret defined in a non-example `.env` file present in the repository tree (not gitignored).
2. The value looks real: not an empty string, obvious placeholder, or a value from an example/test fixture.

## Signals
- `secret:hardcoded`: a hardcoded secret/token/key literal exists in code.
- `secret:connection-string-credentials`: a connection string carries embedded credentials (code or env file).
- `secret:env-file-committed`: a non-example .env file with secrets is present in the repository tree.

## Investigation strategy
1. `getSecrets({})` — list all secrets: `source`, `kind`, `definedIn`, `preview`/`len` (masked — never ask for or record the value), `usedBy`, `hasDefault`, `fallbackFor`.
2. `getJwtUsage({})` — find secrets that sign or verify tokens (`secretSource`), because a leaked JWT secret means forgeable sessions (also see the jwt-security playbook).
3. For hardcoded secrets read `usedBy` (which functions use them) and what they protect (database, third-party API, JWT). A secret used by no function is still exposed but lower impact.
4. `getDependency({name})` for services that the secret unlocks (an SDK dependency plus a key literal, e.g. payments or email) to describe the blast radius.
5. Propose one hypothesis per distinct secret with location (`definedIn`/file:line), kind, `len`, users, and what it grants.

## False-positive rules
- Files named `.env.example`, `.env.sample`, templates and test fixtures are not real secrets (the indexer already excludes examples; tests are excluded from the graph).
- Placeholders (`changeme`, `your-api-key`, `xxx`) and obviously public identifiers (client-side public keys, publishable keys) are not secrets — mark `info` at most.
- A secret that is an environment variable *read* without a default and not defined in the repository is the correct pattern.
- A literal used only as a fallback next to `process.env.X` is a **weakness** (see jwt-security), report it with lower confidence when the variable is enforced at startup.

## Relevant graph relationships
`Secret(env:NAME | hardcoded:file:line)` with masked `preview`/`len`/`entropy`. `Function —USES→ Secret`; `File(.env) —CONTAINS→ Secret`; `Database.credentialsInUrl`.

## Verification strategy
Undecided (C7 finding policy). A hardcoded secret in a repository is directly provable from the facts (static evidence: file, line, kind, masked length) without any network traffic; using the value against real services is **never** allowed. Until the policy is decided, record hypotheses with fact evidence only and request no verifier template.

## Evidence requirements
Secret kind; location (`definedIn` or file:line); masked preview and length (never the value); functions that use it; what it protects (JWT signing, database, third-party); whether the file is tracked in the repository tree.

## Remediation guidance
Guidance only. Rotate every exposed secret first (assume compromise), move secrets to environment variables or a secret manager, delete them from history where possible, add secret scanning to CI and `.env` to `.gitignore`, and commit only `.env.example` with placeholders.
