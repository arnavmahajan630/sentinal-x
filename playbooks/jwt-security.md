---
type: jwt-security
title: JWT and token-handling weaknesses
kind: vulnerability
agent: auth
owasp: A07:2025
apiTop10: API2:2023
cwe: [347, 798, 613, 327]
severityBase: high
verifierTemplate: null
verification: undecided
factQueries: [getJwtUsage, getSecrets, getMiddlewareChain, getRoutes]
signals: [jwt:hardcoded-secret, jwt:literal-fallback, jwt:algorithm-none, jwt:ignore-expiration, jwt:no-expiry, jwt:decode-only]
requires: []
summary: Tokens are signed or verified with hardcoded/guessable secrets, without expiry, without signature verification, or with the none algorithm, so sessions can be forged or never expire.
---

## Threat
JSON Web Tokens are only as strong as their verification. Common flaws: a secret literal in source (anyone with the repo can forge admin tokens), an environment secret with a hardcoded fallback that ships to production, `alg: none` accepted, tokens that never expire, `jwt.decode` used where `jwt.verify` is required, or `ignoreExpiration`. Any of these allows account takeover or permanent sessions.

## Preconditions
1. The project uses a JWT library (`getJwtUsage` returns operations).
2. At least one of the signals below holds for a `sign` or `verify` operation that participates in authentication (used by protected routes).

## Signals
- `jwt:hardcoded-secret`: the signing/verifying secret is a literal in code.
- `jwt:literal-fallback`: the secret is read from the environment but falls back to a literal (`process.env.X || "…"`); if the variable is unset in production the literal is used.
- `jwt:algorithm-none`: the options permit algorithm `none` (unsigned tokens).
- `jwt:ignore-expiration`: `verify` is called with `ignoreExpiration`, so expired tokens are accepted.
- `jwt:no-expiry`: `sign` issues tokens without `expiresIn`.
- `jwt:decode-only`: `decode` is used (no signature check) on a value used for authorization.

## Investigation strategy
1. `getJwtUsage({})` — list every operation with `op`, `secretSource` (`env` | `literal` | `var`), `algorithms`, `expiresIn`, `flags` and `usedByRoutes`. Group by flag.
2. `getSecrets({})` — for `secretSource.kind = env`, find the matching secret (`name`, `definedIn`, `hasDefault`). A secret defined in a committed `.env` or with `hasDefault: true` is a weakness; `len` in the masked literal hints at guessability (short secrets are brute-forceable).
3. `getMiddlewareChain({route})` on routes reported as protected — confirm the enforcing auth middleware is the one that calls `verify` (route appears in `usedByRoutes` of the `verify` operation). Protected routes that are *not* covered by any `verify` are a separate lead.
4. `getRoutes({protected: true})` — cross-check that every protected route depends on a `verify` operation; flag the ones that do not.
5. Propose one hypothesis per weakness with the operation location (`fn`, `file`, `line`), the flag, and how many routes rely on it.

## False-positive rules
- `jwt:hardcoded-secret` on a token used only for a *non-authentication* purpose in tests/tooling is `info`; confirm `usedByRoutes` includes real routes.
- A literal fallback in code that is guarded by a startup check which aborts when the variable is missing is lower risk — say so if you can see it (facts cannot: mark as unknown).
- `jwt:decode-only` is fine when a matching `verify` happens elsewhere for the same token flow (e.g. reading the `exp` claim for UI purposes).
- Do not report the *presence* of JWT itself; report a concrete weakness.

## Relevant graph relationships
`Function.jwtOps[]` (secretSource, algorithms, expiresIn, flags). `Function —USES→ Secret(env:NAME | hardcoded:file:line)`. `Route —PROTECTED_BY→ Middleware` where the middleware fn contains the `verify`.

## Verification strategy
Undecided (C7 finding policy). Two tracks are anticipated: (a) **static** confirmation from the facts above (deterministic: a hardcoded secret or a `none` algorithm is provable from `getJwtUsage`); (b) **dynamic** confirmation in the sandbox: a token with `alg: none`, or an expired token, sent to a protected route; ACCEPTED means confirmed. Until the policy is decided, record hypotheses with the fact evidence and request no verifier template.

## Evidence requirements
Operation location (fn, file, line); the exact flag(s); `secretSource` kind with masked preview/length (never the secret); whether a committed `.env` or default defines it; the list of routes that depend on the operation.

## Remediation guidance
Guidance only. Load the secret from a required environment variable with no default (fail at startup if missing), use long random secrets or asymmetric keys, pin `algorithms` (never allow `none`), set a short `expiresIn` with refresh tokens, always `verify` (never `decode`) for authorization, and rotate any secret that appeared in source control.
