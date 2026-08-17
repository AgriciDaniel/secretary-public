#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from '../lib/core.mjs';

function compareBytes(left, right) {
  return Buffer.from(left).compare(Buffer.from(right));
}

async function collectTestFiles(directory, root, output) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareBytes(left.name, right.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`canonical test tree contains a symlink: ${path.relative(root, absolute)}`);
    }
    if (entry.isDirectory()) {
      await collectTestFiles(absolute, root, output);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      output.push(path.relative(root, absolute));
    }
  }
}

export async function canonicalTestFiles(root = PROJECT_ROOT) {
  const files = [];
  await collectTestFiles(path.join(root, 'tests'), root, files);
  if (files.length === 0) throw new Error('canonical test tree contains no .test.mjs files');
  return files;
}

export async function runCanonicalTests(root = PROJECT_ROOT) {
  const files = await canonicalTestFiles(root);
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', ...files],
    { cwd: root, env: process.env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCanonicalTests();
}
