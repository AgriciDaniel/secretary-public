#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertContainedPath, parseOptions, requireOption, sha256 } from '../lib/core.mjs';

const ALIAS_MARKER = '<!-- secretary-owned-alias:v1 -->';
const SURFACE_MARKER = '<!-- secretary-owned-surface:v1 -->';
const INSTALL_MANIFEST_FILE = '.secretary-install-manifest.v1.json';
const INSTALL_MANIFEST_VERSION = 'secretary.install-manifest/1';
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SURFACE_BYTES = 1024 * 1024;

const OWNED_PATHS = new Map([
  ['commands/secretary.md', { kind: 'surface', marker: SURFACE_MARKER }],
  ['skills/secretary/SKILL.md', { kind: 'surface', marker: SURFACE_MARKER }],
  ['agents/secretary.md', { kind: 'surface', marker: SURFACE_MARKER }],
  ['commands/chief-of-staff.md', { kind: 'alias', marker: ALIAS_MARKER }],
]);

const HELP = `Usage:
  node scripts/uninstall.mjs --target PATH --dry-run
  node scripts/uninstall.mjs --target PATH --confirm REMOVE
  node scripts/uninstall.mjs --help

Options:
  --target PATH       Host configuration directory used during installation.
  --dry-run           Validate ownership and report the exact removal plan only.
  --confirm REMOVE    Remove the validated files and install manifest.
  -h, --help          Show this help without changing any files.

Uninstall is bound to the hash manifest written by the current installer. It removes
only known Secretary surfaces and the exact chief-of-staff alias. Missing manifested
files are reported. Symlinks, unknown paths, marker loss, and content drift fail before
any file is removed. Directories and unrelated files are never removed.
`;

async function existingSafeTarget(target) {
  const absolute = path.resolve(target);
  if (absolute === path.parse(absolute).root) throw new Error('refusing to uninstall Secretary surfaces from the filesystem root');
  const parsed = path.parse(absolute);
  const segments = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Secretary uninstall target does not exist: ${absolute}`);
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`refusing uninstaller target through symlink: ${current}`);
    if (!metadata.isDirectory()) throw new Error(`refusing uninstaller target through non-directory: ${current}`);
  }
  return realpath(absolute);
}

async function readRegularFile(file, label, maxBytes) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`refusing ${label} that is not a regular non-symlinked file: ${file}`);
  }
  let handle;
  try {
    handle = await open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error(`refusing ${label} that is not a regular file: ${file}`);
    if (opened.size > maxBytes) throw new Error(`refusing ${label} larger than ${maxBytes} bytes: ${file}`);
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) throw new Error(`refusing ${label} larger than ${maxBytes} bytes: ${file}`);
    return bytes;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function validateManifest(value, target) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Secretary install manifest must be a JSON object');
  const allowedKeys = ['version', 'target', 'source_root', 'files'];
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) throw new Error(`Secretary install manifest contains unknown field: ${key}`);
  }
  if (value.version !== INSTALL_MANIFEST_VERSION) throw new Error(`unsupported Secretary install manifest version: ${value.version}`);
  if (value.target !== target) throw new Error('Secretary install manifest target does not match the requested target');
  if (typeof value.source_root !== 'string') throw new Error('Secretary install manifest source_root must be a string');
  if (!Array.isArray(value.files) || value.files.length < 3 || value.files.length > OWNED_PATHS.size) {
    throw new Error('Secretary install manifest has an invalid file list');
  }
  const seen = new Set();
  for (const entry of value.files) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Secretary install manifest file entry must be an object');
    if (Object.keys(entry).length !== 3 || !Object.hasOwn(entry, 'path') || !Object.hasOwn(entry, 'kind') || !Object.hasOwn(entry, 'sha256')) {
      throw new Error('Secretary install manifest file entry must contain only path, kind, and sha256');
    }
    const expected = OWNED_PATHS.get(entry.path);
    if (!expected) throw new Error(`Secretary install manifest contains an unknown path: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`Secretary install manifest contains a duplicate path: ${entry.path}`);
    seen.add(entry.path);
    if (entry.kind !== expected.kind) throw new Error(`Secretary install manifest kind mismatch for ${entry.path}`);
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new Error(`Secretary install manifest has an invalid SHA-256 for ${entry.path}`);
    }
  }
  for (const required of ['commands/secretary.md', 'skills/secretary/SKILL.md', 'agents/secretary.md']) {
    if (!seen.has(required)) throw new Error(`Secretary install manifest is missing required path: ${required}`);
  }
  return value;
}

async function loadManifest(target) {
  const manifestFile = await assertContainedPath(target, path.join(target, INSTALL_MANIFEST_FILE), { mustExist: false, allowRoot: false });
  const bytes = await readRegularFile(manifestFile, 'Secretary install manifest', MAX_MANIFEST_BYTES);
  if (bytes === null) {
    throw new Error('Secretary install manifest is missing. Rerun the current installer before using manifest-bound uninstall.');
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Secretary install manifest is not valid JSON: ${error.message}`);
  }
  return { manifestFile, manifest: validateManifest(value, target) };
}

async function validateEntry(target, entry) {
  const expected = OWNED_PATHS.get(entry.path);
  const nativePath = entry.path.split('/').join(path.sep);
  const file = await assertContainedPath(target, path.join(target, nativePath), { mustExist: false, allowRoot: false });
  const parent = path.dirname(file);
  const relativeParent = path.relative(target, parent);
  let current = target;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return { path: entry.path, file, status: 'missing' };
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new Error(`refusing uninstaller path through symlink: ${current}`);
    if (!metadata.isDirectory()) throw new Error(`refusing uninstaller path through non-directory: ${current}`);
  }
  const bytes = await readRegularFile(file, 'Secretary installed surface', MAX_SURFACE_BYTES);
  if (bytes === null) return { path: entry.path, file, status: 'missing' };
  const content = bytes.toString('utf8');
  const markerPresent = expected.kind === 'alias'
    ? content.startsWith(expected.marker)
    : content.includes(expected.marker);
  if (!markerPresent) throw new Error(`refusing to remove unowned or marker-drifted file: ${file}`);
  if (sha256(bytes) !== entry.sha256) throw new Error(`refusing to remove content-drifted Secretary file: ${file}`);
  return { path: entry.path, file, status: 'remove' };
}

export async function uninstall({ target, dryRun = false, confirm = undefined }) {
  if (!dryRun && confirm !== 'REMOVE') {
    throw new Error('uninstall requires --dry-run or the exact confirmation --confirm REMOVE');
  }
  const targetRoot = await existingSafeTarget(target);
  const { manifestFile, manifest } = await loadManifest(targetRoot);
  const plan = [];
  for (const entry of manifest.files) plan.push(await validateEntry(targetRoot, entry));
  const result = {
    target: targetRoot,
    dry_run: dryRun,
    remove: plan.filter((entry) => entry.status === 'remove').map((entry) => entry.path),
    missing: plan.filter((entry) => entry.status === 'missing').map((entry) => entry.path),
    manifest: INSTALL_MANIFEST_FILE,
  };
  if (dryRun) return { ...result, removed: false };
  for (const entry of plan) {
    if (entry.status === 'remove') await unlink(entry.file);
  }
  await unlink(manifestFile);
  return { ...result, removed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
      process.stdout.write(HELP);
      process.exit(0);
    }
    const options = parseOptions(process.argv.slice(2), { target: 'string', 'dry-run': 'boolean', confirm: 'string' });
    const result = await uninstall({
      target: requireOption(options, 'target'),
      dryRun: options['dry-run'] === true,
      confirm: options.confirm,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
