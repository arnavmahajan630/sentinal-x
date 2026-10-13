# Sentinel-X Application Flow And Core Features

## One-Line Pitch

Sentinel-X is a self-hosted, agentic application-security platform for MERN applications. It turns a source-code repository into a queryable security graph, lets specialist AI agents investigate that graph using security playbooks, and then proves serious findings with controlled sandbox verification.

The most important promise is simple:

> Sentinel-X analyzes and proves security issues. It never modifies target application code.

This makes it different from a normal static scanner and different from a coding assistant. Sentinel-X does not blindly trust an LLM's opinion, and it does not patch the app on its own. Instead, it builds an evidence trail: code facts, graph relationships, agent reasoning, verification attempts, exploit evidence, and finding status over time.

## What Sentinel-X Is Solving

Modern MERN applications spread security behavior across routes, middleware, controllers, models, request input, database operations, JWT handling, and configuration. A vulnerability is rarely visible in one line of code. For example, an IDOR issue may involve:

- a route that accepts a user-controlled `id`
- middleware that authenticates the user but does not enforce ownership
- a controller that passes the id into a MongoDB lookup
- a response that exposes sensitive order or payment data

Sentinel-X is designed to connect those pieces. It builds a persistent model of the application, gives agents structured tools to ask security questions, and then verifies important claims in a safe sandbox before presenting them as findings.

## Core Product Pillars

### 1. Repository Indexing

The first step is loading a target application. Sentinel-X can load a local repository path and also has API support for cloning from a Git URL. Once a project is loaded, the engine indexes the codebase.

The indexer parses the repository and extracts a normalized intermediate representation of the app. It looks for meaningful security objects rather than just raw text. This includes:

- Express routes and HTTP methods
- route paths and full resolved paths
- middleware chains
- controller and handler functions
- MongoDB and Mongoose model usage
- request inputs such as params, query, body, headers, and cookies
- database reads and writes
- response shapes and exposed fields
- JWT usage patterns
- hardcoded or committed secrets
- configuration files and dependencies

This gives Sentinel-X a structured foundation. The rest of the system does not need to repeatedly scrape source files from scratch. It can ask direct questions about the application.

### 2. Security Graph

After indexing, Sentinel-X builds an application security graph. The graph stores nodes and edges in MongoDB and represents how security-relevant parts of the app relate to each other.

Important node types include:

- `Project`
- `File`
- `Function`
- `Route`
- `Middleware`
- `Input`
- `Model`
- `Database`
- `Dependency`
- `Secret`
- `ExternalService`
- `Asset`

Important edge types include:

- `CONTAINS`
- `CALLS`
- `FLOWS_TO`
- `PROTECTED_BY`
- `ACCESSES`
- `DEPENDS_ON`
- `EXPOSES`
- `USES`

In pitch terms, the graph answers: "What paths exist from user input to sensitive data?"

Example:

```text
GET /api/orders/:id
  ├─ PROTECTED_BY → authenticate()
  ├─ CALLS        → getOrderById()
  └─ FLOWS_TO     → Order.findById(req.params.id)
                         └─ ACCESSES → MongoDB
                         └─ EXPOSES  → paymentDetails
```

This is valuable because many security bugs are paths, not isolated lines. The graph lets Sentinel-X reason about exposure, access control, sensitive assets, and attack chains.

### 3. Security Fact API

The Security Fact API sits on top of the graph. It gives agents and API routes typed, structured ways to query security information.

Instead of asking an LLM to read an entire repository and guess, Sentinel-X gives it tools such as:

- list routes
- inspect one route
- inspect middleware chains
- identify authorization gaps
- inspect dataflow into database operations
- find sensitive assets
- inspect model access
- inspect JWT usage
- find secrets
- retrieve attack paths
- list confirmed findings

This makes the agent behavior more grounded. The model is not the source of truth; the graph and facts are. The agents use the LLM for reasoning, prioritization, and hypothesis formation, while the system keeps them tied to real application facts.

### 4. Security Knowledge And Playbooks

Sentinel-X uses Markdown playbooks as its security knowledge base. These playbooks describe vulnerability types, signals, false-positive rules, severity expectations, and verification guidance.

The current playbook areas include:

- IDOR / BOLA
- missing authentication
- privilege escalation / BFLA
- JWT security
- NoSQL injection
- mass assignment
- data exposure
- secret exposure
- authorization reference guidance

