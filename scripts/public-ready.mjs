#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, parseOptions } from '../lib/core.mjs';
import { verifyPublicTree } from './public-export.mjs';

const EXPECTED_SUPPORT_OMISSION = [
  'Evidence gate failed with 1 violation:',
  '- strict support gate is unavailable because this public export omits the private claim evidence',
].join('\n');

const REQUIRED_COMMANDS = [
  ['generated', 'scripts/check-generated.mjs', []],
  ['links', 'scripts/check-links.mjs', []],
  ['source types', 'scripts/check-source-types.mjs', []],
  ['evidence locators', 'scripts/check-evidence.mjs', []],
  ['tests', 'scripts/test.mjs', []],
];

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function defaultSource(root) {
  if (await exists(path.join(root, 'references', 'public-export.json'))) return root;
  return path.join(root, 'release', 'secretary-public');
}

export function assertExpectedSupportOmission(result) {
  const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.status !== 1 || combined !== EXPECTED_SUPPORT_OMISSION) {
    throw new Error(`public strict-support result drifted: status=${result.status}; output=${JSON.stringify(combined)}`);
  }
}

export function runNodeCheck(source, relative, args = [], { timeoutMs = 180_000 } = {}) {
  const env = { ...process.env };
  delete env.SECRETARY_LIVE;
  delete env.SECRETARY_LIVE_ADVERSARIAL;
  const result = spawnSync(process.execPath, [path.join(source, relative), ...args], {
    cwd: source,
    encoding: 'utf8',
    env,
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export async function runPublicReady(source, { runCheck = runNodeCheck } = {}) {
  const absoluteSource = path.resolve(source);
  const metadata = await lstat(absoluteSource);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('public readiness source must be a real directory');
  }
  const verification = await verifyPublicTree(absoluteSource);
  if (verification.failures.length > 0) {
    throw new Error(`public readiness verification failed:\n${verification.failures.join('\n')}`);
  }

  for (const [label, relative, args] of REQUIRED_COMMANDS) {
    const result = runCheck(absoluteSource, relative, args);
    if (result.status !== 0) {
      const combined = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      throw new Error(`public ${label} gate failed with status ${result.status}: ${combined}`);
    }
  }
  const support = runCheck(absoluteSource, 'scripts/check-evidence.mjs', ['--require-human-support']);
  assertExpectedSupportOmission(support);
  return { files: verification.files.length, commands: REQUIRED_COMMANDS.map(([label]) => label) };
}

async function main() {
  const options = parseOptions(process.argv.slice(2), { source: 'string' });
  const source = options.source ? path.resolve(options.source) : await defaultSource(PROJECT_ROOT);
  const result = await runPublicReady(source);
  process.stdout.write(`public readiness passed for ${result.files} files; strict support omission confirmed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
