#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, parseOptions } from '../lib/core.mjs';

const ROOT_FILES = [
  '.gitignore',
  'AGENTS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'GEMINI.md',
  'LICENSE',
  'NOTICE',
  'README.md',
  'RELEASE_NOTES.md',
  'SECURITY.md',
  'SKILL.md',
  'SUPPORT.md',
  'package.json',
];
const ROOT_DIRECTORIES = [
  '.github',
  'agents',
  'assets',
  'commands',
  'contracts',
  'docs',
  'examples',
  'lib',
  'profiles',
  'references',
  'schemas',
  'scripts',
  'skills',
  'templates',
  'tests',
  'wiki',
];
const execFileAsync = promisify(execFile);
const SYNTHESIZED_PATHS = new Set([
  'PUBLIC_EXPORT_NOTICE.md',
  'docs/claim-rights-review.md',
  'docs/claim-support-review.md',
  'references/claim-evidence.json',
  'references/public-export.json',
  'references/research-digest.md',
]);
const MANIFEST_PATH = 'PUBLIC_EXPORT_MANIFEST.json';
const ASSET_PROVENANCE_PATH = 'assets/PROVENANCE.md';
const OWNER_APPROVED_ASSET_STATUS = 'Owner approved';
const PUBLIC_VISUAL_EXTENSIONS = new Set(['.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const EXCLUDED_EXACT_PATHS = new Set([
  'docs/claim-rights-review.md',
  'docs/claim-support-review.md',
  'references/claim-evidence.json',
  'references/research-digest.md',
]);
const EXCLUDED_PREFIXES = [
  'references/evidence/',
];
const PRIVATE_ROOT_PREFIXES = [
  '.council/',
  '.git/',
  '.obsidian/',
  '.probe/',
  '.secretary-state/',
  'release/',
  'secretary-state/',
];
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
const FIXTURE_HOME = ['/home', 'test'].join('/');
const ALLOWED_HOME_PATHS = new Map([
  ['tests/backends.test.mjs', new Set([FIXTURE_HOME])],
  ['scripts/release-hygiene.mjs', new Set([FIXTURE_HOME])],
]);
const FIXED_TIME = new Date(0);

const PUBLIC_NOTICE = `# Public source projection

This tree is a deterministic, rights-reduced projection of the private Secretary development repository. It is source code for review and experimentation, not a complete evidence release and not production approval.

The projection omits the private research digest, the claim locator registry, all frozen third-party evidence extracts, Git history, diagnostic directories, local run state, Obsidian state, and ignored build output. It replaces the two runtime-required research files with explicit public placeholders so retrieval fails toward no data instead of silently using missing evidence.

The source ledger and brain notes remain included for provenance, architecture review, and bounded operation. Some notes contain short quotations, factual source metadata, and paraphrases. This export process does not decide whether every remaining use is licensed, non-infringing, or suitable in every jurisdiction. Publication still requires the owner's claim-level rights judgment.

Visual assets are governed by assets/PROVENANCE.md. An exact visual is included only when its inventory row records its current SHA-256 with the exact status Owner approved and a named, dated owner sign-off approves the same hash with a non-pending evidence location. Any pending visual is omitted, and its public README image tag is replaced with an omission notice. Filename continuity, Git history, or file presence is not approval.

The strict human-support gate intentionally fails in this projection because the evidence required to support those claims was omitted. Do not treat an empty public claim-evidence registry as proof that no support review is needed.
`;

const PUBLIC_RESEARCH_DIGEST = `# Public research boundary

The canonical research digest is intentionally not distributed in this public source projection because it contains third-party research text and unresolved reuse questions.

This placeholder preserves repository-relative links only. It is not evidence, does not support any claim in the brain, and must not be cited as if its private counterpart was supplied. Use the source ledger to identify provenance, then obtain and review source material through a rights-cleared process. When support is not supplied, return no data and record the gap.
`;

