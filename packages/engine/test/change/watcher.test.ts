import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ProjectWatcher } from '../../src/change/watcher';

describe('ProjectWatcher', () => {
  it('instantiates and manages lifecycle cleanly', async () => {
    const root = path.resolve('packages/engine/test/fixtures/vuln-mern');
    const watcher = new ProjectWatcher(root, {
      debounceMs: 50,
      pollIntervalMs: 500,
      usePollingFallback: false,
    });

    const receivedBatches: any[] = [];
    const unsubscribe = watcher.onChange((batch) => {
      receivedBatches.push(batch);
    });

    await watcher.start();

    // Verify unsubscribing and stopping
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    await watcher.stop();
  });
});
