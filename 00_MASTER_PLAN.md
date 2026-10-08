# SENTINEL-X — Master Plan

> A self-hosted, agentic application-security platform for MERN applications.
> It builds a persistent security model of a codebase, runs specialist AI agents
> to investigate weaknesses, proves findings with evidence-based verification in
> a sandbox, and tracks security state as the code changes — all through a
> SOC-style dashboard.
>
> **Sentinel-X analyzes and proves. It never modifies target code.**

---

## 1. One-line pitch (for the viva)

> *"A MERN app that secures MERN apps: it turns a repository into a queryable
> security graph, lets AI agents reason over that graph, and then confirms every
> serious finding by actually exploiting it in a sandbox — with a human never
> having to trust the model's word."*

The core technical contribution is **not** "AI finds bugs." It is:

> **A persistent application-security model + agentic investigation +
> evidence-based verification + continuous security state over code changes.**

---

## 2. Scope

### What it does (core product)
1. Indexes a MERN repo into a normalized representation (AST-based).
2. Maintains an **Application Security Graph** (nodes + edges).
3. Exposes a **Security Fact API** so agents query facts instead of raw source.
4. Runs 3 **specialist security agents** over a knowledge base of playbooks.
5. **Verifies** suspicious findings by running controlled exploits in a sandbox.
6. Produces evidence-backed **Findings** with severity.
7. Tracks security state across code changes (**targeted re-analysis**).
8. Presents everything live through a **SOC dashboard** (SSE streaming).

### What it explicitly does NOT do
- ❌ It does not patch or edit target code. **Analysis only.**
- ❌ Agents never modify anything — they read, reason, and request verification.
- ❌ It does not manage multiple projects at once. **One project loaded at a time.**
- ❌ It never sends exploit traffic anywhere except the configured sandbox target.
- ❌ (Core) No embeddings/vector RAG, no DAST fuzzing, no runtime hooks — those
  are non-core extensions (see `SENTINEL-X_NONCORE_BUILD.md`).

---

## 3. Locked decisions

