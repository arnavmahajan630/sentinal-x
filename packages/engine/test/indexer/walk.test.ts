import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { walkProject } from '../../src/indexer/walk';

let root: string;
const write = async (p: string, c = '') => {
  await fs.mkdir(path.dirname(path.join(root, p)), { recursive: true });
  await fs.writeFile(path.join(root, p), c);
};

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sx-walk-'));
  await write('.gitignore', 'secret-dir/\n*.log\n');
  await write('package.json', JSON.stringify({ dependencies: { express: '^4' } }));
  await write('src/app.js', "const e = require('express');");
  await write('src/util.js', 'exports.x = 1;'); // no signals → nearest package.json says server
  await write('src/gen/out.gen.js', 'x'); // ignored by nested .gitignore
  await write('src/gen/.gitignore', '*.gen.js\n');
  await write('src/gen/keep.js', 'x');
  await write('secret-dir/leak.js', 'x');
  await write('node_modules/pkg/index.js', 'x');
  await write('dist/bundle.js', 'x');
  await write('build/b.js', 'x');
  await write('src/app.test.js', 'x');
  await write('__tests__/a.js', 'x');
  await write('client/package.json', JSON.stringify({ dependencies: { react: '^18' } }));
  await write('client/src/App.jsx', "import React from 'react';");
  await write('client/src/api.js', 'export const x = 1;'); // client path
  await write('web-lib/helper.js', "import React from 'react';"); // react import → client
  await write('lib/plain.js', 'exports.y = 2;'); // no package.json nearby beyond root(server) → server
  await write('src/types.d.ts', 'declare const x: number;');
  await write('src/big.js', 'x'.repeat(1_000_001));
  await write('src/app.min.js', 'x');
  await write('.env', 'A=1');
  await write('README.md', '# nope');
});
afterAll(async () => fs.rm(root, { recursive: true, force: true }));

describe('walkProject', () => {
  it('honors gitignore (root + nested) and built-in skips; lists only relevant files', async () => {
    const files = await walkProject(root);
    const paths = files.map((f) => f.path);
    for (const p of [
      'secret-dir/leak.js',
      'src/gen/out.gen.js',
      'node_modules/pkg/index.js',
      'dist/bundle.js',
      'build/b.js',
      'README.md',
    ]) {
      expect(paths).not.toContain(p);
    }
    expect(paths).toEqual(
      expect.arrayContaining(['src/app.js', 'src/gen/keep.js', '.env', 'package.json']),
    );
    expect(paths).toEqual([...paths].sort()); // deterministic order
  });

  it('classifies kinds', async () => {
    const kinds = Object.fromEntries(
      (await walkProject(root)).map((f) => [f.path, f.kind + ':' + f.action]),
    );
    expect(kinds['src/app.js']).toBe('server:extract');
    expect(kinds['src/util.js']).toBe('server:extract');
    expect(kinds['lib/plain.js']).toBe('server:extract');
    expect(kinds['src/app.test.js']).toBe('test:record');
    expect(kinds['__tests__/a.js']).toBe('test:record');
    expect(kinds['client/src/App.jsx']).toBe('client:record');
    expect(kinds['client/src/api.js']).toBe('client:record');
    expect(kinds['web-lib/helper.js']).toBe('client:record');
    expect(kinds['package.json']).toBe('config:extract');
    expect(kinds['.env']).toBe('config:extract');
  });

  it('skips large, minified and declaration files with a reason', async () => {
    const by = Object.fromEntries((await walkProject(root)).map((f) => [f.path, f]));
    expect(by['src/big.js']).toMatchObject({ action: 'skip', skipReason: 'too-large' });
    expect(by['src/app.min.js']).toMatchObject({ action: 'skip', skipReason: 'minified' });
    expect(by['src/types.d.ts']).toMatchObject({ action: 'skip', skipReason: 'declaration' });
  });
});