The playbooks are important because they give the agents a consistent investigation strategy. They also help prevent weak findings. For example, an agent should not flag a route as vulnerable just because it has an `id` parameter. It must check whether authentication exists, whether authorization is enforced, whether the id reaches a sensitive operation, and whether false-positive rules apply.

### 5. Specialist Agents

Sentinel-X uses specialist agents instead of one generic security bot. Each agent has a focused job and a scoped set of playbooks.

#### Auth / Access-Control Agent

The Auth agent investigates authentication and authorization problems. It focuses on:

- IDOR / BOLA
- missing authentication
- privilege escalation
- JWT weaknesses

Its job is to find cases where users may access or modify data they should not be allowed to touch. It checks route protection, middleware behavior, ownership checks, role checks, JWT handling, and whether user-controlled identifiers reach sensitive database operations.

#### Dataflow / Mongo Agent

The Dataflow/Mongo agent investigates data and database risks. It focuses on:

- NoSQL injection
- mass assignment
- data exposure
- secret exposure

Its job is to understand how request input flows into queries, writes, responses, and sensitive fields. It separates issues that are often confused, such as NoSQL injection and mass assignment. NoSQL injection is about unsafe query construction; mass assignment is about trusting whole request bodies during create or update operations.

#### Attack-Path Agent

The Attack-Path agent does not invent new vulnerabilities. It composes already confirmed findings into larger exploit chains.

For example, if one confirmed finding shows weak authorization on a route and another confirms exposure of sensitive data, the Attack-Path agent can connect them through the security graph and explain the larger risk:

```text
User-controlled route parameter
  → weak authorization boundary
  → database object lookup
  → sensitive asset exposure
```

This helps turn individual bugs into a story about real attacker impact.

### 6. Sandbox-Only Verification

Sentinel-X does not stop at "the agent thinks this is vulnerable." Serious hypotheses can be routed to the verification engine.

The verification engine runs controlled exploit templates against a configured sandbox target. The available verification areas include:

- IDOR
- missing authentication
- BFLA / privilege escalation
- NoSQL injection
- mass assignment
- data exposure

Verification is intentionally guarded. Exploit traffic is meant for the sandbox environment only, not arbitrary production systems. If a verifier cannot run, fails, or is not implemented for a type, Sentinel-X records the result as inconclusive rather than crashing or pretending certainty.

Each verification run produces evidence such as:

- request details
- response details
- expected behavior
- actual behavior
- confirmed, rejected, or inconclusive result

### 7. Evidence-Backed Findings

A finding is the source of truth for a proven or tracked security issue. Findings are created from grounded hypotheses and verification results.

A good Sentinel-X finding answers:

- What is the vulnerability type?
- Which route, model, asset, or graph nodes are affected?
- How severe is it?
- What evidence proves it?
- Which agent run produced it?
- Which verification run confirmed it?
- Is it currently open, resolved, regressed, rejected, or inconclusive?

This is what makes the platform pitchable as evidence-based security rather than AI guessing. The user can show not just a title like "Possible IDOR," but the actual request/response evidence and the graph path that explains why it matters.

### 8. Change Intelligence

Sentinel-X is built to keep security state alive as code changes.

When watch mode or the scheduler detects a file change, the change engine:

1. determines which files changed
2. re-indexes the project
3. updates the graph using the new application model
4. identifies affected nodes, routes, and node types
5. re-verifies touched findings where possible
6. transitions findings between states such as open, resolved, and regressed
7. runs relevant specialist agents again on the affected area
8. records the change set and emits live events

This creates a continuous loop. A developer can fix a vulnerable route, save the file, and Sentinel-X can detect the change, re-analyze the affected graph area, re-run verification, and mark the finding resolved if the exploit no longer works.

### 9. SOC-Style Dashboard

The dashboard turns the backend analysis into a live security operations experience. It is organized around nine main views:

- Overview
- Attack Surface
- Security Graph
- Findings
- Agent Activity
- Verification
- Changes
- Knowledge
- Settings

The dashboard communicates both the current security posture and the reasoning behind it. It also uses Server-Sent Events so agent steps, security events, scheduler status, and change updates can stream live instead of requiring manual refreshes.

## Complete End-To-End Flow

The full Sentinel-X flow can be understood as one pipeline:

