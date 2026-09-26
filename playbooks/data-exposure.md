---
type: data-exposure
title: Excessive sensitive data exposure in responses
kind: vulnerability
agent: dataflow
owasp: A01:2025
apiTop10: API3:2023
cwe: [200, 213, 359]
severityBase: medium
verifierTemplate: data-exposure
verification: dynamic
factQueries: [getExposure, getRoute, getSensitiveAssets, getModelAccess]
signals: [exposes-credential, exposes-sensitive]
requires: []
summary: A response returns sensitive fields (password hashes, tokens, payment or personal data) that the caller does not need or should not see.
---

## Threat
Handlers return whole database documents (`res.json(user)`), so fields like `password`, `apiKey`, tokens, payment details and personal data leak to any caller of the route. Attackers combine this with IDOR or missing authentication to harvest credentials. Even for the legitimate owner, returning password hashes or secrets is a flaw.

## Preconditions
1. `getExposure` reports the route/function returning sensitive assets (`exposes-sensitive`); credential-tier assets (`exposes-credential`) are highest priority.
2. The returned value is a full document from a document-returning op (`find*`, `create`, `new`) without `.select('-field')`/projection, and the field is not `select:false` in the schema.

## Signals
- `exposes-credential`: the handler returns credential-tier fields (password, token, apiKey…).
- `exposes-sensitive`: the handler returns sensitive fields of any tier (financial, pii).

## Investigation strategy
1. `getExposure({})` — group by asset and tier. Handle `credential` first, then `financial`, then `pii`.
2. `getRoute({route})` for each exposing route — combine `authorization` and `protected` with the exposure: an anonymous or non-owner caller receiving credentials is critical; the owner receiving their own address is usually fine.
3. `getSensitiveAssets({tier: "credential"})` — check `exposedByRoutes` vs `touchedByRoutes` and `selectFalse`; an asset that is `select:false` but appears exposed means an explicit `+field` select or a `create/new` result.
4. `getModelAccess({model})` — compare with safe reads of the same model that use `.select('-password')`; the difference shows the omission.
5. Propose one hypothesis per (route, asset) group; state who can call the route and what tier leaks.

## False-positive rules
- The owner receives their own *pii/financial* data on an authorized route (`authorization: present`) and it is needed by the feature — at most `info`.
- The field appears in the model but the op has `select` excluding it (`.select('-paymentDetails')`) — the graph already removes it; do not re-add.
- Password **hashes** returned to an authorized owner are still a flaw; do not downgrade credential tier, but note the caller.
- The route returns only counts/aggregates (a variable bound to `countDocuments` result) — facts do not link those; ignore.

## Relevant graph relationships
`Function —EXPOSES→ Asset` (props: `via` (json/send), `var`, `select`, `confidence: direct`). `Function —ACCESSES→ Model` op with `resultVar`. `Model —CONTAINS→ Asset` with `tier`/`weight`/`selectFalse`.

## Verification strategy
Verifier template: `data-exposure` (proposed for C7; sandbox only). Call the route as the least-privileged caller who can reach it (anonymous if unprotected, else a normal user against another user's id where applicable). CONFIRMED when the response body contains the sensitive field with a non-empty value; store evidence with the value masked. REJECTED when the field is absent. Compare against the field's presence in a baseline request.

## Evidence requirements
Route, caller level used, the asset (`Model.field`, tier), the code path (`var` from op at file:line to the response line), the masked response excerpt showing the field, and whether the caller is the owner.

## Remediation guidance
Guidance only. Return explicit DTOs instead of documents; exclude sensitive fields with schema-level `select: false`, `.select('-password')` or `toJSON` transforms; never return credentials or tokens after creation/login except the one-time token the client needs. Review every `res.json(doc)`.
