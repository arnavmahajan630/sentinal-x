---
type: authorization
title: Reading authentication and authorization facts
kind: reference
agent: shared
owasp: A01:2025
cwe: [285, 862, 863]
severityBase: info
verifierTemplate: null
verification: none
appliesTo: [idor, privilege-escalation, missing-auth]
summary: Reference for interpreting route.authorization, authEnforcement and authzEvidence so agents judge access control the same way every time.
---

## Purpose
Shared vocabulary for every access-control playbook. Authentication answers "who are you?"; authorization answers "may **you** touch **this object / this function**?". Most real bugs are *authenticated but unauthorized*: the caller is logged in, and nothing stops them reaching someone else's data or an admin function. This reference tells you exactly what the fact fields mean so you neither miss those bugs nor flag routes that are properly protected.

## Concepts
- **Authentication middleware** (`middleware[].kind = 'auth'`): verifies a credential (JWT, session). `authEnforcement` says whether it really rejects: `enforcing` (sends 401/403 or throws), `weak` (looks at credentials but lets the request continue, e.g. optional auth), `none` (no auth middleware in the chain).
- **Authorization** (`route.authorization`):
  - `none` — no login at all (and the handler does not verify credentials itself).
  - `present` — a check exists that **really blocks**: a query scoped to the logged-in user (`{ _id, user: req.user.id }`), an ownership comparison whose failure returns 403/404/throws, or a role check / role middleware that rejects.
  - `unknown` — logged in, but no blocking check was found. This is the state where IDOR/BFLA live. It also covers non-blocking comparisons (a comparison whose result is only logged), name-only role guards, and weak auth.
- **Blocking vs non-blocking evidence**: every item in `authzEvidence` has `blocking: true|false`. A comparison without a guard (`guards` missing) is not proof of protection.
- **Ownership vs role**: ownership evidence (`ownership-compare`, `user-scoped-query`) protects *object-level* access (IDOR/BOLA). Role evidence (`role-check`, role guard middleware) protects *function-level* access (BFLA). A role guard does **not** stop user A from reading user B's data on a route both can call.
- **Where evidence lives**: `where` = `handler`, `callee` (called from the handler, depth ≤ 2) or `middleware` (chain, including functions nested inside a middleware factory).

## Reading the facts
1. `getAuthorizationGaps({})` returns only routes where the gap *matters* (an id from the URL reaches the DB, data is written or returned, or the body is mass-assigned) with `reasons[]`. Start here.
2. `getRoute` gives the full picture: `protected`, `authEnforcement`, `authorization`, `authzEvidence[]`, `roleGuards[]`, `exposesUserId`, `dbOps[]`, `exposedSensitive[]`.
3. `getMiddlewareChain` shows order and `kind`; entries with `conditional: true` are uncertain and were ignored as protection.
4. `selfAuthenticated: true` means the handler verifies the JWT itself although the chain has no auth middleware; treat as `unknown`, not `none`.
5. `present` is a strong signal but not a guarantee: read the `expr` of blocking evidence and confirm it compares the *right* things (the resource's owner vs the caller), not two request values.

## Pitfalls
- Do not report a route as an IDOR when `authorization` is `present` with blocking ownership/scoped-query evidence.
- Do not treat a route with only role evidence as safe against IDOR; and do not treat ownership evidence as proof that an admin-only function is protected.
- `unknown` is a lead, not a finding. Only the Verification Engine can confirm.
- Public-by-design routes (health checks, login, signup, static/catalog data) legitimately have `authorization: none`; judge them by what they expose (see the missing-auth playbook).
- Facts are direct and same-function: an ownership check performed in an unrelated helper the handler never calls will not appear. Say so in your rationale instead of guessing.