const PUBLIC_RIGHTS_REVIEW = `# Claim rights review

The detailed internal claim-level rights packet is intentionally not distributed in this public source projection. The public export omits frozen source extracts, the private research digest, and the internal claim locator registry because redistribution rights have not been established.

The remaining source metadata and original synthesis still require owner review before publication. This placeholder is a disclosure, not a rights clearance or legal opinion.
`;

const PUBLIC_SUPPORT_REVIEW = `# Claim support review

The internal human-attestation packet is intentionally not distributed in this public source projection. The source passages required for a support decision are absent, so no public recipient can complete or infer the private attestations from this tree.

The strict support gate remains blocked. Obtain rights-cleared evidence and perform a named human review before treating any affected claim as supported.
`;

const PUBLIC_EXPORT_MARKER = {
  version: 1,
  projection: 'rights-reduced-public-source',
  omitted_claim_evidence: true,
  omitted_frozen_extracts: true,
  omitted_private_research_digest: true,
  strict_human_support_available: false,
  git_history_included: false,
  fresh_public_history_required: true,
  omitted_pending_visual_assets: true,
  asset_inclusion_requires_exact_hash_owner_approval: true,
};

const GITHUB_SLUG_PATTERN = /^(?<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/(?<repository>[A-Za-z0-9._-]{1,100})$/u;

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function posixRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join(path.posix.sep);
}

function isExcludedSourcePath(relative) {
  return EXCLUDED_EXACT_PATHS.has(relative) || EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix));
}

function isSafeRelativePath(relative) {
  return relative !== '' && !path.isAbsolute(relative) && !relative.split('/').includes('..');
}

function isPublicVisualAsset(relative) {
  return relative.startsWith('assets/') && PUBLIC_VISUAL_EXTENSIONS.has(path.extname(relative).toLowerCase());
}

function markdownTableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

