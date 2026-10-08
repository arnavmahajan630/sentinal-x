# C9 — Orchestrator (Supervisor)

**Phase:** C9 · **Component:** Central Coordination of Specialist Agents, Request Routing, and Verification.  
**Purpose:** Run agents manually or on event triggers, and route all inter-agent (`InvestigationRequest`) and verification (`VerificationRequest`) requests through a single supervisor. Agents never call each other or the verification engine directly.

---

## 1. Where It Sits

- **Depends on:**
  - `C0` — Config, EventBus (`bus.ts`), MongoDB collections (`models.*`), LLM provider abstraction (`llm/`).
  - `C1` + `C2` — Indexer (`indexer/`) + Application Security Graph (`graph/`).
  - `C3` — FactEngine (`facts/engine.ts`) + Structured query tools (`facts/tools.ts`).
  - `C4` — Knowledge Registry (`knowledge/registry.ts`) + Playbooks (`playbooks/*.md`).
  - `C5` — Agent Runtime (`agents/runtime/`), grounding guard (`groundHypothesis`), budget tracking, checkpointer.
  - `C6` — Auth Agent (`agents/auth.ts`: IDOR, missing-auth, privilege-escalation, jwt-security).
  - `C7` — Verification Engine (`verification/engine.ts`, sandbox client, templates) + Finding Builder (`findings/build.ts`, severity scoring).
  - `C8` — Dataflow Agent (`agents/dataflow.ts`) + Attack-Path Agent (`agents/attackPath.ts`).
- **Unlocks:**
  - `C10` — Change Intelligence (file watcher + git diff feed `onChange`).
  - `C11` — SOC Dashboard (React UI drives `runAssessment` / `runAgent` via SSE).
  - `C12` — Continuous scheduler loop and packaging.

---

## 2. Objective & Architectural Invariants

A supervisor over the three specialist agents (`auth`, `dataflow`, `attack-path`) and the verification engine with three execution modes and a centralized request protocol.

```text
                      ┌──────────────────────────────────────────────┐
                      │           ORCHESTRATOR (Supervisor)         │
                      └──────────────────────┬───────────────────────┘
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      │                                      │                                      │
      ▼                                      ▼                                      ▼
runAssessment(projectId)          runAgent(projectId, name)          onChange(projectId, changeSet)
(Full 5-phase assessment)         (Single agent on demand)           (Targeted subgraph re-run)
      │                                      │                                      │
      └──────────────────────────────────────┼──────────────────────────────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │    Central Request Router    │
                              ├──────────────────────────────┤
                              │ • Deduplicate verifications  │
                              │ • Bounded inter-agent queue  │
                              │ • Idempotent finding minting │
                              │ • Log to security_events     │
                              │ • Stream events on bus       │
                              └──────┬────────────────┬──────┘
                                     │                │
                     VerificationReq │                │ InvestigationReq
                                     ▼                ▼
                           ┌──────────────────┐ ┌──────────────────┐
                           │ Sandbox Verifier │ │   Target Agent   │
                           │   + Findings     │ │ (auth/dataflow)  │
                           └─────────┬────────┘ └──────────────────┘
                                     │
                            Confirmed Findings
                                     │
                                     ▼
                           ┌──────────────────┐
                           │ Attack-Path Agent│
                           └──────────────────┘
```

### Architectural Invariants:
1. **Strict Decoupling:** Agents never call each other directly. Cross-agent queries use `requestInvestigation` (C5), which emits to the orchestrator queue.
2. **Sandbox Protection:** Agents never interact with the sandbox directly. They emit `requestVerification` (C5); the orchestrator validates, deduplicates, and dispatches to `verify()` (C7).
3. **Phased Sequencing:** The Attack-Path agent composes chains over *already-confirmed* findings. It must run strictly after verifications have been drained and findings minted.
4. **Idempotency:** Re-running an assessment on an unchanged codebase does not duplicate findings in MongoDB; findings are deduplicated by `(projectId, type, affectedNodes)`.
5. **Budget & Cancellation:** Top-level orchestrator budget wraps agent budgets; an `AbortSignal` propagates downward across all sub-runs.
6. **Fresh Snapshots:** Each assessment pass creates a fresh `FactEngine` instance ensuring consistent graph snapshots.

---

## 3. Execution Pipeline (5-Phase Full Assessment)

When `runAssessment(projectId, options)` executes, it runs through 5 sequential phases:

```text
Phase 1: Detection Agents ──▶ Phase 2: Inter-Agent Routing ──▶ Phase 3: Sandbox Verification
  (auth + dataflow)             (depth-bounded queue)            (deduplicated batch)
                                                                          │
Phase 5: Unified Summary  ◀── Phase 4: Attack-Path Composition ◀──────────┘
  (persist & stream)            (chain over confirmed findings)
```

1. **Phase 1 — Detection Agents:**
   - Execute `authAgent` and `dataflowAgent` (concurrently or in sequence).
   - Collect emitted `hypotheses`, `verificationRequests`, and `investigationRequests`.
   - Publish live progress on `agent:<runId>` and timeline events on `events`.