```text
Target MERN repo
  → Repository indexing
  → Normalized IR
  → Security graph
  → Security Fact API
  → Playbook-guided specialist agents
  → Grounded vulnerability hypotheses
  → Sandbox verification
  → Evidence-backed findings
  → Dashboard visibility
  → File watching / scheduler
  → Targeted re-analysis and finding transitions
```

### Step 1: The User Loads A Project

The user starts by loading a MERN application. This can be a local repository path or a Git repository URL.

When the backend receives the load request, it resolves the project location, indexes the repository, builds the graph, and stores project metadata. The dashboard can then show the project as loaded, along with detected tags such as Express, React, Node.js, MongoDB, TypeScript, or Git.

At this stage, Sentinel-X has not yet claimed vulnerabilities. It has built the application model.

### Step 2: Sentinel-X Indexes Security-Relevant Code

The indexer reads source files and extracts security-relevant structure. It identifies routes, methods, handlers, middleware, models, inputs, operations, secrets, and data exposure signals.

This stage converts messy source code into structured facts. For example, instead of treating a controller as plain text, Sentinel-X can know:

- this route is `GET /api/orders/:id`
- it has an `id` parameter
- it uses `authenticate`
- it calls an order handler
- the handler performs a Mongo lookup
- the lookup uses the route parameter
- the response may expose sensitive order fields

### Step 3: The Graph Models The Application

The graph builder converts the indexed representation into nodes and edges. Routes connect to middleware. Routes call functions. Functions access models. Inputs flow into database operations. Routes expose assets.

This graph is the heart of the platform. It lets Sentinel-X ask higher-level security questions:

- Which routes are public?
- Which routes mutate data?
- Which routes use user-controlled identifiers?
- Which models contain sensitive fields?
- Which route exposes which asset?
- Which paths connect input to a database operation?
- Which findings share the same affected route or asset?

### Step 4: Agents Query Facts Instead Of Guessing

When an assessment starts, agents do not scan the repository freely and invent answers. They use fact tools backed by the graph.

The Auth agent might begin by asking for authorization gaps. The Dataflow/Mongo agent might ask for mutating routes, data exposure, and secrets. The Attack-Path agent might ask for confirmed findings and graph paths between affected nodes.

This makes the investigation explainable. Every hypothesis should be connected to actual tool calls and real nodes in the graph.

### Step 5: Agents Produce Hypotheses

Agents produce hypotheses, not final findings. A hypothesis is a claim like:

```text
The route GET /api/orders/:id may allow IDOR because an authenticated user-controlled
id reaches an order lookup without a proven ownership check.
```

The runtime applies grounding rules before accepting a hypothesis. The hypothesis must cite real facts from the current run, match an allowed playbook type, and refer to real graph objects. Ungrounded claims are rejected before they become findings.

### Step 6: Verification Proves Or Rejects The Claim

If a hypothesis has a supported verification template, Sentinel-X creates a verification request. The verification engine sends controlled requests to the sandbox target and records what happened.

For example, an IDOR verification might use two seeded users:

```text
User A owns resource A.
User B should not access resource A.
Sentinel-X requests resource A as User B.
If User B receives the protected data, the issue is confirmed.
```

The outcome is recorded as:

- `CONFIRMED`
- `REJECTED`
- `INCONCLUSIVE`

This is the proof layer that makes Sentinel-X stronger than a pure static or LLM-only tool.

### Step 7: Confirmed Issues Become Findings

When verification confirms a vulnerability, Sentinel-X builds a finding. The finding includes severity, confidence, affected nodes, references, evidence, verification result, and timestamps.

Findings are shown in the dashboard and can be filtered by status or severity. A finding can also be linked to an attack path when the graph shows a meaningful exploit chain.

### Step 8: The Dashboard Tells The Story

The dashboard is designed to help a user understand both summary posture and detailed evidence.

The Overview page communicates the current security posture, open finding counts, severity distribution, recent events, and recent runs.

The Attack Surface page shows exposed routes, authorization gaps, sensitive assets, and route-level security information.

The Security Graph page visualizes the application model so users can see how routes, middleware, functions, models, inputs, databases, and assets connect.

The Findings page lists security issues ranked by risk and backed by evidence.

The Agent Activity page streams agent reasoning steps live, making the investigation process visible.

The Verification page shows exploit attempts and their outcomes.

The Changes page shows detected code changes, impacted nodes, re-analysis results, and finding transitions.

The Knowledge page exposes the playbooks that guide agent investigations.

The Settings page covers engine, LLM, sandbox, and system configuration.

