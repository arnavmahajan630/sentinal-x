import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run index -- <path> [--dump routes|ops|models|authz|json] [--force]
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--dump') + 1]);
const dumpIdx = args.indexOf('--dump');
const dump = dumpIdx >= 0 ? args[dumpIdx + 1] : undefined;
const force = args.includes('--force');
if (!target) {
  console.error('usage: npm run index -- <path> [--dump routes|ops|models|authz|json] [--force]');
  process.exit(1);
}

const { connectDb, disconnectDb, initCollections, loadConfig } = await import('../src');
const { indexProject, loadProjectIR } = await import('../src/indexer');

const cfg = loadConfig();
// Local runs hit the compose Mongo on localhost; inside Docker MONGO_URL already points at `mongo`.
await connectDb(cfg.mongoUrl);
await initCollections();

const res = await indexProject(path.resolve(process.env.INIT_CWD ?? process.cwd(), target), {
  force,
});
console.log(`\nprojectId ${res.projectId}  (${res.durationMs} ms)`);
console.log(res.stats);
if (res.unparsed.length) {
  console.log('unparsed:');
  for (const u of res.unparsed) console.log(`  ${u.path}${u.line ? ':' + u.line : ''}  ${u.error}`);
}
console.log(
  `changed ${res.changed.length}, changedLinked ${res.changedLinked.length}, removed ${res.removed.length}`,
);

if (dump) {
  const ir = await loadProjectIR(res.projectId);
  if (dump === 'routes') {
    for (const r of ir.routes) {
      const chain = r.chain
        .map(
          (c) =>
            `${c.origin}:${c.ref.factory ? `${c.ref.factory}(${(c.ref.args ?? []).join(',')})` : c.ref.text}${c.conditional ? '?' : ''}`,
        )
        .join(' → ');
      console.log(
        `${r.id.padEnd(36)} ${r.mounted ? ' ' : '!unmounted '}${r.dynamic ? 'dynamic ' : ''}handler=${r.handlerFnId ?? r.handler.text}  [${chain}]  ${r.file}:${r.loc.line}`,
      );
    }
  } else if (dump === 'ops') {
    for (const f of ir.files) {
      f.ir?.mongoOps.forEach((o, i) => {
        console.log(
          `${f.path}:${o.loc.line}:${o.loc.col}  ${f.linked?.opModels[i] ?? '?'}.${o.op}  src=[${o.argSources.join(', ')}]  fn=${o.fnId.split('#')[1]}${o.select ? '  select=' + o.select.join(' ') : ''}`,
        );
      });
    }
  } else if (dump === 'models') {
    for (const f of ir.files)
      for (const m of f.ir?.models ?? [])
        console.log(
          `${m.name}: ${m.fields.map((x) => x.name + (x.select === false ? '(select:false)' : '') + (x.ref ? '→' + x.ref : '')).join(', ')}`,
        );
  } else if (dump === 'authz') {
    for (const f of ir.files)
      for (const a of f.ir?.authz ?? [])
        console.log(
          `${f.path}:${a.loc.line}  ${a.fnId.split('#')[1]}  ${a.kind}  ${a.expr}${a.guards ? '  guards=' + JSON.stringify(a.guards) : ''}`,
        );
  } else if (dump === 'json') {
    console.log(JSON.stringify(ir, null, 2));
  }
}
await disconnectDb();
