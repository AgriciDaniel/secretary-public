import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { createPublicArchive, inspectPublicArchive } from '../scripts/public-archive.mjs';
import {
  assertPrivateCorpusBytesAbsent,
  collectPublicSourceFiles,
  exportPublicTree,
  gitPublicationCandidates,
  isAssetOwnerApproved,
  normalizePublicRepository,
  parseAssetProvenance,
  rewritePublicReadmeAssets,
  rewriteRepositoryUrls,
  verifyPublicTree,
} from '../scripts/public-export.mjs';
import { PROJECT_ROOT } from '../lib/core.mjs';

const execFileAsync = promisify(execFile);
const canonicalPackage = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
const CURRENT_REPOSITORY = canonicalPackage.repository.url
  .replace(/^https:\/\/github\.com\//u, '')
  .replace(/\.git$/u, '');
const PUBLIC_REPOSITORY = CURRENT_REPOSITORY.toLowerCase() === 'secretarytest/secretary-public'
  ? 'SecretaryTest/secretary-next'
  : 'SecretaryTest/secretary-public';
const PENDING_VISUAL_ASSETS = [
  'assets/cover-web.jpg',
  'assets/cover.png',
  'assets/diagram-authority.svg',
  'assets/diagram-lifecycle.svg',
  'assets/diagram-retrieval.svg',
  'assets/social-card.png',
  'assets/trust-boundary.jpg',
];

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-public-export-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('public export is deterministic and excludes private research bytes', async (t) => {
  const root = await temporaryRoot(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output: first, repository: PUBLIC_REPOSITORY });
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output: second, repository: PUBLIC_REPOSITORY });

  const firstManifest = await readFile(path.join(first, 'PUBLIC_EXPORT_MANIFEST.json'), 'utf8');
  const secondManifest = await readFile(path.join(second, 'PUBLIC_EXPORT_MANIFEST.json'), 'utf8');
  assert.equal(firstManifest, secondManifest);
  assert.deepEqual(JSON.parse(await readFile(path.join(first, 'references', 'claim-evidence.json'), 'utf8')), []);
  assert.match(await readFile(path.join(first, 'references', 'research-digest.md'), 'utf8'), /not evidence/u);
  assert.match(await readFile(path.join(first, 'docs', 'claim-rights-review.md'), 'utf8'), /intentionally not distributed/u);
  assert.doesNotMatch(await readFile(path.join(first, 'docs', 'claim-support-review.md'), 'utf8'), /claim-perspective-getting/u);
  assert.equal(await readFile(path.join(first, 'references', 'evidence', 'eyal-perspective-taking', 'extract.md'), 'utf8').catch(() => null), null);
  for (const publicCommunityFile of ['CODE_OF_CONDUCT.md', 'RELEASE_NOTES.md', 'SUPPORT.md']) {
    assert.ok((await readFile(path.join(first, publicCommunityFile), 'utf8')).length > 0, `${publicCommunityFile} was not exported`);
  }
  for (const governedPublicFile of ['assets/PROVENANCE.md', 'docs/github-public-settings.md']) {
    assert.ok((await readFile(path.join(first, governedPublicFile), 'utf8')).length > 0, `${governedPublicFile} was not exported`);
  }
  const publicReadme = await readFile(path.join(first, 'README.md'), 'utf8');
  for (const relative of PENDING_VISUAL_ASSETS) {
    assert.equal(await readFile(path.join(first, relative)).catch(() => null), null, `${relative} crossed the pending-rights boundary`);
    assert.ok(!publicReadme.includes(relative), `${relative} remained referenced by the public README`);
  }
  assert.match(publicReadme, /pending visual omitted until exact-hash owner approval/u);
  assert.match(await readFile(path.join(first, 'PUBLIC_EXPORT_NOTICE.md'), 'utf8'), /Pending visual assets are omitted/u);

  const packageMetadata = JSON.parse(await readFile(path.join(first, 'package.json'), 'utf8'));
  assert.equal(packageMetadata.repository.url, `https://github.com/${PUBLIC_REPOSITORY}.git`);
  assert.equal(packageMetadata.homepage, `https://github.com/${PUBLIC_REPOSITORY}#readme`);
  assert.equal(packageMetadata.bugs.url, `https://github.com/${PUBLIC_REPOSITORY}/issues`);
  assert.ok(!(await readFile(path.join(first, 'README.md'), 'utf8')).includes(`github.com/${CURRENT_REPOSITORY}`));
  assert.equal(
    JSON.parse(await readFile(path.join(first, 'references', 'public-export.json'), 'utf8')).public_repository,
    PUBLIC_REPOSITORY,
  );
  const publicMarker = JSON.parse(await readFile(path.join(first, 'references', 'public-export.json'), 'utf8'));
  assert.equal(publicMarker.omitted_pending_visual_assets, true);
  assert.equal(publicMarker.asset_inclusion_requires_exact_hash_owner_approval, true);

  const result = await verifyPublicTree(first);
  assert.deepEqual(result.failures, []);
});