### Step 9: Continuous Change Tracking Keeps Findings Honest

After the first assessment, Sentinel-X can continue watching the project. The scheduler automatically attaches watchers to loaded projects and emits honest idle heartbeats when nothing changes.

When a change happens, Sentinel-X does not simply rerun everything blindly. It performs targeted re-analysis:

```text
Code change
  → changed files detected
  → project re-indexed
  → graph updated
  → affected nodes identified
  → touched findings re-verified
  → relevant agents re-run
  → finding states updated
```

This allows the system to say:

- "This vulnerability is still open."
- "This fix resolved the finding."
- "This previously fixed issue regressed."
- "This change affects routes that need re-analysis."

That is a major product value: Sentinel-X is not just a one-time scanner. It tracks the living security state of an application.

## Demo / Viva Pitch Talking Points

Use this short explanation when pitching:

> Sentinel-X is a MERN security platform that analyzes another MERN application. First, it indexes the repository and builds a graph of routes, middleware, inputs, models, database operations, and sensitive assets. Then specialist AI agents query that graph using structured tools and security playbooks, so they are grounded in facts instead of guessing from raw code. When an agent suspects a serious vulnerability, Sentinel-X verifies it in a controlled sandbox using real exploit templates. Only evidence-backed results become findings. Finally, the dashboard shows the attack surface, graph, agent reasoning, verification evidence, and finding lifecycle. When code changes, Sentinel-X re-analyzes the affected parts and transitions findings to resolved or regressed.

The strongest technical contribution is:

```text
Persistent security graph
  + grounded agentic investigation
  + sandbox proof
  + continuous change tracking
```

The strongest product message is:

```text
Do not just ask AI if code is vulnerable.
Model the application, let agents investigate it, and prove important findings.
```

## What Makes Sentinel-X Different

Sentinel-X is not only static analysis. Static analysis usually reports patterns and possible issues. Sentinel-X builds a richer application model and uses it to reason across routes, middleware, dataflow, and assets.

Sentinel-X is not only DAST. DAST tools send requests to a running app but often lack deep knowledge of the source code and internal graph. Sentinel-X combines source understanding with sandbox verification.

Sentinel-X is not only an LLM wrapper. Agents cannot simply make claims without grounding. They must use fact tools, cite evidence, follow playbooks, and route serious claims through verification.

Sentinel-X is not a patching tool. It is intentionally analysis-only. This keeps trust boundaries clear: the platform investigates, proves, explains, and tracks security state, while developers remain responsible for code changes.

## Core Feature Summary

| Feature | What It Does | Why It Matters |
|---|---|---|
| Project loader | Loads local or Git-based MERN repositories | Starts analysis from real application code |
| Indexer | Extracts routes, functions, models, inputs, secrets, JWT usage, and data exposure | Converts source code into structured security facts |
| Security graph | Models routes, middleware, inputs, functions, databases, assets, and relationships | Makes vulnerabilities visible as paths |
| Fact API | Gives agents typed tools over the graph | Keeps AI reasoning grounded |
| Playbooks | Define vulnerability signals, false-positive rules, and guidance | Makes investigations consistent and explainable |
| Auth agent | Finds access-control and JWT risks | Covers IDOR, missing auth, BFLA, and token issues |
| Dataflow/Mongo agent | Finds database and data exposure risks | Covers NoSQL injection, mass assignment, exposed data, and secrets |
| Attack-Path agent | Connects confirmed findings into exploit chains | Explains attacker impact |
| Verification engine | Runs controlled exploit templates in sandbox | Converts hypotheses into evidence |
| Findings model | Stores severity, evidence, status, and affected nodes | Creates an auditable security record |
| Dashboard | Shows posture, graph, findings, agents, verification, changes, and knowledge | Makes the system understandable and demoable |
| Scheduler / watcher | Tracks code changes and re-analysis | Keeps security state current over time |

## Mental Model For The Whole System

Think of Sentinel-X as four layers:

```text
1. Understand the app
   Repository → Indexer → IR → Security graph

2. Investigate the app
   Graph → Fact API → Playbooks → Specialist agents

3. Prove the risk
   Hypothesis → Sandbox verification → Evidence-backed finding

4. Keep it current
   Code change → Impact analysis → Re-verification → Status transition
```

This is the story to remember for a pitch: Sentinel-X moves from understanding, to investigation, to proof, to continuous security state.

