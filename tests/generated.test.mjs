import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PROJECT_ROOT } from '../lib/core.mjs';
import { checkGenerated } from '../scripts/check-generated.mjs';
import { BRAIN_MANIFEST_PATH, generateBrainManifest } from '../scripts/generate-brain-manifest.mjs';
import { generateSurfaces } from '../scripts/generate-surfaces.mjs';
import { install } from '../scripts/install.mjs';

async function canonicalTemporaryDirectory(prefix) {
  return realpath(await mkdtemp(path.join(tmpdir(), prefix)));
}

test('generated surfaces and brain manifest byte-match their sources and detect drift', async () => {
  assert.deepEqual(await checkGenerated(PROJECT_ROOT), []);
  const root = await canonicalTemporaryDirectory('secretary-generated-');
  await cp(path.join(PROJECT_ROOT, 'contracts'), path.join(root, 'contracts'), { recursive: true });
  await cp(path.join(PROJECT_ROOT, 'wiki'), path.join(root, 'wiki'), { recursive: true });
  await generateSurfaces(root);
  await generateBrainManifest(root);
  await writeFile(path.join(root, 'AGENTS.md'), 'drift\n');
  assert.deepEqual(await checkGenerated(root), ['AGENTS.md']);
  await writeFile(path.join(root, BRAIN_MANIFEST_PATH), '{"drift":true}\n');
  assert.deepEqual(await checkGenerated(root), ['AGENTS.md', BRAIN_MANIFEST_PATH]);
});

test('CLAUDE surface is exactly three lines', async () => {
  assert.equal(await readFile(path.join(PROJECT_ROOT, 'CLAUDE.md'), 'utf8'), '# Secretary\n\n@AGENTS.md\n');
});

function assertOrderedFragments(value, fragments) {
  let previous = -1;
  for (const fragment of fragments) {
    const current = value.indexOf(fragment, previous + 1);
    assert.notEqual(current, -1, `missing generated surface fragment: ${fragment}`);
    previous = current;
  }
}

