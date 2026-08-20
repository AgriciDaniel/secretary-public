import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { PROJECT_ROOT, sha256 } from '../lib/core.mjs';
import { install } from '../scripts/install.mjs';
import { uninstall } from '../scripts/uninstall.mjs';

const execFileAsync = promisify(execFile);
const controller = path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs');
const installer = path.join(PROJECT_ROOT, 'scripts', 'install.mjs');
const uninstaller = path.join(PROJECT_ROOT, 'scripts', 'uninstall.mjs');
const manifestName = '.secretary-install-manifest.v1.json';

async function canonicalTemporaryDirectory(prefix) {
  return realpath(await mkdtemp(path.join(tmpdir(), prefix)));
}

async function missing(file) {
  await assert.rejects(() => lstat(file), /ENOENT/u);
}

test('controller and installation CLIs provide side-effect-free conventional help', async () => {
  const root = await canonicalTemporaryDirectory('secretary-help-');
  const stateParent = path.join(root, 'state-must-not-exist');
  const env = { ...process.env, XDG_STATE_HOME: stateParent };
  for (const flag of ['--help', '-h']) {
    const controllerResult = await execFileAsync(process.execPath, [controller, flag], { cwd: root, env });
    assert.match(controllerResult.stdout, /^Usage:\n  node scripts\/secretaryctl\.mjs/u);
    assert.equal(controllerResult.stderr, '');

    const nestedHelp = await execFileAsync(process.execPath, [controller, 'principal', 'init', flag], { cwd: root, env });
    assert.match(nestedHelp.stdout, /^Usage:\n  node scripts\/secretaryctl\.mjs/u);
    assert.equal(nestedHelp.stderr, '');

    const installResult = await execFileAsync(process.execPath, [installer, flag], { cwd: root, env });
    assert.match(installResult.stdout, /^Usage:\n  node scripts\/install\.mjs/u);
    assert.equal(installResult.stderr, '');

    const uninstallResult = await execFileAsync(process.execPath, [uninstaller, flag], { cwd: root, env });
    assert.match(uninstallResult.stdout, /^Usage:\n  node scripts\/uninstall\.mjs/u);
    assert.equal(uninstallResult.stderr, '');
  }
  await missing(stateParent);
});

test('manifest-bound uninstall reports and removes only installed surfaces including exact aliases', async () => {
  const target = await canonicalTemporaryDirectory('secretary-uninstall-');
  const unrelated = path.join(target, 'user-owned.txt');
  await writeFile(unrelated, 'keep me\n');
  const installed = await install({ target, exactCommandAliases: true });
  assert.equal(installed.uninstall_manifest, path.join(target, manifestName));

  const preview = await uninstall({ target, dryRun: true });
  assert.equal(preview.removed, false);
  assert.deepEqual(preview.remove, [
    'commands/secretary.md',
    'skills/secretary/SKILL.md',
    'agents/secretary.md',
    'commands/chief-of-staff.md',
  ]);
  assert.deepEqual(preview.missing, []);
  assert.equal(await readFile(unrelated, 'utf8'), 'keep me\n');

  const removed = await uninstall({ target, confirm: 'REMOVE' });
  assert.equal(removed.removed, true);
  for (const relative of [...removed.remove, manifestName]) await missing(path.join(target, relative));
  assert.equal(await readFile(unrelated, 'utf8'), 'keep me\n');
  assert.ok((await lstat(path.join(target, 'commands'))).isDirectory());
});

test('reinstall preserves a manifested exact alias but refuses to adopt alias drift', async () => {
  const target = await canonicalTemporaryDirectory('secretary-reinstall-alias-');
  await install({ target, exactCommandAliases: true });
  await install({ target });
  const alias = path.join(target, 'commands', 'chief-of-staff.md');
  assert.ok((await lstat(alias)).isFile());
  const manifest = JSON.parse(await readFile(path.join(target, manifestName), 'utf8'));
  assert.ok(manifest.files.some((entry) => entry.path === 'commands/chief-of-staff.md'));

  await writeFile(alias, `${await readFile(alias, 'utf8')}drift\n`);
  await assert.rejects(() => install({ target }), /unmanifested or content-drifted command alias/u);
  await install({ target, exactCommandAliases: true });
  assert.doesNotMatch(await readFile(alias, 'utf8'), /drift/u);
});

