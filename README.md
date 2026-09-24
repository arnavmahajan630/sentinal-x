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

| Command                                                                       | What                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run typecheck` / `lint` / `test`                                         | quality gates (DB test needs Mongo on `localhost:27017`)                    |
| `npm run llm:ping`                                                            | scratch LLM call through `getProvider(cfg)` (reads `.env`)                  |
| `npm run index -- <path> [--dump routes\|ops\|models\|authz\|json] [--force]` | index a repo into Mongo (needs `docker compose up -d mongo`), print summary |

## Layout

```
packages/engine/src   config · bus · db/ · llm/ · health · indexer/   (C2+ add graph/, facts/, ...)
apps/server           Express API (+ SSE from C11)
apps/dashboard        React + Vite + Tailwind SOC UI
sandbox/              seed users for the target app (wired in C7)
```
