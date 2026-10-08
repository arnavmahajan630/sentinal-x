import { describe, expect, it } from 'vitest';
import { getRelevantAgents, shouldRunAttackPath } from '../../src/orchestrator/relevance';

describe('orchestrator relevance mapping', () => {
  it('maps route and middleware node changes to the auth agent', () => {
    const agents = getRelevantAgents({
      changedFiles: [],
      affectedNodeTypes: ['Route', 'Middleware'],
    });
    expect(agents).toEqual(['auth']);
  });

  it('maps model, database, and input changes to the dataflow agent', () => {
    const agents = getRelevantAgents({
      changedFiles: [],
      affectedNodeTypes: ['Model', 'Input', 'Database'],
    });
    expect(agents).toEqual(['dataflow']);
  });

  it('maps auth-related file paths to the auth agent', () => {
    const agents = getRelevantAgents({
      changedFiles: ['src/routes/auth.ts', 'src/middleware/jwt.ts'],
    });
    expect(agents).toEqual(['auth']);
  });

  it('maps database-related file paths to the dataflow agent', () => {
    const agents = getRelevantAgents({
      changedFiles: ['src/models/user.ts', 'src/db/queries.ts'],
    });
    expect(agents).toEqual(['dataflow']);
  });

  it('maps composite changes touching both auth and dataflow to both agents', () => {
    const agents = getRelevantAgents({
      changedFiles: ['src/routes/orders.ts', 'src/models/order.ts'],
      affectedNodeTypes: ['Route', 'Model'],
    });
    expect(agents.sort()).toEqual(['auth', 'dataflow'].sort());
  });

  it('falls back to both agents when changes are ambiguous or generic', () => {
    const agents = getRelevantAgents({
      changedFiles: ['src/utils/helpers.ts'],
    });
    expect(agents.sort()).toEqual(['auth', 'dataflow'].sort());
  });

  it('correctly decides whether to run attack-path based on findings count', () => {
    expect(shouldRunAttackPath(0)).toBe(false);
    expect(shouldRunAttackPath(1)).toBe(true);
    expect(shouldRunAttackPath(5)).toBe(true);
  });
});