test('Claude and Codex surfaces identify their own invocation and preserve the controller sequence', async () => {
  const claude = await readFile(path.join(PROJECT_ROOT, 'commands', 'secretary.md'), 'utf8');
  const codex = await readFile(path.join(PROJECT_ROOT, 'skills', 'secretary', 'SKILL.md'), 'utf8');
  assert.match(claude, /description: Use \/secretary /);
  assert.match(claude, /## \/secretary operational prelude/);
  assert.doesNotMatch(claude, /Invoke \$secretary/);
  assert.match(codex, /description: Use \$secretary /);
  assert.match(codex, /## \$secretary operational prelude/);

  const orderedWorkflow = [
    'Local controller link',
    'principal status',
    'principal init --answers-file ANSWERS_FILE',
    'remove `ANSWERS_FILE` immediately',
    'temporary regular task file',
    'Select one governed `PROFILE_FILE`',
    'preflight --backend PROFILE_BACKEND --model PROFILE_MODEL --json',
    'Do not switch providers or models automatically',
    'preflight --backend OVERRIDE --model OVERRIDE_MODEL --json',
    'prepare --run-id RUN_ID --task-file TASK_FILE --workspace WORKSPACE --profile PROFILE_FILE',
    '--backend OVERRIDE --model OVERRIDE_MODEL',
    'never pass only one half of an override pair',
    'remove `TASK_FILE` and `SESSION_FILE`',
    'run --run-id RUN_ID',
    'status --run-id RUN_ID',
    'result --run-id RUN_ID',
    'needs_approval',
    'Never call `approve` or `execute` without a human approval',
  ];
  assertOrderedFragments(claude, orderedWorkflow);
  assertOrderedFragments(codex, orderedWorkflow);
});

test('exact command aliases are opt-in and collision-safe', async () => {
  const target = await canonicalTemporaryDirectory('secretary-install-');
  const result = await install({ target });
  assert.equal(result.controller, path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs'));
  for (const relative of [
    'commands/secretary.md',
    'skills/secretary/SKILL.md',
    'agents/secretary.md',
  ]) {
    const installed = await readFile(path.join(target, relative), 'utf8');
    assert.match(installed, /^---\n/);
    assert.match(installed, /\n---\n<!-- secretary-owned-surface:v1 -->\n/);
    assert.match(installed, /<!-- secretary-controller-link:v1 -->/);
    assert.match(installed, /"runtime":"node"/);
    assert.match(installed, new RegExp(`"controller":${JSON.stringify(result.controller).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(installed, /rerun the installer/);
    assert.match(installed, /Do not search for another controller/);
    if (relative === 'skills/secretary/SKILL.md' || relative === 'agents/secretary.md') {
      assert.match(installed, /\nname: secretary\n/);
    }
    assert.match(installed, /\ndescription: /);
  }
  await assert.rejects(() => readFile(path.join(target, 'commands', 'sec.md')), /ENOENT/);
  await assert.rejects(() => readFile(path.join(target, 'commands', 'chief-of-staff.md')), /ENOENT/);
  await install({ target, exactCommandAliases: true });
  await assert.rejects(() => readFile(path.join(target, 'commands', 'sec.md')), /ENOENT/);
  assert.match(await readFile(path.join(target, 'commands', 'chief-of-staff.md'), 'utf8'), /^<!-- secretary-owned-alias:v1 -->/);
  await writeFile(path.join(target, 'commands', 'chief-of-staff.md'), 'user owned\n');
  await assert.rejects(() => install({ target, exactCommandAliases: true }), /refusing to overwrite unowned/);
  assert.equal(await readFile(path.join(target, 'commands', 'chief-of-staff.md'), 'utf8'), 'user owned\n');
});

test('installed controller link records a stop instruction after source relocation', async () => {
  const source = await canonicalTemporaryDirectory('secretary-install-source-');
  await mkdir(path.join(source, 'scripts'));
  await mkdir(path.join(source, 'commands'));
  await mkdir(path.join(source, 'skills', 'secretary'), { recursive: true });
  await mkdir(path.join(source, 'agents'));
  await mkdir(path.join(source, 'templates'));
  await writeFile(path.join(source, 'scripts', 'secretaryctl.mjs'), 'export {};\n');
  await writeFile(path.join(source, 'commands', 'secretary.md'), 'command\n');
  await writeFile(path.join(source, 'skills', 'secretary', 'SKILL.md'), 'skill\n');
  await writeFile(path.join(source, 'agents', 'secretary.md'), 'agent\n');
  await writeFile(path.join(source, 'templates', 'command-aliases.json'), '{"aliases":[]}\n');
  const target = await canonicalTemporaryDirectory('secretary-install-linked-');
  const result = await install({ target, root: source });
  const installed = await readFile(path.join(target, 'commands', 'secretary.md'), 'utf8');
  assert.match(installed, new RegExp(JSON.stringify(result.controller).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const moved = `${source}-moved`;
  await rename(source, moved);
  await assert.rejects(() => lstat(result.controller), /ENOENT/);
  assert.match(installed, /If the controller is missing, moved, a symlink, or not a regular file, stop/);
});

test('installer rejects a symlinked controller', async () => {
  const source = await canonicalTemporaryDirectory('secretary-install-source-symlink-');
  await mkdir(path.join(source, 'scripts'));
  await symlink(path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs'), path.join(source, 'scripts', 'secretaryctl.mjs'));
  const target = await canonicalTemporaryDirectory('secretary-install-target-symlink-');
  await assert.rejects(() => install({ target, root: source }), /non-regular or symlinked Secretary controller/);
});

test('installer rejects a user-created symlink used as the final target after temp-root canonicalization', async () => {
  const outside = await canonicalTemporaryDirectory('secretary-install-target-outside-');
  const parent = await canonicalTemporaryDirectory('secretary-install-target-parent-');
  const target = path.join(parent, 'linked-target');
  await symlink(outside, target);
  assert.equal((await lstat(target)).isSymbolicLink(), true);
  await assert.rejects(() => install({ target }), /installer target through symlink/);
  await assert.rejects(() => readFile(path.join(outside, 'commands', 'secretary.md')), /ENOENT/);
});

test('installer rejects filesystem-root and source-overlapping targets', async () => {
  await assert.rejects(() => install({ target: path.parse(PROJECT_ROOT).root }), /filesystem root/);
  await assert.rejects(() => install({ target: PROJECT_ROOT }), /overlaps the Secretary source checkout/);
  await assert.rejects(() => install({ target: path.join(PROJECT_ROOT, '.host-config') }), /overlaps the Secretary source checkout/);
});

test('installer rejects a controller link path that could break its Markdown record', async () => {
  const original = await canonicalTemporaryDirectory('secretary-install-source-unsafe-');
  const source = `${original}\`unsafe`;
  await rename(original, source);
  await mkdir(path.join(source, 'scripts'));
  await writeFile(path.join(source, 'scripts', 'secretaryctl.mjs'), 'export {};\n');
  const target = await canonicalTemporaryDirectory('secretary-install-target-unsafe-');
  await assert.rejects(() => install({ target, root: source }), /path with control characters or backticks/);
});

test('installer refuses unowned canonical surfaces and symlink traversal', async () => {
  const target = await canonicalTemporaryDirectory('secretary-install-collision-');
  await writeFile(path.join(target, 'commands'), 'not a directory\n');
  await assert.rejects(() => install({ target }), /non-directory/);

  const secondTarget = await canonicalTemporaryDirectory('secretary-install-owned-');
  await mkdir(path.join(secondTarget, 'commands'));
  await writeFile(path.join(secondTarget, 'commands', 'secretary.md'), 'user owned\n');
  await assert.rejects(() => install({ target: secondTarget }), /unowned Secretary surface/);
  assert.equal(await readFile(path.join(secondTarget, 'commands', 'secretary.md'), 'utf8'), 'user owned\n');

  const thirdTarget = await canonicalTemporaryDirectory('secretary-install-symlink-');
  const outside = await canonicalTemporaryDirectory('secretary-install-outside-');
  await symlink(outside, path.join(thirdTarget, 'skills'));
  await assert.rejects(() => install({ target: thirdTarget }), /through symlink/);
  await assert.rejects(() => readFile(path.join(outside, 'secretary', 'SKILL.md')), /ENOENT/);

  const fourthTarget = await canonicalTemporaryDirectory('secretary-install-final-link-');
  await mkdir(path.join(fourthTarget, 'commands'));
  const externalSurface = path.join(outside, 'external-secretary.md');
  const original = await readFile(path.join(PROJECT_ROOT, 'commands', 'secretary.md'), 'utf8');
  await writeFile(externalSurface, original);
  await symlink(externalSurface, path.join(fourthTarget, 'commands', 'secretary.md'));
  await assert.rejects(() => install({ target: fourthTarget }), /not a regular non-symlinked file/);
  assert.equal(await readFile(externalSurface, 'utf8'), original);
});
