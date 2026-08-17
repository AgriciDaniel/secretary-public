#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PROJECT_ROOT,
  assertContainedPath,
  atomicWrite,
  parseOptions,
  requireOption,
  sha256,
} from '../lib/core.mjs';

const ALIAS_MARKER = '<!-- secretary-owned-alias:v1 -->';
const SURFACE_MARKER = '<!-- secretary-owned-surface:v1 -->';
const CONTROLLER_LINK_MARKER = '<!-- secretary-controller-link:v1 -->';
const INSTALL_MANIFEST_FILE = '.secretary-install-manifest.v1.json';
const INSTALL_MANIFEST_VERSION = 'secretary.install-manifest/1';

const HELP = `Usage:
  node scripts/install.mjs --target PATH [--exact-command-aliases]
  node scripts/install.mjs --help

Options:
  --target PATH               Host configuration directory to install into.
  --exact-command-aliases     Also install the exact chief-of-staff alias.
  -h, --help                  Show this help without changing any files.

The installer writes three canonical Secretary surfaces and a hash-bound uninstall
manifest. It refuses filesystem roots, source-overlapping targets, symlink traversal,
and unowned collisions.
`;

function assertSafeLinkPath(value, label) {
  if (/[\u0000-\u001f\u007f`]/u.test(value)) {
    throw new Error(`refusing ${label} path with control characters or backticks`);
  }
  return value;
}

async function resolveController(root) {
  const sourceRoot = await realpath(path.resolve(root));
  const candidate = path.join(sourceRoot, 'scripts', 'secretaryctl.mjs');
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`refusing non-regular or symlinked Secretary controller: ${candidate}`);
  }
  const controller = await assertContainedPath(sourceRoot, candidate, { mustExist: true, allowRoot: false });
  return {
    sourceRoot: assertSafeLinkPath(sourceRoot, 'source root'),
    controller: assertSafeLinkPath(controller, 'controller'),
  };
}

function controllerLink({ sourceRoot, controller }) {
  const record = JSON.stringify({ runtime: 'node', controller, source_root: sourceRoot });
  return `${CONTROLLER_LINK_MARKER}\n\n## Local controller link\n\nThis installed surface is linked to the source checkout recorded below. Invoke the controller as an argument array with \`node\` and the exact \`controller\` value. Before routine use, run \`principal status\`; on the first use, run \`principal init\`. If the controller is missing, moved, a symlink, or not a regular file, stop and tell the user to rerun the installer from the intended checkout. Do not search for another controller or silently fall back to prose-only onboarding.\n\n\`\`\`json\n${record}\n\`\`\`\n`;
}

function markedSurface(sourceContent) {
  const body = sourceContent.trimEnd();
  if (!body.startsWith('---\n')) return `${SURFACE_MARKER}\n\n${body}`;
  const closing = body.indexOf('\n---\n', 4);
  if (closing < 0) throw new Error('refusing installed surface with unclosed YAML frontmatter');
  const boundary = closing + '\n---\n'.length;
  return `${body.slice(0, boundary)}${SURFACE_MARKER}\n\n${body.slice(boundary)}`;
}

function isOwnedSurface(content) {
  if (content.startsWith(`${SURFACE_MARKER}\n`)) return true;
  if (!content.startsWith('---\n')) return false;
  const closing = content.indexOf('\n---\n', 4);
  if (closing < 0) return false;
  return content.slice(closing + '\n---\n'.length).startsWith(`${SURFACE_MARKER}\n`);
}

async function ensureSafeTarget(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  const segments = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error(`refusing installer target through symlink: ${current}`);
      if (!metadata.isDirectory()) throw new Error(`refusing installer target through non-directory: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current, { mode: 0o700 });
    }
  }
  return realpath(absolute);
}

async function ensureSafeParent(root, relativeFile) {
  const segments = path.dirname(relativeFile).split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) throw new Error(`refusing installer path through symlink: ${current}`);
      if (!metadata.isDirectory()) throw new Error(`refusing installer path through non-directory: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(current, { mode: 0o700 });
    }
  }
  return assertContainedPath(root, path.join(root, relativeFile), { mustExist: false, allowRoot: false });
}

async function existingText(file) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`refusing installer destination that is not a regular non-symlinked file: ${file}`);
  }
  let handle;
  try {
    handle = await open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error(`refusing installer destination that is not a regular file: ${file}`);
    if (opened.size > 1024 * 1024) throw new Error(`refusing installer destination larger than 1048576 bytes: ${file}`);
    return (await handle.readFile()).toString('utf8');
  } finally {
    await handle?.close().catch(() => {});
  }
}

function installManifest({ target, sourceRoot, files }) {
  return `${JSON.stringify({
    version: INSTALL_MANIFEST_VERSION,
    target,
    source_root: sourceRoot,
    files: files.map(([file, content, kind]) => ({
      path: path.relative(target, file).split(path.sep).join('/'),
      kind,
      sha256: sha256(content),
    })),
  }, null, 2)}\n`;
}

