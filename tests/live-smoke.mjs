import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { PROJECT_ROOT, runDirectory, validateSchema } from '../lib/core.mjs';

const execFileAsync = promisify(execFile);
const controller = path.join(PROJECT_ROOT, 'scripts', 'secretaryctl.mjs');
const enabled = process.env.SECRETARY_LIVE === '1';
const taskText = 'Draft a one-sentence acknowledgement. Make no domain claims, use no tools, and return a completed schema-bound result.\n';

async function ctl(args, env) {
  return execFileAsync(process.execPath, [controller, ...args], {
    cwd: PROJECT_ROOT,
    env,
    maxBuffer: 30 * 1024 * 1024,
  });
}

async function liveContext(backend) {
  const base = await mkdtemp(path.join(tmpdir(), `secretary-live-${backend}-`));
  const workspace = path.join(base, 'workspace');
  await mkdir(workspace);
  const taskFile = path.join(workspace, 'task.md');
  await writeFile(taskFile, taskText);
  const env = {
    ...process.env,
    XDG_STATE_HOME: path.join(base, 'state'),
    SECRETARY_PREFLIGHT_TIMEOUT_MS: process.env.SECRETARY_PREFLIGHT_TIMEOUT_MS || '30000',
    SECRETARY_RUN_TIMEOUT_MS: '180000',
  };
  delete env.SECRETARY_CLAUDE_BIN;
  delete env.SECRETARY_CODEX_BIN;
  delete env.SECRETARY_FAKE_MODE;
  return { base, workspace, taskFile, env };
}

async function fullResultSchema() {
  return JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
}

async function runLiveBackend({ backend, profile, model }) {
  const context = await liveContext(backend);
  const runId = `live-${backend}-${Date.now()}`;
  const prepareArgs = [
    'prepare',
    '--run-id', runId,
    '--task-file', context.taskFile,
    '--profile', path.join(PROJECT_ROOT, 'profiles', profile),
    '--workspace', context.workspace,
  ];
  if (model) prepareArgs.push('--model', model);
  await ctl(prepareArgs, context.env);
  await ctl(['run', '--run-id', runId], context.env);
  const { stdout } = await ctl(['result', '--run-id', runId], context.env);
  const result = JSON.parse(stdout);
  assert.equal(result.run_id, runId);
  assert.deepEqual(validateSchema(result, await fullResultSchema()), []);
  return { ...context, runId, directory: runDirectory(runId, context.env) };
}

function jsonl(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

test('live Claude controller smoke returns a full-schema-valid result', { skip: !enabled }, async () => {
  const context = await runLiveBackend({
    backend: 'claude',
    profile: 'general-secretary.json',
    model: 'claude-haiku-4-5',
  });
  const preflight = JSON.parse(await readFile(path.join(context.directory, 'preflight.stdout.log'), 'utf8'));
  const runEnvelope = JSON.parse(await readFile(path.join(context.directory, 'backend-envelope.json'), 'utf8'));
  const costs = [preflight.total_cost_usd, runEnvelope.total_cost_usd].filter((value) => typeof value === 'number');
  assert.equal(costs.length, 2, 'Claude envelopes did not report both preflight and run costs');
  const costUsd = costs.reduce((sum, value) => sum + value, 0);
  console.log(`SECRETARY_LIVE_COST ${JSON.stringify({ backend: 'claude', cost_usd: costUsd })}`);
});

test('live Codex controller smoke returns a full-schema-valid result', { skip: !enabled }, async () => {
  const context = await runLiveBackend({
    backend: 'codex',
    profile: 'agent-chief-of-staff.json',
  });
  const events = [
    ...jsonl(await readFile(path.join(context.directory, 'preflight.stdout.log'), 'utf8')),
    ...jsonl(await readFile(path.join(context.directory, 'stdout.log'), 'utf8')),
  ];
  const usage = {};
  for (const event of events.filter((candidate) => candidate.type === 'turn.completed')) {
    for (const [key, value] of Object.entries(event.usage || {})) {
      if (typeof value === 'number') usage[key] = (usage[key] || 0) + value;
    }
  }
  console.log(`SECRETARY_LIVE_COST ${JSON.stringify({ backend: 'codex', cost_usd: null, cost_note: 'Codex CLI does not report USD cost', usage })}`);
});
