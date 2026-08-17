import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { canonicalTestFiles } from '../scripts/test.mjs';
import { PROJECT_ROOT } from '../lib/core.mjs';

test('canonical test discovery is deterministic and confined to tests', async () => {
  const first = await canonicalTestFiles(PROJECT_ROOT);
  const second = await canonicalTestFiles(PROJECT_ROOT);

  assert.deepEqual(first, second);
  assert.ok(first.includes(path.join('tests', 'test-runner.test.mjs')));
  assert.ok(first.every((relative) => relative.startsWith(`tests${path.sep}`)));
  assert.ok(first.every((relative) => !relative.startsWith(`release${path.sep}`)));
  assert.ok(first.every((relative) => relative.endsWith('.test.mjs')));
});
