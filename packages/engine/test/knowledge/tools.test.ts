import { describe, expect, it } from 'vitest';
import { combineTools } from '../../src/tools/registry';
import { FACT_TOOLS } from '../../src/facts/tools';
import { KNOWLEDGE_TOOLS, runKnowledgeTool, toKnowledgeLlmTools } from '../../src/knowledge';
import { realRegistry } from './helpers';

const reg = realRegistry();

describe('KNOWLEDGE_TOOLS', () => {
  it('names do not collide with fact tools; schemas are valid LlmTool shapes', () => {
    expect(() => combineTools<any>(FACT_TOOLS as any, KNOWLEDGE_TOOLS as any)).not.toThrow();
    expect(() => combineTools<any>(KNOWLEDGE_TOOLS as any, KNOWLEDGE_TOOLS as any)).toThrowError(
      /Duplicate tool name/,
    );
    const tools = toKnowledgeLlmTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'getPlaybook',
      'getPlaybooksForSignals',
      'getSignalCatalog',
      'listPlaybooks',
    ]);
    for (const t of tools) expect(t.schema).toMatchObject({ type: 'object' });
    expect(
      (KNOWLEDGE_TOOLS.find((t) => t.name === 'getPlaybook')!.schema.shape as any).sections,
    ).toBeDefined();
  });

  it('getPlaybook returns everything, or only the requested sections (token saver)', async () => {
    const full = await runKnowledgeTool(reg, 'getPlaybook', { type: 'idor' });
    expect(full).toMatchObject({
      ok: true,
      data: {
        type: 'idor',
        verifierTemplate: 'idor',
        version: expect.stringMatching(/^[0-9a-f]{8}$/),
      },
    });
    expect(Object.keys((full as any).data.sections)).toHaveLength(9);
    const part = await runKnowledgeTool(reg, 'getPlaybook', {
      type: 'idor',
      sections: ['Investigation strategy', 'False-positive rules'],
    });
    expect(Object.keys((part as any).data.sections)).toEqual([
      'Investigation strategy',
      'False-positive rules',
    ]);
    expect(JSON.stringify(part).length).toBeLessThan(JSON.stringify(full).length / 2);
  });

  it('getPlaybooksForSignals: compact ranked matches + unknown signals reported', async () => {
    const r: any = await runKnowledgeTool(reg, 'getPlaybooksForSignals', {
      signals: ['authorization:unknown', 'user-controlled-id-flows-to-model-read', 'made-up'],
    });
    expect(r.ok).toBe(true);
    expect(r.data.unknownSignals).toEqual(['made-up']);
    expect(r.data.matches.map((m: any) => m.type)).toEqual(['idor', 'authorization']);
    expect(r.data.matches[0]).toMatchObject({ matched: ['authorization:unknown'], score: 2 });
    expect(r.data.matches[0].sections).toBeUndefined(); // compact
    const only: any = await runKnowledgeTool(reg, 'getPlaybooksForSignals', {
      signals: ['mass-assignment'],
      agent: 'auth',
    });
    expect(only.data.matches).toEqual([]); // mass-assignment belongs to the dataflow agent
  });

  it('listPlaybooks / getSignalCatalog', async () => {
    const l: any = await runKnowledgeTool(reg, 'listPlaybooks', { agent: 'auth' });
    expect(l.data.map((p: any) => p.type)).toEqual([
      'authorization',
      'idor',
      'jwt-security',
      'missing-auth',
      'privilege-escalation',
    ]);
    const c: any = await runKnowledgeTool(reg, 'getSignalCatalog', {});
    expect(c.data.find((s: any) => s.signal === 'mass-assignment')).toMatchObject({
      source: 'route',
    });
  });

  it('structured errors: not_found with suggestions, invalid args, unknown tool', async () => {
    expect(await runKnowledgeTool(reg, 'getPlaybook', { type: 'idorr' })).toMatchObject({
      ok: false,
      error: { code: 'not_found', suggestions: ['idor'] },
    });
    expect(await runKnowledgeTool(reg, 'getPlaybook', {})).toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' },
    });
    expect(
      await runKnowledgeTool(reg, 'getPlaybook', { type: 'idor', sections: ['Nope'] }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_argument' } });
    expect(await runKnowledgeTool(reg, 'getPlaybooksForSignals', { signals: [] })).toMatchObject({
      ok: false,
    });
    expect(await runKnowledgeTool(reg, 'getPlaybok', {})).toMatchObject({
      ok: false,
      error: { code: 'unknown_tool', suggestions: expect.arrayContaining(['getPlaybook']) },
    });
  });
});