2. **Phase 2 — Inter-Agent Investigation Routing:**
   - Process queued `InvestigationRequest`s (e.g. Auth asking Dataflow about a query source).
   - Enforce bounded depth (`maxHops = 1` or `maxInvestigations = 3`) to prevent recursion loops.
   - Dispatch target agent with question context and append any resulting hypotheses to the verification queue.
3. **Phase 3 — Sandbox Verification Drain:**
   - Deduplicate all queued `VerificationRequest`s by key: `${template}:${JSON.stringify(subject)}`.
   - Execute `verify(cfg, projectId, request)` against the guarded sandbox for each unique request.
   - Record `verification_runs` in MongoDB and publish status to the event bus.
4. **Phase 4 — Finding Minting & Idempotent Upsert:**
   - For every run where `result === 'CONFIRMED'`, invoke `buildFinding(cfg, engine, hypothesis, run)`.
   - Enforce idempotency: check if an open finding already exists for `(projectId, type, affectedNodes.sort())`; update existing finding rather than creating duplicates.
5. **Phase 5 — Attack-Path Composition:**
   - If confirmed open findings exist, run `attackPathAgent`.
   - Attack-Path agent inspects confirmed findings, queries `getAttackPath`, and attaches exploit chains via `attachAttackPath`.
   - Aggregate all stats, update assessment run status to `completed`, and emit `assessment.finished`.

---

## 4. Detailed Component Specification

### 4.1 Type Definitions (`packages/engine/src/orchestrator/types.ts`)
```ts
export type OrchestratorStatus = 'idle' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type AssessmentMode = 'full' | 'agent' | 'change';

export interface OrchestratorBudget {
  maxTotalSteps: number;      // default: 80
  maxTotalTokens: number;     // default: 150_000
  timeoutMs: number;          // default: 600_000 (10 mins)
}

export interface AssessmentOptions {
  projectId: string;
  provider?: LlmProvider;
  engine?: FactEngine;
  store?: RunStore;
  bus?: EventBus;
  signal?: AbortSignal;
  budget?: Partial<OrchestratorBudget>;
  enableVerification?: boolean; // defaults to config.sandbox.verificationEnabled
  maxInvestigationDepth?: number; // default: 1
}

export interface AgentRunSummary {
  runId: string;
  agent: string;
  status: string;
  steps: number;
  tokens: number;
  durationMs: number;
  hypothesesCount: number;
  observationsCount: number;
  error?: string;
}

export interface AssessmentResult {
  assessmentId: string;
  projectId: string;
  mode: AssessmentMode;
  status: OrchestratorStatus;
  agents: Record<string, AgentRunSummary>;
  verificationRuns: VerificationRun[];
  findings: Finding[];
  hypotheses: Hypothesis[];
  durationMs: number;
  error?: string;
}

export interface ChangeSetInput {
  changedFiles: string[];
  changedNodeIds?: string[];
  affectedNodeTypes?: string[];
}
```

### 4.2 Relevance Mapping (`packages/engine/src/orchestrator/relevance.ts`)
Selects the minimal set of specialist agents to re-run based on modified files or graph node types:
- **`auth` Agent:** Triggered when changes touch:
  - Node types: `Route`, `Middleware`, `Function` (middleware or auth handlers)
  - Files matching: routes, auth controllers, middleware, JWT helpers, permission checks
- **`dataflow` Agent:** Triggered when changes touch:
  - Node types: `Input`, `Model`, `Database`, `Secret`, `Function` (data access)
  - Files matching: Mongoose models, database schemas, query handlers, controllers reading `req.body` / `req.query`
- **`attack-path` Agent:** Triggered when:
  - Upstream agents produce new confirmed findings, or
  - Changes modify sensitive `Asset` nodes or entrypoint `Route` nodes.

```ts
export function getRelevantAgents(changeSet: ChangeSetInput): AgentName[] {
  const agents = new Set<AgentName>();
  const types = new Set(changeSet.affectedNodeTypes ?? []);
  const files = changeSet.changedFiles.map((f) => f.toLowerCase());

  // Auth relevance
  if (
    types.has('Route') ||
    types.has('Middleware') ||
    files.some((f) => f.includes('route') || f.includes('auth') || f.includes('middleware') || f.includes('jwt'))
  ) {
    agents.add('auth');
  }

  // Dataflow relevance
  if (
    types.has('Model') ||
    types.has('Input') ||
    types.has('Database') ||
    types.has('Secret') ||
    files.some((f) => f.includes('model') || f.includes('schema') || f.includes('db') || f.includes('query'))
  ) {
    agents.add('dataflow');
  }

  // Default: if ambiguous, run detection agents
  if (agents.size === 0) {
    agents.add('auth');
    agents.add('dataflow');
  }

  return Array.from(agents);
}
```

