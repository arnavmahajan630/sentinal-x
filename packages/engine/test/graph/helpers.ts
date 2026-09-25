import path from 'node:path';
import { analyzeProject } from '../../src/indexer/analyze';
import type { Analysis } from '../../src/indexer/analyze';
import type { FileRow } from '../../src/indexer';
import { buildGraphModel } from '../../src/graph/model';
import type { GraphBuildInput } from '../../src/graph/model';
import type { EdgeDraft, GraphModel, NodeDraft } from '../../src/graph/types';

export const FIXTURE = path.resolve(__dirname, '../fixtures/vuln-mern');

export const toFileRows = (a: Analysis): FileRow[] =>
  a.rows.map((r) => ({
    path: r.w.path,
    kind: r.w.kind,
    status: r.status,
    ir: r.ir,
    linked: a.linked.files[r.w.path] ?? null,
  }));

export async function fixtureInput(): Promise<GraphBuildInput> {
  const a = await analyzeProject(FIXTURE);
  return { projectId: 'fixture', project: { name: 'vuln-mern' }, files: toFileRows(a) };
}

export class Q {
  private byId: Map<string, NodeDraft>;
  constructor(public m: GraphModel) {
    this.byId = new Map(m.nodes.map((n) => [n.id, n]));
  }
  node(id: string): NodeDraft {
    const n = this.byId.get(id);
    if (!n) throw new Error(`no node ${id}`);
    return n;
  }
  has = (id: string) => this.byId.has(id);
  ofType = (t: string) => this.m.nodes.filter((n) => n.type === t);
  out(id: string, type?: string): EdgeDraft[] {
    return this.m.edges.filter((e) => e.from === id && (!type || e.type === type));
  }
  in(id: string, type?: string): EdgeDraft[] {
    return this.m.edges.filter((e) => e.to === id && (!type || e.type === type));
  }
  edge(type: string, from: string, to: string): EdgeDraft | undefined {
    return this.m.edges.find((e) => e.type === type && e.from === from && e.to === to);
  }
}

export async function fixtureQ() {
  return new Q(buildGraphModel(await fixtureInput()));
}
