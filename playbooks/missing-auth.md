---
type: missing-auth
title: Missing authentication on data-bearing routes
kind: vulnerability
agent: auth
owasp: A01:2025
apiTop10: API2:2023
cwe: [306, 862]
severityBase: high
verifierTemplate: missing-auth
verification: dynamic
factQueries: [getUnprotectedRoutes, getRoute, getMiddlewareChain, getExposure]
signals: [unprotected-touches-data, auth-weak]
requires: []
summary: A route that reads or changes data can be called without logging in (or with an auth middleware that never rejects).
---

## Threat
Endpoints that operate on the database but require no valid credential let anyone on the network read, modify or delete data, and often expose sensitive fields. Typical causes: an auth middleware registered *after* the route, applied to a sibling router but not this one, an "optional auth" middleware used on a private route, or a forgotten `/api/admin` path.

## Preconditions
1. `route.protected = false` (no enforcing auth middleware in the chain) **or** `authEnforcement = weak`.
2. The handler touches a model (`models[]` non-empty), writes data, or returns sensitive fields.
3. The route is mounted (`mounted: true`).

## Signals
- `unprotected-touches-data`: the route has no auth middleware and operates on a database model.
- `auth-weak`: an auth-like middleware exists but never rejects (optional auth), so the route is effectively public.

## Investigation strategy
1. `getUnprotectedRoutes({})` — the candidate list (mounted routes without auth). Ignore routes with empty `models`.
2. `getRoute({route})` — check `authorization`, `models`, `dbOps` (writes?), `exposesSensitive`, `mutates`. Rank: writes first, then credential/financial exposure, then reads.
3. `getMiddlewareChain({route})` — look at the order. A protected sibling route often shows `authenticate` in its chain; if this route's chain lacks it, check whether it was registered before the global `use(auth)` (fact: chain has no auth entry; the route is `unprotected`). A `conditional: true` auth entry means the middleware was mounted on a dynamic path and may not apply.
4. `getExposure({route})` — list the sensitive assets the anonymous caller would receive.
5. Apply the false-positive rules, then propose with the chain, the models touched and what is exposed.

## False-positive rules
Do not propose for intentionally public routes when they expose nothing sensitive and change nothing meaningful:
- Health/readiness, version, static/marketing content, public catalog reads without sensitive assets.
- **Authentication endpoints** (`/login`, `/register`, `/signup`, `/forgot-password`, `/refresh`) are public by design. Do not report "missing auth" on them; instead read the nosql-injection, mass-assignment and data-exposure playbooks (they often *return* credentials or accept privileged fields).
- Webhooks that verify a signature in the handler (`selfAuthenticated` true) — say so.
- Routes whose data is per-request only and never persisted or returned (echo endpoints).
When unsure whether a route is meant to be public, propose with `low` confidence and list the reason.

## Relevant graph relationships
`Route —PROTECTED_BY→ Middleware` (ordered by `props.order`, with `origin` app/mount/router/route). `Project —EXPOSES→ Route` marks mounted entry points. `Function —EXPOSES→ Asset` shows what an anonymous call returns.

## Verification strategy
Verifier template: `missing-auth`. Send the request with no credentials (and once with a syntactically valid but unrelated token). CONFIRMED when the sandbox returns 2xx with real data (or the write takes effect). REJECTED on 401/403. Use safe methods first; for writes use a disposable record created by the verifier.

## Evidence requirements
Route id and method; the middleware chain (showing no enforcing auth); models and ops touched; exposed sensitive assets; the unauthenticated request and the response body excerpt (values masked for credentials); expected 401/403 vs actual status.

## Remediation guidance
Guidance only. Apply authentication at the router or application level before route registration (`app.use(authenticate)` above the routers) so new routes default to protected, and mark deliberately public routes explicitly. Replace optional-auth on private routes with an enforcing middleware. Add an integration test that hits every non-public route without a token.