### 4.3 Central Request Protocol & Routing (`packages/engine/src/orchestrator/requests.ts`)
- **Verification Deduplication & Execution:**
  - Build a deterministic cache key: `${req.template}::${req.subject.kind}::${JSON.stringify(req.subject)}`.
  - Group identical requests so each exploit is executed at most once per assessment.
  - Call `verify(cfg, projectId, req)`.
  - If `result === 'CONFIRMED'`, call `buildFinding(...)` with idempotency safeguards.
- **Investigation Request Handling:**
  - Verify that `req.target` is registered in `AgentSpec.investigationTargets`.
  - Enforce max hop count (`depth <= maxDepth`) to prevent infinite ping-pong.
  - Launch targeted child `runAgent` with the question as the goal and references as context.
- **Audit Logging:**
  - Log each routing decision to `security_events` (`models.security_events.create(...)`).
  - Publish realtime timeline events to the event bus (`events` channel).

### 4.4 Multi-Phase Coordinator (`packages/engine/src/orchestrator/supervisor.ts`)
Maintains the lifecycle of the entire assessment:
- Generates an `assessmentId`.
- Tracks cumulative token usage, step counts, and overall timeout.
- Executes child agents using `runAgent` with forwarded cancellation signals and event emitter bridges.
- Catches individual agent failures gracefully: if `auth` fails due to an LLM provider timeout, `dataflow` and subsequent phases still complete, resulting in status `'partial'` rather than crashing.

### 4.5 Execution Entrypoints (`packages/engine/src/orchestrator/run.ts`)
Exposes the three primary entrypoints:
```ts
export async function runAssessment(
  projectId: string,
  options?: Partial<AssessmentOptions>,
): Promise<AssessmentResult>;

export async function runAgentOnDemand(
  projectId: string,
  agentName: 'auth' | 'dataflow' | 'attack-path' | 'demo',
  options?: Partial<AssessmentOptions> & { goal?: string },
): Promise<AssessmentResult>;

export async function onChange(
  projectId: string,
  changeSet: ChangeSetInput,
  options?: Partial<AssessmentOptions>,
): Promise<AssessmentResult>;
```

### 4.6 Public Exports & Monorepo Wiring
1. **Module Exports:** `packages/engine/src/orchestrator/index.ts` re-exports all public types and functions.
2. **Subpath Export:** Update `packages/engine/package.json` to export `"./orchestrator": "./src/orchestrator/index.ts"`.
3. **Root Engine Export:** Add `export * from './orchestrator';` in `packages/engine/src/index.ts`.
4. **CLI Runner:** Create `packages/engine/scripts/assess.ts` and add `"assess": "tsx scripts/assess.ts"` to `packages/engine/package.json`.

---

## 5. Verification & Test Strategy

| Test File | Scope | Method |
|---|---|---|
| `test/orchestrator/relevance.test.ts` | Relevance mapping logic | Pure unit tests verifying file/node patterns map to `auth`, `dataflow`, or both. |
| `test/orchestrator/requests.test.ts` | Request deduplication & routing | Unit tests ensuring identical `VerificationRequest`s deduplicate, and investigation depth limits hold. |
| `test/orchestrator/supervisor.test.ts` | End-to-end multi-agent assessment | Integration tests using `fixtureEngine()`, `MemoryRunStore()`, and `ScriptedProvider` (zero network/live LLM required). |
| `test/orchestrator/orchestrator.e2e.test.ts` | Full MongoDB persistence & events | End-to-end tests validating writes to `agent_runs`, `verification_runs`, `findings`, and `security_events`. |

---

## 6. Acceptance Criteria & Definition of Done (DoD)

- [ ] **Unified Assessment:** Calling `runAssessment(projectId)` executes Auth and Dataflow agents, executes and deduplicates verification requests in the sandbox, mints confirmed findings, and triggers Attack-Path composition.
- [ ] **On-Demand Single Agent:** Calling `runAgentOnDemand(projectId, agentName)` runs the specified agent, drains its verification requests, and returns findings.
- [ ] **Targeted Re-analysis:** Calling `onChange(projectId, changeSet)` runs only the relevant agents for the modified files/nodes.
- [ ] **Zero Direct Agent Calls:** Agents communicate strictly via `requestInvestigation` and `requestVerification`, routed through the orchestrator.
- [ ] **Finding Idempotency:** Running assessment multiple times without code changes produces no duplicate findings in the database.
- [ ] **Resilience & Budget:** Individual agent failures degrade the assessment gracefully without uncaught exceptions; orchestrator timeout and cancellation work reliably.
- [ ] **Deterministic Test Suite:** Complete test coverage passing with in-memory test fixtures.

---

## 7. Handoff to Next Phases

- **To C10 (Change Intelligence):** File watcher and `git diff` listener will call `onChange(projectId, changeSet)` when files change.
- **To C11 (SOC Dashboard):** Express server exposes `/api/assessments` and streams orchestrator events over SSE.
- **To C12 (Continuous Packaging):** Scheduled daemon calls `runAssessment` periodically.
