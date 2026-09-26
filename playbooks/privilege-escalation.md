---
type: privilege-escalation
title: Privilege escalation and broken function-level authorization (BFLA)
kind: vulnerability
agent: auth
owasp: A01:2025
apiTop10: API5:2023
cwe: [269, 285, 862]
severityBase: high
verifierTemplate: bfla
verification: dynamic
factQueries: [getRoutes, getRoute, getMiddlewareChain, getModelAccess]
signals: [privileged-path-without-role-check]
requires: []
summary: A normal user can call an administrative or privileged function because no role or permission check guards it.
---

## Threat
Privileged functions (user management, role changes, configuration, exports, internal tools) are reachable by any authenticated user — or anyone — because authorization is only checked in the UI or not at all. Attackers change the URL from `/api/orders` to `/api/admin/users`, or switch the HTTP method (`GET` allowed, `DELETE` forgotten). Vertical escalation also happens when a normal user can set their own role.

## Preconditions
1. The path or behaviour is privileged: path segments such as `admin`, `staff`, `manager`, `internal`, `superuser`; or the handler mutates users, roles, permissions, billing or configuration.
2. There is **no blocking role evidence**: `roleGuards` empty and `authzEvidence` has no blocking `role-check` (in the handler, a callee, or a chain middleware).
3. The route is mounted.

## Signals
- `privileged-path-without-role-check`: the path looks privileged but no role guard or role check was found in the chain or handler.

## Investigation strategy
1. `getRoutes({pathPrefix: "/api/admin"})` and repeat for other privileged prefixes you see (`/api/manage`, `/internal`, `/staff`). Also `getRoutes({mutates: true})` and read the models touched — user, role, permission, account models are privileged data.
2. `getRoute({route})` on each — read `roleGuards[]`, `authzEvidence[]` (kinds `role-check`, `role-guard-middleware`), `authorization` and `middleware[]`.
3. `getMiddlewareChain({route})` — compare with a *known-good* privileged sibling: does it contain `requireRole(...)`/role middleware while this one does not? Inconsistency inside one router is the classic BFLA.
4. `getModelAccess({model})` for user/role models — list every route that can write to them and verify each has role evidence. Check other HTTP verbs on the same path separately.
5. Propose a hypothesis per unguarded privileged route; note whether a normal (non-admin) authenticated user or an anonymous caller can reach it.

## False-positive rules
- A blocking role check exists (`authzEvidence` kind `role-check` with `blocking: true`, from the handler or a middleware). `roleGuards` from a *name-only* guard (evidence kind `role-guard-middleware`, non-blocking) is a lead: read the middleware function; if it truly rejects, do not propose.
- Path only *looks* privileged (`/administration-policy` public docs) but the handler exposes nothing or writes nothing.
- The whole router is gated by a role middleware mounted at the router level: it appears in `middleware[]` for every route of that router, so an empty `roleGuards` would not occur — do not flag.
- Self-service functions (users editing **their own** profile) are not privileged; do check that they cannot set `role`/`isAdmin` (mass-assignment playbook).

## Relevant graph relationships
`Route —PROTECTED_BY→ Middleware(kind role, roleGuard)` with `props.args` (e.g. `'admin'`). `Function.authz` with `role-check` entries and their `guards`. `Function —ACCESSES→ Model` for privileged models.

## Verification strategy
Verifier template: `bfla`. Log in as a **normal user** (never the admin) and call the privileged endpoint with the appropriate method and a harmless payload (or a read-only variant). CONFIRMED when the sandbox answers 2xx and performs/returns privileged data. REJECTED on 401/403. Test each verb separately. Never use destructive actions on real seeded data; create a disposable target first.

## Evidence requirements
Route id and privileged rationale (path/model); the chain without a role guard; comparison with a guarded sibling; the model touched; the verifier's request as a normal user and the response, with expected 403 vs actual status.

## Remediation guidance
Guidance only. Deny by default: attach a role/permission middleware at the router level for every privileged router and require explicit opt-out. Enforce authorization server-side per function and per HTTP verb, not by hiding UI. Never let clients set their own `role`/`isAdmin`; whitelist updatable fields.
