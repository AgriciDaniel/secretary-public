import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { PROJECT_ROOT, sha256 } from '../lib/core.mjs';
import {
  createQualityPacket,
  freezeQualityJob,
  qualityStatus,
  registerQualityReview,
} from '../lib/quality.mjs';

const execFileAsync = promisify(execFile);
const controller = path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs');

async function harness(overrides = {}) {
  const base = await mkdtemp(path.join(tmpdir(), 'secretary-quality-'));
  const workspace = path.join(base, 'workspace');
  await mkdir(workspace);
  const qualityId = 'quality-0001';
  const baselineText = 'baseline artifact\n';
  const referenceText = 'approved comparison reference\n';
  const job = {
    version: 'secretary.quality-job/1',
    quality_id: qualityId,
    objective: 'Improve the artifact against the frozen acceptance contract.',
    baseline: { path: 'baseline.txt', sha256: sha256(baselineText) },
    reference: {
      id: 'reference-1',
      description: 'A permitted reference artifact.',
      path: 'reference.txt',
      sha256: sha256(referenceText),
      permissible_use_confirmed: true,
    },
    acceptance: {
      minimum_score: 8,
      gates: [
        { id: 'tests_pass', kind: 'deterministic', blocking: true, protected: true, criterion: 'All tests pass.' },
      ],
      dimensions: [
        { id: 'quality', weight: 1, criterion: 'The artifact is clear and complete.' },
      ],
    },
    budget: { max_iterations: 3, max_minutes: 60, max_tokens: 10000, max_cost_usd: 0 },
    scheduling: { strategy: 'sequential', coupling_rationale: 'The artifact is tightly coupled.', builder_ids: ['builder-1'], integration_owner: null },
    review: { fresh_context_required: true, blind_order_required: false, artifact_inspection_required: true },
    stop: { plateau_window: 2, minimum_score_delta: 0.2, stop_on_regression: true },
    authority: { external_actions_require_approval: true },
    ...overrides,
  };
  const jobFile = path.join(workspace, 'job.json');
  const artifactFile = path.join(workspace, 'artifact.txt');
  await writeFile(path.join(workspace, 'baseline.txt'), baselineText);
  await writeFile(path.join(workspace, 'reference.txt'), referenceText);
  await writeFile(jobFile, `${JSON.stringify(job, null, 2)}\n`);
  await writeFile(artifactFile, 'artifact version one\n');
  await writeFile(path.join(workspace, 'test-output.txt'), 'all focused tests passed\n');
  const env = { ...process.env, XDG_STATE_HOME: path.join(base, 'state') };
  return { base, workspace, qualityId, job, jobFile, artifactFile, env };
}

function reviewFor(packet, overrides = {}) {
  return {
    version: 'secretary.quality-review/1',
    quality_id: packet.quality_id,
    iteration: packet.iteration,
    job_sha256: packet.job_sha256,
    baseline_artifact_sha256: packet.baseline_artifact.sha256,
    reference_artifact_sha256: packet.reference_artifact.sha256,
    artifact_sha256: packet.artifact.sha256,
    reviewer: { id: 'independent-reviewer', type: 'model', fresh_context: true, was_builder: false },
    baseline_artifact_inspected: true,
    reference_artifact_inspected: true,
    artifact_inspected: true,
    blind_order: { performed: false, order_id: null },
    gates: [{
      id: 'tests_pass',
      status: 'passed',
      exit_code: 0,
      evidence: {
        summary: 'Focused tests passed.',
        artifacts: [{
          kind: 'test_output',
          path: 'test-output.txt',
          sha256: sha256('all focused tests passed\n'),
        }],
      },
    }],
    baseline_dimensions: [{ id: 'quality', score: 4, rationale: 'The baseline is incomplete.' }],
    baseline_overall_score: 4,
    dimensions: [{ id: 'quality', score: 8.5, rationale: 'Meets the frozen criterion.' }],
    overall_score: 8.5,
    regressions: [],
    limitations: [],
    resource_usage: { minutes: 2, tokens: 100, cost_usd: 0 },
    recommendation: 'Accept the artifact.',
    outcome: 'passed',
    ...overrides,
  };
}

async function saveReview(context, packet, review) {
  const file = path.join(context.workspace, `review-${packet.iteration}.json`);
  await writeFile(file, `${JSON.stringify(review, null, 2)}\n`);
  return file;
}

