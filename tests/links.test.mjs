import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkLinks } from '../scripts/check-links.mjs';

const execFileAsync = promisify(execFile);

test('Markdown link gate resolves relative and angle-bracket paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-links-'));
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'target.md'), '# Target\n');
  await writeFile(path.join(root, 'with space.md'), '# Space\n');
  await writeFile(
    path.join(root, 'docs', 'index.md'),
    '[Target](../target.md) [Space](<../with space.md>) [External](https://example.com)\n',
  );
  assert.deepEqual((await checkLinks(root)).failures, []);
});

test('Markdown link gate rejects missing targets and root escapes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-links-fail-'));
  await writeFile(path.join(root, 'index.md'), '[Missing](missing.md) [Escape](../outside.md)\n');
  const errors = (await checkLinks(root)).failures.map((failure) => failure.error).sort();
  assert.deepEqual(errors, ['escapes-root', 'missing-target']);
});

test('Markdown link gate excludes Git-ignored files at the repository root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-links-git-'));
  await execFileAsync('git', ['init', '--quiet', root]);
  await writeFile(path.join(root, '.gitignore'), 'ignored.md\n');
  await writeFile(path.join(root, 'visible.md'), '# Visible\n');
  await writeFile(path.join(root, 'ignored.md'), '[Missing](missing.md)\n');
  const result = await checkLinks(root);
  assert.equal(result.files, 1);
  assert.deepEqual(result.failures, []);
});
