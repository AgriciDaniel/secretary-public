import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildBrainManifest, renderBrainManifest } from './brain-manifest.mjs';
import { assertContainedPath } from './core.mjs';

const TOKEN_BYTES = 4;
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'been', 'before', 'being', 'between',
  'both', 'but', 'can', 'could', 'does', 'each', 'for', 'from', 'have', 'here', 'into', 'its', 'more', 'must',
  'not', 'only', 'other', 'our', 'out', 'over', 'prepare', 'should', 'some', 'such', 'task', 'than', 'that',
  'the', 'their', 'then', 'there', 'these', 'they', 'this', 'through', 'under', 'use', 'using', 'was', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with', 'would', 'you', 'your',
]);

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(value, 'utf8') / TOKEN_BYTES);
}

function normalizedText(value) {
  return value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
  return new Set(normalizedText(value).split(/\s+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

export function scoreBrainNote(note, taskText, profileDomains) {
  const taskNormalized = normalizedText(taskText);
  const taskTokens = tokens(taskText);
  const profileTokens = tokens([...profileDomains].join(' '));
  const titleNormalized = normalizedText(note.title);
  const titleTokens = tokens(note.title);
  const tagTokens = tokens(note.tags.join(' '));
  const domainTokens = tokens(note.domain);
  const summaryTokens = tokens(note.operating_summary);
  let score = 0;
  if (titleNormalized.length > 0 && taskNormalized.includes(titleNormalized)) score += 30;
  score += intersectionSize(taskTokens, titleTokens) * 12;
  score += intersectionSize(taskTokens, tagTokens) * 6;
  score += intersectionSize(taskTokens, domainTokens) * 10;
  score += intersectionSize(taskTokens, summaryTokens) * 3;
  score += intersectionSize(profileTokens, titleTokens) * 4;
  score += intersectionSize(profileTokens, tagTokens) * 3;
  score += intersectionSize(profileTokens, domainTokens) * 5;
  score += intersectionSize(profileTokens, summaryTokens);
  return score;
}

async function brainRoot(profile, projectRoot) {
  const configuredRoot = path.resolve(projectRoot, profile.brain.root);
  const relative = path.relative(projectRoot, configuredRoot);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`declared brain root escapes the project: ${profile.brain.root}`);
  }
  const metadata = await lstat(configuredRoot).catch(() => null);
  if (!metadata) throw new Error(`declared brain root is unavailable: ${profile.brain.root}`);
  if (metadata.isSymbolicLink()) throw new Error(`declared brain root must not be a symlink: ${profile.brain.root}`);
  if (!metadata.isDirectory()) throw new Error(`declared brain root must be a directory: ${profile.brain.root}`);
  return assertContainedPath(projectRoot, configuredRoot);
}

async function requiredBrainFile(root, declaredPath, projectRoot) {
  if (path.isAbsolute(declaredPath)) throw new Error(`declared brain path must be relative: ${declaredPath}`);
  const absolute = path.resolve(root, declaredPath);
  const relativeToRoot = path.relative(root, absolute);
  if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error(`declared brain path escapes its root: ${declaredPath}`);
  }
  const metadata = await lstat(absolute).catch(() => null);
  if (!metadata) throw new Error(`declared brain file is unavailable: ${declaredPath}`);
  if (metadata.isSymbolicLink()) throw new Error(`declared brain file must not be a symlink: ${declaredPath}`);
  if (!metadata.isFile()) throw new Error(`declared brain path must be a regular file: ${declaredPath}`);
  const safePath = await assertContainedPath(root, absolute);
  const relativeToProject = path.relative(projectRoot, safePath);
  if (relativeToProject === '..' || relativeToProject.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToProject)) {
    throw new Error(`declared brain path escapes the project: ${declaredPath}`);
  }
  return {
    absolute: safePath,
    relative: relativeToProject.split(path.sep).join(path.posix.sep),
    root,
    origin: 'brain',
  };
}

function validateManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.notes)) throw new Error('brain manifest has an unsupported shape');
  const seen = new Set();
  for (const note of manifest.notes) {
    if (!note || typeof note !== 'object' || Array.isArray(note)) throw new Error('brain manifest note is invalid');
    for (const key of ['path', 'title', 'domain', 'confidence_tag', 'operating_summary']) {
      if (typeof note[key] !== 'string' || note[key].length === 0) throw new Error(`brain manifest note lacks ${key}`);
    }
    if (!Array.isArray(note.tags) || note.tags.some((tag) => typeof tag !== 'string')) {
      throw new Error(`brain manifest note has invalid tags: ${note.path}`);
    }
    if (!note.tags.includes(note.confidence_tag)) throw new Error(`brain manifest confidence tag is not in tags: ${note.path}`);
    if (!note.path.startsWith('wiki/') || !note.path.endsWith('.md') || path.posix.normalize(note.path) !== note.path) {
      throw new Error(`brain manifest note path is invalid: ${note.path}`);
    }
    if (seen.has(note.path)) throw new Error(`brain manifest has duplicate note: ${note.path}`);
    seen.add(note.path);
  }
}

