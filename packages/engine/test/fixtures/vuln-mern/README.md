# vuln-mern (test fixture)

Deliberately vulnerable MERN app used ONLY as an indexer/graph/fact test fixture. Never shipped, never run.
Seeded: IDOR (`GET /api/orders/:id`), NoSQLi (`/login`), mass-assignment (`/register`, `PUT /api/orders/:id`),
hardcoded JWT secret, unauth data exposure (`GET /api/users/:id`), plus SAFE routes (ownership check, user-scoped query)
that agents must NOT flag. Includes: CJS + ESM + TS, router mounts, middleware ordering trap, wrapper handlers,
dynamic registration (`dynamic.js`), a syntax error (`broken.js`), an ignored dir, client + test files.
