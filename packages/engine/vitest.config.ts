import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/fixtures/**'],
    // DB-backed suites share one database; run files serially to avoid index-build races
    fileParallelism: false,
  },
});
