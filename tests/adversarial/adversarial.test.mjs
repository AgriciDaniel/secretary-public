import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  governedProfiles,
  postCaseStopReason,
  profileForCaseIndex,
  reportedCostStopReason,
} from './live.mjs';

const execFileAsync = promisify(execFile);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..', '..');
const corpusFile = path.join(testDirectory, 'corpus.json');
const liveHarness = path.join(testDirectory, 'live.mjs');

async function corpusText() {
  return readFile(corpusFile, 'utf8');
}

test('adversarial corpus is diverse, deterministic, and contract complete', async () => {
  const raw = await corpusText();
  const corpus = JSON.parse(raw);
  assert.equal(corpus.schema_version, 'secretary.adversarial-corpus/1');
  assert.ok(Array.isArray(corpus.cases));
  assert.ok(corpus.cases.length >= 30, `expected at least 30 cases, got ${corpus.cases.length}`);

  const expectedKeys = [
    'category',
    'expected_approval_request',
    'expected_approvals_used',
    'expected_effective_authority',
    'expected_observed_injection',
    'forbidden_marker',
    'id',
    'payload',
    'safe_fact',
    'title',
  ];
  const ids = new Set();
  const markers = new Set();
  const categories = new Map();

  for (const entry of corpus.cases) {
    assert.deepEqual(Object.keys(entry).sort(), expectedKeys, `${entry.id || '<missing id>'} has an unexpected shape`);
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)+$/);
    assert.match(entry.category, /^[a-z][a-z0-9_]+$/);
    assert.ok(entry.title.length >= 8);
    assert.ok(entry.payload.length >= 60);
    assert.match(entry.forbidden_marker, /^ADVINJ-[A-Z][0-9]{2}-[A-Z]+$/);
    assert.ok(entry.safe_fact.includes(entry.id), `${entry.id} safe fact must identify its case`);
    assert.equal(entry.expected_observed_injection, true);
    assert.deepEqual(entry.expected_effective_authority, []);
    assert.deepEqual(entry.expected_approvals_used, []);
    assert.equal(entry.expected_approval_request, null);
    assert.equal(ids.has(entry.id), false, `duplicate case id ${entry.id}`);
    assert.equal(markers.has(entry.forbidden_marker), false, `duplicate marker ${entry.forbidden_marker}`);
    ids.add(entry.id);
    markers.add(entry.forbidden_marker);
    categories.set(entry.category, (categories.get(entry.category) || 0) + 1);
  }

  assert.ok(categories.size >= 10, `expected at least 10 categories, got ${categories.size}`);
  for (const [category, count] of categories) {
    assert.ok(count >= 3, `category ${category} needs at least 3 cases, got ${count}`);
  }
  assert.equal(raw.includes('\u2014'), false, 'corpus contains an em dash');
});

test('live adversarial harness is fail closed when the spend flag is absent', async () => {
  const env = { ...process.env };
  delete env.SECRETARY_LIVE_ADVERSARIAL;
  delete env.NODE_TEST_CONTEXT;
  delete env.npm_lifecycle_event;
  env.SECRETARY_CLAUDE_BIN = path.join(testDirectory, 'must-not-be-invoked');
  await assert.rejects(
    execFileAsync(process.execPath, [liveHarness], {
      cwd: projectRoot,
      env,
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      assert.match(error.stderr, /requires SECRETARY_LIVE_ADVERSARIAL=1/);
      assert.doesNotMatch(error.stderr, /must-not-be-invoked/);
      return true;
    },
  );
});

test('live plan rotates every backend across all five governed profiles', () => {
  assert.deepEqual(
    Array.from({ length: governedProfiles.length }, (_, index) => profileForCaseIndex(index)),
    [...governedProfiles],
  );
  assert.equal(profileForCaseIndex(governedProfiles.length), governedProfiles[0]);
  assert.throws(() => profileForCaseIndex(-1), /non-negative integer/);
});

test('reported USD ceiling stops before another case and missing Claude USD fails closed', () => {
  assert.equal(reportedCostStopReason({
    cumulativeReportedCostUsd: 0.5,
    reportedUsdCeiling: 0.5,
    claudeCostReportingUnavailable: false,
  }), 'reported_usd_ceiling_reached');
  assert.equal(reportedCostStopReason({
    cumulativeReportedCostUsd: 0.49,
    reportedUsdCeiling: 0.5,
    claudeCostReportingUnavailable: true,
  }), 'claude_reported_usd_unavailable');
  assert.equal(reportedCostStopReason({
    cumulativeReportedCostUsd: 0.49,
    reportedUsdCeiling: 0.5,
    claudeCostReportingUnavailable: false,
  }), null);
});

test('post-case controls fail fast and expose a final-case reported USD overshoot', () => {
  const baseline = {
    resultPassed: true,
    completedRecords: 5,
    plannedRuns: 5,
    cumulativeReportedCostUsd: 0.49,
    reportedUsdCeiling: 0.5,
    claudeCostReportingUnavailable: false,
  };
  assert.equal(postCaseStopReason({ ...baseline, resultPassed: false }), 'case_failed');
  assert.equal(postCaseStopReason({
    ...baseline,
    claudeCostReportingUnavailable: true,
  }), 'claude_reported_usd_unavailable');
  assert.equal(postCaseStopReason({
    ...baseline,
    cumulativeReportedCostUsd: 0.51,
  }), 'reported_usd_ceiling_exceeded');
  assert.equal(postCaseStopReason({
    ...baseline,
    completedRecords: 4,
    cumulativeReportedCostUsd: 0.5,
  }), 'reported_usd_ceiling_reached');
  assert.equal(postCaseStopReason({
    ...baseline,
    cumulativeReportedCostUsd: 0.5,
  }), null);
});

test('live harness requires an explicit reported USD ceiling before any backend call', async () => {
  const env = {
    ...process.env,
    SECRETARY_LIVE_ADVERSARIAL: '1',
    SECRETARY_LIVE_ADVERSARIAL_BACKENDS: 'claude',
    SECRETARY_LIVE_ADVERSARIAL_MAX_CASES: '5',
    SECRETARY_CLAUDE_BIN: path.join(testDirectory, 'must-not-be-invoked'),
  };
  delete env.SECRETARY_LIVE_ADVERSARIAL_MAX_REPORTED_COST_USD;
  delete env.NODE_TEST_CONTEXT;
  delete env.npm_lifecycle_event;
  await assert.rejects(
    execFileAsync(process.execPath, [liveHarness], {
      cwd: projectRoot,
      env,
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      assert.match(error.stderr, /SECRETARY_LIVE_ADVERSARIAL_MAX_REPORTED_COST_USD must be an explicit positive decimal number/);
      assert.doesNotMatch(error.stderr, /must-not-be-invoked/);
      return true;
    },
  );
});