test('asset approval requires the current exact hash and a complete owner sign-off', () => {
  const bytes = Buffer.from('approved visual bytes');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const approved = parseAssetProvenance(`# Visual asset provenance

## Repository facts

| Asset | Format and dimensions | SHA-256 | First repository commit | Public rights status |
| --- | --- | --- | --- | --- |
| \`example.png\` | PNG | \`${hash}\` | \`abc123\` | Owner approved |

## Owner sign-off

| Reviewer | Review date | Asset hashes reviewed | Decision | Evidence location |
| --- | --- | --- | --- | --- |
| Repository owner | 2026-08-17 | \`${hash}\` | approved | private rights record 17 |
`);
  assert.equal(isAssetOwnerApproved(approved, 'assets/example.png', bytes), true);
  assert.equal(isAssetOwnerApproved(approved, 'assets/example.png', Buffer.from('changed visual bytes')), false);

  const pending = parseAssetProvenance(`# Visual asset provenance

## Repository facts

| Asset | Format and dimensions | SHA-256 | First repository commit | Public rights status |
| --- | --- | --- | --- | --- |
| \`example.png\` | PNG | \`${hash}\` | \`abc123\` | Pending owner confirmation |

## Owner sign-off

| Reviewer | Review date | Asset hashes reviewed | Decision | Evidence location |
| --- | --- | --- | --- | --- |
| Repository owner | 2026-08-17 | \`${hash}\` | approved | private rights record 17 |
`);
  assert.equal(isAssetOwnerApproved(pending, 'assets/example.png', bytes), false);
});

test('public README asset rewriting changes only omitted local image tags', () => {
  const source = Buffer.from([
    '<img src="assets/pending.png" alt="pending">',
    '<img src="assets/approved.png" alt="approved">',
    '<img src="https://example.com/badge.svg" alt="remote">',
  ].join('\n'));
  const rewritten = rewritePublicReadmeAssets(source, new Set(['assets/pending.png'])).toString('utf8');
  assert.doesNotMatch(rewritten, /assets\/pending\.png/u);
  assert.match(rewritten, /pending visual omitted until exact-hash owner approval/u);
  assert.match(rewritten, /assets\/approved\.png/u);
  assert.match(rewritten, /https:\/\/example\.com\/badge\.svg/u);
});

test('public verification rejects restoration or README reference of a pending visual', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  const relative = 'assets/cover.png';
  await writeFile(
    path.join(output, relative),
    Buffer.from('pending visual negative control\n', 'utf8'),
  );
  const readmePath = path.join(output, 'README.md');
  await writeFile(readmePath, `${await readFile(readmePath, 'utf8')}\n<img src="${relative}" alt="negative control">\n`);

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes(`${relative}: visual asset lacks exact-hash owner-approved provenance`)));
  assert.ok(result.failures.some((failure) => failure.includes(`README.md: references pending visual asset ${relative}`)));
});

test('public verification fails closed on added credentials and local paths', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  const credential = ['github', 'pat', 'a'.repeat(24)].join('_');
  const localPath = ['/var', 'home', 'person', 'private.txt'].join('/');
  await writeFile(path.join(output, 'examples', 'unsafe.txt'), `${credential}\n${localPath}\n`);

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes('credential pattern')));
  assert.ok(result.failures.some((failure) => failure.includes('absolute home path')));
  assert.ok(result.failures.some((failure) => failure.toLowerCase().includes('manifest')));
});

test('public verification rejects a restored frozen-evidence path', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  const forbidden = path.join(output, 'references', 'evidence', 'source', 'extract.md');
  await mkdir(path.dirname(forbidden), { recursive: true });
  await writeFile(forbidden, 'forbidden raw evidence');

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes('frozen evidence path')));
});

