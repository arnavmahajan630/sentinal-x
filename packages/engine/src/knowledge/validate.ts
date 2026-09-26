import { FACT_TOOLS } from '../facts/tools';
import { SIGNAL_CATALOG } from './signals';
import { isVerifierTemplate } from './templates';
import type { Playbook } from './types';

export const MAX_PLAYBOOK_CHARS = 9_000;
const TOOL_REF = /\bget[A-Z]\w*/g;

/**
 * Cross-checks playbooks against the rest of the system (fact tools, signal catalog, verifier templates).
 * Returns human-readable problems; empty = consistent. Used by tests and by `npm run knowledge -- validate`.
 */
export function validatePlaybooks(playbooks: Playbook[]): string[] {
  const problems: string[] = [];
  const tools = new Set(FACT_TOOLS.map((t) => t.name));
  const used = new Set<string>();
  const err = (p: Playbook, m: string) => problems.push(`${p.file}: ${m}`);

  for (const p of playbooks) {
    if (p.body.length > MAX_PLAYBOOK_CHARS)
      err(p, `body ${p.body.length} chars > ${MAX_PLAYBOOK_CHARS}`);
    if (/\b(TODO|FIXME|XXX)\b/.test(p.body)) err(p, 'contains TODO/FIXME');

    const refs = new Set(p.body.match(TOOL_REF) ?? []);
    for (const r of refs) if (!tools.has(r)) err(p, `references unknown fact tool "${r}"`);

    if (p.kind === 'vulnerability') {
      for (const q of p.factQueries) {
        if (!tools.has(q)) err(p, `factQueries has unknown tool "${q}"`);
        if (!(p.sections['Investigation strategy'] ?? '').includes(q))
          err(p, `factQueries "${q}" is not used in Investigation strategy`);
      }
      for (const r of refs)
        if (!p.factQueries.includes(r))
          err(p, `body uses "${r}" but it is not declared in factQueries`);
      const invTools = new Set((p.sections['Investigation strategy'] ?? '').match(TOOL_REF) ?? []);
      if (invTools.size < 2) err(p, 'Investigation strategy must call at least 2 fact tools');

      for (const s of [...p.signals, ...p.requires]) {
        used.add(s);
        if (!(s in SIGNAL_CATALOG)) err(p, `unknown signal "${s}"`);
        if (!(p.sections.Signals ?? '').includes(s))
          err(p, `signal "${s}" is not described in the Signals section`);
      }
      if (p.verifierTemplate !== null && !isVerifierTemplate(p.verifierTemplate))
        err(p, `unknown verifierTemplate "${p.verifierTemplate}"`);
    }
  }
  for (const [sig, meta] of Object.entries(SIGNAL_CATALOG)) {
    if (!meta.informational && !used.has(sig))
      problems.push(`signal catalog: "${sig}" is not used by any playbook`);
  }
  return problems;
}
