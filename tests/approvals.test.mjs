import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PROJECT_ROOT, readJson, runDirectory, sha256, verifyAuditChain } from '../lib/core.mjs';
import { grantRecordFile } from '../lib/approvals.mjs';

const execFileAsync = promisify(execFile);
const controller = path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs');
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fakeCli = path.join(fixtures, 'fake-cli.mjs');
const approvalId = 'approval-0001';
const content = 'Approved outbound document.\n';

async function harness() {
  const base = await mkdtemp(path.join(tmpdir(), 'secretary-approvals-'));
  const workspace = path.join(base, 'workspace');
  const target = path.join(workspace, 'outbound.txt');
  const contentFile = path.join(workspace, 'approved-content.txt');
  await mkdir(workspace);
  await writeFile(path.join(workspace, 'task.md'), 'Prepare the approved outbound document.\n');
  await writeFile(contentFile, content);
  await chmod(fakeCli, 0o755);
  const env = {
    ...process.env,
    XDG_STATE_HOME: path.join(base, 'state'),
    SECRETARY_CLAUDE_BIN: fakeCli,
    SECRETARY_CODEX_BIN: fakeCli,
    SECRETARY_FAKE_MODE: 'needs-approval',
    SECRETARY_FAKE_ACTION_TARGET: target,
    SECRETARY_FAKE_CONTENT_SHA256: sha256(content),
    SECRETARY_PREFLIGHT_TIMEOUT_MS: '1000',
    SECRETARY_RUN_TIMEOUT_MS: '2000',
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.npm_lifecycle_event;
  return { base, workspace, target, contentFile, env };
}

async function ctl(args, env, expectedFailure = false) {
  try {
    const result = await execFileAsync(process.execPath, [controller, ...args], {
      cwd: PROJECT_ROOT,
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (expectedFailure) assert.fail(`expected failure for ${args.join(' ')}`);
    return { code: 0, ...result };
  } catch (error) {
    if (!expectedFailure) throw error;
    return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function createAwaiting(runId, context) {
  await ctl([
    'prepare',
    '--run-id', runId,
    '--task-file', path.join(context.workspace, 'task.md'),
    '--profile', path.join(PROJECT_ROOT, 'profiles', 'general-secretary.json'),
    '--workspace', context.workspace,
  ], context.env);
  await ctl(['run', '--run-id', runId], context.env);
  return JSON.parse((await ctl(['approvals', 'list', '--run-id', runId, '--json'], context.env)).stdout).approvals[0];
}

async function approve(runId, actionHash, context, extra = []) {
  return ctl([
    'approve',
    '--run-id', runId,
    '--approval-id', approvalId,
    '--non-interactive',
    '--action-sha256', actionHash,
    '--approved-by', 'test-operator',
    ...extra,
  ], context.env);
}

async function eventKinds(runId, env) {
  const events = path.join(runDirectory(runId, env), 'events');
  const files = (await readdir(events)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(files.map(async (name) => (await readJson(path.join(events, name))).kind));
}

test('prepare through approve and execute completes with visible hashes and an intact audit chain', async () => {
  const context = await harness();
  const runId = 'approval-happy-0001';
  const pending = await createAwaiting(runId, context);
  assert.equal(pending.status, 'pending');
  assert.match(pending.action_sha256, /^[a-f0-9]{64}$/);
  assert.equal(pending.grant_sha256, null);
  const humanList = await ctl(['approvals', 'list', '--run-id', runId], context.env);
  assert.match(humanList.stdout, new RegExp(`Action SHA-256: ${pending.action_sha256}`));
  const grant = JSON.parse((await ctl([
    'approve',
    '--run-id', runId,
    '--approval-id', approvalId,
    '--approved-by', 'test-operator',
  ], context.env)).stdout);
  assert.match(grant.grant_sha256, /^[a-f0-9]{64}$/);
  const granted = JSON.parse((await ctl(['approvals', 'list', '--run-id', runId, '--json'], context.env)).stdout).approvals[0];
  assert.equal(granted.action_sha256, pending.action_sha256);
  assert.equal(granted.grant_sha256, grant.grant_sha256);
  assert.ok(Date.parse(granted.expires_at) > Date.now());
  const grantedHumanList = await ctl(['approvals', 'list', '--run-id', runId], context.env);
  assert.match(grantedHumanList.stdout, new RegExp(`Grant SHA-256: ${grant.grant_sha256}`));
  const executed = JSON.parse((await ctl([
    'execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile,
  ], context.env)).stdout);
  assert.equal(executed.phase, 'executed');
  assert.equal(await readFile(context.target, 'utf8'), content);
  assert.deepEqual(await verifyAuditChain(runId, context.env), { ok: true, brokenAt: null });
  const kinds = await eventKinds(runId, context.env);
  assert.ok(kinds.indexOf('approval_granted') < kinds.indexOf('approval_used'));
  assert.ok(kinds.indexOf('approval_used') < kinds.indexOf('approval_executed'));
});

test('a consumed grant cannot be replayed', async () => {
  const context = await harness();
  const runId = 'approval-replay-001';
  const pending = await createAwaiting(runId, context);
  await approve(runId, pending.action_sha256, context);
  await ctl(['execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile], context.env);
  const replay = await ctl(
    ['execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile],
    context.env,
    true,
  );
  assert.match(replay.stderr, /^already_consumed:/);
});

test('a grant copied from another run fails integrity verification', async () => {
  const context = await harness();
  const runA = 'approval-cross-a01';
  const runB = 'approval-cross-b01';
  const pendingA = await createAwaiting(runA, context);
  const pendingB = await createAwaiting(runB, context);
  await approve(runA, pendingA.action_sha256, context);
  await approve(runB, pendingB.action_sha256, context);
  await writeFile(
    grantRecordFile(runB, approvalId, context.env),
    await readFile(grantRecordFile(runA, approvalId, context.env)),
  );
  const replay = await ctl(
    ['execute', '--run-id', runB, '--approval-id', approvalId, '--content-file', context.contentFile],
    context.env,
    true,
  );
  assert.match(replay.stderr, /^grant_integrity_failed:/);
});

test('an expired grant fails closed and records approval_expired', async () => {
  const context = await harness();
  const runId = 'approval-expired-01';
  const pending = await createAwaiting(runId, context);
  await approve(runId, pending.action_sha256, context, ['--expires-in', '0']);
  const expired = await ctl(
    ['execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile],
    context.env,
    true,
  );
  assert.match(expired.stderr, /^approval_expired:/);
  assert.equal((await readJson(path.join(runDirectory(runId, context.env), 'state.json'))).phase, 'expired');
  assert.ok((await eventKinds(runId, context.env)).includes('approval_expired'));
});

test('a byte change in the grant record fails HMAC verification', async () => {
  const context = await harness();
  const runId = 'approval-tamper-001';
  const pending = await createAwaiting(runId, context);
  await approve(runId, pending.action_sha256, context);
  const grantFile = grantRecordFile(runId, approvalId, context.env);
  const stored = await readFile(grantFile, 'utf8');
  assert.match(stored, /test-operator/);
  await writeFile(grantFile, stored.replace('test-operator', 'best-operator'));
  const tampered = await ctl(
    ['execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile],
    context.env,
    true,
  );
  assert.match(tampered.stderr, /^grant_integrity_failed:/);
});

test('a wrong non-interactive confirmation hash fails before approval', async () => {
  const context = await harness();
  const wrongHashRun = 'approval-wrong-hash';
  await createAwaiting(wrongHashRun, context);
  const wrongHash = await ctl([
    'approve',
    '--run-id', wrongHashRun,
    '--approval-id', approvalId,
    '--non-interactive',
    '--action-sha256', '0'.repeat(64),
  ], context.env, true);
  assert.match(wrongHash.stderr, /^grant_mismatch:/);
  const missingGuard = await ctl([
    'approve',
    '--run-id', wrongHashRun,
    '--approval-id', approvalId,
    '--non-interactive',
  ], context.env, true);
  assert.match(missingGuard.stderr, /^grant_mismatch:/);
  assert.equal((await readJson(path.join(runDirectory(wrongHashRun, context.env), 'state.json'))).phase, 'awaiting_approval');
});

test('content mismatch leaves the valid grant unconsumed', async () => {
  const context = await harness();
  const runId = 'approval-content-001';
  const pending = await createAwaiting(runId, context);
  await approve(runId, pending.action_sha256, context);
  const wrongContent = path.join(context.workspace, 'wrong.txt');
  await writeFile(wrongContent, 'Wrong content.\n');
  const mismatch = await ctl(
    ['execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', wrongContent],
    context.env,
    true,
  );
  assert.match(mismatch.stderr, /^content_mismatch:/);
  assert.equal((await readJson(path.join(runDirectory(runId, context.env), 'state.json'))).phase, 'approved');
});

test('concurrent execute attempts produce exactly one adapter winner', async () => {
  const context = await harness();
  const runId = 'approval-race-0001';
  const pending = await createAwaiting(runId, context);
  await approve(runId, pending.action_sha256, context);
  const attempts = await Promise.all(Array.from({ length: 12 }, async () => {
    try {
      const result = await ctl([
        'execute', '--run-id', runId, '--approval-id', approvalId, '--content-file', context.contentFile,
      ], context.env);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error };
    }
  }));
  assert.equal(attempts.filter((attempt) => attempt.ok).length, 1);
  assert.equal(await readFile(context.target, 'utf8'), content);
  assert.equal((await readJson(path.join(runDirectory(runId, context.env), 'state.json'))).phase, 'executed');
});

test('deny requires a reason and a recorded denial is terminal', async () => {
  const context = await harness();
  const runId = 'approval-deny-0001';
  await createAwaiting(runId, context);
  const missing = await ctl(['deny', '--run-id', runId, '--approval-id', approvalId], context.env, true);
  assert.match(missing.stderr, /missing required option: --reason/);
  const denied = JSON.parse((await ctl([
    'deny', '--run-id', runId, '--approval-id', approvalId, '--reason', 'Principal declined the action.',
  ], context.env)).stdout);
  assert.equal(denied.phase, 'cancelled');
  const approveAfterDenial = await ctl(
    ['approve', '--run-id', runId, '--approval-id', approvalId],
    context.env,
    true,
  );
  assert.match(approveAfterDenial.stderr, /^no_such_approval:/);
  assert.ok((await eventKinds(runId, context.env)).includes('approval_denied'));
});
