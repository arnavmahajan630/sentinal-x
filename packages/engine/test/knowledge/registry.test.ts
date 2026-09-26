import { describe, expect, it } from 'vitest';
import {
  KnowledgeError,
  KnowledgeRegistry,
  parsePlaybook,
  splitSections,
} from '../../src/knowledge';
import { vulnMd } from './helpers';

const pb = (over: Record<string, string> = {}, file = 'demo.md') =>
  parsePlaybook(vulnMd(over), file);
const refMd = (type: string, appliesTo: string) =>
  `---\ntype: ${type}\ntitle: Reference guide\nkind: reference\nagent: shared\nowasp: A01:2025\nseverityBase: info\nverifierTemplate: null\nverification: none\nappliesTo: ${appliesTo}\nsummary: Reference summary text here.\n---\n\n${['Purpose', 'Concepts', 'Reading the facts', 'Pitfalls'].map((n) => `## ${n}\n${n} text that is long enough to pass the minimum check.`).join('\n\n')}\n`;

describe('parsePlaybook', () => {
  it('parses front-matter, sections, hash and version', () => {
    const p = pb();
    expect(p).toMatchObject({
      type: 'demo',
      kind: 'vulnerability',
      severityBase: 'high',
      verifierTemplate: 'idor',
      factQueries: ['getRoute', 'getDataflow'],
    });
    expect(Object.keys(p.sections)).toHaveLength(9);
    expect(p.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(p.version).toBe(p.hash.slice(0, 8));
    expect(pb({ summary: 'Another summary text long enough.' }).version).not.toBe(p.version);
  });

  it('rejects: type != filename, bad severity, wrong section order, empty section, bad template/verification combo', () => {
    expect(() => pb({}, 'other.md')).toThrowError(/must equal the file name/);
    expect(() => pb({ severityBase: 'urgent' })).toThrowError(/front-matter/);
    expect(() => pb({ owasp: 'A11:2025' })).toThrowError(/A01:2025/);
    expect(() => pb({ verifierTemplate: 'null', verification: 'dynamic' })).toThrowError();
    expect(() => pb({ verifierTemplate: 'idor', verification: 'undecided' })).toThrowError(
      /verification dynamic\|static/,
    );
    const swapped = {
      Threat: 'x'.repeat(50),
      Signals: 'x'.repeat(50),
      Preconditions: 'x'.repeat(50),
    };
    expect(() => parsePlaybook(vulnMd({}, swapped), 'demo.md')).toThrowError(
      /sections must be, in order/,
    );
    const ok = Object.fromEntries(
      [
        'Threat',
        'Preconditions',
        'Signals',
        'Investigation strategy',
        'False-positive rules',
        'Relevant graph relationships',
        'Verification strategy',
        'Evidence requirements',
        'Remediation guidance',
      ].map((n) => [n, n === 'Threat' ? 'short' : 'x'.repeat(50)]),
    );
    expect(() => parsePlaybook(vulnMd({}, ok), 'demo.md')).toThrowError(/empty\/too short/);
  });

  it('unknown front-matter keys are rejected (strict)', () => {
    expect(() => parsePlaybook(vulnMd({ colour: 'blue' }), 'demo.md')).toThrowError(/front-matter/);
  });

  it('splitSections ignores headings inside code fences', () => {
    const s = splitSections('## A\ntext\n```\n## not a heading\n```\n## B\nmore');
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s[0]!.text).toContain('## not a heading');
  });
});

describe('KnowledgeRegistry', () => {
  const idor = pb(
    {
      type: 'idor',
      signals: '[authorization:unknown, authorization:none]',
      requires: '[user-controlled-id-flows-to-model-read]',
      severityBase: 'high',
    },
    'idor.md',
  );
  const mass = pb(
    { type: 'mass-assignment', signals: '[mass-assignment]', severityBase: 'medium' },
    'mass-assignment.md',
  );
  const crit = pb(
    {
      type: 'nosql-injection',
      signals: '[query-built-from-input-object, mass-assignment]',
      severityBase: 'critical',
      agent: 'dataflow',
    },
    'nosql-injection.md',
  );
  const guide = parsePlaybook(refMd('authorization', '[idor]'), 'authorization.md');
  const reg = new KnowledgeRegistry([idor, mass, crit, guide]);

  it('getPlaybook: exact, case-insensitive, suggestions on typo', () => {
    expect(reg.getPlaybook('IDOR').type).toBe('idor');
    expect(() => reg.getPlaybook('idorr')).toThrowError(
      expect.objectContaining({ code: 'not_found', suggestions: ['idor'] }),
    );
  });

  it('matching: any-of signals + all-of requires; unrelated signals match nothing', () => {
    expect(reg.getPlaybooksForSignals(['authorization:unknown']).map((p) => p.type)).toEqual([]); // requires missing
    expect(
      reg
        .getPlaybooksForSignals(['authorization:unknown', 'user-controlled-id-flows-to-model-read'])
        .map((p) => p.type),
    ).toEqual(['idor', 'authorization']); // + reference (appliesTo)
    expect(
      reg.getPlaybooksForSignals(['user-controlled-id-flows-to-model-read']).map((p) => p.type),
    ).toEqual([]); // no any-of signal
    expect(reg.getPlaybooksForSignals(['nothing']).map((p) => p.type)).toEqual([]);
  });

  it('ranking: matched count, then severity, then type; limit; references optional', () => {
    const m = reg.matchPlaybooks(['mass-assignment', 'query-built-from-input-object']);
    expect(m.map((x) => [x.playbook.type, x.score])).toEqual([
      ['nosql-injection', 2],
      ['mass-assignment', 1],
    ]);
    expect(m[0]!.matched).toEqual(['query-built-from-input-object', 'mass-assignment']);
    expect(
      reg
        .matchPlaybooks(['mass-assignment', 'query-built-from-input-object'], { limit: 1 })
        .map((x) => x.playbook.type),
    ).toEqual(['nosql-injection']);
    expect(
      reg
        .matchPlaybooks(['authorization:none', 'user-controlled-id-flows-to-model-read'], {
          includeReferences: false,
        })
        .map((x) => x.playbook.type),
    ).toEqual(['idor']);
  });

  it('agent filter keeps shared playbooks; list filters by kind', () => {
    expect(reg.listPlaybooks({ agent: 'dataflow' }).map((p) => p.type)).toEqual([
      'authorization',
      'nosql-injection',
    ]);
    expect(reg.listPlaybooks({ kind: 'reference' }).map((p) => p.type)).toEqual(['authorization']);
  });

  it('is deterministic and rejects duplicates / dangling appliesTo', () => {
    expect(JSON.stringify(reg.matchPlaybooks(['mass-assignment']))).toBe(
      JSON.stringify(reg.matchPlaybooks(['mass-assignment'])),
    );
    expect(() => new KnowledgeRegistry([idor, idor])).toThrowError(KnowledgeError);
    expect(() => new KnowledgeRegistry([guide])).toThrowError(/appliesTo unknown playbook "idor"/);
  });
});
