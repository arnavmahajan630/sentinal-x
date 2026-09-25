import { FactEngine } from '../../src/facts/engine';
import { InMemoryGraphStore } from '../../src/graph/memoryStore';
import { buildGraphModel } from '../../src/graph/model';
import { fixtureInput } from '../graph/helpers';

export async function fixtureEngine() {
  const model = buildGraphModel(await fixtureInput());
  const store = new InMemoryGraphStore('fixture', model);
  return { engine: new FactEngine(store), store, model };
}
