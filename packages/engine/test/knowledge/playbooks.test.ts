import { describe, expect, it } from 'vitest';
import { FACT_TOOLS } from '../../src/facts/tools';
import { SIGNAL_CATALOG, validatePlaybooks } from '../../src/knowledge';
import { realRegistry } from './helpers';

const reg = realRegistry();
const all = reg.listPlaybooks();

describe('real playbooks (playbooks/*.md)', () => {
  it('ships the 9 agreed playbooks: 8 vulnerability + 1 reference', () => {
    expect(all.map((p) => p.type)).toEqual([
      'authorization',
      'data-exposure',
      'idor',
      'jwt-security',
      'mass-assignment',
      'missing-auth',
      'nosql-injection',
      'privilege-escalation',
      'secret-exposure',
    ]);
    expect(all.filter((p) => p.kind === 'reference').map((p) => p.type)).toEqual(['authorization']);
  });

  it('is consistent with fact tools, signal catalog and verifier templates (validatePlaybooks = no problems)', () => {
    expect(validatePlaybooks(all)).toEqual([]);
  });

  it('agent ownership matches the plans (C6 auth / C8 dataflow)', () => {
    const by = (a: string) => all.filter((p) => p.agent === a).map((p) => p.type);
    expect(by('auth')).toEqual(['idor', 'jwt-security', 'missing-auth', 'privilege-escalation']);
    expect(by('dataflow')).toEqual([
      'data-exposure',
      'mass-assignment',
      'nosql-injection',
      'secret-exposure',
    ]);
    expect(by('shared')).toEqual(['authorization']);
  });

  it('verification policy: planned templates for provable classes, jwt/secret undecided (C7 decision open)', () => {
    const t = (n: string) => reg.getPlaybook(n);
    expect([
      t('idor').verifierTemplate,
      t('missing-auth').verifierTemplate,
      t('privilege-escalation').verifierTemplate,
      t('nosql-injection').verifierTemplate,
    ]).toEqual(['idor', 'missing-auth', 'bfla', 'nosql-injection']);
    expect([t('mass-assignment').verifierTemplate, t('data-exposure').verifierTemplate]).toEqual([
      'mass-assignment',
      'data-exposure',
    ]);
    for (const n of ['jwt-security', 'secret-exposure'])
      expect(t(n)).toMatchObject({ verifierTemplate: null, verification: 'undecided' });
  });

  it('every declared fact query exists and each vulnerability playbook uses ≥ 2 in order in its investigation', () => {
    const names = new Set(FACT_TOOLS.map((x) => x.name));
    for (const p of all.filter((x) => x.kind === 'vulnerability')) {
      expect(p.factQueries.length, p.type).toBeGreaterThanOrEqual(3);
      for (const q of p.factQueries) expect(names.has(q), `${p.type}:${q}`).toBe(true);
      const inv = p.sections['Investigation strategy']!;
      const idx = p.factQueries.map((q) => inv.indexOf(q));
      expect(
        idx.every((i) => i >= 0),
        p.type,
      ).toBe(true);
      expect(idx, `${p.type} queries are declared in investigation order`).toEqual(
        [...idx].sort((a, b) => a - b),
      );
    }
  });

  it('covers every non-informational signal; references attach to access-control playbooks', () => {
    const used = new Set(all.flatMap((p) => [...p.signals, ...p.requires]));
    for (const [s, m] of Object.entries(SIGNAL_CATALOG))
      if (!m.informational) expect(used.has(s), s).toBe(true);
    expect(reg.getPlaybook('authorization').appliesTo).toEqual([
      'idor',
      'privilege-escalation',
      'missing-auth',
    ]);
  });

  it('plan DoD: getPlaybook(idor) + getPlaybooksForSignals(...) return IDOR and the authorization reference', () => {
    const idor = reg.getPlaybook('idor');
    expect(idor).toMatchObject({
      verifierTemplate: 'idor',
      factQueries: [
        'getAuthorizationGaps',
        'getRoute',
        'getDataflow',
        'getModelAccess',
        'getExposure',
      ],
    });
    expect(
      reg
        .getPlaybooksForSignals(['authorization:unknown', 'user-controlled-id-flows-to-model-read'])
        .map((p) => p.type),
    ).toEqual(['idor', 'authorization']);
  });

  it('versions are stable, 8 hex chars', () => {
    for (const p of all) expect(p.version).toMatch(/^[0-9a-f]{8}$/);
    expect(new Set(all.map((p) => p.version)).size).toBe(all.length);
  });
});
