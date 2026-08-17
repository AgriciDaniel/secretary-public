import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_ROOT,
  assertContainedPath,
  atomicWrite,
  atomicWriteJson,
  canonicalJson,
  ensurePrivateDir,
  readJson,
  sha256,
  stateRoot,
  validateRunId,
  validateSchema,
} from './core.mjs';

export const QUALITY_JOB_VERSION = 'secretary.quality-job/1';
export const QUALITY_REVIEW_VERSION = 'secretary.quality-review/1';
export const MAX_QUALITY_ARTIFACT_BYTES = 256 * 1024 * 1024;
export const MAX_QUALITY_REFERENCE_BYTES = 64 * 1024 * 1024;
export const MAX_QUALITY_EVIDENCE_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_QUALITY_EVIDENCE_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_QUALITY_EVIDENCE_FILES = 200;

export function qualityDirectory(qualityId, env = process.env) {
  return path.join(stateRoot(env), 'quality', validateRunId(qualityId));
}

async function claimDirectory(directory, label) {
  await ensurePrivateDir(path.dirname(directory));
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`quality state already exists: ${label}`);
    throw error;
  }
}

async function claimReview(file, iteration) {
  try {
    await writeFile(file, `${new Date().toISOString()}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`quality review already exists for iteration ${iteration}`);
    throw error;
  }
}

function schemaErrors(value, schema, label) {
  const errors = validateSchema(value, schema);
  if (errors.length > 0) throw new Error(`invalid ${label}: ${errors.join('; ')}`);
}

async function readBoundedRegularFile(file, maximum, label) {
  const metadata = await lstat(file);
  if (!metadata.isFile()) throw new Error(`${label} must be a regular file`);
  if (metadata.size > maximum) throw new Error(`${label} exceeds ${maximum} bytes`);
  return readFile(file);
}

export function validateQualityJobSemantics(job) {
  const errors = [];
  const gateIds = job.acceptance.gates.map((gate) => gate.id);
  if (new Set(gateIds).size !== gateIds.length) errors.push('acceptance gate IDs must be unique');
  if (!job.acceptance.gates.some((gate) => gate.blocking && gate.kind === 'deterministic')) {
    errors.push('at least one blocking deterministic gate is required');
  }
  for (const gate of job.acceptance.gates) {
    if (!gate.protected) errors.push(`gate ${gate.id} must be protected`);
  }
  const dimensions = job.acceptance.dimensions.map((dimension) => dimension.id);
  if (new Set(dimensions).size !== dimensions.length) errors.push('acceptance dimension IDs must be unique');
  if (!job.review.fresh_context_required) errors.push('fresh-context review must be required');
  if (!job.review.artifact_inspection_required) errors.push('artifact inspection must be required');
  if (!job.authority.external_actions_require_approval) errors.push('external actions must require approval');
  if (job.scheduling.strategy !== 'sequential' && !job.scheduling.integration_owner) {
    errors.push('parallel or mixed scheduling requires an integration owner');
  }
  if (job.scheduling.integration_owner && !job.scheduling.builder_ids.includes(job.scheduling.integration_owner)) {
    errors.push('integration owner must be one of the declared builders');
  }
  if (errors.length > 0) throw new Error(`invalid quality job policy: ${errors.join('; ')}`);
  return job;
}

export async function freezeQualityJob({ qualityId, jobFile, workspace, env = process.env }) {
  validateRunId(qualityId);
  const workspaceReal = await realpath(workspace);
  const safeJobFile = await assertContainedPath(workspaceReal, jobFile, { allowRoot: false });
  const job = JSON.parse(await readFile(safeJobFile, 'utf8'));
  const schema = await readJson(path.join(PROJECT_ROOT, 'schemas', 'quality-job.v1.json'));
  schemaErrors(job, schema, 'quality job');
  if (job.quality_id !== qualityId) throw new Error('quality_id does not match --quality-id');
  validateQualityJobSemantics(job);
  if (path.isAbsolute(job.reference.path) || job.reference.path.split(/[\\/]/).includes('..')) {
    throw new Error('quality reference path must be workspace-relative');
  }
  if (path.isAbsolute(job.baseline.path) || job.baseline.path.split(/[\\/]/).includes('..')) {
    throw new Error('quality baseline path must be workspace-relative');
  }
  const baselinePath = await assertContainedPath(
    workspaceReal,
    path.resolve(workspaceReal, job.baseline.path),
    { allowRoot: false },
  );
  const referencePath = await assertContainedPath(
    workspaceReal,
    path.resolve(workspaceReal, job.reference.path),
    { allowRoot: false },
  );
  const baselineBytes = await readBoundedRegularFile(baselinePath, MAX_QUALITY_ARTIFACT_BYTES, 'quality baseline');
  if (sha256(baselineBytes) !== job.baseline.sha256) throw new Error('quality baseline hash mismatch');
  const referenceBytes = await readBoundedRegularFile(referencePath, MAX_QUALITY_REFERENCE_BYTES, 'quality reference');
  if (sha256(referenceBytes) !== job.reference.sha256) throw new Error('quality reference hash mismatch');
  const directory = qualityDirectory(qualityId, env);
  await claimDirectory(directory, qualityId);
  await ensurePrivateDir(path.join(directory, 'iterations'));
  const now = new Date().toISOString();
  const jobSha256 = sha256(canonicalJson(job));
  const state = {
    version: 'secretary.quality-state/1',
    quality_id: qualityId,
    phase: 'frozen',
    workspace: workspaceReal,
    job_sha256: jobSha256,
    created_at: now,
    updated_at: now,
  };
  await atomicWriteJson(path.join(directory, 'job.json'), job);
  await atomicWrite(path.join(directory, 'baseline.bin'), baselineBytes);
  await atomicWrite(path.join(directory, 'reference.bin'), referenceBytes);
  await atomicWriteJson(path.join(directory, 'state.json'), state);
  return { ...state, state_dir: directory };
}

function iterationDirectory(directory, iteration) {
  if (!Number.isSafeInteger(iteration) || iteration < 1) throw new Error('iteration must be a positive integer');
  return path.join(directory, 'iterations', String(iteration).padStart(4, '0'));
}

async function loadQuality(qualityId, env) {
  const directory = qualityDirectory(qualityId, env);
  const [state, job] = await Promise.all([
    readJson(path.join(directory, 'state.json')),
    readJson(path.join(directory, 'job.json')),
  ]);
  const observed = sha256(canonicalJson(job));
  if (observed !== state.job_sha256) throw new Error('frozen quality job hash mismatch');
  const frozenReference = await readBoundedRegularFile(
    path.join(directory, 'reference.bin'),
    MAX_QUALITY_REFERENCE_BYTES,
    'frozen quality reference',
  );
  if (sha256(frozenReference) !== job.reference.sha256) throw new Error('frozen quality reference hash mismatch');
  const frozenBaseline = await readBoundedRegularFile(
    path.join(directory, 'baseline.bin'),
    MAX_QUALITY_ARTIFACT_BYTES,
    'frozen quality baseline',
  );
  if (sha256(frozenBaseline) !== job.baseline.sha256) throw new Error('frozen quality baseline hash mismatch');
  return { directory, state, job };
}

async function verifiedPacket(currentDirectory, { allowMissing = false } = {}) {
  let packet;
  try {
    packet = await readJson(path.join(currentDirectory, 'packet.json'));
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  }
  const commitment = await readJson(path.join(currentDirectory, 'packet-commitment.json'));
  if (commitment.quality_id !== packet.quality_id || commitment.iteration !== packet.iteration) {
    throw new Error('quality packet commitment binding mismatch');
  }
  if (commitment.packet_sha256 !== sha256(canonicalJson(packet))) throw new Error('quality packet commitment mismatch');
  return packet;
}

export async function createQualityPacket({ qualityId, iteration, artifactFile, builderId, env = process.env }) {
  const { directory, state, job } = await loadQuality(qualityId, env);
  if (!job.scheduling.builder_ids.includes(builderId)) throw new Error('builder-id must name a declared builder');
  if (iteration > job.budget.max_iterations) throw new Error('iteration exceeds frozen maximum');
  const currentDirectory = iterationDirectory(directory, iteration);
  if (iteration > 1) {
    const priorDirectory = iterationDirectory(directory, iteration - 1);
    const priorReview = await verifiedStoredReview(priorDirectory);
    if (!priorReview) throw new Error('previous iteration requires a registered review');
    const priorStatus = await qualityStatus({ qualityId, env });
    if (priorStatus.terminal) throw new Error(`quality job is terminal: ${priorStatus.outcome}`);
  }
  const safeArtifact = await assertContainedPath(state.workspace, artifactFile, { allowRoot: false });
  const artifact = await readBoundedRegularFile(safeArtifact, MAX_QUALITY_ARTIFACT_BYTES, 'quality artifact');
  const packet = {
    version: 'secretary.quality-packet/1',
    quality_id: qualityId,
    iteration,
    builder_id: builderId,
    job_sha256: state.job_sha256,
    baseline_artifact: {
      sha256: job.baseline.sha256,
      frozen_file: path.join(directory, 'baseline.bin'),
    },
    reference_artifact: {
      sha256: job.reference.sha256,
      frozen_file: path.join(directory, 'reference.bin'),
    },
    artifact: {
      path: path.relative(state.workspace, safeArtifact),
      sha256: sha256(artifact),
      bytes: artifact.length,
      frozen_file: path.join(currentDirectory, 'artifact.bin'),
    },
    required_gate_ids: job.acceptance.gates.map((gate) => gate.id),
    required_dimension_ids: job.acceptance.dimensions.map((dimension) => dimension.id),
    review_policy: job.review,
    created_at: new Date().toISOString(),
  };
  await claimDirectory(currentDirectory, `${qualityId} iteration ${iteration}`);
  await atomicWrite(path.join(currentDirectory, 'artifact.bin'), artifact);
  await atomicWriteJson(path.join(currentDirectory, 'packet.json'), packet);
  await atomicWriteJson(path.join(currentDirectory, 'packet-commitment.json'), {
    version: 'secretary.quality-packet-commitment/1',
    quality_id: qualityId,
    iteration,
    packet_sha256: sha256(canonicalJson(packet)),
  });
  await atomicWriteJson(path.join(directory, 'state.json'), {
    ...state,
    phase: 'awaiting_review',
    updated_at: new Date().toISOString(),
  });
  return { ...packet, packet_file: path.join(currentDirectory, 'packet.json') };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function validateQualityReviewSemantics(review, packet, job) {
  const errors = [];
  if (review.quality_id !== packet.quality_id) errors.push('quality_id does not match packet');
  if (review.iteration !== packet.iteration) errors.push('iteration does not match packet');
  if (review.job_sha256 !== packet.job_sha256) errors.push('job_sha256 does not match packet');
  if (review.baseline_artifact_sha256 !== packet.baseline_artifact.sha256) errors.push('baseline_artifact_sha256 does not match packet');
  if (review.reference_artifact_sha256 !== packet.reference_artifact.sha256) errors.push('reference_artifact_sha256 does not match packet');
  if (review.artifact_sha256 !== packet.artifact.sha256) errors.push('artifact_sha256 does not match packet');
  if (review.reviewer.was_builder) errors.push('builder cannot sign off its own artifact');
  if (job.scheduling.builder_ids.includes(review.reviewer.id)) errors.push('declared builder cannot be the reviewer');
  if (job.review.fresh_context_required && !review.reviewer.fresh_context) errors.push('fresh-context reviewer is required');
  if (job.review.artifact_inspection_required && !review.artifact_inspected) errors.push('artifact inspection is required');
  if (job.review.artifact_inspection_required && !review.baseline_artifact_inspected) errors.push('baseline artifact inspection is required');
  if (job.review.artifact_inspection_required && !review.reference_artifact_inspected) errors.push('reference artifact inspection is required');
  if (job.review.blind_order_required && !review.blind_order.performed) errors.push('blind-order review is required');
  if (review.blind_order.performed && !review.blind_order.order_id) errors.push('performed blind-order review requires an order_id');
  if (!review.blind_order.performed && review.blind_order.order_id !== null) errors.push('unperformed blind-order review requires a null order_id');
  const expectedGates = sortedUnique(packet.required_gate_ids);
  const observedGates = sortedUnique(review.gates.map((gate) => gate.id));
  if (canonicalJson(expectedGates) !== canonicalJson(observedGates)) errors.push('review must report every gate exactly once');
  if (review.gates.length !== observedGates.length) errors.push('review gate IDs must be unique');
  const expectedDimensions = sortedUnique(packet.required_dimension_ids);
  const observedDimensions = sortedUnique(review.dimensions.map((dimension) => dimension.id));
  const observedBaselineDimensions = sortedUnique(review.baseline_dimensions.map((dimension) => dimension.id));
  if (canonicalJson(expectedDimensions) !== canonicalJson(observedDimensions)) errors.push('review must score every dimension exactly once');
  if (review.dimensions.length !== observedDimensions.length) errors.push('review dimension IDs must be unique');
  if (canonicalJson(expectedDimensions) !== canonicalJson(observedBaselineDimensions)) errors.push('review must score every baseline dimension exactly once');
  if (review.baseline_dimensions.length !== observedBaselineDimensions.length) errors.push('review baseline dimension IDs must be unique');
  const gateById = new Map(review.gates.map((gate) => [gate.id, gate]));
  const dimensionById = new Map(review.dimensions.map((dimension) => [dimension.id, dimension]));
  const baselineDimensionById = new Map(review.baseline_dimensions.map((dimension) => [dimension.id, dimension]));
  if (
    expectedDimensions.length === observedDimensions.length
    && expectedDimensions.every((id, index) => id === observedDimensions[index])
    && expectedDimensions.length === observedBaselineDimensions.length
    && expectedDimensions.every((id, index) => id === observedBaselineDimensions[index])
  ) {
    const totalWeight = job.acceptance.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    const computedScore = job.acceptance.dimensions.reduce(
      (sum, dimension) => sum + dimensionById.get(dimension.id).score * dimension.weight,
      0,
    ) / totalWeight;
    if (Math.abs(computedScore - review.overall_score) > 0.000001) {
      errors.push(`overall_score must equal the frozen weighted dimension score ${computedScore}`);
    }
    const computedBaselineScore = job.acceptance.dimensions.reduce(
      (sum, dimension) => sum + baselineDimensionById.get(dimension.id).score * dimension.weight,
      0,
    ) / totalWeight;
    if (Math.abs(computedBaselineScore - review.baseline_overall_score) > 0.000001) {
      errors.push(`baseline_overall_score must equal the frozen weighted dimension score ${computedBaselineScore}`);
    }
  }
  for (const gate of review.gates) {
    const jobGate = job.acceptance.gates.find((candidate) => candidate.id === gate.id);
    if (jobGate?.kind === 'deterministic') {
      if (gate.status === 'not_run' && gate.exit_code !== null) errors.push(`not-run deterministic gate ${gate.id} requires a null exit_code`);
      if (gate.status !== 'not_run' && !Number.isInteger(gate.exit_code)) errors.push(`deterministic gate ${gate.id} requires an integer exit_code`);
      if (gate.status === 'passed' && gate.exit_code !== 0) errors.push(`passed deterministic gate ${gate.id} requires exit_code 0`);
      if (gate.status === 'failed' && gate.exit_code === 0) errors.push(`failed deterministic gate ${gate.id} cannot use exit_code 0`);
    } else if (gate.exit_code !== null) {
      errors.push(`non-deterministic gate ${gate.id} requires a null exit_code`);
    }
  }
  if (review.resource_usage.minutes <= 0) errors.push('performed review requires positive declared minutes');
  const blockingPassed = job.acceptance.gates
    .filter((gate) => gate.blocking)
    .every((gate) => gateById.get(gate.id)?.status === 'passed');
  const thresholdPassed = review.overall_score >= job.acceptance.minimum_score;
  if (review.outcome === 'passed' && (!blockingPassed || !thresholdPassed || review.regressions.length > 0)) {
    errors.push('passed requires all blocking gates, the score threshold, and no regressions');
  }
  if (errors.length > 0) throw new Error(`invalid quality review policy: ${errors.join('; ')}`);
  return review;
}

export async function registerQualityReview({ qualityId, iteration, reviewFile, env = process.env }) {
  const { directory, state, job } = await loadQuality(qualityId, env);
  const currentDirectory = iterationDirectory(directory, iteration);
  const packet = await verifiedPacket(currentDirectory);
  const review = JSON.parse(await readFile(reviewFile, 'utf8'));
  const schema = await readJson(path.join(PROJECT_ROOT, 'schemas', 'quality-review-result.v1.json'));
  schemaErrors(review, schema, 'quality review');
  validateQualityReviewSemantics(review, packet, job);
  const evidenceManifest = [];
  const frozenByHash = new Map();
  let evidenceFiles = 0;
  let evidenceBytes = 0;
  for (const gate of review.gates) {
    if (gate.status !== 'not_run' && gate.evidence.artifacts.length === 0) {
      throw new Error(`gate ${gate.id} requires at least one evidence artifact`);
    }
    const jobGate = job.acceptance.gates.find((candidate) => candidate.id === gate.id);
    if (
      jobGate.kind === 'deterministic'
      && gate.status !== 'not_run'
      && !gate.evidence.artifacts.some((artifact) => ['test_output', 'trace'].includes(artifact.kind))
    ) {
      throw new Error(`deterministic gate ${gate.id} requires test_output or trace evidence`);
    }
    for (const artifact of gate.evidence.artifacts) {
      evidenceFiles += 1;
      if (evidenceFiles > MAX_QUALITY_EVIDENCE_FILES) {
        throw new Error(`quality review evidence exceeds ${MAX_QUALITY_EVIDENCE_FILES} files`);
      }
      if (path.isAbsolute(artifact.path) || artifact.path.split(/[\\/]/).includes('..')) {
        throw new Error(`gate evidence path must be workspace-relative: ${artifact.path}`);
      }
      const safePath = await assertContainedPath(state.workspace, path.resolve(state.workspace, artifact.path), { allowRoot: false });
      const bytes = await readBoundedRegularFile(safePath, MAX_QUALITY_EVIDENCE_FILE_BYTES, `gate evidence ${artifact.path}`);
      evidenceBytes += bytes.length;
      if (evidenceBytes > MAX_QUALITY_EVIDENCE_TOTAL_BYTES) {
        throw new Error(`quality review evidence exceeds ${MAX_QUALITY_EVIDENCE_TOTAL_BYTES} total bytes`);
      }
      const observedHash = sha256(bytes);
      if (observedHash !== artifact.sha256) throw new Error(`gate evidence hash mismatch: ${artifact.path}`);
      const frozenFile = path.join('evidence', observedHash);
      evidenceManifest.push({
        gate_id: gate.id,
        kind: artifact.kind,
        path: path.relative(state.workspace, safePath),
        sha256: observedHash,
        bytes: bytes.length,
        frozen_file: frozenFile,
      });
      if (!frozenByHash.has(observedHash)) frozenByHash.set(observedHash, bytes);
    }
  }
  await claimReview(path.join(currentDirectory, 'review.claim'), iteration);
  const storedEvidenceManifest = {
    version: 'secretary.quality-review-evidence/1',
    quality_id: qualityId,
    iteration,
    entries: evidenceManifest,
  };
  for (const [hash, bytes] of frozenByHash) {
    await atomicWrite(path.join(currentDirectory, 'evidence', hash), bytes);
  }
  await atomicWriteJson(path.join(currentDirectory, 'review-evidence-manifest.json'), storedEvidenceManifest);
  await atomicWriteJson(path.join(currentDirectory, 'review.json'), review);
  await atomicWriteJson(path.join(currentDirectory, 'review-commitment.json'), {
    version: 'secretary.quality-review-commitment/1',
    quality_id: qualityId,
    iteration,
    review_sha256: sha256(canonicalJson(review)),
    evidence_manifest_sha256: sha256(canonicalJson(storedEvidenceManifest)),
  });
  await atomicWriteJson(path.join(directory, 'state.json'), {
    ...state,
    phase: 'reviewed',
    updated_at: new Date().toISOString(),
  });
  return qualityStatus({ qualityId, env });
}

async function verifiedStoredReview(currentDirectory) {
  let review;
  try {
    review = await readJson(path.join(currentDirectory, 'review.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const [commitment, evidenceManifest] = await Promise.all([
    readJson(path.join(currentDirectory, 'review-commitment.json')),
    readJson(path.join(currentDirectory, 'review-evidence-manifest.json')),
  ]);
  if (commitment.quality_id !== review.quality_id || commitment.iteration !== review.iteration) {
    throw new Error('quality review commitment binding mismatch');
  }
  if (evidenceManifest.quality_id !== review.quality_id || evidenceManifest.iteration !== review.iteration) {
    throw new Error('quality review evidence manifest binding mismatch');
  }
  if (commitment.review_sha256 !== sha256(canonicalJson(review))) throw new Error('quality review commitment mismatch');
  if (commitment.evidence_manifest_sha256 !== sha256(canonicalJson(evidenceManifest))) {
    throw new Error('quality review evidence manifest commitment mismatch');
  }
  if (!Array.isArray(evidenceManifest.entries) || evidenceManifest.entries.length > MAX_QUALITY_EVIDENCE_FILES) {
    throw new Error('quality review evidence manifest has an invalid entry count');
  }
  const expectedEvidence = review.gates.flatMap((gate) => gate.evidence.artifacts.map((artifact) => ({
    gate_id: gate.id,
    kind: artifact.kind,
    path: path.normalize(artifact.path),
    sha256: artifact.sha256,
  }))).sort((left, right) => {
    const leftText = canonicalJson(left);
    const rightText = canonicalJson(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
  const observedEvidence = evidenceManifest.entries.map((entry) => ({
    gate_id: entry.gate_id,
    kind: entry.kind,
    path: entry.path,
    sha256: entry.sha256,
  })).sort((left, right) => {
    const leftText = canonicalJson(left);
    const rightText = canonicalJson(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
  if (canonicalJson(expectedEvidence) !== canonicalJson(observedEvidence)) {
    throw new Error('quality review evidence manifest does not match the review');
  }
  let totalBytes = 0;
  for (const entry of evidenceManifest.entries) {
    if (entry.frozen_file !== path.join('evidence', entry.sha256)) {
      throw new Error(`quality review evidence path mismatch: ${entry.path}`);
    }
    const frozenPath = await assertContainedPath(
      currentDirectory,
      path.join(currentDirectory, entry.frozen_file),
      { allowRoot: false },
    );
    const frozen = await readBoundedRegularFile(
      frozenPath,
      MAX_QUALITY_EVIDENCE_FILE_BYTES,
      `frozen gate evidence ${entry.path}`,
    );
    totalBytes += frozen.length;
    if (totalBytes > MAX_QUALITY_EVIDENCE_TOTAL_BYTES) throw new Error('frozen gate evidence exceeds total byte limit');
    if (entry.bytes !== frozen.length) throw new Error(`frozen gate evidence byte count mismatch: ${entry.path}`);
    if (sha256(frozen) !== entry.sha256) throw new Error(`frozen gate evidence hash mismatch: ${entry.path}`);
  }
  return review;
}

function plateauReached(scores, window, minimumDelta) {
  if (scores.length < window + 1) return false;
  const recent = scores.slice(-(window + 1));
  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index] - recent[index - 1] >= minimumDelta) return false;
  }
  return true;
}

export async function qualityStatus({ qualityId, env = process.env }) {
  const { directory, state, job } = await loadQuality(qualityId, env);
  const reviewSchema = await readJson(path.join(PROJECT_ROOT, 'schemas', 'quality-review-result.v1.json'));
  const reviews = [];
  for (let iteration = 1; iteration <= job.budget.max_iterations; iteration += 1) {
    const currentDirectory = iterationDirectory(directory, iteration);
    const packet = await verifiedPacket(currentDirectory, { allowMissing: true });
    if (!packet) break;
    if (packet.iteration !== iteration || packet.job_sha256 !== state.job_sha256) {
      throw new Error(`quality packet binding mismatch at iteration ${iteration}`);
    }
    const frozenArtifact = await readBoundedRegularFile(
      path.join(currentDirectory, 'artifact.bin'),
      MAX_QUALITY_ARTIFACT_BYTES,
      `frozen quality artifact ${iteration}`,
    );
    if (sha256(frozenArtifact) !== packet.artifact.sha256) throw new Error(`frozen quality artifact hash mismatch at iteration ${iteration}`);
    const review = await verifiedStoredReview(currentDirectory);
    if (!review) break;
    schemaErrors(review, reviewSchema, `stored quality review ${iteration}`);
    validateQualityReviewSemantics(review, packet, job);
    reviews.push(review);
  }
  const usage = reviews.reduce((total, review) => ({
    minutes: total.minutes + review.resource_usage.minutes,
    tokens: total.tokens + review.resource_usage.tokens,
    cost_usd: Number((total.cost_usd + review.resource_usage.cost_usd).toFixed(6)),
  }), { minutes: 0, tokens: 0, cost_usd: 0 });
  const latest = reviews.at(-1) || null;
  const improvement = latest ? latest.overall_score - latest.baseline_overall_score : null;
  let outcome = state.phase === 'awaiting_review' ? 'awaiting_review' : reviews.length === 0 ? 'ready_for_artifact' : 'ready_for_next_iteration';
  let stopReason = null;
  let terminal = false;
  const budgetExceeded = reviews.length > job.budget.max_iterations
    || usage.minutes > job.budget.max_minutes
    || usage.tokens > job.budget.max_tokens
    || usage.cost_usd > job.budget.max_cost_usd;
  const budgetReached = reviews.length >= job.budget.max_iterations
    || usage.minutes >= job.budget.max_minutes
    || usage.tokens >= job.budget.max_tokens
    || (job.budget.max_cost_usd > 0 && usage.cost_usd >= job.budget.max_cost_usd);
  if (budgetExceeded) {
    outcome = 'budget_stopped';
    stopReason = 'resource_ceiling_exceeded';
    terminal = true;
  } else if (latest?.outcome === 'passed') {
    outcome = 'needs_human_decision';
    stopReason = 'declared_acceptance_requires_human';
    terminal = true;
  } else if (latest?.outcome === 'inconclusive') {
    outcome = 'inconclusive';
    stopReason = 'review_inconclusive';
    terminal = true;
  } else if (latest?.outcome === 'needs_human_decision') {
    outcome = 'needs_human_decision';
    stopReason = 'human_adjudication_required';
    terminal = true;
  } else if (latest && job.stop.stop_on_regression && latest.regressions.length > 0) {
    outcome = improvement >= job.stop.minimum_score_delta ? 'improved_not_passed' : 'not_passed';
    stopReason = 'material_regression';
    terminal = true;
  } else if (plateauReached(reviews.map((review) => review.overall_score), job.stop.plateau_window, job.stop.minimum_score_delta)) {
    outcome = improvement >= job.stop.minimum_score_delta ? 'improved_not_passed' : 'not_passed';
    stopReason = 'plateau';
    terminal = true;
  } else if (budgetReached) {
    outcome = 'budget_stopped';
    stopReason = 'resource_ceiling';
    terminal = true;
  }
  return {
    version: 'secretary.quality-status/1',
    quality_id: qualityId,
    phase: state.phase,
    job_sha256: state.job_sha256,
    iterations_reviewed: reviews.length,
    latest_score: latest?.overall_score ?? null,
    baseline_score: latest?.baseline_overall_score ?? null,
    improvement,
    usage,
    reported_review_outcome: latest?.outcome ?? null,
    outcome,
    stop_reason: stopReason,
    terminal,
  };
}