export async function retrieveBrain({ profile, taskText, projectRoot }) {
  const root = await brainRoot(profile, projectRoot);
  const retrieval = profile.brain.retrieval;
  const manifestEntry = await requiredBrainFile(root, retrieval.manifest_path, projectRoot);
  const actualManifestText = await readFile(manifestEntry.absolute, 'utf8');
  const expectedManifestText = renderBrainManifest(await buildBrainManifest(root));
  if (actualManifestText !== expectedManifestText) {
    throw new Error(`generated brain manifest drift: ${retrieval.manifest_path}; run npm run generate`);
  }
  const manifest = JSON.parse(actualManifestText);
  validateManifest(manifest);

  const alwaysLoaded = [];
  const alwaysLoadedPaths = new Set();
  for (const declaredPath of retrieval.always_load) {
    const entry = await requiredBrainFile(root, declaredPath, projectRoot);
    if (entry.relative === manifestEntry.relative || alwaysLoadedPaths.has(entry.relative)) {
      throw new Error(`duplicate always-loaded brain path: ${declaredPath}`);
    }
    alwaysLoaded.push(entry);
    alwaysLoadedPaths.add(entry.relative);
  }

  let totalTokens = estimateTokens(actualManifestText);
  for (const entry of alwaysLoaded) totalTokens += estimateTokens(await readFile(entry.absolute, 'utf8'));
  if (totalTokens > retrieval.max_note_tokens) {
    throw new Error(`Tier 0 and Tier 1 brain content exceeds max_note_tokens: ${totalTokens} > ${retrieval.max_note_tokens}`);
  }

  const claimEvidenceEntry = alwaysLoaded.find((entry) => entry.relative === 'references/claim-evidence.json');
  const rawPathsByNote = new Map();
  if (claimEvidenceEntry) {
    let claimEvidence;
    try {
      claimEvidence = JSON.parse(await readFile(claimEvidenceEntry.absolute, 'utf8'));
    } catch (error) {
      throw new Error(`claim-evidence registry is invalid: ${error.message}`);
    }
    if (!Array.isArray(claimEvidence)) throw new Error('claim-evidence registry must be an array');
    for (const row of claimEvidence) {
      if (typeof row?.note_path !== 'string' || typeof row?.source_id !== 'string') continue;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(row.source_id)) throw new Error(`claim-evidence registry has invalid source_id: ${row.source_id}`);
      const paths = rawPathsByNote.get(row.note_path) || new Set();
      paths.add(`references/evidence/${row.source_id}/extract.md`);
      rawPathsByNote.set(row.note_path, paths);
    }
  }

  const profileDomains = new Set(retrieval.profile_domains);
  const ranked = manifest.notes
    .filter((note) => !alwaysLoadedPaths.has(note.path))
    .map((note) => ({ note, score: scoreBrainNote(note, taskText, profileDomains) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || comparePaths(left.note.path, right.note.path));

  const selected = [];
  const selectedPaths = new Set();
  const rawEvidenceEntries = [];
  const loadedRawEvidencePaths = new Set();
  for (const candidate of ranked) {
    if (selected.length >= retrieval.max_notes) break;
    const entry = await requiredBrainFile(root, candidate.note.path, projectRoot);
    const noteTokens = estimateTokens(await readFile(entry.absolute, 'utf8'));
    const candidateRawEntries = [];
    let candidateTokens = noteTokens;
    for (const rawPath of [...(rawPathsByNote.get(candidate.note.path) || [])].sort(comparePaths)) {
      if (loadedRawEvidencePaths.has(rawPath)) continue;
      const rawEntry = await requiredBrainFile(root, rawPath, projectRoot);
      const rawTokens = estimateTokens(await readFile(rawEntry.absolute, 'utf8'));
      candidateRawEntries.push({ entry: rawEntry, tokens: rawTokens });
      candidateTokens += rawTokens;
    }
    if (totalTokens + candidateTokens > retrieval.max_note_tokens) continue;
    selected.push({ ...entry, score: candidate.score, estimated_tokens: noteTokens });
    selectedPaths.add(entry.relative);
    for (const candidateRaw of candidateRawEntries) {
      rawEvidenceEntries.push(candidateRaw.entry);
      loadedRawEvidencePaths.add(candidateRaw.entry.relative);
    }
    totalTokens += candidateTokens;
  }

  const loadedNotePaths = manifest.notes
    .map((note) => note.path)
    .filter((notePath) => alwaysLoadedPaths.has(notePath) || selectedPaths.has(notePath));
  const notLoadedNotePaths = manifest.notes
    .map((note) => note.path)
    .filter((notePath) => !alwaysLoadedPaths.has(notePath) && !selectedPaths.has(notePath));

  const notLoadedRawEvidencePaths = [];

  return {
    entries: [manifestEntry, ...alwaysLoaded, ...selected.map(({ score, estimated_tokens, ...entry }) => entry), ...rawEvidenceEntries],
    report: {
      manifest_path: manifestEntry.relative,
      manifest_notes: manifest.notes.length,
      always_loaded_paths: alwaysLoaded.map((entry) => entry.relative),
      selected_notes: selected.map((entry) => ({
        path: entry.relative,
        score: entry.score,
        estimated_tokens: entry.estimated_tokens,
      })),
      loaded_note_paths: loadedNotePaths,
      not_loaded_note_paths: notLoadedNotePaths,
      loaded_raw_evidence_paths: [...loadedRawEvidencePaths],
      not_loaded_raw_evidence_paths: notLoadedRawEvidencePaths,
      estimated_brain_tokens: totalTokens,
      max_note_tokens: retrieval.max_note_tokens,
      max_notes: retrieval.max_notes,
      token_estimator: 'ceil UTF-8 bytes divided by 4 for each loaded brain file',
    },
  };
}
