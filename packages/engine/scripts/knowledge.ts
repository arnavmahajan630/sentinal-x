import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Usage: npm run knowledge -- list | show <type> [section] | match <signal,signal…> | validate | signals
//        npm run knowledge -- route <projectPath> '<route id>'   (index + graph + facts → signals → playbooks)
//        npm run knowledge -- sync                                (mirror playbooks into Mongo security_knowledge)
loadEnv({ path: new URL('../../../.env', import.meta.url).pathname, quiet: true });

const [cmd, ...rest] = process.argv.slice(2);
const K = await import('../src/knowledge');
const reg = K.getKnowledge(process.env.PLAYBOOKS_DIR);

const row = (p: import('../src/knowledge').Playbook) =>
  `${p.type.padEnd(22)} ${p.kind.padEnd(13)} ${p.agent.padEnd(9)} ${p.severityBase.padEnd(8)} ${String(p.verifierTemplate ?? '-').padEnd(16)} ${p.verification.padEnd(10)} @${p.version}`;

switch (cmd) {
  case 'list':
    for (const p of reg.listPlaybooks()) console.log(row(p));
    break;
  case 'show': {
    const p = reg.getPlaybook(rest[0] ?? '');
    if (rest[1])
      console.log(p.sections[rest[1] as keyof typeof p.sections] ?? `no section "${rest[1]}"`);
    else
      console.log(
        `${row(p)}\nfactQueries: ${p.factQueries.join(', ')}\nsignals: ${p.signals.join(', ')}  requires: ${p.requires.join(', ') || '-'}\n\n${p.body}`,
      );
    break;
  }
  case 'match': {
    const signals = (rest[0] ?? '').split(',').filter(Boolean);
    for (const m of reg.matchPlaybooks(signals))
      console.log(
        `${m.playbook.type.padEnd(22)} score=${m.score} matched=[${m.matched.join(', ')}]`,
      );
    break;
  }
  case 'signals':
    for (const [s, m] of Object.entries(K.SIGNAL_CATALOG))
      console.log(
        `${s.padEnd(42)} ${m.source.padEnd(7)} ${m.informational ? '(info) ' : ''}${m.description}`,
      );
    break;
  case 'validate': {
    const problems = K.validatePlaybooks(reg.listPlaybooks());
    console.log(
      problems.length
        ? problems.join('\n')
        : `OK: ${reg.listPlaybooks().length} playbooks consistent`,
    );
    process.exit(problems.length ? 1 : 0);
    break;
  }
  case 'sync': {
    const { connectDb, disconnectDb, initCollections, loadConfig } = await import('../src');
    await connectDb(loadConfig().mongoUrl);
    await initCollections();
    console.log(await K.syncKnowledge(reg));
    await disconnectDb();
    break;
  }
  case 'route': {
    const [target, routeId] = rest;
    if (!target || !routeId) throw new Error("usage: route <projectPath> '<route id>'");
    const { connectDb, disconnectDb, initCollections, loadConfig } = await import('../src');
    const { indexProject } = await import('../src/indexer');
    const { buildGraph, MongoGraphStore } = await import('../src/graph');
    const { FactEngine } = await import('../src/facts');
    await connectDb(loadConfig().mongoUrl);
    await initCollections();
    const idx = await indexProject(path.resolve(process.env.INIT_CWD ?? process.cwd(), target));
    await buildGraph(idx.projectId);
    const engine = new FactEngine(new MongoGraphStore(idx.projectId));
    const facts = await engine.getRoute(routeId);
    const signals = K.signalsFromRoute(facts);
    console.log(
      `route:   ${facts.id}  authorization=${facts.authorization}  protected=${facts.protected}`,
    );
    console.log(`signals: ${signals.join(', ')}`);
    for (const m of reg.matchPlaybooks(signals))
      console.log(
        `  → ${m.playbook.type.padEnd(22)} score=${m.score} ${m.playbook.kind === 'reference' ? '(reference)' : `matched=[${m.matched.join(', ')}]`} @${m.playbook.version}`,
      );
    await disconnectDb();
    break;
  }
  default:
    console.error(
      'usage: npm run knowledge -- list | show <type> [section] | match <a,b> | signals | validate | sync | route <path> <route>',
    );
    process.exit(1);
}