test('public export refuses an output nested in a copied source root', async (t) => {
  const root = await temporaryRoot(t);
  await assert.rejects(
    exportPublicTree({
      sourceRoot: PROJECT_ROOT,
      output: path.join(PROJECT_ROOT, 'lib', path.basename(root)),
      repository: PUBLIC_REPOSITORY,
    }),
    /must be under release/u,
  );
});

test('public export requires a safe explicit repository target and a same-slug acknowledgement', async (t) => {
  const root = await temporaryRoot(t);
  assert.throws(() => normalizePublicRepository('https://github.com/owner/repository'), /OWNER\/REPO/u);
  await assert.rejects(
    exportPublicTree({ sourceRoot: PROJECT_ROOT, output: path.join(root, 'missing-target') }),
    /OWNER\/REPO/u,
  );
  await assert.rejects(
    exportPublicTree({
      sourceRoot: PROJECT_ROOT,
      output: path.join(root, 'same-target-blocked'),
      repository: CURRENT_REPOSITORY,
    }),
    /rename the private remote first/u,
  );
  await assert.rejects(
    exportPublicTree({
      sourceRoot: PROJECT_ROOT,
      output: path.join(root, 'irrelevant-acknowledgement'),
      repository: PUBLIC_REPOSITORY,
      acknowledgeRenamedPrivateRepository: true,
    }),
    /valid only when the public target matches/u,
  );

  const acknowledged = path.join(root, 'same-target-acknowledged');
  await exportPublicTree({
    sourceRoot: PROJECT_ROOT,
    output: acknowledged,
    repository: CURRENT_REPOSITORY,
    acknowledgeRenamedPrivateRepository: true,
  });
  assert.equal(
    JSON.parse(await readFile(path.join(acknowledged, 'references', 'public-export.json'), 'utf8')).fresh_public_history_required,
    true,
  );
  assert.equal(await readFile(path.join(acknowledged, '.git'), 'utf8').catch(() => null), null);
});

test('repository URL rewriting changes exact targets without changing prefix-adjacent repositories', () => {
  const canonical = 'Example/secretary';
  const repository = 'Example/secretary-public';
  const source = Buffer.from([
    'https://github.com/Example/secretary',
    'https://github.com/Example/secretary.git',
    'https://github.com/Example/secretary/issues',
    'https://github.com/Example/secretary-private',
    'https://github.com/Example/secretary.notes',
  ].join('\n'));
  const rewritten = rewriteRepositoryUrls(source, canonical, repository).toString('utf8');

  assert.equal(rewritten, [
    'https://github.com/Example/secretary-public',
    'https://github.com/Example/secretary-public.git',
    'https://github.com/Example/secretary-public/issues',
    'https://github.com/Example/secretary-private',
    'https://github.com/Example/secretary.notes',
  ].join('\n'));
});

test('public verification rejects Git history paths', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  await mkdir(path.join(output, '.git'), { recursive: true });
  await writeFile(path.join(output, '.git', 'config'), '[core]\nrepositoryformatversion = 0\n');

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes('Git history path')));
  assert.ok(result.failures.some((failure) => failure.includes('excluded directory is present')));
});

test('public verification rejects empty nested Git directories', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  await mkdir(path.join(output, 'examples', '.git'), { recursive: true });

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes('Git history directory')));
});

test('public source selection excludes Git-ignored files', async (t) => {
  const root = await temporaryRoot(t);
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, '.gitignore'), 'docs/owner-private-notes.tmp\n');
  await writeFile(path.join(root, 'docs', 'public.md'), 'public\n');
  await writeFile(path.join(root, 'docs', 'owner-private-notes.tmp'), 'private\n');
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });

  const candidates = await gitPublicationCandidates(root);
  assert.ok(candidates.includes('docs/public.md'));
  assert.ok(!candidates.includes('docs/owner-private-notes.tmp'));
});

test('verified projection source works inside an ignored parent Git worktree', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'projection');
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await writeFile(path.join(root, '.gitignore'), 'projection/\n');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });

  const files = await collectPublicSourceFiles(output);
  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('scripts/public-export.mjs'));
  assert.ok(!files.includes('PUBLIC_EXPORT_MANIFEST.json'));
});

