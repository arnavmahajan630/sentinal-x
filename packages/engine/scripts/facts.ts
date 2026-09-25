import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run facts -- --list
//        npm run facts -- <path> <tool> ['<json args>']
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const { FACT_TOOLS, FactEngine, runFactTool } = await import('../src/facts');

if (args[0] === '--list') {
  for (const t of FACT_TOOLS) console.log(`${t.name.padEnd(24)} ${t.description}`);
  process.exit(0);
}
const [target, tool, json] = args;
if (!target || !tool) {
  console.error("usage: npm run facts -- --list | <path> <tool> ['<json args>']");
  process.exit(1);
}

const { connectDb, disconnectDb, initCollections, loadConfig } = await import('../src');
const { indexProject } = await import('../src/indexer');
const { buildGraph, MongoGraphStore } = await import('../src/graph');

await connectDb(loadConfig().mongoUrl);
await initCollections();
const idx = await indexProject(path.resolve(process.env.INIT_CWD ?? process.cwd(), target));
await buildGraph(idx.projectId);

const engine = new FactEngine(new MongoGraphStore(idx.projectId));
const result = await runFactTool(engine, tool, json ? JSON.parse(json) : {});
console.log(JSON.stringify(result, null, 2));
await disconnectDb();
process.exit(result.ok ? 0 : 2);
