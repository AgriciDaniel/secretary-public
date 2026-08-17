import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportPublicTree } from '../scripts/public-export.mjs';
import { assertExpectedSupportOmission, runPublicReady } from '../scripts/public-ready.mjs';
import { PROJECT_ROOT } from '../lib/core.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-public-ready-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'public');
  await exportPublicTree({
    sourceRoot: PROJECT_ROOT,
    output,
    repository: 'SecretaryTest/public-ready',
  });
  return output;
}

test('public readiness runs the closed gate sequence and accepts only the declared omission', async (t) => {
  const output = await fixture(t);
  const calls = [];
  const runCheck = (_source, relative, args) => {
    calls.push([relative, args]);
    if (relative === 'scripts/check-evidence.mjs' && args.includes('--require-human-support')) {
      return {
        status: 1,
        stdout: '',
        stderr: 'Evidence gate failed with 1 violation:\n- strict support gate is unavailable because this public export omits the private claim evidence\n',
      };
    }
    return { status: 0, stdout: 'passed\n', stderr: '' };
  };

  const result = await runPublicReady(output, { runCheck });
  assert.equal(result.files > 0, true);
  assert.deepEqual(calls, [
    ['scripts/check-generated.mjs', []],
    ['scripts/check-links.mjs', []],
    ['scripts/check-source-types.mjs', []],
    ['scripts/check-evidence.mjs', []],
    ['scripts/test.mjs', []],
    ['scripts/check-evidence.mjs', ['--require-human-support']],
  ]);
});

test('public readiness rejects changed support outcomes and reasons', () => {
  for (const result of [
    { status: 0, stdout: 'passed\n', stderr: '' },
    { status: 1, stdout: '', stderr: 'Evidence gate failed with another reason\n' },
    { status: 2, stdout: '', stderr: 'Evidence gate failed with 1 violation:\n- strict support gate is unavailable because this public export omits the private claim evidence\n' },
  ]) {
    assert.throws(() => assertExpectedSupportOmission(result), /strict-support result drifted/u);
  }
});

test('public readiness rejects marker drift before running child gates', async (t) => {
  const output = await fixture(t);
  const markerPath = path.join(output, 'references', 'public-export.json');
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  marker.strict_human_support_available = true;
  await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  let called = false;

  await assert.rejects(
    runPublicReady(output, { runCheck: () => { called = true; return { status: 0, stdout: '', stderr: '' }; } }),
    /public readiness verification failed/u,
  );
  assert.equal(called, false);
});
