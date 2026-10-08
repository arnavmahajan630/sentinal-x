export type ComponentState = 'online' | 'offline' | 'not_configured';

export interface ComponentHealth {
  state: ComponentState;
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  ts: string;
  components: {
    engine: ComponentHealth;
    sandbox: ComponentHealth;
    llm: ComponentHealth;
    database: ComponentHealth;
  };
}

export interface Project {
  projectId: string;
  name: string;
  path: string;
  gitHead?: string;
  gitBranch?: string;
  status: string;
  stats?: {
    files: number;
    indexed: number;
    routes: number;
    functions: number;
    models: number;
  };
  indexedAt?: string;
}

export interface OverviewData {
  projectId: string;
  project: Project;
  posture: {
    grade: string;
    score: number;
    statusText: string;
    protectedRoutes: number;
    totalRoutes: number;
  };
  findings: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    resolved: number;
    regressed: number;
  };
  topFindings: Finding[];
  recentEvents: any[];
  recentRuns: any[];
}

export interface RouteItem {
  id: string;
  method: string;
  path: string;
  fullPath: string;
  protected: boolean;
  authEnforcement: 'enforcing' | 'weak' | 'none';
  handler: string;
  file: string;
  mutates: boolean;
  hasInput: boolean;
  inputs?: string[];
  middlewareChain?: string[];
  line?: number;
}

export interface GraphNode {
  id: string;
  type: string;
  key: string;
  props: Record<string, any>;
  loc?: { file?: string; line?: number; col?: number };
}

export interface GraphEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  props?: Record<string, any>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Finding {
  id: string;
  projectId: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'regressed' | 'rejected';
  affectedNodes: string[];
  evidence: {
    request?: Record<string, any>;
    response?: Record<string, any>;
    expected?: string;
    actual?: string;
  };
  verificationResult?: {
    runId: string;
    result: 'CONFIRMED' | 'REJECTED' | 'INCONCLUSIVE';
    verifiedAt: string;
  };
  attackPath?: {
    findingIds: string[];
    nodes: string[];
    narrative: string;
  };
  agentRun: string;
  references: {
    owasp?: string;
    apiTop10?: string;
    cwe?: number[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface VerificationRun {
  id: string;
  projectId: string;
  runId: string;
  hypothesisId: string;
  template: string;
  result: 'CONFIRMED' | 'REJECTED' | 'INCONCLUSIVE';
  evidence: {
    request?: Record<string, any>;
    response?: Record<string, any>;
    expected?: string;
    actual?: string;
  };
  startedAt: string;
  finishedAt: string;
}

export interface ChangeSet {
  id: string;
  projectId: string;
  gitHead?: string;
  changedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  changedNodeIds: string[];
  affectedNodeTypes: string[];
  impactedRoutes: string[];
  status: string;
  reindexStats?: {
    filesIndexed: number;
    nodesChanged: number;
    edgesChanged: number;
    durationMs: number;
  };
  transitions: Array<{
    findingId: string;
    type: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    verificationResult?: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface Playbook {
  type: string;
  name: string;
  agent: string;
  severityBase: string;
  owasp?: string;
  apiTop10?: string;
  cwe?: number[];
  summary: string;
  signals: string[];
  body?: string;
}

export interface AgentStep {
  runId: string;
  seq: number;
  kind: string;
  title: string;
  detail: any;
  ts: string;
}

// ────────────────────────────────────────────────────────────────────────────
// API Fetch Helpers
// ────────────────────────────────────────────────────────────────────
const API_BASE = '';

export async function fetchHealth(): Promise<HealthReport> {
  const res = await fetch(`${API_BASE}/health`);
  const body = (await res.json()) as HealthReport;
  if (!body?.components) throw new Error(`Unexpected /health response (${res.status})`);
  return body;
}

export async function fetchPublicConfig(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/config`);
  return res.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  return res.json();
}

export async function fetchProject(projectId?: string): Promise<Project> {
  const url = projectId ? `${API_BASE}/api/project?projectId=${encodeURIComponent(projectId)}` : `${API_BASE}/api/project`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function loadLocalProject(path: string, force = false): Promise<any> {
  const res = await fetch(`${API_BASE}/api/project/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, force }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load project');
  }
  return res.json();
}

export async function fetchOverview(projectId: string): Promise<OverviewData> {
  const res = await fetch(`${API_BASE}/api/overview?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Failed to fetch overview');
  return res.json();
}

export async function fetchRoutes(projectId: string): Promise<{ routes: RouteItem[]; gaps: any[]; assetsCount: number }> {
  const res = await fetch(`${API_BASE}/api/routes?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
}

export async function fetchGraph(projectId: string, filter?: string, route?: string, finding?: string): Promise<GraphData> {
  const params = new URLSearchParams({ projectId });
  if (filter) params.set('filter', filter);
  if (route) params.set('route', route);
  if (finding) params.set('finding', finding);

  const res = await fetch(`${API_BASE}/api/graph?${params}`);
  if (!res.ok) throw new Error('Failed to fetch graph');
  return res.json();
}

export async function fetchFindings(projectId: string, status?: string, severity?: string): Promise<Finding[]> {
  const params = new URLSearchParams({ projectId });
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);

  const res = await fetch(`${API_BASE}/api/findings?${params}`);
  if (!res.ok) throw new Error('Failed to fetch findings');
  return res.json();
}

export async function fetchFinding(id: string): Promise<Finding> {
  const res = await fetch(`${API_BASE}/api/findings/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch finding');
  return res.json();
}

export async function fetchVerifications(projectId: string): Promise<VerificationRun[]> {
  const res = await fetch(`${API_BASE}/api/verifications?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Failed to fetch verifications');
  return res.json();
}

export async function triggerVerification(payload: { projectId: string; findingId?: string; template?: string; subject?: any }): Promise<VerificationRun> {
  const res = await fetch(`${API_BASE}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to trigger verification');
  return res.json();
}

export async function triggerAssessment(projectId: string, mode = 'full', agent?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, mode, agent }),
  });
  if (!res.ok) throw new Error('Failed to trigger assessment');
  return res.json();
}

export async function fetchRuns(projectId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/api/runs?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}

export async function fetchChanges(projectId: string): Promise<{ changeSets: ChangeSet[]; isWatching: boolean }> {
  const res = await fetch(`${API_BASE}/api/changes?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) throw new Error('Failed to fetch changes');
  return res.json();
}

export async function toggleWatch(projectId: string, action: 'start' | 'stop'): Promise<{ success: boolean; isWatching: boolean }> {
  const res = await fetch(`${API_BASE}/api/watch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, action }),
  });
  if (!res.ok) throw new Error('Failed to toggle file watcher');
  return res.json();
}

export async function fetchKnowledge(): Promise<Playbook[]> {
  const res = await fetch(`${API_BASE}/api/knowledge`);
  if (!res.ok) throw new Error('Failed to fetch knowledge');
  return res.json();
}

export async function fetchPlaybook(type: string): Promise<Playbook> {
  const res = await fetch(`${API_BASE}/api/knowledge/${encodeURIComponent(type)}`);
  if (!res.ok) throw new Error('Failed to fetch playbook');
  return res.json();
}