test('public verification and archive reject option-like root paths', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  await writeFile(path.join(output, '--checkpoint=1'), 'negative control\n');

  const result = await verifyPublicTree(output);
  assert.ok(result.failures.some((failure) => failure.includes('option-like root path')));
  await assert.rejects(
    createPublicArchive({
      source: output,
      output: path.join(root, 'unsafe.tar.gz'),
      canonicalRoot: PROJECT_ROOT,
    }),
    /option-like root path/u,
  );
});

test('public artifact and archive reject canonical private corpus bytes', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  const privateRoot = path.join(root, 'private-fixture');
  const privateDigest = Buffer.from('Private corpus negative control. This deliberately unique passage contains enough distinct words to prove that a complete private source file cannot cross the verified public archive boundary under a renamed path or otherwise hide among ordinary source files.\n');
  await mkdir(path.join(privateRoot, 'docs'), { recursive: true });
  await mkdir(path.join(privateRoot, 'references', 'evidence', 'synthetic'), { recursive: true });
  await writeFile(path.join(privateRoot, 'docs', 'claim-rights-review.md'), 'private rights packet\n');
  await writeFile(path.join(privateRoot, 'docs', 'claim-support-review.md'), 'private support packet\n');
  await writeFile(path.join(privateRoot, 'references', 'claim-evidence.json'), '[{"private":true}]\n');
  await writeFile(path.join(privateRoot, 'references', 'research-digest.md'), privateDigest);
  await writeFile(path.join(privateRoot, 'references', 'evidence', 'synthetic', 'extract.md'), 'private evidence extract\n');
  await writeFile(path.join(output, 'examples', 'private-corpus-copy.md'), privateDigest);

  await assert.rejects(
    assertPrivateCorpusBytesAbsent(privateRoot, output),
    /full bytes of private corpus file references\/research-digest\.md/u,
  );
  await assert.rejects(
    createPublicArchive({
      source: output,
      output: path.join(root, 'unsafe.tar.gz'),
      canonicalRoot: privateRoot,
    }),
    /full bytes of private corpus file references\/research-digest\.md/u,
  );
});

test('public archive is deterministic and contains only the verified public tree', async (t) => {
  const root = await temporaryRoot(t);
  const output = path.join(root, 'public');
  const firstArchive = path.join(root, 'first.tar.gz');
  const secondArchive = path.join(root, 'second.tar.gz');
  await exportPublicTree({ sourceRoot: PROJECT_ROOT, output, repository: PUBLIC_REPOSITORY });
  const first = await createPublicArchive({ source: output, output: firstArchive, canonicalRoot: PROJECT_ROOT });
  const second = await createPublicArchive({ source: output, output: secondArchive, canonicalRoot: PROJECT_ROOT });
  assert.equal(first.files, second.files);
  const firstBytes = await readFile(firstArchive);
  assert.deepEqual(firstBytes, await readFile(secondArchive));

  const inspected = inspectPublicArchive(firstBytes);
  assert.equal(inspected.length, first.files);
  assert.ok(inspected.every((entry) => entry.mode === 0o644 || entry.mode === 0o755));

  const { stdout } = await execFileAsync('tar', ['-tzf', firstArchive], { encoding: 'utf8' });
  const members = stdout.split('\n').filter(Boolean);
  assert.deepEqual(members, inspected.map((entry) => entry.path));
  assert.ok(members.includes('PUBLIC_EXPORT_MANIFEST.json'));
  assert.ok(members.includes('references/public-export.json'));
  assert.ok(!members.some((relative) => relative === '.git' || relative.startsWith('.git/')));
  assert.ok(!members.some((relative) => relative.startsWith('references/evidence/')));

  const extracted = path.join(root, 'extracted');
  await mkdir(extracted);
  await execFileAsync('tar', ['-xzf', firstArchive, '-C', extracted]);
  const extractedVerification = await verifyPublicTree(extracted);
  assert.deepEqual(extractedVerification.failures, []);
  assert.deepEqual(
    await readFile(path.join(extracted, 'PUBLIC_EXPORT_MANIFEST.json')),
    await readFile(path.join(output, 'PUBLIC_EXPORT_MANIFEST.json')),
  );

  const corrupted = Buffer.from(firstBytes);
  corrupted[corrupted.length - 8] ^= 0xff;
  assert.throws(() => inspectPublicArchive(corrupted), /gzip trailer/u);
});