| Area | Decision |
|---|---|
| Project name | **Sentinel-X** |
| Language | **TypeScript everywhere** (Node backend, React frontend). No Python in core. |
| Stack | **MERN** — MongoDB, Express, React, Node. Ticks the lab's stack requirement. |
| Graph storage | Mongo `graph_nodes` + `graph_edges` collections, behind a **graph-query abstraction** (swappable later). |
| Agent framework | **LangGraph.js** (supervisor + specialist subgraphs, checkpointed memory, native streaming). |
| Knowledge (core) | **Playbooks loaded by vulnerability type** — no embeddings. |
| LLM (demo) | **Gemini** (free tier). DeepSeek-first in config; Ollama supported. All behind a provider abstraction. |
| Streaming | **SSE** from server → dashboard for live agent activity. |
| Verification | Real controlled exploits, **hard-locked to the sandbox target only**. |
| Sandbox | Target app runs via **docker-compose** with seeded users (User A / User B / admin) in a config file. |
| Change trigger | **File watcher + git diff** (polling as fallback). No GitHub integration in core. |
| Severity | **Severity scoring = core.** Full CVSS = non-core upgrade. |
| Remediation | Guidance text = **non-core**. No patching, ever. |
| Multi-user auth on Sentinel-X | Not now (single-user, self-hosted). |
| Frameworks | **Express-based MERN only** in core. NestJS/Fastify/Next.js = non-core. |
| UI source of truth | `resources/images/*` = final product look. Stack: **React + Vite + Tailwind v4 + shadcn, dark-first** (light = tokens only until a toggle is built). Built incrementally: each phase builds only the UI it needs. |
| Dashboard views | **9 routes**: Overview, Attack Surface, Security Graph, Findings, Agent Activity, Verification, Changes (= old "Dev Security"), Knowledge, Settings. |
| Landing / project loader | Final UI has a landing page (project cards, Connect GitHub, Add from Git URL). **Core = single-project loader only** (Add Local Repository live; GitHub/Git URL shown disabled). Multi-project + GitHub = N13. Built when load-project exists (C1/C9/C11), not C0. |
| Non-core UI in images | CVSS score, Fix Recommendation tab, Export, GitHub source appear in the images but belong to N9/N15/N10/N13 — core UI renders them only when the extension registers. |
| Indexer IR | Two layers: **raw per-file IR** (pure fn of file content, cached by hash, stored in `files.ir`) + **linked view** (pure fn of all IR: route full paths, order-aware middleware chains, resolved refs; `files.linked`). C1 owns linking; C2 consumes `loadProjectIR()`. File kinds: server/client/shared/config/**test** (client+test = record only). |
| Graph build | `buildGraphModel` (pure, deterministic ids like `Route:GET /api/orders/:id`) + `buildGraph` **diff-apply** (no clear+rebuild, no per-file patching). Explicit call after `indexProject`; C10 uses its `changedNodeIds`. Ops live on edge props (no Operation nodes). Sensitivity tiers credential/financial/pii/pii-broad. `Route.protected` is evidence-based with `authEnforcement` enforcing/weak/none. Exposure = `Function EXPOSES Asset` (direct only). |
| Fact API | `FactEngine` snapshots the graph once per agent run (create a new instance after `buildGraph`), returns typed JSON facts; **C3 detects nothing**. `authorization` = `present` only for a check that really blocks (user-scoped query / guarded ownership or role check), else `unknown`; `none` = no login. `getAuthorizationGaps` defaults to relevant-only. Tool contracts (`FACT_TOOLS`, `runFactTool`, structured errors with suggestions) live in C3; C5 adapts them. |
| Playbooks | 9 files in `playbooks/`: `idor`, `missing-auth`, `privilege-escalation`, `jwt-security` (Auth agent) · `nosql-injection`, `mass-assignment`, `data-exposure`, `secret-exposure` (Dataflow/Mongo agent) · `authorization` (reference for both). Strict front-matter + fixed sections (adds *False-positive rules* + *Remediation guidance*). Routing = fact **signals** (`SIGNAL_CATALOG`) → `getPlaybooksForSignals` (any-of `signals` + all-of `requires`, ranked). Versioned by content hash (`type@version`), mirrored to `security_knowledge`. `severityBase` is lowercase `critical|high|medium|low|info`. `PLAYBOOKS_DIR` overrides the location. |
| Agent runtime | LangGraph **0.4.9 pinned** (core 0.3) — upgrading the LangChain stack to 1.x is a separate later task. Tool-calling loop + `finish` tool (one LLM call/step), LLM via `LlmProvider`. **Grounding guard**: `proposeHypothesis` must name a real route/JWT op/secret, pass the playbook **signal gate**, cite successful fact-tool calls of the same run; the runtime fills `affectedNodes`/template/`type@version`; ungrounded proposals never persist. Budgets `{maxSteps 12, maxTokens 60k, maxToolCalls 40, timeout}`; events `{runId,seq,kind,title,detail,ts}` on `agent:<runId>`; traces in `agent_*`/`tool_calls` + LangGraph checkpoints (`agent_checkpoints`, `agent_checkpoint_writes`). |
| UI node mapping | Sensitive Data=Asset · Configuration=File(kind config) · Database=Model/Database · Client(External)=synthesized from `Project EXPOSES Route` · User Input=Input · External Service=ExternalService. |
| Test target | In-repo fixture `packages/engine/test/fixtures/vuln-mern/` (test-only). The real sandbox target is still user-provided. |
| Target app | You provide a deliberately-vulnerable MERN app + seeded bugs. **Out of build scope — Sentinel-X does not include the target.** |

---

## 4. System architecture

```text
                          ┌─────────────────────────────────────┐
                          │              SENTINEL-X              │
                          │  (single Node/TS service + React UI) │
                          │                                     │
                          │  API Server (Express) + SSE         │
                          │  Agent Orchestrator (LangGraph)     │
                          │  Analysis Engine (Indexer→Graph)    │
                          │  Security Fact Engine               │
                          │  Verification Engine (sandbox-only) │
                          │  Change Detector                    │
                          └───────────────┬─────────────────────┘
                                          │
             ┌────────────────────────────┼────────────────────────────┐
             ▼                            ▼                             ▼
     Application Graph             Agent Runtime                    MongoDB
     (nodes/edges +                 (LangGraph)                (all persistence)
      graph abstraction)                 │
             │                    ┌───────┴────────┐
             ▼                    ▼                ▼
       Graph/Fact Tools     Knowledge (playbooks)  LLM Provider
                                                        │
                                              ┌─────────┼─────────┐
                                              ▼         ▼         ▼
                                           Gemini    DeepSeek   Ollama
                                          (demo)    (config)   (local)

     ┌──────────────────────── SANDBOX (isolated) ───────────────────────┐
     │  docker-compose: target MERN app + its Mongo + seed users config  │
     │  Verification Engine is the ONLY thing allowed to talk to it.     │
     └────────────────────────────────────────────────────────────────────┘
```

### Primary data flow (the whole product in one path)
```text
repo ──▶ Indexer ──▶ IR ──▶ Security Graph ──▶ Fact API
                                                  │
                              Playbooks ──▶ Agent Runtime ──▶ Observations
                                                  │                │
                                                  ▼                ▼
                                            Hypotheses ──▶ VerificationRequest
                                                                   │
                                              Orchestrator ──▶ Verification Engine
                                                                   │  (sandbox)
                                                                   ▼
                                            CONFIRMED / REJECTED / INCONCLUSIVE
                                                                   │
                                                                   ▼
                                                Finding (+severity, evidence)
                                                                   │
                    code change ──▶ Change Detector ──▶ affected nodes ──▶ re-run
                                                                   │
                                                                   ▼
                                                        SOC Dashboard (SSE live)
```

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript, Express |
| Realtime | Server-Sent Events (SSE) |
| Frontend | React + TypeScript + Vite |
| Graph UI | React Flow (or Cytoscape.js) |
| UI styling | Tailwind CSS v4 + shadcn/ui (tokens in `apps/dashboard/src/index.css`), lucide icons, Inter font |
| Tests / lint | Vitest 3, ESLint 9 (flat), Prettier |
| Database | MongoDB + Mongoose |
| AST / parsing | `ts-morph` only (parses JS/JSX/CJS too). `@babel/parser` deferred until a real file needs it. Tree-sitter optional. |
| Agents | LangGraph.js + LangChain chat-model adapters |
| LLM providers | **Gemini via native REST adapter** (`gemini-3.8-flash` default; LangChain's Gemini adapter dropped thought signatures), DeepSeek (`@langchain/openai`, OpenAI-compatible), `@langchain/ollama` |
| File watch | `chokidar` |
| Git | `simple-git` |
| HTTP (verifier) | `undici` / `axios`, allowlist-guarded |
| Packaging | Docker + docker-compose; optional CLI via `commander` |
| Monorepo | npm workspaces |

---

## 6. Data model (MongoDB collections)

```text
projects            # the single loaded project: path, gitHead, status
files               # indexed files + per-file IR
graph_nodes         # {projectId, type, key, props, loc}
graph_edges         # {projectId, type, from, to, props}

agent_runs          # one investigation run
agent_steps         # each reasoning/tool step (streamed to UI)
tool_calls          # tool name, input, output, timing
observations        # raw facts an agent noted
hypotheses          # suspected vulnerabilities (unproven)
verification_runs   # exploit attempt + result + evidence
findings            # the source of truth (proven or explained)

security_events     # timeline: scans, changes, verifications
change_sets         # git diff → affected files/nodes per change
security_knowledge  # playbook registry / metadata (type, front-matter, body, hash/version) — mirrored from playbooks/*.md by syncKnowledge()
```

### Graph schema
```text
Node types:  Project · File · Function · Route · Middleware · Input ·
             Model · Database · Dependency · Secret · ExternalService · Asset

Edge types:  CONTAINS · CALLS · FLOWS_TO · PROTECTED_BY · ACCESSES ·
             DEPENDS_ON · EXPOSES · USES
```

Example subgraph:
```text
POST /orders/:id ──PROTECTED_BY──▶ authenticate()
       │
       └──CALLS──▶ updateOrder() ──CALLS──▶ Order.findById() ──ACCESSES──▶ MongoDB
                        ▲
              req.params.id ──FLOWS_TO──┘   (user-controlled input reaching a DB read)
```

---

## 7. Core vs Non-core boundary

**Core = the product stands alone and is fully demoable.** It runs blank-repo → indexed
→ graph → agents → verified findings → change loop → dashboard.

**Non-core = independent enhancements.** Each attaches to a stable core interface and
adds capability *without core depending on it*. Core must never import non-core.

| Core (must build) | Non-core (extensions) |
|---|---|
| Repository Indexer (AST→IR) | Vector/embeddings RAG |
| Security Graph + graph abstraction | Dependency-CVE reachability |
| Security Fact API | Taint/dataflow engine (real source→sink) |
| Playbooks (load-by-type) | Frontend-aware analysis |
| Agent Runtime (LangGraph) | Business-logic & race-condition detection |
| 3 agents: Auth/AC, Dataflow/Mongo, Attack-Path | Runtime instrumentation hooks (live graph) |
| Orchestrator (manual + file-watch trigger) | Active DAST / fuzzing |
| Verification Engine (sandbox-only, templates) | Human-in-the-loop feedback |
| Finding Model + severity scoring | CVSS 4.0 scoring |
| Change Intelligence (watch + diff → targeted re-run) | Exportable PDF report |
| SOC Dashboard (all views, SSE) | MCP coding-agent interface |
| Continuous loop + packaging | Model routing / token budget · Multi-project · Benchmark harness · Remediation guidance · NestJS/Fastify/Next.js |

Full detail lives in **one build file per component**:
- Core → `core/C0…C12_*.md` (one file per phase/component, scaffolding → done).
- Non-core → `noncore/N1…N16_*.md` (one file per extension).
- Index/read-order → `INDEX.md`.

---

## 8. Phase map

Build is organized as **vertical slices**, not "frontend / backend / AI". Each core
phase produces something runnable, and **each has its own build file** (`core/Cx_*.md`)
that plans it end to end.

| Phase | Slice | Outcome |
|---|---|---|
| C0 ✅ | Scaffold | Monorepo, Mongo, Docker, config, LLM abstraction, health API + empty dashboard (9-route shell, live health pills). **Done — see `core/C0_scaffold.md` "As built".** |
| C1 ✅ | Indexer | Repo → AST → normalized IR + **linked** view (routes with full paths/ordered chains). **Done — see `core/C1_indexer.md` "As built".** |
| C2 ✅ | Graph | IR → nodes/edges in Mongo behind graph abstraction (deterministic ids, pure model + diff-apply). **Done — see `core/C2_graph.md` "As built".** |
| C3 ✅ | Fact API | Structured queries over the graph + `FACT_TOOLS` registry for agents. **Done — see `core/C3_fact_engine.md` "As built".** |
| C4 ✅ | Knowledge | 9 playbooks (8 vulnerability + 1 reference) + deterministic registry, signal catalog, `KNOWLEDGE_TOOLS`, `security_knowledge` sync. **Done — see `core/C4_knowledge_playbooks.md` "As built".** |
| C5 ✅ | Agent Runtime | LangGraph base: tools=Fact API+playbooks+emit tools, grounding guard, budget, memory, event stream. **Done — see `core/C5_agent_runtime.md` "As built".** (Verified live on Gemini flash with the demo agent.) |
| C6 🟡 | Agent 1 (flagship) | Auth/Access-Control agent → observations + hypotheses. **Code-complete, live run pending — see `core/C6_auth_agent.md` "As built".** |
| C7 ✅ | Verify + Finding | Sandbox verifier + Finding model + severity → **first confirmed IDOR**. **Done — see `core/C7_verification_findings.md` "As built".** |
| C8 ✅ | Agents 2 & 3 | Dataflow/Mongo + Attack-Path agents. **Done — see `core/C8_mongo_attackpath_agents.md` "As built".** |
| C9 | Orchestrator | Supervisor: manual run + agent→request routing |
| C10 | Change Intelligence | Watch + diff → affected nodes → targeted re-run + finding status |
| C11 | SOC Dashboard | All views wired to live SSE |
| C12 | Continuous + packaging | Scheduler loop, `docker compose up`, CLI |

> **After C7 you already have an end-to-end demo** (graph → agent → confirmed IDOR).
> C8–C12 deepen and productionize it. This de-risks the assessment: the minimum
> demoable thread lands early.

---

## 9. Milestones & Definition of Done

The MVP-of-the-full-product is **done** when, on a deliberately vulnerable MERN app,
you can demonstrate this full loop reliably:

```text
1. Load project          ▶ 2. Initialize/index      ▶ 3. Security graph generated
4. Baseline assessment   ▶ 5. Agent flags potential IDOR
6. Agent traces dataflow ▶ 7. Verification CONFIRMS IDOR in sandbox
8. Finding appears in SOC with full evidence chain
9. Developer fixes code  ▶ 10. Sentinel-X detects the change
11. Relevant agent reruns on affected subgraph
12. Finding is re-verified and marked RESOLVED
```

Per-phase DoD is defined inside each `core/Cx_*.md` build file.

---

## 10. The 3 demo pillars + demo script

**Pillar 1 — Security graph & attack surface.** Point Sentinel-X at the repo; the
dashboard renders routes, middleware, models, and flags unprotected/sensitive routes.

**Pillar 2 — Agentic investigation (live).** The Auth agent picks up a suspicious
route; the dashboard streams its reasoning, tool calls, and hypothesis in real time.

**Pillar 3 — Verification & the change loop.** The verifier confirms the IDOR with
real requests as User A against User B's resource; you fix the code live; Sentinel-X
detects the change, re-verifies, and flips the finding to RESOLVED.

### 5–10 minute demo script
```text
0:00  "This is Sentinel-X. It secures MERN apps and it's built in MERN."
0:30  Load the vulnerable app → Initialize. Graph builds.               (Pillar 1)
2:00  Open Attack Surface: highlight an unprotected /orders/:id route.
3:00  Run Auth agent → switch to Agent Activity → narrate the live SSE
      stream: observation → hypothesis (potential IDOR) → verify request. (Pillar 2)
5:00  Verification runs in sandbox: User A reads User B's order → CONFIRMED.
      Open the Finding → walk the evidence chain + severity.
6:30  Fix the route in the editor (add ownership check) + save.          (Pillar 3)
7:00  Change Detector fires → affected node → agent reruns → re-verify →
      Finding flips to RESOLVED. Changes view (formerly "Dev Security") shows the transition.
8:30  One line on the graph → "this is now a persistent security model, not a scan."
9:00  Q&A.
```

---

## 11. Faculty / viva prep

Likely questions and crisp answers:

- **"Is this a MERN project?"** Yes — Mongo (incl. the graph), Express API, React
  dashboard, Node runtime. It's a MERN app whose job is to secure MERN apps.
- **"How is this different from `npm audit` / Snyk / Semgrep?"** Those pattern-match
  and stop at "potential". Sentinel-X keeps a persistent graph, *reasons* over it with
  agents, and **proves** each serious finding by exploiting it in a sandbox, then tracks
  it across commits. It reports evidence, not guesses.
- **"Isn't the AI just hallucinating vulnerabilities?"** The agent can only *hypothesize*.
  It cannot mark anything CONFIRMED — only the Verification Engine can, and only via a
  real controlled exploit with captured evidence. That separation is the point.
- **"Why a graph instead of feeding files to the LLM?"** Scale and precision: the graph
  gives the agent structured, queryable facts (routes, middleware chains, dataflow)
  instead of raw source, so reasoning is grounded and cheaper.
- **"Is exploiting apps safe?"** The verifier is hard-locked to the configured sandbox
  URL with an allowlist and a global kill switch; it refuses any other target.
- **"What did you build vs the AI?"** The architecture, the graph schema, the security
  playbooks (which encode real IDOR/NoSQLi investigation strategy), the verification
  templates, and the ground-truth test bed — all human security judgment. The agent
  executes that judgment at scale.

---

## 12. Risk register

| Risk | Mitigation |
|---|---|
| DeepSeek multi-step tool-calling is unreliable | Provider abstraction; demo on **Gemini**; DeepSeek stays config-first but swappable. |
| Agent loops / runaway cost | Per-run **budget** (max steps + token cap) enforced in the runtime; hard stop. |
| Verifier hits the wrong target | Sandbox **allowlist + kill switch** invariant; refuses non-sandbox URLs; every request logged. |
| AST edge cases in real apps | Start with conventional MERN structure; degrade gracefully (unparsed files → flagged, not fatal). |
| Scope creep swallows the deadline | Core is fully demoable after C7; everything past it is optional. Non-core never blocks core. |
| Graph too big to render | Dashboard renders filtered subgraphs (by route/finding), not the whole graph at once. |
| Playbook↔verifier template mismatch (C4 playbooks `jwt-security`/`secret-exposure`/`authorization` name templates C7 lacks; C7 mints Findings only on CONFIRMED) | **Open — decide finding policy for non-exploitable classes (static verifier templates vs proven-only) during C7 planning.** C4 status: `mass-assignment` + `data-exposure` templates *proposed* (dynamic); `jwt-security` + `secret-exposure` have `verifierTemplate: null`, `verification: undecided`. |
| Agent tool-calling quality on harder prompts / other providers unproven: only Gemini flash + the demo goal ran live (Ollama: laptop too small; DeepSeek untested) | Guard + nudges + budgets in place; run C6/C8 live on Gemini with small budgets; keep a recorded backup run; Gemini free-tier limits → keep `--max-steps` small. |
| LLM non-determinism in demo | Pre-seed the target with known bugs; rehearse; keep a recorded backup run. |

---

## 13. Repository layout

```text
sentinel-x/
├── package.json                 # npm workspaces
├── docker-compose.yml           # mongo + sentinel-x server + dashboard
├── .env.example                 # LLM keys, sandbox target URL, seed users
├── packages/
│   └── engine/src/              # the core library (framework-agnostic; consumed as TS source)
│       ├── config.ts bus.ts health.ts   # C0 ✅ typed env · event bus · /health report
│       ├── db/                  # C0 ✅ mongoose connection + 14 collections/indexes
│       ├── indexer/             # C1 ✅ (subpath export `@sentinelx/engine/indexer`; fixtures in packages/engine/test/fixtures)
│       ├── graph/               # C2 ✅ (subpath export `@sentinelx/engine/graph`; GraphStore + MongoGraphStore + pure model builder)
│       ├── facts/               # C3 ✅ (subpath export `@sentinelx/engine/facts`; FactEngine + FACT_TOOLS)
│       ├── knowledge/           # C4 ✅ (subpath `@sentinelx/engine/knowledge`; loader/registry/signals/tools/sync) — playbooks live in repo-root `playbooks/`
│       ├── tools/               # shared tool registry (ToolDef/runTool/combineTools) used by facts + knowledge
│       ├── agents/              # C5 ✅ runtime (subpath `@sentinelx/engine/agents`); C6/C8 add the 3 agents on top
│       ├── orchestrator/        # C9
│       ├── verification/        # C7 (sandbox-locked)
│       ├── findings/            # C7 (model + severity)
│       ├── change/              # C10 (watch + diff)
│       └── llm/                 # C0 ✅ provider abstraction (types, LangChain wrapper, gemini/deepseek/ollama)
├── apps/
│   ├── server/                  # Express API + SSE + CLI
│   └── dashboard/               # React + Vite SOC UI
├── playbooks/                   # idor.md, nosql-injection.md, jwt-security.md, ...
└── sandbox/                     # docker-compose for the TARGET app + seed config
                                 # (target app itself is provided by you, out of scope)
```

---

## Appendix — OWASP coverage matrix (audited 2026-09-25, honest)

Targets: **OWASP Top 10:2025** + API Security Top 10 (2023) patterns. Legend: ✅ core, provable by sandbox exploit (C7) · 🟡 core facts/agent exist, **proof/finding policy still open (C7 planning)** · 🔵 planned non-core · ⬜ **not planned yet (gap)**.

| Category | Status | Where / note |
|---|---|---|
| A01 Broken Access Control — IDOR/BOLA, BFLA, missing auth, privilege escalation | ✅ | C6 agent + C7 templates (`idor`, `missing-auth`, `bfla`); facts: routes, `authorization`, dataflow (C3) |
| A01 — CORS misconfiguration | ⬜ | no extractor/agent |
| A01 — SSRF | ⬜ | `ExternalService` HTTP-client nodes exist; URL args not captured |
| A02 Security Misconfiguration (headers, CORS, verbose errors) | ⬜ | cheap start: middleware-presence facts derivable from existing chains |
| A03 Software Supply Chain Failures | 🔵 | N2 (core already stores deps + installed versions) |
| A04 Cryptographic Failures — hardcoded/env secrets | 🟡 | facts (`getSecrets`), `secret-exposure` playbook |
| A04 — weak password hashing / weak crypto | ⬜ | |
| A05 Injection — NoSQL injection, mass assignment | ✅ | C8 agent + C7 `nosql-injection` |
| A05 — XSS | 🔵 | N4 (client-side only) |
| A05 — command/code injection, path traversal, open redirect | ⬜ | needs a "dangerous sink call" extractor |
| A06 Insecure Design / business logic | 🔵 | N5 |
| A07 Authentication Failures — JWT (hardcoded/weak secret, alg none, no expiry/verify) | 🟡 | facts (`getJwtUsage`) + C6; needs static-proof policy |
| A07 — brute force / rate limiting, session & cookie flags, password policy | ⬜ | |
| A08 Software/Data Integrity Failures | ⬜ | no plan mentions it |
| A09 Security Logging & Alerting Failures | ⬜ | |
| A10 Mishandling of Exceptional Conditions | ⬜ | |
| API3 Property-level authorization (mass assignment, excessive data exposure) | ✅ / 🟡 | mass assignment ✅ (C8); data exposure 🟡 (`getExposure`) |
| API4 Unrestricted resource consumption (rate limiting), CSRF | ⬜ | |
| API6 Sensitive business flows | 🔵 | N5 |
| API9 Improper inventory | ✅ (informational) | Attack Surface lists every route |

**Open decision (C7 planning):** 🟡 items are not exploit-provable; either add **static verifier templates** (deterministic graph-fact checks → Finding with `verification:'static'`, honestly badged) or keep proven-only. The UI mockups already show "Unverified"/"Hypothesis" states.

**Proposed future non-core items (unscoped, N17+):** N17 misconfiguration checks (rate limit / CORS / helmet / CSRF / error-handler presence); N18 dangerous-sink calls (exec/eval/fs/HTTP-client/redirect args → command injection, path traversal, SSRF, open redirect); N19 crypto hygiene (hash algorithm/rounds, weak randomness, JWT algorithms); N20 logging & error handling (A09/A10); N21 integrity/deserialization (A08).

★ In scope with proof today = A01 (access control) + A05 (NoSQL injection, mass assignment).