export function parseAssetProvenance(text) {
  if (typeof text !== 'string') throw new Error('asset provenance record must be text');
  const records = new Map();
  const signoffs = [];
  let section = null;
  for (const line of text.split('\n')) {
    if (line === '## Repository facts') section = 'inventory';
    else if (line === '## Owner sign-off') section = 'signoff';
    else if (line.startsWith('## ')) section = null;
    const cells = markdownTableCells(line);
    if (!cells || cells.length !== 5 || cells.every((cell) => /^-+$/u.test(cell.replaceAll(' ', '')))) continue;
    if (section === 'inventory') {
      const match = cells[0].match(/^`(?<name>[^`]+)`$/u);
      if (!match) continue;
      const relative = `assets/${match.groups.name}`;
      if (!isSafeRelativePath(relative) || !isPublicVisualAsset(relative)) {
        throw new Error(`asset provenance inventory contains an unsafe or unsupported visual path: ${relative}`);
      }
      const hashMatch = cells[2].match(/^`(?<hash>[0-9a-f]{64})`$/u);
      if (!hashMatch) throw new Error(`asset provenance inventory has an invalid SHA-256 for ${relative}`);
      if (records.has(relative)) throw new Error(`asset provenance inventory contains a duplicate path: ${relative}`);
      records.set(relative, {
        path: relative,
        sha256: hashMatch.groups.hash,
        status: cells[4],
      });
    } else if (section === 'signoff' && cells[0] !== 'Reviewer') {
      signoffs.push({
        reviewer: cells[0],
        reviewDate: cells[1],
        hashes: cells[2].match(/[0-9a-f]{64}/gu) ?? [],
        decision: cells[3],
        evidenceLocation: cells[4],
      });
    }
  }
  if (records.size === 0) throw new Error('asset provenance inventory contains no visual assets');
  return { records, signoffs };
}

export function isAssetOwnerApproved(provenance, relative, bytes) {
  const record = provenance.records.get(relative);
  if (!record || record.status !== OWNER_APPROVED_ASSET_STATUS || record.sha256 !== sha256(bytes)) return false;
  return provenance.signoffs.some((signoff) => (
    signoff.decision === 'approved'
    && signoff.reviewer !== ''
    && signoff.reviewer !== 'Pending'
    && /^\d{4}-\d{2}-\d{2}$/u.test(signoff.reviewDate)
    && signoff.hashes.includes(record.sha256)
    && signoff.evidenceLocation !== ''
    && signoff.evidenceLocation !== 'Pending'
  ));
}

async function loadAssetProvenance(root) {
  const text = await readFile(path.join(root, ASSET_PROVENANCE_PATH), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') throw new Error(`${ASSET_PROVENANCE_PATH}: required public asset provenance record is missing`);
    throw error;
  });
  return { text, ...parseAssetProvenance(text) };
}

export function rewritePublicReadmeAssets(bytes, omittedPaths) {
  if (isBinary(bytes)) throw new Error('public README must be text');
  const text = bytes.toString('utf8');
  const rewritten = text.replace(/<img\b[^>]*\bsrc=["'](assets\/[^"']+)["'][^>]*>/gu, (tag, relative) => {
    if (!omittedPaths.has(relative)) return tag;
    return '<em>Public projection: pending visual omitted until exact-hash owner approval.</em>';
  });
  return Buffer.from(rewritten, 'utf8');
}

export function normalizePublicRepository(value) {
  if (typeof value !== 'string' || value.trim() !== value || !GITHUB_SLUG_PATTERN.test(value)) {
    throw new Error('public repository must be an explicit GitHub OWNER/REPO slug');
  }
  const { owner, repository } = GITHUB_SLUG_PATTERN.exec(value).groups;
  if (owner.endsWith('-') || repository === '.' || repository === '..' || repository.endsWith('.git')) {
    throw new Error('public repository must be an explicit GitHub OWNER/REPO slug');
  }
  return `${owner}/${repository}`;
}

function githubSlugFromPackageMetadata(packageMetadata) {
  const repositoryUrl = typeof packageMetadata.repository === 'string'
    ? packageMetadata.repository
    : packageMetadata.repository?.url;
  const match = typeof repositoryUrl === 'string'
    ? repositoryUrl.match(/github\.com[/:](?<owner>[^/]+)\/(?<repository>[^/#]+?)(?:\.git)?$/iu)
    : null;
  if (!match?.groups) throw new Error('canonical package repository must be a GitHub repository URL');
  return normalizePublicRepository(`${match.groups.owner}/${match.groups.repository.replace(/\.git$/iu, '')}`);
}

async function canonicalRepository(root) {
  const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  return githubSlugFromPackageMetadata(packageMetadata);
}

function publicExportMarker(repository, omittedPendingVisualAssets = true) {
  return {
    ...PUBLIC_EXPORT_MARKER,
    omitted_pending_visual_assets: omittedPendingVisualAssets,
    public_repository: repository,
  };
}

export function rewriteRepositoryUrls(bytes, canonical, repository) {
  if (isBinary(bytes) || canonical.toLowerCase() === repository.toLowerCase()) return bytes;
  const canonicalBase = `https://github.com/${canonical}`;
  const publicBase = `https://github.com/${repository}`;
  const escapedCanonicalBase = canonicalBase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const exactRepositoryUrl = new RegExp(
    `${escapedCanonicalBase}(?=$|[^A-Za-z0-9._-]|\\.git(?=$|[^A-Za-z0-9._-]))`,
    'gu',
  );
  return Buffer.from(bytes.toString('utf8').replace(exactRepositoryUrl, publicBase), 'utf8');
}

async function assertRepositoryTargetApplied(outputRoot, canonical, repository) {
  if (canonical.toLowerCase() === repository.toLowerCase()) return;
  const canonicalBase = `https://github.com/${canonical}`;
  for (const relative of await allFiles(outputRoot)) {
    const bytes = await readFile(path.join(outputRoot, relative));
    if (isBinary(bytes)) continue;
    const text = bytes.toString('utf8');
    let offset = text.indexOf(canonicalBase);
    while (offset !== -1) {
      const suffix = text.slice(offset + canonicalBase.length);
      const next = suffix[0];
      if (suffix.startsWith('.git') || next === undefined || !/[A-Za-z0-9._-]/u.test(next)) {
        throw new Error(`public export retained canonical repository URL in ${relative}`);
      }
      offset = text.indexOf(canonicalBase, offset + canonicalBase.length);
    }
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function isBinary(bytes) {
  for (const byte of bytes) {
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) return true;
  }
  return false;
}

function isAllowedBinary(relative) {
  return relative.startsWith('assets/') && new Set(['.ico', '.jpeg', '.jpg', '.png', '.webp']).has(path.extname(relative).toLowerCase());
}

function unexpectedHomePaths(relative, text) {
  const allowed = ALLOWED_HOME_PATHS.get(relative) ?? new Set();
  return (text.match(ABSOLUTE_HOME_PATH) ?? []).filter((candidate) => !allowed.has(candidate));
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function gitPublicationCandidates(root = PROJECT_ROOT) {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 },
  );
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  return [...new Set(bytes.toString('utf8').split('\0').filter(Boolean))].sort(byteSort);
}

async function sourcePublicationCandidates(root) {
  try {
    const candidates = await gitPublicationCandidates(root);
    if (ROOT_FILES.every((relative) => candidates.includes(relative))) return candidates;
  } catch (error) {
    if (!(await exists(path.join(root, 'references', 'public-export.json')))) throw error;
  }
  if (!(await exists(path.join(root, 'references', 'public-export.json')))) {
    throw new Error('public export source must be a complete Git worktree or a verified public projection');
  }
  const verified = await verifyPublicTree(root);
  if (verified.failures.length > 0) {
    throw new Error(`public projection source verification failed:\n${verified.failures.join('\n')}`);
  }
  return verified.files.filter((relative) => relative !== MANIFEST_PATH);
}

export async function collectPublicSourceFiles(root = PROJECT_ROOT) {
  const absoluteRoot = path.resolve(root);
  const candidates = await sourcePublicationCandidates(absoluteRoot);
  const candidateSet = new Set(candidates);
  if (!candidateSet.has(ASSET_PROVENANCE_PATH)) {
    throw new Error(`${ASSET_PROVENANCE_PATH}: required public asset provenance record is not tracked or an unignored worktree file`);
  }
  const provenance = await loadAssetProvenance(absoluteRoot);
  for (const relative of ROOT_FILES) {
    if (!candidateSet.has(relative)) throw new Error(`required public root file is not tracked or an unignored worktree file: ${relative}`);
    const absolute = path.join(absoluteRoot, relative);
    const metadata = await lstat(absolute);
    if (!metadata.isFile()) throw new Error(`required public root file is not regular: ${relative}`);
  }
  for (const relative of ROOT_DIRECTORIES) {
    const absolute = path.join(absoluteRoot, relative);
    const metadata = await lstat(absolute);
    if (!metadata.isDirectory()) throw new Error(`required public root directory is missing: ${relative}`);
  }
  const files = candidates.filter((relative) => (
    ROOT_FILES.includes(relative)
    || ROOT_DIRECTORIES.some((directory) => relative.startsWith(`${directory}/`))
  ));
  for (const relative of files) {
    if (!isSafeRelativePath(relative)) throw new Error(`public export refuses unsafe source path: ${relative}`);
    const metadata = await lstat(path.join(absoluteRoot, relative));
    if (!metadata.isFile()) throw new Error(`public export refuses non-regular source entry: ${relative}`);
  }
  const selected = [];
  for (const relative of files) {
    if (isExcludedSourcePath(relative) || SYNTHESIZED_PATHS.has(relative)) continue;
    if (isPublicVisualAsset(relative)) {
      const bytes = await readFile(path.join(absoluteRoot, relative));
      if (!isAssetOwnerApproved(provenance, relative, bytes)) continue;
    }
    selected.push(relative);
  }
  return selected.sort(byteSort);
}

async function writeSynthesizedFiles(outputRoot, repository, omittedPendingVisualAssets) {
  await writeFile(path.join(outputRoot, 'PUBLIC_EXPORT_NOTICE.md'), PUBLIC_NOTICE, { mode: 0o644 });
  await mkdir(path.join(outputRoot, 'docs'), { recursive: true, mode: 0o755 });
  await writeFile(path.join(outputRoot, 'docs', 'claim-rights-review.md'), PUBLIC_RIGHTS_REVIEW, { mode: 0o644 });
  await writeFile(path.join(outputRoot, 'docs', 'claim-support-review.md'), PUBLIC_SUPPORT_REVIEW, { mode: 0o644 });
  await mkdir(path.join(outputRoot, 'references'), { recursive: true, mode: 0o755 });
  await writeFile(path.join(outputRoot, 'references', 'claim-evidence.json'), '[]\n', { mode: 0o644 });
  await writeFile(
    path.join(outputRoot, 'references', 'public-export.json'),
    `${JSON.stringify(publicExportMarker(repository, omittedPendingVisualAssets), null, 2)}\n`,
    { mode: 0o644 },
  );
  await writeFile(path.join(outputRoot, 'references', 'research-digest.md'), PUBLIC_RESEARCH_DIGEST, { mode: 0o644 });
}

async function allFiles(root, directories = null) {
  const output = [];
  async function walk(directory) {
    const handle = await opendir(directory);
    const entries = [];
    for await (const entry of handle) entries.push(entry);
    entries.sort((left, right) => byteSort(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = posixRelative(root, absolute);
      if (entry.isDirectory()) {
        if (directories) directories.push(relative);
        await walk(absolute);
      }
      else if (entry.isFile()) output.push(relative);
      else throw new Error(`public tree contains non-regular entry: ${relative}`);
    }
  }
  await walk(root);
  return output.sort(byteSort);
}

function scanPublicFile(relative, bytes, failures) {
  if (!isSafeRelativePath(relative)) failures.push(`${relative}: unsafe path`);
  if (relative.startsWith('-')) failures.push(`${relative}: option-like root path`);
  if (relative.split('/').includes('.git')) failures.push(`${relative}: Git history path`);
  if (PRIVATE_ROOT_PREFIXES.some((prefix) => relative.startsWith(prefix))) failures.push(`${relative}: private root path`);
  if (relative.startsWith('references/evidence/')) failures.push(`${relative}: frozen evidence path`);
  if (isBinary(bytes) && !isAllowedBinary(relative)) {
    failures.push(`${relative}: unexpected binary`);
    return;
  }
  if (isBinary(bytes)) return;
  const text = bytes.toString('utf8');
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) failures.push(`${relative}: credential pattern`);
  if (unexpectedHomePaths(relative, text).length > 0) failures.push(`${relative}: absolute home path`);
  if (text.includes('\u2014')) failures.push(`${relative}: em dash`);
}

async function buildManifest(root) {
  const files = (await allFiles(root)).filter((relative) => relative !== MANIFEST_PATH);
  const entries = [];
  for (const relative of files) {
    const absolute = path.join(root, relative);
    const [bytes, metadata] = await Promise.all([readFile(absolute), stat(absolute)]);
    entries.push({ path: relative, sha256: sha256(bytes), mode: metadata.mode & 0o111 ? '0755' : '0644' });
  }
  return { version: 1, projection: PUBLIC_EXPORT_MARKER.projection, files: entries };
}

async function normalizeTree(root) {
  const directories = [];
  async function walk(directory) {
    directories.push(directory);
    const handle = await opendir(directory);
    const entries = [];
    for await (const entry of handle) entries.push(entry);
    entries.sort((left, right) => byteSort(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await chmod(absolute, 0o755);
        await walk(absolute);
      } else {
        const metadata = await stat(absolute);
        await chmod(absolute, metadata.mode & 0o111 ? 0o755 : 0o644);
        await utimes(absolute, FIXED_TIME, FIXED_TIME);
      }
    }
  }
  await walk(root);
  for (const directory of directories.reverse()) await utimes(directory, FIXED_TIME, FIXED_TIME);
}

export async function verifyPublicTree(root) {
  const absoluteRoot = path.resolve(root);
  const failures = [];
  const directories = [];
  const files = await allFiles(absoluteRoot, directories);
  for (const relative of files) scanPublicFile(relative, await readFile(path.join(absoluteRoot, relative)), failures);
  for (const relative of directories) {
    if (relative.split('/').includes('.git')) failures.push(`${relative}/: Git history directory`);
  }
  for (const prefix of [...PRIVATE_ROOT_PREFIXES, 'references/evidence/']) {
    if (await exists(path.join(absoluteRoot, prefix))) failures.push(`${prefix}: excluded directory is present`);
  }

  for (const required of [...SYNTHESIZED_PATHS, MANIFEST_PATH]) {
    if (!files.includes(required)) failures.push(`${required}: required public projection file is missing`);
  }
  if (!files.includes(ASSET_PROVENANCE_PATH)) failures.push(`${ASSET_PROVENANCE_PATH}: required public asset provenance record is missing`);
  let provenance;
  try {
    provenance = await loadAssetProvenance(absoluteRoot);
  } catch (error) {
    failures.push(error.message);
  }
  if (provenance) {
    const publicFileSet = new Set(files);
    for (const [relative, record] of provenance.records) {
      if (record.status === OWNER_APPROVED_ASSET_STATUS && !publicFileSet.has(relative)) {
        failures.push(`${relative}: owner-approved visual asset is missing`);
      }
    }
    for (const relative of files.filter(isPublicVisualAsset)) {
      const bytes = await readFile(path.join(absoluteRoot, relative));
      if (!isAssetOwnerApproved(provenance, relative, bytes)) {
        failures.push(`${relative}: visual asset lacks exact-hash owner-approved provenance`);
      }
    }
    const readme = await readFile(path.join(absoluteRoot, 'README.md'), 'utf8').catch(() => '');
    for (const [relative, record] of provenance.records) {
      if (record.status !== OWNER_APPROVED_ASSET_STATUS && readme.includes(relative)) {
        failures.push(`README.md: references pending visual asset ${relative}`);
      }
    }
  }
  const claimEvidence = await readFile(path.join(absoluteRoot, 'references', 'claim-evidence.json'), 'utf8').catch(() => null);
  if (claimEvidence !== '[]\n') failures.push('references/claim-evidence.json: expected the exact empty public registry');
  const markerText = await readFile(path.join(absoluteRoot, 'references', 'public-export.json'), 'utf8').catch(() => null);
  let marker;
  try {
    marker = JSON.parse(markerText);
    const repository = normalizePublicRepository(marker.public_repository);
    if (typeof marker.omitted_pending_visual_assets !== 'boolean') {
      failures.push('references/public-export.json: visual omission marker must be boolean');
    }
    if (
      marker.omitted_pending_visual_assets === false
      && provenance
      && [...provenance.records.values()].some((record) => record.status !== OWNER_APPROVED_ASSET_STATUS)
    ) {
      failures.push('references/public-export.json: claims no pending visual omission while provenance remains pending');
    }
    if (markerText !== `${JSON.stringify(publicExportMarker(repository, marker.omitted_pending_visual_assets), null, 2)}\n`) {
      failures.push('references/public-export.json: public omission marker drift');
    }
    const packageMetadata = JSON.parse(await readFile(path.join(absoluteRoot, 'package.json'), 'utf8'));
    const expectedBase = `https://github.com/${repository}`;
    if (packageMetadata.repository?.url !== `${expectedBase}.git`) failures.push('package.json: public repository URL does not match export target');
    if (packageMetadata.homepage !== `${expectedBase}#readme`) failures.push('package.json: public homepage does not match export target');
    if (packageMetadata.bugs?.url !== `${expectedBase}/issues`) failures.push('package.json: public issue URL does not match export target');
  } catch (error) {
    failures.push(`references/public-export.json: invalid public repository marker: ${error.message}`);
  }
  const digestText = await readFile(path.join(absoluteRoot, 'references', 'research-digest.md'), 'utf8').catch(() => null);
  if (digestText !== PUBLIC_RESEARCH_DIGEST) failures.push('references/research-digest.md: public placeholder drift');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(absoluteRoot, MANIFEST_PATH), 'utf8'));
  } catch (error) {
    failures.push(`${MANIFEST_PATH}: invalid JSON: ${error.message}`);
  }
  if (manifest) {
    const expected = await buildManifest(absoluteRoot);
    if (JSON.stringify(manifest) !== JSON.stringify(expected)) failures.push(`${MANIFEST_PATH}: file list, mode, or digest mismatch`);
  }
  return { files, failures };
}

