---
type: idor
title: Insecure Direct Object Reference (BOLA)
kind: vulnerability
agent: auth
owasp: A01:2025
apiTop10: API1:2023
cwe: [639, 284]
severityBase: high
verifierTemplate: idor
verification: dynamic
factQueries: [getAuthorizationGaps, getRoute, getDataflow, getModelAccess, getExposure]
signals: [authorization:unknown, authorization:none]
requires: [user-controlled-id-flows-to-model-read]
summary: A caller can read or change another user's object by changing an id, because no blocking ownership check stands between the id and the database.
---

## Threat
The API accepts an object identifier from the client (URL param, query, body) and uses it to read or modify a record without verifying the record belongs to the caller. An attacker enumerates or guesses ids and reads other users' orders, profiles or payment data (BOLA / IDOR). It is the most common and most damaging API flaw because the caller is often fully authenticated, so scanners and auth middleware see nothing wrong.

## Preconditions
All of these must hold for a hypothesis:
1. The route reaches a model operation with an id-like input (`route.exposesUserId = true`): `req.params.id`, `req.query.userId`, `req.body.orderId`, …
2. No **blocking** ownership evidence: `route.authorization` is `unknown` (or `none`) and `authzEvidence` has no blocking `ownership-compare` / `user-scoped-query`.
3. The model holds per-user data (it has an owner/user reference, or sensitive assets such as credentials, payment or personal data).

## Signals
- `user-controlled-id-flows-to-model-read` (required): an id-like input reaches a model op in the handler.
- `authorization:unknown`: logged in, no blocking authorization check found.
- `authorization:none`: no login at all (then also read the missing-auth playbook; the object exposure is worse).

## Investigation strategy
1. `getAuthorizationGaps({})` — take routes whose `reasons` include `idParamReachesDb` (for `authorization:none` routes use `getRoute` directly). Rank: mutating first (`mutatesData`), then routes that also list `exposesSensitive`.
2. `getRoute({route})` for each candidate. Confirm `exposesUserId: true`, `authorization: unknown|none`, and read `authzEvidence`: it must contain **no** item with `blocking: true` and kind `ownership-compare` or `user-scoped-query`.
3. `getDataflow({route})` — find the step `req.params.id → handler → Model` and read the sink's `queryShape`. The bug shape is a filter made **only** of the input (`findById(id)`, `{ _id: id }`), with no key bound to the caller (`user`, `owner`, `userId` = `req.user…`).
4. `getModelAccess({model})` — check the model's other operations. If sibling routes on the same model use scoped queries (`{ _id, user: req.user.id }`) and this one does not, that is strong evidence of an oversight rather than a public resource.
5. `getExposure({route})` — list which sensitive fields (`credential`, `financial`, `pii`) the handler returns. Tier drives severity.
6. Propose a hypothesis only if steps 2–3 hold. Record the route, the input, the sink op (file:line), the missing evidence and the exposed assets.

## False-positive rules
Do **not** propose when any of these is true:
- `authorization: present` with a blocking `user-scoped-query` or a guarded `ownership-compare` (403/404/throw) in `handler`, `callee` or `middleware`.
- The id comes from the auth context (`req.user.id`) rather than the request — `exposesUserId` would be false; double-check `inputs[]`.
- The model has no per-user data and no sensitive assets (public catalog resources: products, posts marked public) — at most `info`.
- The route is admin-only with a blocking role guard **and** the model is not per-user data (admins may see all).
- The identifier is a random unguessable value AND the resource is meant to be shared by link (still report as `low`, mention the design).
Ownership checks hidden in a helper the handler does not call are invisible to the facts: state that limit instead of asserting the bug.

## Relevant graph relationships
`Input(req.params.id) —FLOWS_TO→ Function(handler) —FLOWS_TO→ Model` carries the sink op and `queryShape`. `Route —PROTECTED_BY→ Middleware` shows who authenticates. `Function —ACCESSES→ Model` lists all ops. `Function —EXPOSES→ Asset` lists returned sensitive fields. `Function.authz` holds ownership/role evidence.

## Verification strategy
Verifier template: `idor` (sandbox only, seeded users). Login as **User A** and **User B**; create or locate a resource owned by B; request it with A's token (and for writes, attempt the same mutation). CONFIRMED when the response is 2xx and contains B's data (or the mutation is visible to B). REJECTED when the server answers 403/404 or returns only A's data. INCONCLUSIVE when the setup fails (no resource, sandbox down). For `authorization:none` routes also try with no token.

## Evidence requirements
Findings must carry: route id; the input and sink (`Model.op` with file:line); `queryShape` showing no user binding; the absent blocking evidence; exposed sensitive assets with tier; and the verifier's request/response pair (A's token → B's object) with expected vs actual. Confidence is high only when the exploit succeeded.

## Remediation guidance
Guidance only; Sentinel-X never edits code. Scope every object query to the caller (`findOne({ _id: id, user: req.user.id })`) or compare `resource.owner` with `req.user.id` and stop with 403/404 before returning or mutating. Centralise the check in middleware or a policy helper so new routes inherit it. Prefer 404 over 403 to avoid leaking existence, and never trust ids from the body for ownership.
