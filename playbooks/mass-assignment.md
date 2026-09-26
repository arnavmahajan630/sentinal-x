---
type: mass-assignment
title: Mass assignment (over-posting) into database writes
kind: vulnerability
agent: dataflow
owasp: A01:2025
apiTop10: API3:2023
cwe: [915]
severityBase: high
verifierTemplate: mass-assignment
verification: dynamic
factQueries: [getRoutes, getRoute, getModelAccess, getSensitiveAssets]
signals: [mass-assignment]
requires: []
summary: The whole request body is passed into a create/update, so a caller can set fields they should never control (role, isAdmin, ownership, balance, verification flags).
---

## Threat
Handlers such as `User.create(req.body)`, `new Order({ ...req.body })` or `Model.findByIdAndUpdate(id, req.body)` copy every client-supplied property into the record. An attacker adds `"role":"admin"`, `"isAdmin":true`, `"user":"<victim id>"`, `"balance":1000000` or `"verified":true` and gains privileges, reassigns ownership or forges state. It is API3 (property-level authorization) and frequently chains into privilege escalation or IDOR.

## Preconditions
1. A write operation (`create`, `insertMany`, `new`, `update*`, `findByIdAndUpdate`, `findOneAndUpdate`) receives the **whole** `req.body` (`route.massAssignment = true`; `argSources` contains `req.body`).
2. The target model has fields that must not be client-controlled (role/permission flags, owner references, money, verification, credential fields). Facts list sensitive fields (`getSensitiveAssets`); other privileged fields (role, isAdmin) are not classified, so treat them as *possible* and prove with the verifier.
3. The route is reachable by an attacker (public signup routes are the highest risk).

## Signals
- `mass-assignment`: the whole req.body is passed into create/update/new.

## Investigation strategy
1. `getRoutes({mutates: true})` — list writing routes; sort public (`protected: false`) first, then authenticated.
2. `getRoute({route})` — read `dbOps[]`: keep ops whose `argSources` contains `req.body` (whole) and whose `op` is a write. Note the model and whether the handler also sets ownership from the auth context (`user: req.user.id` in the shape — good, but the spread can still override it if it comes *after* the spread).
3. `getModelAccess({model})` — see who else writes to this model and with what arguments; a route that whitelists fields (`argSources` like `req.body.name`) next to one that spreads the whole body shows the inconsistency.
4. `getSensitiveAssets({})` — check whether the model contains credential/financial/pii assets that the body could overwrite (`password`, `apiKey`, `paymentDetails`). Mention `selectFalse` assets: they are hidden on read but still writable.
5. Propose with the route, the write op (file:line), the model, and which sensitive or privileged fields could be set.

## False-positive rules
- The handler passes a **picked/whitelisted** object (`argSources` list specific fields, or a DTO created from named properties) — not mass assignment.
- The model schema is `strict` and the privileged field does not exist on it (unknown fields are dropped) — verify on the sandbox before claiming impact; without facts about the schema, use `low` confidence.
- Validation middleware (kind `validation`) enforces a schema with `additionalProperties: false`/`stripUnknown`.
- Update operations that use `$set` with named fields only.

## Relevant graph relationships
`Input(req.body) —FLOWS_TO→ Function —FLOWS_TO→ Model` with `ops[]` (`op`, `argSources = ['req.body']`, `queryShape`). `Model —CONTAINS→ Asset` gives sensitive fields that could be overwritten.

## Verification strategy
Verifier template: `mass-assignment` (proposed for C7; sandbox only). Send the normal request plus an extra privileged/unknown field with a recognisable value (`"role":"admin"`, `"isAdmin":true`, or a marker field), then read the record back through a normal read endpoint. CONFIRMED when the extra field is persisted or reflected. REJECTED when it is ignored or the request is refused. Use a throw-away record and never change the seeded admin.

## Evidence requirements
Route; write op and location; the injected field(s); request/response of the write; the read-back proving the field persisted; the model and its sensitive assets; impact (privilege escalation vs data tampering).

## Remediation guidance
Guidance only. Never pass `req.body` to a model write. Build the update object from an explicit allowlist (`const { name, email } = req.body`), validate with a schema that strips unknown keys, and set server-owned fields (owner, role, balance) from the authenticated context after the client values.
