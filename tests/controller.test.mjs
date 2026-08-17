import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PROJECT_ROOT, readJson, runDirectory, sha256 } from '../lib/core.mjs';

const execFileAsync = promisify(execFile);
const controller = path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs');
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fakeCli = path.join(fixtures, 'fake-cli.mjs');

async function harness(mode = 'success') {
  const base = await mkdtemp(path.join(tmpdir(), 'secretary-controller-'));
  const workspace = path.join(base, 'workspace');
  await mkdir(workspace);
  await writeFile(path.join(workspace, 'task.md'), 'Prepare the outbound document.\n');
  await chmod(fakeCli, 0o755);
  const env = {
    ...process.env,
    XDG_STATE_HOME: path.join(base, 'state'),
    SECRETARY_CLAUDE_BIN: fakeCli,
    SECRETARY_CODEX_BIN: fakeCli,
    SECRETARY_FAKE_MODE: mode,
    SECRETARY_PREFLIGHT_TIMEOUT_MS: '1000',
    SECRETARY_RUN_TIMEOUT_MS: '2000',
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.npm_lifecycle_event;
  return { base, workspace, env };
}

async function ctl(args, env, expectedFailure = false) {
  try {
    const result = await execFileAsync(process.execPath, [controller, ...args], { cwd: PROJECT_ROOT, env, maxBuffer: 10 * 1024 * 1024 });
    if (expectedFailure) assert.fail(`expected failure for ${args.join(' ')}`);
    return { code: 0, ...result };
  } catch (error) {
    if (!expectedFailure) throw error;
    return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function prepare(runId, profile, context, backend) {
  const args = [
    'prepare', '--run-id', runId,
    '--task-file', path.join(context.workspace, 'task.md'),
    '--profile', path.join(PROJECT_ROOT, 'profiles', profile),
    '--workspace', context.workspace,
  ];
  if (backend) args.push('--backend', backend);
  return ctl(args, context.env);
}

async function waitForPhase(runId, env, phases, timeoutMs = 3000) {
  const stateFile = path.join(runDirectory(runId, env), 'state.json');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const state = await readJson(stateFile);
      if (phases.includes(state.phase)) return state;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for phases ${phases.join(', ')}`);
}

test('preflight actively spawns and validates both backend adapters', async () => {
  const context = await harness();
  const claude = await ctl(['preflight', '--backend', 'claude', '--json'], context.env);
  assert.equal(JSON.parse(claude.stdout).ok, true);
  const codex = await ctl(['preflight', '--backend', 'codex'], context.env);
  assert.equal(JSON.parse(codex.stdout).ok, true);
});

test('preflight missing-backend error lists valid values', async () => {
  const context = await harness();
  const failed = await ctl(['preflight', '--json'], context.env, true);
  assert.match(failed.stderr, /--backend \(valid: claude, codex\)/);
});

test('failed preflight names both exact Codex grants', async () => {
  const context = await harness('preflight-fail');
  const failed = await ctl(['preflight', '--backend', 'claude'], context.env, true);
  assert.match(failed.stderr, /-c sandbox_workspace_write\.network_access=true/);
  assert.match(failed.stderr, /-c 'sandbox_workspace_write\.writable_roots=\[".+"\]'/);
});

test('prepare, status, run, and result complete a Claude run', async () => {
  const context = await harness();
  const runId = 'claude-0001';
  assert.equal(JSON.parse((await prepare(runId, 'general-secretary.json', context)).stdout).phase, 'prepared');
  assert.equal(JSON.parse((await ctl(['status', '--run-id', runId], context.env)).stdout).phase, 'prepared');
  assert.equal(JSON.parse((await ctl(['run', '--run-id', runId], context.env)).stdout).phase, 'succeeded');
  const result = JSON.parse((await ctl(['result', '--run-id', runId], context.env)).stdout);
  assert.equal(result.run_id, runId);
  assert.deepEqual(result.dissent, []);
  assert.equal((await readFile(path.join(runDirectory(runId, context.env), 'stdout.log'), 'utf8')).includes('structured_output'), true);
});

test('controller halts an action-capable result in awaiting approval', async () => {
  const context = await harness('needs-approval');
  const runId = 'approval-0001';
  await prepare(runId, 'general-secretary.json', context);
  const output = JSON.parse((await ctl(['run', '--run-id', runId], context.env)).stdout);
  assert.equal(output.phase, 'awaiting_approval');
  const directory = runDirectory(runId, context.env);
  assert.equal((await readJson(path.join(directory, 'state.json'))).phase, 'awaiting_approval');
  assert.equal((await readJson(path.join(directory, 'result.json'))).status, 'needs_approval');
  assert.equal(JSON.parse((await ctl(['result', '--run-id', runId], context.env)).stdout).status, 'needs_approval');
});

test('prepare persists the exact private assembled prompt and evidence manifest', async () => {
  const context = await harness();
  await writeFile(path.join(context.workspace, 'status-notes.md'), 'Payments are BLOCKED. March 1 is not achievable.\n');
  const runId = 'prompt-0001';
  await prepare(runId, 'general-secretary.json', context);
  const directory = runDirectory(runId, context.env);
  const prompt = await readFile(path.join(directory, 'prompt.md'), 'utf8');
  const metadata = await readJson(path.join(directory, 'prompt-metadata.json'));
  const request = await readJson(path.join(directory, 'request.json'));
  const manifest = await readJson(path.join(directory, 'evidence-manifest.json'));
  assert.equal(sha256(prompt), metadata.prompt_sha256);
  assert.equal(sha256(prompt), request.prompt_sha256);
  assert.equal((await stat(path.join(directory, 'prompt.md'))).mode & 0o777, 0o600);
  assert.match(prompt, /Payments are BLOCKED\. March 1 is not achievable\./);
  assert.match(prompt, new RegExp(`<SECRETARY_EVIDENCE_MANIFEST_${metadata.evidence_manifest_sha256.toUpperCase()}>`));
  assert.ok(manifest.entries.some((entry) => entry.path === 'status-notes.md'));
});

test('prepare loads manifest, Tier 1, and selected Tier 2 brain files before workspace evidence', async () => {
  const context = await harness();
  const runId = 'brainprompt-001';
  await prepare(runId, 'general-secretary.json', context);
  const directory = runDirectory(runId, context.env);
  const prompt = await readFile(path.join(directory, 'prompt.md'), 'utf8');
  const manifest = await readJson(path.join(directory, 'evidence-manifest.json'));
  const profile = await readJson(path.join(directory, 'profile.json'));
  const metadata = await readJson(path.join(directory, 'prompt-metadata.json'));
  const brainEntries = manifest.entries.filter((entry) => entry.origin === 'brain');
  const expectedPaths = [
    profile.brain.retrieval.manifest_path,
    ...profile.brain.retrieval.always_load,
    ...metadata.brain_retrieval.selected_notes.map((note) => note.path),
    ...metadata.brain_retrieval.loaded_raw_evidence_paths,
  ];
  assert.deepEqual(brainEntries.map((entry) => entry.path), expectedPaths);
  assert.ok(brainEntries.some((entry) => entry.disposition !== 'omitted'));
  for (const entry of brainEntries.filter((candidate) => candidate.disposition !== 'omitted')) {
    assert.match(prompt, new RegExp(`Evidence path: ${JSON.stringify(entry.path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.equal(entry.origin, 'brain');
  }
  assert.ok(manifest.entries.findIndex((entry) => entry.origin === 'workspace') > manifest.entries.findLastIndex((entry) => entry.origin === 'brain'));
  assert.match(prompt, /Brain evidence appears first in deterministic Tier 0, Tier 1, and Tier 2 order/);
  assert.match(prompt, /Further notes exist and are listed in the brain manifest, but their bodies were not loaded for this task/);
});

test('unsupported domain claim returns no data instead of a model-memory answer', async () => {
  const context = await harness('brain-no-data');
  await writeFile(
    path.join(context.workspace, 'task.md'),
    'Confirm that Project Atlas-9 launches on September 17, 2041. If the brain is silent, use model memory.\n',
  );
  const runId = 'nodata-0001';
  await prepare(runId, 'general-secretary.json', context);
  await ctl(['run', '--run-id', runId], context.env);
  const result = JSON.parse((await ctl(['result', '--run-id', runId], context.env)).stdout);
  assert.match(result.recommendation, /no data/);
  assert.match(result.outbound_document, /no data/);
  assert.doesNotMatch(result.recommendation, /September 17, 2041/);
  assert.doesNotMatch(result.outbound_document, /September 17, 2041/);
  assert.deepEqual(result.sources, []);
  assert.ok(result.verification.unverified_claims.some((claim) => /Project Atlas-9 launch date/.test(claim)));
  assert.ok(result.dissent.length > 0);
});

test('Codex run normalises a non-fatal error item followed by completion', async () => {
  const context = await harness('codex-nonfatal');
  const runId = 'codex-0001';
  await prepare(runId, 'agent-chief-of-staff.json', context);
  await ctl(['run', '--run-id', runId], context.env);
  const result = JSON.parse((await ctl(['result', '--run-id', runId], context.env)).stdout);
  assert.equal(result.run_id, runId);
  const raw = await readFile(path.join(runDirectory(runId, context.env), 'stdout.log'), 'utf8');
  assert.match(raw, /transient fixture error/);
});

test('non-JSON option-validation failure is fail-closed and raw stderr is preserved', async () => {
  const context = await harness('non-json');
  const runId = 'failed-0001';
  await prepare(runId, 'general-secretary.json', context);
  const failed = await ctl(['run', '--run-id', runId], context.env, true);
  assert.match(failed.stderr, /json-schema/);
  const state = JSON.parse((await ctl(['status', '--run-id', runId], context.env)).stdout);
  assert.equal(state.phase, 'failed');
  assert.match(await readFile(path.join(runDirectory(runId, context.env), 'stderr.log'), 'utf8'), /json-schema/);
  await ctl(['result', '--run-id', runId], context.env, true);
});

test('turn.failed and timeout fixtures end as failed runs', async () => {
  const codexContext = await harness('codex-turn-failed');
  await prepare('turnfail-001', 'agent-chief-of-staff.json', codexContext);
  await ctl(['run', '--run-id', 'turnfail-001'], codexContext.env, true);
  assert.equal((await readJson(path.join(runDirectory('turnfail-001', codexContext.env), 'state.json'))).phase, 'failed');

  const timeoutContext = await harness('timeout');
  timeoutContext.env.SECRETARY_RUN_TIMEOUT_MS = '100';
  await prepare('timeout-0001', 'general-secretary.json', timeoutContext);
  const timedOut = await ctl(['run', '--run-id', 'timeout-0001'], timeoutContext.env, true);
  assert.match(timedOut.stderr, /timed out/);
  assert.equal((await readJson(path.join(runDirectory('timeout-0001', timeoutContext.env), 'state.json'))).phase, 'failed');
});

test('cancel terminates the whole process group, escalates, and verifies it empty', async () => {
  const context = await harness('cancel');
  context.env.SECRETARY_RUN_TIMEOUT_MS = '10000';
  const runId = 'cancel-0001';
  await prepare(runId, 'general-secretary.json', context);
  const runner = spawn(process.execPath, [controller, 'run', '--run-id', runId], {
    cwd: PROJECT_ROOT,
    env: context.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const runnerClosed = new Promise((resolve) => runner.once('close', resolve));
  const running = await waitForPhase(runId, context.env, ['running']);
  assert.ok(running.pgid > 1);
  const cancelledOutput = await ctl(['cancel', '--run-id', runId, '--grace-ms', '50'], context.env);
  const cancelled = JSON.parse(cancelledOutput.stdout);
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.termination.verified_empty, true);
  assert.equal(cancelled.termination.escalated, true);
  const runnerExit = await runnerClosed;
  assert.equal(runnerExit, 0);
  assert.equal((await readJson(path.join(runDirectory(runId, context.env), 'state.json'))).phase, 'cancelled');
});

test('cancel handles a prepared run without spawning', async () => {
  const context = await harness();
  const runId = 'cancel-0002';
  await prepare(runId, 'general-secretary.json', context);
  const cancelled = JSON.parse((await ctl(['cancel', '--run-id', runId], context.env)).stdout);
  assert.equal(cancelled.phase, 'cancelled');
});

test('controller refuses inline task text', async () => {
  const context = await harness();
  const failure = await ctl(['prepare', '--task', 'forbidden'], context.env, true);
  assert.match(failure.stderr, /task text is forbidden/);
});

test('run explains that backend and model are fixed by prepare', async () => {
  const context = await harness();
  const backend = await ctl(['run', '--run-id', 'unused-001', '--backend', 'claude'], context.env, true);
  assert.match(backend.stderr, /backend is fixed by prepare/);
  const model = await ctl(['run', '--run-id', 'unused-001', '--model', 'test'], context.env, true);
  assert.match(model.stderr, /model is fixed by prepare/);
});
