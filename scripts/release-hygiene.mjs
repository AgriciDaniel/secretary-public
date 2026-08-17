#!/usr/bin/env node
import { access, lstat, mkdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT_ROOT, parseOptions } from '../lib/core.mjs';

const execFileAsync = promisify(execFile);
const DIAGNOSTIC_ROOTS = ['.probe/', '.council/'];
const CREDENTIAL_PATTERNS = [
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /AKIA[0-9A-Z]{16}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /xox[baprs]-[A-Za-z0-9-]{12,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
];
const ABSOLUTE_HOME_PATH = /\/(?:var\/)?home\/[^/\s"']+|\/Users\/[^/\s"']+/g;
const TEST_HOME_FIXTURE = ['/home', 'test'].join('/');
const ALLOWED_ABSOLUTE_HOME_FIXTURES = new Map([
  ['tests/backends.test.mjs', new Set([TEST_HOME_FIXTURE])],
  // This checker declares the fixture it allows, so a naive scan of its own
  // source matches its own detector. Splitting the literal above keeps the
  // allowlist readable without the file tripping the gate it implements.
  ['scripts/release-hygiene.mjs', new Set([TEST_HOME_FIXTURE])],
]);

// Image assets are the only binaries this project intends to ship. Scope the
// exemption to assets/ and to a closed extension list so an unexpected binary
// anywhere else still fails the gate.
const ALLOWED_BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico']);
function isAllowedBinaryAsset(relative) {
  if (!relative.startsWith('assets/')) return false;
  return ALLOWED_BINARY_EXTENSIONS.has(path.extname(relative).toLowerCase());
}

// Stored evidence extracts hold verbatim third-party source text. The em-dash
// prohibition is a house style rule for material this project authors, and it
// cannot apply to a quotation without altering it. Altering a quotation defeats
// the purpose of storing it, because the citation gate exists to prove that a
// source says what a claim reports. Scope the exemption to extract files under
// references/evidence/ so authored prose anywhere else still fails the gate.
function isVerbatimEvidenceExtract(relative) {
  return relative.startsWith('references/evidence/') && path.basename(relative) === 'extract.md';
}

function isSafeRelativePath(relative) {
  return relative !== '' && !path.isAbsolute(relative) && !relative.split('/').includes('..');
}

function isBinary(buffer) {
  for (const byte of buffer) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) return true;
  }
  return false;
}

async function trackedFiles(root) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  return bytes.toString('utf8').split('\0').filter(Boolean).sort();
}

async function workingTreeFiles(root) {
  const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  return [...new Set(bytes.toString('utf8').split('\0').filter(Boolean))].sort();
}

function unexpectedHomePaths(relative, text) {
  const allowed = ALLOWED_ABSOLUTE_HOME_FIXTURES.get(relative) ?? new Set();
  const matches = text.match(ABSOLUTE_HOME_PATH) ?? [];
  return matches.filter((match) => !allowed.has(match));
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function checkReleaseHygiene(root = PROJECT_ROOT, { includeUntracked = false } = {}) {
  const files = includeUntracked ? await workingTreeFiles(root) : await trackedFiles(root);
  const failures = [];
  const diagnosticDirectoriesPresent = [];
  for (const diagnosticRoot of DIAGNOSTIC_ROOTS) {
    if (await exists(path.join(root, diagnosticRoot))) diagnosticDirectoriesPresent.push(diagnosticRoot);
  }
  for (const relative of files) {
    if (!isSafeRelativePath(relative)) {
      failures.push({ category: 'unsafe-path', relative });
      continue;
    }
    if (relative.startsWith('-')) {
      failures.push({ category: 'option-like-root-path', relative });
      continue;
    }
    if (DIAGNOSTIC_ROOTS.some((rootName) => relative.startsWith(rootName))) {
      failures.push({ category: 'diagnostic-directory', relative });
      continue;
    }
    const absolute = path.join(root, relative);
    let stats;
    try {
      stats = await lstat(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        failures.push({ category: 'missing-tracked-file', relative });
        continue;
      }
      throw error;
    }
    if (!stats.isFile()) {
      failures.push({ category: 'unexpected-nonregular-file', relative });
      continue;
    }
    const contents = await readFile(absolute);
    if (isBinary(contents) && !isAllowedBinaryAsset(relative)) {
      failures.push({ category: 'unexpected-binary', relative });
      continue;
    }
    const text = contents.toString('utf8');
    if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) failures.push({ category: 'credential-pattern', relative });
    if (unexpectedHomePaths(relative, text).length > 0) failures.push({ category: 'absolute-home-path', relative });
    if (text.includes('\u2014') && !isVerbatimEvidenceExtract(relative)) failures.push({ category: 'em-dash', relative });
  }
  return { files, failures, diagnosticDirectoriesPresent };
}

export async function createPrivateArchive(root, files, output) {
  const absoluteOutput = path.resolve(root, output);
  if (!absoluteOutput.startsWith(`${root}${path.sep}`)) throw new Error('private archive output must be inside the repository');
  if (await exists(absoluteOutput)) throw new Error(`refusing to overwrite existing private archive: ${path.relative(root, absoluteOutput)}`);
  if (files.some((relative) => relative.startsWith('-'))) throw new Error('private archive refuses option-like root paths');
  await mkdir(path.dirname(absoluteOutput), { recursive: true, mode: 0o700 });
  await execFileAsync('tar', ['-czf', absoluteOutput, '--', ...files], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  return path.relative(root, absoluteOutput);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseOptions(process.argv.slice(2), { 'private-output': 'string', 'include-untracked': 'boolean' });
    if (options['private-output'] && options['include-untracked']) throw new Error('--private-output cannot be combined with --include-untracked');
    const result = await checkReleaseHygiene(PROJECT_ROOT, { includeUntracked: options['include-untracked'] === true });
    if (result.failures.length > 0) {
      for (const failure of result.failures) process.stderr.write(`${failure.category}: ${failure.relative}\n`);
      process.exitCode = 1;
    } else if (options['private-output']) {
      const archive = await createPrivateArchive(PROJECT_ROOT, result.files, options['private-output']);
      process.stdout.write(`release hygiene passed for ${result.files.length} tracked files; created private canonical archive ${archive}\n`);
    } else {
      const diagnostics = result.diagnosticDirectoriesPresent.length > 0
        ? `; working-directory diagnostics excluded: ${result.diagnosticDirectoriesPresent.join(', ')}`
        : '';
      const scope = options['include-untracked'] ? 'tracked and untracked files' : 'tracked files';
      process.stdout.write(`release hygiene passed for ${result.files.length} ${scope}${diagnostics}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
