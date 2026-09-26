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

## Layout

```
packages/engine/src   config · bus · db/ · llm/ · health · indexer/ · graph/ · facts/ · knowledge/ · tools/   (C5+ add agents/, ...)
apps/server           Express API (+ SSE from C11)
apps/dashboard        React + Vite + Tailwind SOC UI
playbooks/            security playbooks (markdown) — see resources/plan C4
sandbox/              seed users for the target app (wired in C7)
```