export async function assertPrivateCorpusBytesAbsent(sourceRoot, outputRoot) {
  const markerPath = path.join(sourceRoot, 'references', 'public-export.json');
  if (await exists(markerPath)) {
    const sourceMarker = JSON.parse(await readFile(markerPath, 'utf8'));
    const repository = normalizePublicRepository(sourceMarker.public_repository);
    const expectedMarker = `${JSON.stringify(publicExportMarker(repository, sourceMarker.omitted_pending_visual_assets), null, 2)}\n`;
    const expectedPublicFiles = new Map([
      ['docs/claim-rights-review.md', PUBLIC_RIGHTS_REVIEW],
      ['docs/claim-support-review.md', PUBLIC_SUPPORT_REVIEW],
      ['references/claim-evidence.json', '[]\n'],
      ['references/research-digest.md', PUBLIC_RESEARCH_DIGEST],
      ['references/public-export.json', expectedMarker],
    ]);
    for (const [relative, expected] of expectedPublicFiles) {
      const actual = await readFile(path.join(sourceRoot, relative), 'utf8').catch(() => null);
      if (actual !== expected) throw new Error(`public projection source marker or placeholder drift: ${relative}`);
    }
    if (await exists(path.join(sourceRoot, 'references', 'evidence'))) {
      throw new Error('public projection source unexpectedly contains references/evidence');
    }
    return;
  }
  const privatePaths = [
    'docs/claim-rights-review.md',
    'docs/claim-support-review.md',
    'references/claim-evidence.json',
    'references/research-digest.md',
    ...(await allFiles(path.join(sourceRoot, 'references', 'evidence'))).map((relative) => `references/evidence/${relative}`),
  ];
  const exported = await Promise.all((await allFiles(outputRoot)).map(async (relative) => ({
    relative,
    bytes: await readFile(path.join(outputRoot, relative)),
  })));
  for (const privatePath of privatePaths) {
    const privateBytes = await readFile(path.join(sourceRoot, privatePath));
    if (privateBytes.length === 0) continue;
    for (const candidate of exported) {
      if (candidate.bytes.includes(privateBytes)) {
        throw new Error(`public export contains the full bytes of private corpus file ${privatePath} in ${candidate.relative}`);
      }
    }
  }

  const normalizedWords = (bytes) => bytes.toString('utf8').normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const windowSize = 25;
  for (const privatePath of privatePaths) {
    const privateWords = normalizedWords(await readFile(path.join(sourceRoot, privatePath)));
    if (privateWords.length < windowSize) continue;
    const privateWindows = new Set();
    for (let index = 0; index <= privateWords.length - windowSize; index += 1) {
      privateWindows.add(privateWords.slice(index, index + windowSize).join(' '));
    }
    for (const candidate of exported) {
      const publicWords = normalizedWords(candidate.bytes);
      for (let index = 0; index <= publicWords.length - windowSize; index += 1) {
        if (privateWindows.has(publicWords.slice(index, index + windowSize).join(' '))) {
          throw new Error(`public export contains a ${windowSize}-word passage from private corpus file ${privatePath} in ${candidate.relative}`);
        }
      }
    }
  }
}

