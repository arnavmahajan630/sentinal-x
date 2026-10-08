# Sentinel-X

Self-hosted agentic application-security platform for MERN apps. Plans live in `resources/plan/`
(start at `00_MASTER_PLAN.md`). **Analysis only — never modifies target code.**

## Quickstart (Docker)

```bash
cp .env.example .env      # set GEMINI_API_KEY (or LLM_PROVIDER=ollama)
docker compose up --build
```

- Dashboard: http://localhost:8080
- API: http://localhost:4000 (`/health`, `/api/config`)
- MongoDB: `127.0.0.1:27017`

## Local dev

```bash
cp .env.example .env
docker compose up -d mongo        # only Mongo in Docker
npm install
npm run dev                       # server :4000 (tsx watch) + dashboard :5173 (Vite)
```

## Scripts

| Command                                                                                             | What                                                                                   |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run typecheck` / `lint` / `test`                                                               | quality gates (DB test needs Mongo on `localhost:27017`)                               |
| `npm run llm:ping`                                                                                  | scratch LLM call through `getProvider(cfg)` (reads `.env`)                             |
| `npm run index -- <path> [--dump routes\|ops\|models\|authz\|json] [--force]`                       | index a repo into Mongo (needs `docker compose up -d mongo`), print summary            |
| `npm run graph -- <path> [--dump summary\|routes\|route <id>\|find <Type>\|path <from> <to>\|json]` | index + build the security graph, print a summary                                      |
| `npm run facts -- --list` / `npm run facts -- <path> <tool> ['<json>']`                             | list fact tools / run one on a project (indexes + builds graph first)                  |
| `npm run knowledge -- list\|show <type>\|match a,b\|validate\|sync\|route <path> '<route>'`         | browse/validate playbooks, sync to Mongo, or route a route's fact signals to playbooks |
| `npm run agent -- <path> [--goal "…"] [--provider ollama\|gemini] [--model …] [--max-steps N]`      | index + graph, then run the demo agent live and stream its steps (needs a working LLM) |

## CLI

`apps/server/cli.ts` ships a headless `sentinel` binary (built by `tsup` to
`dist/cli.js`; use `npm run cli --` for dev, or `docker compose exec server node
dist/cli.js ...` against a running container):

| Command | What |
| --- | --- |
| `sentinel load <path> [--force]` | index a repo + build its security graph |
| `sentinel scan <path\|projectId> [--mode full\|agent] [--agent auth\|dataflow\|attack-path] [--provider ...] [--model ...] [--max-steps N]` | run a full assessment or a single agent |
| `sentinel watch <path\|projectId> [--poll-ms N] [--debounce-ms N]` | index/build if needed, then watch for changes and re-verify affected findings |
| `sentinel findings <projectId> [--status open\|resolved\|regressed\|all] [--severity ...] [--json]` | print current findings |

The `scheduler` service (`apps/server/scheduler.ts`, started automatically by `docker
compose up`) is the always-on counterpart: it watches every loaded project
continuously, re-runs the full pipeline on a detected change, and emits an honest
idle heartbeat (`No changes. Current state: N open, C critical, H high.`) when
nothing has changed — it never fabricates activity. It holds a per-project lock
(`projects.activeRunId`) so a manual `POST /api/watch` for a scheduler-owned project
gets a `409` instead of a second concurrent watcher.

## Demo

The 3 pillars (see `resources/plan/00_MASTER_PLAN.md` §10 for the full script):
1. **Security graph & attack surface** — point Sentinel-X at a repo; routes,
   middleware, models, and unprotected/sensitive routes render immediately.
2. **Agentic investigation (live)** — the Auth agent flags a suspicious route; the
   dashboard streams its reasoning over SSE in real time.
3. **Verification & the change loop** — the verifier confirms an IDOR with a real
   exploit request; you fix the code; Sentinel-X detects the change, re-verifies, and
   flips the finding to `resolved` — unattended.

```bash
cp .env.example .env            # set GEMINI_API_KEY
docker compose up --build       # mongo, server, scheduler, sandbox(-mongo/-seed), dashboard

# Load the vulnerable sandbox target and run a full assessment
docker compose exec server node dist/cli.js load /app/sandbox
docker compose exec server node dist/cli.js scan <projectId>
docker compose exec server node dist/cli.js findings <projectId>

# Watch the always-on loop
docker compose logs -f scheduler        # idle heartbeat, never fake activity

# Fix the vulnerable route in the sandbox fixture and save — the scheduler picks it
# up automatically: re-index -> impact -> agent rerun -> re-verify -> transition,
# visible in `docker compose logs scheduler` and the dashboard's Changes/Findings views
docker compose exec server node dist/cli.js findings <projectId> --status resolved
```

Open the dashboard at http://localhost:8080 to follow the same flow visually.

For local (non-Docker) dashboard dev against a non-default API host, set
`VITE_API_TARGET` (read by `apps/dashboard/vite.config.ts`) before `npm run dev`.

## Layout

```
packages/engine/src   config · bus · db/ · llm/ · health · indexer/ · graph/ · facts/ · knowledge/ · tools/ · agents/   (C6+ add the specialist agents)
apps/server           Express API (+ SSE from C11)
apps/dashboard        React + Vite + Tailwind SOC UI
playbooks/            security playbooks (markdown) — see resources/plan C4
sandbox/              seed users for the target app (wired in C7)
```
