---
type: nosql-injection
title: NoSQL (operator) injection in MongoDB queries
kind: vulnerability
agent: dataflow
owasp: A05:2025
cwe: [943, 89]
severityBase: high
verifierTemplate: nosql-injection
verification: dynamic
factQueries: [getRoutes, getRoute, getDataflow, getModelAccess]
signals: [query-built-from-input-object]
requires: []
summary: Request values are placed inside a MongoDB filter object, so an attacker can send operators such as $ne or $gt to bypass checks or extract data.
---

## Threat
When a handler builds a query like `User.findOne({ username: req.body.username, password: req.body.password })`, a JSON body such as `{"username":"admin","password":{"$ne":null}}` turns the password check into "password is not null" and logs the attacker in. Express also parses `?user[$ne]=x` into nested objects. Impact ranges from authentication bypass to data extraction with `$regex`/`$gt` and, when `$where` is reachable, server-side JS execution.

## Preconditions
1. A model read/update/delete operation whose **filter** contains values taken from `req.body` or `req.query` (`queryShape` keys of kind `input`, or the whole input as the filter).
2. The value is not coerced to a primitive (`String(x)`, schema validation) before the query.
3. The route is reachable by the attacker (check `authorization` for the impact).

## Signals
- `query-built-from-input-object`: a read/update/delete filter is built from body/query values (operator-injection surface).

## Investigation strategy
1. `getRoutes({authorization: "none"})` and `getRoutes({mutates: false})` for login/search-style routes; also review protected routes later. Prefer `POST` routes with credentials, and search endpoints with `req.query`.
2. `getRoute({route})` — read `dbOps[]`: for each op look at `queryShape` (which keys receive body/query input) and `argSources` (canonical inputs such as `req.body.password`).
3. `getDataflow({route})` — confirm the step `req.body.<field> → handler → Model` and which query keys carry it (`findOne(password, username)`); an input that is a *whole* object (`find(req.body)`) is the worst case.
4. `getModelAccess({model})` — see what data the model holds (credentials?), and whether other routes filter the same model with the same pattern.
5. Check `middleware[]` for a `validation` kind entry before the handler; if present, note it as mitigating and lower confidence. Propose with the injection point (field/key), the operation and the impact (auth bypass vs data leak).

## False-positive rules
- The value comes from `req.params` only (always a string) — not injectable.
- A validation middleware (kind `validation`) in the chain enforces string types, or the code coerces (`String()`, `.toString()`, `Number()`) — the facts unwrap these coercions, so `queryShape` would then show a plain var, not an input.
- The app enables Mongoose `sanitizeFilter` (a config fact is not available: mark unknown rather than assert).
- `create`/`insertMany` with body data is **mass-assignment**, not NoSQL injection (see that playbook).

## Relevant graph relationships
`Input(req.body.x) —FLOWS_TO→ Function —FLOWS_TO→ Model` with `ops[].queryShape` and `argSources`. `Function —ACCESSES→ Model` lists all ops. `Function —EXPOSES→ Asset` shows what an injected query can return.

## Verification strategy
Verifier template: `nosql-injection` (sandbox only). For credential fields send operator payloads in JSON: `{"password":{"$ne":null}}`, `{"password":{"$gt":""}}`, and for query strings `?field[$ne]=x`. CONFIRMED when the response changes as an injection would (login succeeds without the password, extra records are returned, or a boolean difference between two crafted payloads is observable). REJECTED when the server returns validation errors or the same result as the benign request. Always try the benign request first for a baseline.

## Evidence requirements
Route, injected field and query key; the operation (`Model.op`, file:line) and `queryShape`; baseline request/response; injected request/response; the observable difference; affected assets (credential tier raises severity to critical for auth bypass).

## Remediation guidance
Guidance only. Validate and coerce input types (`String(req.body.username)` or a schema validator such as zod/Joi), reject objects where primitives are expected, enable `mongoose.set('sanitizeFilter', true)`, and never pass request objects directly into filters. Compare passwords with a hash function rather than in the query.