export async function install({ target, exactCommandAliases = false, root = PROJECT_ROOT }) {
  const controllerRecord = await resolveController(root);
  const targetAbsolute = path.resolve(target);
  if (targetAbsolute === path.parse(targetAbsolute).root) {
    throw new Error('refusing to install Secretary surfaces at the filesystem root');
  }
  const targetFromSource = path.relative(controllerRecord.sourceRoot, targetAbsolute);
  const sourceFromTarget = path.relative(targetAbsolute, controllerRecord.sourceRoot);
  const targetInsideSource = targetFromSource === '' || (!targetFromSource.startsWith('..') && !path.isAbsolute(targetFromSource));
  const sourceInsideTarget = sourceFromTarget === '' || (!sourceFromTarget.startsWith('..') && !path.isAbsolute(sourceFromTarget));
  if (targetInsideSource || sourceInsideTarget) {
    throw new Error('refusing installer target that overlaps the Secretary source checkout');
  }
  const targetRoot = await ensureSafeTarget(target);
  const manifestPath = await ensureSafeParent(targetRoot, INSTALL_MANIFEST_FILE);
  const existingManifest = await existingText(manifestPath);
  let previousManifest = null;
  if (existingManifest !== null) {
    try {
      previousManifest = JSON.parse(existingManifest);
    } catch {
      throw new Error(`refusing to overwrite invalid Secretary install manifest: ${manifestPath}`);
    }
    if (previousManifest?.version !== INSTALL_MANIFEST_VERSION
      || previousManifest.target !== targetRoot
      || !Array.isArray(previousManifest.files)) {
      throw new Error(`refusing to overwrite unowned Secretary install manifest: ${manifestPath}`);
    }
  }
  const copies = [
    ['commands/secretary.md', 'commands/secretary.md'],
    ['skills/secretary/SKILL.md', 'skills/secretary/SKILL.md'],
    ['agents/secretary.md', 'agents/secretary.md'],
  ];
  const writes = [];
  for (const [source, destination] of copies) {
    const destinationPath = await ensureSafeParent(targetRoot, destination);
    const sourceContent = await readFile(path.join(controllerRecord.sourceRoot, source), 'utf8');
    const installedContent = `${markedSurface(sourceContent)}\n\n${controllerLink(controllerRecord)}`;
    const existing = await existingText(destinationPath);
    if (existing !== null && existing !== sourceContent && !isOwnedSurface(existing)) {
      throw new Error(`refusing to overwrite unowned Secretary surface: ${destinationPath}`);
    }
    writes.push([destinationPath, installedContent, 'surface']);
  }
  if (exactCommandAliases) {
    const manifest = JSON.parse(await readFile(path.join(controllerRecord.sourceRoot, 'templates', 'command-aliases.json'), 'utf8'));
    for (const alias of manifest.aliases) {
      const destination = await ensureSafeParent(targetRoot, path.join('commands', `${alias.name}.md`));
      const existing = await existingText(destination);
      if (existing !== null && !existing.startsWith(ALIAS_MARKER)) {
        throw new Error(`refusing to overwrite unowned command alias: ${destination}`);
      }
      const content = `${ALIAS_MARKER}\n\nInvoke the exact command \`${alias.target}\`.\n`;
      writes.push([destination, content, 'alias']);
    }
  }
  if (!exactCommandAliases) {
    const aliases = JSON.parse(await readFile(path.join(controllerRecord.sourceRoot, 'templates', 'command-aliases.json'), 'utf8'));
    for (const alias of aliases.aliases) {
      const destination = await ensureSafeParent(targetRoot, path.join('commands', `${alias.name}.md`));
      const existing = await existingText(destination);
      if (existing?.startsWith(ALIAS_MARKER)) {
        const relative = path.relative(targetRoot, destination).split(path.sep).join('/');
        const previous = previousManifest?.files.find((entry) => entry.path === relative);
        if (previous?.kind !== 'alias' || previous.sha256 !== sha256(existing)) {
          throw new Error(`refusing to adopt unmanifested or content-drifted command alias: ${destination}; rerun with --exact-command-aliases to replace it`);
        }
        writes.push([destination, existing, 'alias']);
      }
    }
  }
  const manifest = installManifest({ target: targetRoot, sourceRoot: controllerRecord.sourceRoot, files: writes });
  for (const [destination, content] of writes) await atomicWrite(destination, content);
  await atomicWrite(manifestPath, manifest);
  return {
    target: targetRoot,
    controller: controllerRecord.controller,
    exact_command_aliases: exactCommandAliases,
    uninstall_manifest: manifestPath,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.slice(2).some((argument) => argument === '--help' || argument === '-h')) {
      process.stdout.write(HELP);
      process.exit(0);
    }
    const options = parseOptions(process.argv.slice(2), { target: 'string', 'exact-command-aliases': 'boolean' });
    const result = await install({
      target: requireOption(options, 'target'),
      exactCommandAliases: options['exact-command-aliases'] === true,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