test('quality lane freezes a job and routes a separately reported pass to human acceptance', async () => {
  const context = await harness();
  const frozen = await freezeQualityJob(context);
  assert.equal(frozen.phase, 'frozen');
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  assert.equal(packet.job_sha256, frozen.job_sha256);
  assert.equal(packet.artifact.sha256.length, 64);
  assert.equal((await qualityStatus({ qualityId: context.qualityId, env: context.env })).outcome, 'awaiting_review');
  await assert.rejects(
    createQualityPacket({ qualityId: context.qualityId, iteration: 1, artifactFile: context.artifactFile, builderId: 'builder-1', env: context.env }),
    /quality state already exists/,
  );
  const reviewFile = await saveReview(context, packet, reviewFor(packet));
  const status = await registerQualityReview({
    qualityId: context.qualityId,
    iteration: 1,
    reviewFile,
    env: context.env,
  });
  assert.equal(status.reported_review_outcome, 'passed');
  assert.equal(status.outcome, 'needs_human_decision');
  assert.equal(status.stop_reason, 'declared_acceptance_requires_human');
  assert.equal(status.terminal, true);
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /quality review already exists/,
  );
  assert.deepEqual(JSON.parse(await readFile(packet.packet_file, 'utf8')).required_gate_ids, ['tests_pass']);
  const iterationDirectory = path.dirname(packet.packet_file);
  const evidenceManifest = JSON.parse(await readFile(path.join(iterationDirectory, 'review-evidence-manifest.json'), 'utf8'));
  assert.equal(evidenceManifest.entries[0].path, 'test-output.txt');
  assert.equal(
    await readFile(path.join(iterationDirectory, evidenceManifest.entries[0].frozen_file), 'utf8'),
    'all focused tests passed\n',
  );
  const storedReviewFile = path.join(iterationDirectory, 'review.json');
  const storedReview = JSON.parse(await readFile(storedReviewFile, 'utf8'));
  storedReview.overall_score = 1;
  await writeFile(storedReviewFile, `${JSON.stringify(storedReview, null, 2)}\n`);
  await assert.rejects(
    qualityStatus({ qualityId: context.qualityId, env: context.env }),
    /quality review commitment mismatch/,
  );
});

test('unauthenticated pass declarations cannot become controller-certified acceptance', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const declared = reviewFor(packet, {
    reviewer: { id: 'builder-alias', type: 'model', fresh_context: true, was_builder: false },
    resource_usage: { minutes: 1, tokens: 0, cost_usd: 0 },
  });
  await writeFile(path.join(context.workspace, 'test-output.txt'), 'TESTS FAILED\n');
  declared.gates[0].evidence.summary = 'Reviewer declares the gate passed.';
  declared.gates[0].evidence.artifacts[0].sha256 = sha256('TESTS FAILED\n');
  const reviewFile = await saveReview(context, packet, declared);
  const status = await registerQualityReview({
    qualityId: context.qualityId,
    iteration: 1,
    reviewFile,
    env: context.env,
  });
  assert.equal(status.reported_review_outcome, 'passed');
  assert.equal(status.outcome, 'needs_human_decision');
  assert.equal(status.stop_reason, 'declared_acceptance_requires_human');
  assert.equal(status.terminal, true);
});

test('quality job freezes a workspace-contained reference at its declared hash', async () => {
  const context = await harness();
  const job = JSON.parse(await readFile(context.jobFile, 'utf8'));
  job.reference.sha256 = '0'.repeat(64);
  await writeFile(context.jobFile, `${JSON.stringify(job, null, 2)}\n`);
  await assert.rejects(freezeQualityJob(context), /quality reference hash mismatch/);
});

test('quality job rejects mutable gates and missing deterministic blockers', async () => {
  const context = await harness({
    acceptance: {
      minimum_score: 8,
      gates: [{ id: 'taste_only', kind: 'craft', blocking: false, protected: false, criterion: 'Looks good.' }],
      dimensions: [{ id: 'quality', weight: 1, criterion: 'Quality.' }],
    },
  });
  await assert.rejects(freezeQualityJob(context), /blocking deterministic gate|protected must equal true|must be protected/);
});

test('quality review rejects self-sign-off and artifact hash substitution', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const reviewFile = await saveReview(context, packet, reviewFor(packet, {
    artifact_sha256: '0'.repeat(64),
    reviewer: { id: 'builder', type: 'model', fresh_context: true, was_builder: true },
  }));
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /artifact_sha256 does not match|was_builder must equal false/,
  );
});

test('quality packet and review bind declared builder identity', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  await assert.rejects(
    createQualityPacket({ qualityId: context.qualityId, iteration: 1, artifactFile: context.artifactFile, builderId: 'unknown-builder', env: context.env }),
    /declared builder/,
  );
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const reviewFile = await saveReview(context, packet, reviewFor(packet, {
    reviewer: { id: 'builder-1', type: 'model', fresh_context: true, was_builder: false },
  }));
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /declared builder cannot be the reviewer/,
  );
});