export async function exportPublicTree({
  sourceRoot = PROJECT_ROOT,
  output,
  repository,
  acknowledgeRenamedPrivateRepository = false,
}) {
  if (!output) throw new Error('public export requires an output directory');
  const absoluteSource = path.resolve(sourceRoot);
  const absoluteOutput = path.resolve(output);
  const publicRepository = normalizePublicRepository(repository);
  const sourceRepository = await canonicalRepository(absoluteSource);
  if (acknowledgeRenamedPrivateRepository && publicRepository.toLowerCase() !== sourceRepository.toLowerCase()) {
    throw new Error('--acknowledge-renamed-private-repository is valid only when the public target matches the current canonical slug');
  }
  if (publicRepository.toLowerCase() === sourceRepository.toLowerCase() && !acknowledgeRenamedPrivateRepository) {
    throw new Error('public repository matches the current canonical repository; rename the private remote first, then pass --acknowledge-renamed-private-repository');
  }
  if (absoluteOutput === absoluteSource || absoluteSource.startsWith(`${absoluteOutput}${path.sep}`)) {
    throw new Error('public export output must not contain the source repository');
  }
  const relativeOutput = path.relative(absoluteSource, absoluteOutput);
  if (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput)) {
    const firstSegment = relativeOutput.split(path.sep)[0];
    if (firstSegment !== 'release') throw new Error('public export output inside the source repository must be under release/');
  }
  if (await exists(absoluteOutput)) throw new Error(`refusing to overwrite existing public export: ${absoluteOutput}`);
  const parent = path.dirname(absoluteOutput);
  await mkdir(parent, { recursive: true, mode: 0o755 });
  const temporary = await mkdtemp(path.join(parent, '.secretary-public-export-'));
  try {
    const files = await collectPublicSourceFiles(absoluteSource);
    const sourceCandidates = await sourcePublicationCandidates(absoluteSource);
    const provenance = await loadAssetProvenance(absoluteSource);
    const omittedVisuals = new Set();
    for (const relative of sourceCandidates.filter(isPublicVisualAsset)) {
      const bytes = await readFile(path.join(absoluteSource, relative));
      if (!isAssetOwnerApproved(provenance, relative, bytes)) omittedVisuals.add(relative);
    }
    for (const relative of files) {
      const source = path.join(absoluteSource, relative);
      const destination = path.join(temporary, relative);
      const metadata = await lstat(source);
      if (!metadata.isFile()) throw new Error(`public export source changed type during copy: ${relative}`);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
      const sourceBytes = await readFile(source);
      let outputBytes = rewriteRepositoryUrls(sourceBytes, sourceRepository, publicRepository);
      if (relative === 'README.md') outputBytes = rewritePublicReadmeAssets(outputBytes, omittedVisuals);
      if (outputBytes === sourceBytes) await copyFile(source, destination, constants.COPYFILE_EXCL);
      else await writeFile(destination, outputBytes, { flag: 'wx' });
      await chmod(destination, metadata.mode & 0o111 ? 0o755 : 0o644);
    }
    await writeSynthesizedFiles(temporary, publicRepository, omittedVisuals.size > 0);
    await assertRepositoryTargetApplied(temporary, sourceRepository, publicRepository);
    const manifest = await buildManifest(temporary);
    await writeFile(path.join(temporary, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    await assertPrivateCorpusBytesAbsent(absoluteSource, temporary);
    await normalizeTree(temporary);
    const result = await verifyPublicTree(temporary);
    if (result.failures.length > 0) throw new Error(`public export verification failed:\n${result.failures.join('\n')}`);
    await rename(temporary, absoluteOutput);
    return { output: absoluteOutput, files: result.files.length };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2), {
    output: 'string',
    verify: 'string',
    repository: 'string',
    'acknowledge-renamed-private-repository': 'boolean',
  });
  if (Boolean(options.output) === Boolean(options.verify)) throw new Error('provide exactly one of --output or --verify');
  if (options.verify) {
    if (options.repository || options['acknowledge-renamed-private-repository']) {
      throw new Error('--repository and --acknowledge-renamed-private-repository are export-only options');
    }
    const result = await verifyPublicTree(options.verify);
    if (result.failures.length > 0) throw new Error(`public export verification failed:\n${result.failures.join('\n')}`);
    process.stdout.write(`public export verification passed for ${result.files.length} files\n`);
    return;
  }
  const result = await exportPublicTree({
    output: options.output,
    repository: options.repository,
    acknowledgeRenamedPrivateRepository: options['acknowledge-renamed-private-repository'] === true,
  });
  process.stdout.write(`public export created ${result.output} with ${result.files} files\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
