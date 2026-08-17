import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkReleaseHygiene, createPrivateArchive } from '../scripts/release-hygiene.mjs';

const execFileAsync = promisify(execFile);

test('private release hygiene and archive reject option-like root paths', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-private-archive-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await writeFile(path.join(root, '--checkpoint=1'), 'negative control\n');
  await execFileAsync('git', ['add', '--', '--checkpoint=1'], { cwd: root });

  const result = await checkReleaseHygiene(root);
  assert.ok(result.failures.some((failure) => failure.category === 'option-like-root-path'));
  await assert.rejects(
    createPrivateArchive(root, result.files, 'private.tar.gz'),
    /option-like root paths/u,
  );
});
