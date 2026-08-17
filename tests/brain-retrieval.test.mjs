import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { estimateTokens, retrieveBrain } from '../lib/brain-retrieval.mjs';
import { assemblePrompt, PROJECT_ROOT } from '../lib/core.mjs';
import { buildEvidenceBundle } from '../lib/evidence.mjs';

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

async function retrievalFixture(taskText) {
  const profile = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'profiles', 'general-secretary.json'), 'utf8'));
  const brain = await retrieveBrain({ profile, taskText, projectRoot: PROJECT_ROOT });
  const workspace = await mkdtemp(path.join(tmpdir(), 'secretary-retrieval-'));
  const evidence = await buildEvidenceBundle({ workspace, profile, orderedEntries: brain.entries });
  const [contract, resultSchema] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, 'contracts', 'secretary-core.md'), 'utf8'),
    readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8').then(JSON.parse),
  ]);
  const assembled = await assemblePrompt({
    runId: 'retrieval-001',
    task: taskText,
    profile,
    contract,
    resultSchema,
    evidence,
    brainRetrieval: brain.report,
  });
  return { profile, brain, evidence, assembled };
}

test('Tier 0 manifest and Tier 1 files are always present in the assembled prompt', async () => {
  const { profile, assembled } = await retrievalFixture('Prepare a routine briefing.');
  const requiredPaths = [
    profile.brain.retrieval.manifest_path,
    ...profile.brain.retrieval.always_load,
  ];
  for (const requiredPath of requiredPaths) {
    assert.match(assembled.prompt, new RegExp(`Evidence path: ${JSON.stringify(requiredPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('escalation retrieval is deterministic, relevant, bounded, and announces omitted bodies', async () => {
  const task = 'Prepare an escalation route for a capability limit and an authority limit.';
  const first = await retrievalFixture(task);
  const second = await retrieveBrain({ profile: first.profile, taskText: task, projectRoot: PROJECT_ROOT });
  assert.deepEqual(second.report.selected_notes, first.brain.report.selected_notes);
  assert.ok(first.brain.report.selected_notes.some((note) => note.path === 'wiki/escalation/Three-Way Escalation.md'));
  assert.ok(first.brain.report.selected_notes.slice(0, 3).every((note) => note.path.startsWith('wiki/escalation/')));
  assert.ok(first.brain.report.selected_notes.every((note) => !note.path.startsWith('wiki/duties/')));
  assert.ok(first.brain.report.selected_notes.every((note) => note.path !== 'wiki/judgment/Printing Press Tool Discovery.md'));
  assert.ok(first.brain.report.not_loaded_note_paths.length > 0);
  assert.match(first.assembled.prompt, /Further notes exist and are listed in the brain manifest, but their bodies were not loaded for this task\./);
  assert.match(first.assembled.prompt, /If the manifest covers the matter but that note body is not supplied, name the note and state that its body needs loading\./);

  const brainTokensInPrompt = first.evidence.manifest.entries
    .filter((entry) => entry.origin === 'brain' && entry.disposition !== 'omitted')
    .reduce((total, entry) => total + estimateTokens(first.evidence.contents.get(entry.path)), 0);
  assert.equal(brainTokensInPrompt, first.brain.report.estimated_brain_tokens);
  assert.ok(brainTokensInPrompt <= first.profile.brain.retrieval.max_note_tokens);
});

test('selected notes load private extracts when present and stay no-RAW in a public projection', async () => {
  const retrieval = await retrievalFixture('Assess perspective getting and accuracy using the supplied research.');
  assert.ok(retrieval.brain.report.loaded_note_paths.includes('wiki/judgment/Perspective Getting and Accuracy.md'));
  const claimEvidence = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'references', 'claim-evidence.json'), 'utf8'));
  const publicExport = await readFile(path.join(PROJECT_ROOT, 'references', 'public-export.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!publicExport) {
    assert.ok(claimEvidence.length > 0, 'private source tree unexpectedly has no claim evidence');
    assert.ok(retrieval.brain.report.loaded_raw_evidence_paths.includes('references/evidence/eyal-perspective-taking/extract.md'));
    assert.match(retrieval.assembled.prompt, /we failed to find any consistent evidence that it actually did so/);
  } else {
    assert.equal(publicExport.omitted_claim_evidence, true);
    assert.deepEqual(claimEvidence, []);
    assert.deepEqual(retrieval.brain.report.loaded_raw_evidence_paths, []);
    assert.doesNotMatch(retrieval.assembled.prompt, /we failed to find any consistent evidence that it actually did so/);
    assert.match(retrieval.assembled.prompt, /When human support attestation was not supplied, say so and do not assign high confidence/);
    assert.match(retrieval.assembled.prompt, /If the principal asks for a claim that the supplied evidence cannot substantiate, do not write the claim/);
  }
  const brainTokensInPrompt = retrieval.evidence.manifest.entries
    .filter((entry) => entry.origin === 'brain' && entry.disposition !== 'omitted')
    .reduce((total, entry) => total + estimateTokens(retrieval.evidence.contents.get(entry.path)), 0);
  assert.equal(brainTokensInPrompt, retrieval.brain.report.estimated_brain_tokens);
  assert.ok(brainTokensInPrompt <= retrieval.profile.brain.retrieval.max_note_tokens);
});

test('generated brain manifest has every wiki note with no orphan or phantom', async () => {
  const manifest = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'references', 'brain-manifest.json'), 'utf8'));
  const notePaths = (await walk(path.join(PROJECT_ROOT, 'wiki')))
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.relative(PROJECT_ROOT, file).split(path.sep).join(path.posix.sep))
    .sort();
  const manifestedPaths = manifest.notes.map((note) => note.path).sort();
  assert.deepEqual(manifestedPaths, notePaths);
  for (const note of manifest.notes) {
    assert.ok(note.title.length > 0);
    assert.ok(note.domain.length > 0);
    assert.match(note.confidence_tag, /^#confidence\/[a-z-]+$/);
    assert.ok(note.operating_summary.length > 0);
    assert.doesNotMatch(note.operating_summary, /\n/);
  }
});
