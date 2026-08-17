#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { PROJECT_ROOT, parseOptions } from '../lib/core.mjs';

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', '.probe', '.council', 'release']);
const execFileAsync = promisify(execFile);

async function gitMarkdownFiles(root) {
  try {
    const { stdout: topLevelOutput } = await execFileAsync(
      'git',
      ['-C', root, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    const topLevel = await realpath(topLevelOutput.trim());
    if (topLevel !== await realpath(root)) return null;
    const { stdout } = await execFileAsync(
      'git',
      ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout
      .split('\0')
      .filter((relative) => relative.endsWith('.md'))
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map((relative) => path.join(root, relative));
  } catch {
    return null;
  }
}

async function markdownFiles(root) {
  const selected = await gitMarkdownFiles(root);
  if (selected) return selected;
  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
    }
  }
  await walk(root);
  return files;
}

function relativeTargets(markdown) {
  const targets = [];
  const pattern = /\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    let target = match[1];
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    try {
      target = decodeURIComponent(target.split('#')[0]);
    } catch {
      targets.push({ target, error: 'invalid-percent-encoding' });
      continue;
    }
    if (target) targets.push({ target, error: null });
  }
  return targets;
}

export async function checkLinks(root = PROJECT_ROOT) {
  const absoluteRoot = path.resolve(root);
  const files = await markdownFiles(absoluteRoot);
  const failures = [];
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    for (const { target, error } of relativeTargets(markdown)) {
      if (error) {
        failures.push({ file: path.relative(absoluteRoot, file), target, error });
        continue;
      }
      const resolved = target.startsWith('/')
        ? path.join(absoluteRoot, target.slice(1))
        : path.resolve(path.dirname(file), target);
      const relative = path.relative(absoluteRoot, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        failures.push({ file: path.relative(absoluteRoot, file), target, error: 'escapes-root' });
        continue;
      }
      try {
        await stat(resolved);
      } catch {
        failures.push({ file: path.relative(absoluteRoot, file), target, error: 'missing-target' });
      }
    }
  }
  return { root: absoluteRoot, files: files.length, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseOptions(process.argv.slice(2), { root: 'string' });
    const result = await checkLinks(options.root || PROJECT_ROOT);
    if (result.failures.length > 0) {
      for (const failure of result.failures) {
        process.stderr.write(`${failure.error}: ${failure.file} -> ${failure.target}\n`);
      }
      process.exitCode = 1;
    } else {
      process.stdout.write(`Markdown relative-link audit passed for ${result.files} files\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
