import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run graph -- <path> [--dump summary|routes|route <id>|find <Type>|path <fromId> <toId>|json]
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const di = args.indexOf('--dump');
const dump = di >= 0 ? args[di + 1] : 'summary';
const rest = di >= 0 ? args.slice(di + 2) : [];
if (!target) {
  console.error(
    'usage: npm run graph -- <path> [--dump summary|routes|route <id>|find <Type>|path <from> <to>|json]',
  );
  process.exit(1);
}

const { connectDb, disconnectDb, initCollections, loadConfig } = await import('../src');
const { indexProject } = await import('../src/indexer');
const { buildGraph, MongoGraphStore } = await import('../src/graph');

await connectDb(loadConfig().mongoUrl);
await initCollections();

const idx = await indexProject(path.resolve(process.env.INIT_CWD ?? process.cwd(), target));
const res = await buildGraph(idx.projectId);
const store = new MongoGraphStore(idx.projectId);
const st = await store.stats();
console.log(`\nprojectId ${idx.projectId}  index ${idx.durationMs} ms  graph ${res.durationMs} ms`);
console.log(`graph: ${st.nodes} nodes, ${st.edges} edges`);
console.log(
  `delta: +${res.added.nodes}/~${res.changed.nodes}/-${res.removed.nodes} nodes  +${res.added.edges}/~${res.changed.edges}/-${res.removed.edges} edges`,
);

if (dump === 'summary') {
  console.log('nodes by type:', st.byNodeType);
  console.log('edges by type:', st.byEdgeType);
} else if (dump === 'routes') {
  const routes = await store.find({ type: 'Route' });
  for (const r of routes) {
    const p = r.props;
    const flags = [
      p.mounted ? '' : 'UNMOUNTED',
      p.protected ? `auth:${p.authEnforcement}` : 'OPEN',
      p.exposesUserId ? 'exposesUserId' : '',
      p.roleGuards?.length
        ? `role:${p.roleGuards.map((g: any) => g.name + (g.args ? '(' + g.args.join(',') + ')' : '')).join('+')}`
        : '',
      p.exposesSensitive?.length
        ? `exposes:${p.exposesSensitive.map((a: string) => a.replace('Asset:', '')).join(',')}`
        : '',
    ]
      .filter(Boolean)
      .join('  ');
    console.log(`${r.key.padEnd(34)} ${flags}`);
  }
} else if (dump === 'route') {
  const id = `Route:${rest[0]}`;
  const n = await store.node(id);
  if (!n) console.log('no such route', id);
  else {
    console.log(JSON.stringify(n, null, 2));
    for (const e of await store.edgesOf(id))
      console.log(
        `${e.type.padEnd(13)} → ${e.to}${e.props ? '  ' + JSON.stringify(e.props).slice(0, 160) : ''}`,
      );
  }
} else if (dump === 'find') {
  for (const n of await store.find({ type: rest[0] as any }))
    console.log(n.id, JSON.stringify(n.props).slice(0, 140));
} else if (dump === 'path') {
  const p = await store.pathDetail(rest[0]!, rest[1]!, undefined);
  console.log(p ? p.nodes.map((n) => n.id).join('\n  → ') : 'no path');
} else if (dump === 'json') {
  console.log(
    JSON.stringify({ nodes: await store.find({}), edges: await store.edges({}) }, null, 2),
  );
}
await disconnectDb();