test('quality review rejects a score that does not match frozen dimension weights', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const reviewFile = await saveReview(context, packet, reviewFor(packet, {
    overall_score: 9.9,
    outcome: 'refine',
    recommendation: 'The claimed total does not match the dimension score.',
  }));
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /overall_score must equal/,
  );
});

test('quality review rejects gate evidence that changed after hashing', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  await writeFile(path.join(context.workspace, 'test-output.txt'), 'tests did not run\n');
  const reviewFile = await saveReview(context, packet, reviewFor(packet));
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /gate evidence hash mismatch/,
  );
});

test('quality review rejects inconsistent deterministic exit codes and zero declared time', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const inconsistent = reviewFor(packet);
  inconsistent.gates[0].exit_code = 1;
  inconsistent.resource_usage.minutes = 0;
  const reviewFile = await saveReview(context, packet, inconsistent);
  await assert.rejects(
    registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env }),
    /requires exit_code 0|positive declared minutes/,
  );
});

test('quality status stops on a declared material regression', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const review = reviewFor(packet, {
    overall_score: 7,
    dimensions: [{ id: 'quality', score: 7, rationale: 'Improved, but below threshold.' }],
    regressions: ['Accessibility regressed.'],
    recommendation: 'Stop and adjudicate the regression.',
    outcome: 'refine',
  });
  const reviewFile = await saveReview(context, packet, review);
  const status = await registerQualityReview({
    qualityId: context.qualityId,
    iteration: 1,
    reviewFile,
    env: context.env,
  });
  assert.equal(status.outcome, 'improved_not_passed');
  assert.equal(status.stop_reason, 'material_regression');
  await assert.rejects(
    createQualityPacket({ qualityId: context.qualityId, iteration: 2, artifactFile: context.artifactFile, builderId: 'builder-1', env: context.env }),
    /quality job is terminal/,
  );
});

test('quality status does not claim improvement below the scored baseline', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  const review = reviewFor(packet, {
    baseline_dimensions: [{ id: 'quality', score: 7.5, rationale: 'The baseline is stronger.' }],
    baseline_overall_score: 7.5,
    dimensions: [{ id: 'quality', score: 7, rationale: 'The candidate regressed.' }],
    overall_score: 7,
    regressions: ['The candidate is worse than baseline.'],
    recommendation: 'Stop without claiming improvement.',
    outcome: 'refine',
  });
  const reviewFile = await saveReview(context, packet, review);
  const status = await registerQualityReview({ qualityId: context.qualityId, iteration: 1, reviewFile, env: context.env });
  assert.equal(status.outcome, 'not_passed');
  assert.equal(status.improvement, -0.5);
});

test('quality status rejects tampering with the frozen candidate artifact', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  const packet = await createQualityPacket({
    qualityId: context.qualityId,
    iteration: 1,
    artifactFile: context.artifactFile,
    builderId: 'builder-1',
    env: context.env,
  });
  await writeFile(packet.artifact.frozen_file, 'tampered frozen artifact\n');
  await assert.rejects(
    qualityStatus({ qualityId: context.qualityId, env: context.env }),
    /frozen quality artifact hash mismatch/,
  );
});

test('quality status is honest before any reviewer result exists', async () => {
  const context = await harness();
  await freezeQualityJob(context);
  assert.equal((await qualityStatus({ qualityId: context.qualityId, env: context.env })).outcome, 'ready_for_artifact');
});

test('quality CLI exposes freeze, packet, review, and status as JSON', async () => {
  const context = await harness();
  const run = async (args) => execFileAsync(process.execPath, [controller, ...args], {
    cwd: PROJECT_ROOT,
    env: context.env,
  });
  const frozen = JSON.parse((await run([
    'quality', 'freeze',
    '--quality-id', context.qualityId,
    '--job-file', context.jobFile,
    '--workspace', context.workspace,
  ])).stdout);
  assert.equal(frozen.phase, 'frozen');
  const packet = JSON.parse((await run([
    'quality', 'packet',
    '--quality-id', context.qualityId,
    '--iteration', '1',
    '--artifact-file', context.artifactFile,
    '--builder-id', 'builder-1',
  ])).stdout);
  const reviewFile = await saveReview(context, packet, reviewFor(packet));
  const reviewed = JSON.parse((await run([
    'quality', 'review',
    '--quality-id', context.qualityId,
    '--iteration', '1',
    '--review-file', reviewFile,
  ])).stdout);
  assert.equal(reviewed.reported_review_outcome, 'passed');
  assert.equal(reviewed.outcome, 'needs_human_decision');
  const status = JSON.parse((await run([
    'quality', 'status',
    '--quality-id', context.qualityId,
  ])).stdout);
  assert.equal(status.stop_reason, 'declared_acceptance_requires_human');
});
