import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'cli.ts', scheduler: 'scheduler.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Engine is consumed as TS source; bundle it into the server build.
  noExternal: ['@sentinelx/engine'],
  banner: {
    js: "import { createRequire as __cr } from 'module'; import { fileURLToPath as __fup } from 'url'; import { dirname as __dn } from 'path'; const require = __cr(import.meta.url); const __filename = __fup(import.meta.url); const __dirname = __dn(__filename);",
  },
});
