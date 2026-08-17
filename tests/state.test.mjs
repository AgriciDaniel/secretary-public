import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  canonicalJson,
  createRunState,
  pruneExpiredRuns,
  readJson,
  runDirectory,
  sha256,
  transitionRun,
  verifyAuditChain,
  writeAuditEvent,
} from '../lib/core.mjs';

function request(runId) {
  return {
    run_id: runId,
    backend: 'claude',
    profile_id: 'general-secretary',
    task_file: '/tmp/task.md',
    task_sha256: 'a'.repeat(64),
    workspace: '/tmp',
    prompt_file: '/tmp/prompt.md',
    prompt_sha256: 'b'.repeat(64),
    evidence_manifest_file: '/tmp/evidence-manifest.json',
    evidence_manifest_sha256: 'c'.repeat(64),
    result_schema_file: '/tmp/result-schema.json',
    result_schema_sha256: 'd'.repeat(64),
    created_at: new Date().toISOString(),
  };
}

test('run-state transitions are explicit and private', async () => {
  const xdg = await mkdtemp(path.join(tmpdir(), 'secretary-state-'));
  const env = { ...process.env, XDG_STATE_HOME: xdg };
  const runId = 'state-0001';
  const created = await createRunState(request(runId), env);
  assert.equal((await stat(created.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(created.directory, 'state.json'))).mode & 0o777, 0o600);
  await transitionRun(runId, 'preflighting', {}, env);
  await transitionRun(runId, 'running', { pid: 10, pgid: 10 }, env);
  const succeeded = await transitionRun(runId, 'succeeded', { pid: null, pgid: null }, env);
  assert.equal(succeeded.phase, 'succeeded');
  assert.equal(succeeded.revision, 3);
  await assert.rejects(() => transitionRun(runId, 'running', {}, env), /invalid run-state transition/);
  assert.equal((await readJson(path.join(runDirectory(runId, env), 'state.json'))).phase, 'succeeded');
  assert.ok((await readFile(path.join(created.directory, 'state.json'), 'utf8')).endsWith('\n'));
});

test('approval run-state transitions reject illegal lifecycle jumps', async () => {
  const xdg = await mkdtemp(path.join(tmpdir(), 'secretary-approval-state-'));
  const env = { ...process.env, XDG_STATE_HOME: xdg };
  const runId = 'approval-state-0001';
  await createRunState(request(runId), env);
  await assert.rejects(() => transitionRun(runId, 'approved', {}, env), /prepared to approved/);
  await transitionRun(runId, 'preflighting', {}, env);
  await transitionRun(runId, 'running', { pid: 10, pgid: 10 }, env);
  await assert.rejects(() => transitionRun(runId, 'executing', {}, env), /running to executing/);
  await transitionRun(runId, 'awaiting_approval', { pid: null, pgid: null }, env);
  await assert.rejects(() => transitionRun(runId, 'executed', {}, env), /awaiting_approval to executed/);
  await transitionRun(runId, 'approved', {}, env);
  await assert.rejects(() => transitionRun(runId, 'executed', {}, env), /approved to executed/);
  await transitionRun(runId, 'executing', {}, env);
  await assert.rejects(() => transitionRun(runId, 'expired', {}, env), /executing to expired/);
  await transitionRun(runId, 'executed', {}, env);
  await assert.rejects(() => transitionRun(runId, 'running', {}, env), /executed to running/);

  const expiringRunId = 'approval-state-0002';
  await createRunState(request(expiringRunId), env);
  await transitionRun(expiringRunId, 'preflighting', {}, env);
  await transitionRun(expiringRunId, 'running', { pid: 11, pgid: 11 }, env);
  await transitionRun(expiringRunId, 'awaiting_approval', { pid: null, pgid: null }, env);
  await transitionRun(expiringRunId, 'approved', {}, env);
  await transitionRun(expiringRunId, 'expired', {}, env);
  await assert.rejects(() => transitionRun(expiringRunId, 'executing', {}, env), /expired to executing/);
});

test('an expected revision permits exactly one concurrent state consumer', async () => {
  const xdg = await mkdtemp(path.join(tmpdir(), 'secretary-revision-race-'));
  const env = { ...process.env, XDG_STATE_HOME: xdg };
  const runId = 'revision-race-0001';
  await createRunState(request(runId), env);
  await transitionRun(runId, 'preflighting', {}, env);
  await transitionRun(runId, 'running', { pid: 10, pgid: 10 }, env);
  await transitionRun(runId, 'awaiting_approval', { pid: null, pgid: null }, env);
  const approved = await transitionRun(runId, 'approved', {}, env);
  const attempts = await Promise.allSettled(
    Array.from({ length: 16 }, () => transitionRun(runId, 'executing', {}, env, approved.revision)),
  );
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
  assert.equal(rejected.length, 15);
  assert.ok(rejected.every((attempt) => attempt.reason.code === 'revision_conflict'));
  const state = await readJson(path.join(runDirectory(runId, env), 'state.json'));
  assert.equal(state.phase, 'executing');
  assert.equal(state.revision, approved.revision + 1);
});

test('audit chain verifies intact events and locates a tampered middle link', async () => {
  const xdg = await mkdtemp(path.join(tmpdir(), 'secretary-audit-chain-'));
  const env = { ...process.env, XDG_STATE_HOME: xdg };
  const runId = 'audit-chain-0001';
  await createRunState(request(runId), env);
  const first = await writeAuditEvent(runId, 'prepared', 'controller', 'prepared', null, env);
  const second = await writeAuditEvent(runId, 'preflight_passed', 'controller', 'preflight passed', null, env);
  await writeAuditEvent(runId, 'spawned', 'controller', 'spawned', { pid: 10 }, env);
  assert.equal(first.prev_event_sha256, null);
  assert.equal(second.prev_event_sha256, sha256(canonicalJson(first)));
  assert.deepEqual(await verifyAuditChain(runId, env), { ok: true, brokenAt: null });

  const eventsDirectory = path.join(runDirectory(runId, env), 'events');
  const eventFiles = (await readdir(eventsDirectory)).filter((name) => name.endsWith('.json')).sort();
  const middleFile = path.join(eventsDirectory, eventFiles[1]);
  const middle = await readJson(middleFile);
  middle.details.message = 'tampered';
  await writeFile(middleFile, `${JSON.stringify(middle, null, 2)}\n`);
  assert.deepEqual(await verifyAuditChain(runId, env), { ok: false, brokenAt: 2 });
});

test('run-state retention removes only runs older than 30 days', async () => {
  const xdg = await mkdtemp(path.join(tmpdir(), 'secretary-retention-'));
  const env = { ...process.env, XDG_STATE_HOME: xdg };
  await createRunState(request('expired-001'), env);
  await createRunState(request('current-001'), env);
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  await utimes(runDirectory('expired-001', env), old, old);
  assert.deepEqual(await pruneExpiredRuns(env), ['expired-001']);
  await assert.rejects(() => access(runDirectory('expired-001', env)), /ENOENT/);
  await access(runDirectory('current-001', env));
});
