import { KnowledgeError } from './errors';
import { loadPlaybooksFromDir, resolvePlaybooksDir } from './loader';
import { suggest } from '../tools/suggest';
import { SEVERITY_RANK } from './types';
import type { Playbook, PlaybookAgent, PlaybookKind } from './types';

export interface PlaybookMatch {
  playbook: Playbook;
  /** signals from the input that triggered this playbook (references: []) */
  matched: string[];
  score: number;
}

/** Deterministic playbook lookup by type and by fact signals (no embeddings; N1 may replace retrieval behind this class). */
export class KnowledgeRegistry {
  private byType = new Map<string, Playbook>();

  constructor(playbooks: Playbook[]) {
    for (const p of playbooks) {
      if (this.byType.has(p.type))
        throw new KnowledgeError('invalid_playbook', `duplicate playbook type "${p.type}"`);
      this.byType.set(p.type, p);
    }
    for (const p of playbooks) {
      for (const t of p.appliesTo) {
        if (!this.byType.has(t))
          throw new KnowledgeError(
            'invalid_playbook',
            `${p.file}: appliesTo unknown playbook "${t}"`,
          );
      }
    }
  }

  static fromDir(dir?: string): KnowledgeRegistry {
    return new KnowledgeRegistry(loadPlaybooksFromDir(resolvePlaybooksDir(dir)));
  }

  getPlaybook(type: string): Playbook {
    const p = this.byType.get(type.trim().toLowerCase());
    if (!p)
      throw new KnowledgeError(
        'not_found',
        `No playbook "${type}"`,
        suggest(type, [...this.byType.keys()]),
      );
    return p;
  }

  listPlaybooks(filter: { agent?: PlaybookAgent; kind?: PlaybookKind } = {}): Playbook[] {
    return [...this.byType.values()]
      .filter(
        (p) =>
          (!filter.kind || p.kind === filter.kind) &&
          (!filter.agent || p.agent === filter.agent || p.agent === 'shared'),
      )
      .sort((a, b) => (a.type < b.type ? -1 : 1));
  }

  /**
   * match iff (signals empty or ≥1 present) AND all `requires` present.
   * rank = matched-signal count + satisfied requires, then severityBase, then type.
   * Reference playbooks are appended when a matched playbook is in their `appliesTo`.
   */
  matchPlaybooks(
    signals: string[],
    opts: { agent?: PlaybookAgent; includeReferences?: boolean; limit?: number } = {},
  ): PlaybookMatch[] {
    const have = new Set(signals);
    const vulns: PlaybookMatch[] = [];
    for (const p of this.listPlaybooks({ kind: 'vulnerability', agent: opts.agent })) {
      const matched = p.signals.filter((s) => have.has(s));
      if (!p.signals.length ? false : matched.length === 0) continue;
      if (!p.requires.every((r) => have.has(r))) continue;
      vulns.push({ playbook: p, matched, score: matched.length + p.requires.length });
    }
    vulns.sort(
      (a, b) =>
        b.score - a.score ||
        SEVERITY_RANK[b.playbook.severityBase] - SEVERITY_RANK[a.playbook.severityBase] ||
        (a.playbook.type < b.playbook.type ? -1 : 1),
    );
    const top = opts.limit ? vulns.slice(0, opts.limit) : vulns;
    if (opts.includeReferences === false) return top;
    const types = new Set(top.map((m) => m.playbook.type));
    const refs = this.listPlaybooks({ kind: 'reference', agent: opts.agent })
      .filter((r) => r.appliesTo.some((t) => types.has(t)))
      .map((r) => ({ playbook: r, matched: [], score: 0 }));
    return [...top, ...refs];
  }

  getPlaybooksForSignals(
    signals: string[],
    opts?: { agent?: PlaybookAgent; includeReferences?: boolean; limit?: number },
  ): Playbook[] {
    return this.matchPlaybooks(signals, opts).map((m) => m.playbook);
  }
}

let cached: { dir: string; reg: KnowledgeRegistry } | undefined;
/** process-wide registry for the default (or given) playbooks dir */
export function getKnowledge(dir?: string): KnowledgeRegistry {
  const resolved = resolvePlaybooksDir(dir);
  if (!cached || cached.dir !== resolved)
    cached = { dir: resolved, reg: new KnowledgeRegistry(loadPlaybooksFromDir(resolved)) };
  return cached.reg;
}
export const getPlaybook = (type: string): Playbook => getKnowledge().getPlaybook(type);
export const getPlaybooksForSignals = (signals: string[]): Playbook[] =>
  getKnowledge().getPlaybooksForSignals(signals);
export const listPlaybooks = (): Playbook[] => getKnowledge().listPlaybooks();