test('uninstall rejects content drift before removing any installed file', async () => {
  const target = await canonicalTemporaryDirectory('secretary-uninstall-drift-');
  await install({ target, exactCommandAliases: true });
  const drifted = path.join(target, 'commands', 'secretary.md');
  await writeFile(drifted, `${await readFile(drifted, 'utf8')}user edit\n`);

  await assert.rejects(() => uninstall({ target, confirm: 'REMOVE' }), /content-drifted Secretary file/u);
  assert.ok((await lstat(path.join(target, 'skills', 'secretary', 'SKILL.md'))).isFile());
  assert.ok((await lstat(path.join(target, 'commands', 'chief-of-staff.md'))).isFile());
  assert.ok((await lstat(path.join(target, manifestName))).isFile());
});

test('uninstall rejects symlink substitution without touching its target', async () => {
  const target = await canonicalTemporaryDirectory('secretary-uninstall-link-');
  const outside = await canonicalTemporaryDirectory('secretary-uninstall-outside-');
  const external = path.join(outside, 'external.md');
  await writeFile(external, 'outside\n');
  await install({ target });
  const installedSurface = path.join(target, 'agents', 'secretary.md');
  await unlink(installedSurface);
  await symlink(external, installedSurface);

  await assert.rejects(() => uninstall({ target, dryRun: true }), /not a regular non-symlinked file/u);
  assert.equal(await readFile(external, 'utf8'), 'outside\n');
  assert.ok((await lstat(path.join(target, 'commands', 'secretary.md'))).isFile());
});

test('a tampered manifest cannot grant ownership of an unrelated file', async () => {
  const target = await canonicalTemporaryDirectory('secretary-uninstall-manifest-');
  await install({ target });
  const canonical = path.join(target, 'commands', 'secretary.md');
  const unowned = 'user content\n';
  await writeFile(canonical, unowned);
  const manifestPath = path.join(target, manifestName);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.find((entry) => entry.path === 'commands/secretary.md').sha256 = sha256(unowned);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(() => uninstall({ target, confirm: 'REMOVE' }), /unowned or marker-drifted file/u);
  assert.equal(await readFile(canonical, 'utf8'), unowned);
  assert.ok((await lstat(path.join(target, 'skills', 'secretary', 'SKILL.md'))).isFile());
});

test('uninstall rejects unknown manifested paths and requires exact confirmation', async () => {
  const target = await canonicalTemporaryDirectory('secretary-uninstall-unknown-');
  await install({ target });
  await assert.rejects(() => uninstall({ target }), /exact confirmation/u);
  await assert.rejects(() => uninstall({ target, confirm: 'remove' }), /exact confirmation/u);

  const manifestPath = path.join(target, manifestName);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.push({ path: 'user-owned.txt', kind: 'surface', sha256: '0'.repeat(64) });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(() => uninstall({ target, dryRun: true }), /invalid file list|unknown path/u);
  assert.ok((await lstat(path.join(target, 'commands', 'secretary.md'))).isFile());
});

test('a CRLF source checkout still installs surfaces whose frontmatter starts at the first byte', async () => {
  const source = await canonicalTemporaryDirectory('secretary-crlf-source-');
  const target = await canonicalTemporaryDirectory('secretary-crlf-target-');
  const surfaces = ['commands/secretary.md', 'skills/secretary/SKILL.md', 'agents/secretary.md'];

  await mkdir(path.join(source, 'scripts'), { recursive: true });
  await writeFile(path.join(source, 'scripts', 'secretaryctl.mjs'), '#!/usr/bin/env node\n');
  await mkdir(path.join(source, 'templates'), { recursive: true });
  await writeFile(path.join(source, 'templates', 'command-aliases.json'), `${JSON.stringify({ aliases: [] })}\n`);
  for (const relative of surfaces) {
    await mkdir(path.join(source, path.dirname(relative)), { recursive: true });
    await writeFile(path.join(source, relative), '---\r\nname: secretary\r\ndescription: staff work\r\n---\r\n\r\n# Secretary\r\n');
  }

  await install({ target, root: source });

  for (const relative of surfaces) {
    const installed = await readFile(path.join(target, relative), 'utf8');
    assert.ok(installed.startsWith('---\r\n'), `${relative} must keep YAML frontmatter at the first byte`);
    assert.match(installed, /^---\r\nname: secretary\r\ndescription: staff work\r\n---\r\n<!-- secretary-owned-surface:v1 -->\n/u);
  }

  const reinstalled = await install({ target, root: source });
  assert.equal(reinstalled.target, target);
});
