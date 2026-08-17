#!/usr/bin/env node
// MODE WARNING: [offline: canned result, not behavioural evidence] runs test only assertion machinery and controller plumbing. [live: real backend, behavioural evidence] runs use the real backend, require SECRETARY_LIVE=1, and are blocked inside npm test.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const OFFLINE_MODE_LABEL = '[offline: canned result, not behavioural evidence]';
export const LIVE_MODE_LABEL = '[live: real backend, behavioural evidence]';

const execFileAsync = promisify(execFile);
const harnessFile = fileURLToPath(import.meta.url);
const behaviourRoot = path.dirname(harnessFile);
const projectRoot = path.resolve(behaviourRoot, '..', '..');
const controller = path.join(projectRoot, 'scripts', 'secretaryctl.mjs');
const profile = path.join(projectRoot, 'profiles', 'general-secretary.json');
const fakeBackend = path.join(behaviourRoot, 'fake-backend.mjs');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function ctl(args, env) {
  return execFileAsync(process.execPath, [controller, ...args], {
    cwd: projectRoot,
    env,
    maxBuffer: 30 * 1024 * 1024,
  });
}

function modeGuard(mode) {
  if (!['offline', 'live'].includes(mode)) throw new Error(`unsupported behaviour mode: ${mode}`);
  if (mode !== 'live') return;
  if (process.env.SECRETARY_LIVE !== '1') throw new Error('live mode requires SECRETARY_LIVE=1');
  if (process.env.npm_lifecycle_event === 'test' || process.env.NODE_TEST_CONTEXT) {
    throw new Error('live mode is forbidden inside npm test or node --test');
  }
}

async function scenarioContext(scenarioDirectory, mode, cannedName) {
  const scenario = await readJson(path.join(scenarioDirectory, 'scenario.json'));
  const base = await mkdtemp(path.join(tmpdir(), `secretary-behaviour-${scenario.id}-`));
  const workspace = path.join(base, 'workspace');
  await mkdir(workspace);
  await cp(path.join(scenarioDirectory, 'workspace'), workspace, { recursive: true });
  const taskFile = path.join(workspace, 'task.md');
  await copyFile(path.join(scenarioDirectory, 'task.md'), taskFile);
  const env = {
    ...process.env,
    XDG_STATE_HOME: path.join(base, 'state'),
    SECRETARY_PREFLIGHT_TIMEOUT_MS: process.env.SECRETARY_PREFLIGHT_TIMEOUT_MS || '30000',
    SECRETARY_RUN_TIMEOUT_MS: process.env.SECRETARY_RUN_TIMEOUT_MS || '180000',
  };
  delete env.NODE_TEST_CONTEXT;
  if (mode === 'offline') {
    const cannedFile = scenario.canned_results?.[cannedName];
    if (!cannedFile) throw new Error(`scenario ${scenario.id} lacks canned result ${cannedName}`);
    env.SECRETARY_CLAUDE_BIN = fakeBackend;
    env.SECRETARY_BEHAVIOUR_CANNED_RESULT = path.join(scenarioDirectory, cannedFile);
    env.SECRETARY_BEHAVIOUR_MODE_LABEL = OFFLINE_MODE_LABEL;
  } else {
    delete env.SECRETARY_CLAUDE_BIN;
    delete env.SECRETARY_CODEX_BIN;
    delete env.SECRETARY_BEHAVIOUR_CANNED_RESULT;
    delete env.SECRETARY_BEHAVIOUR_MODE_LABEL;
    delete env.SECRETARY_FAKE_MODE;
  }
  return { scenario, base, workspace, taskFile, env };
}

export async function runScenario(scenarioDirectory, options = {}) {
  const mode = options.mode || 'offline';
  const cannedName = options.canned || 'passing';
  modeGuard(mode);
  const context = await scenarioContext(path.resolve(scenarioDirectory), mode, cannedName);
  const suffix = randomBytes(5).toString('hex');
  const runId = `${mode}-${context.scenario.id}-${suffix}`;
  const prepareArgs = [
    'prepare',
    '--run-id', runId,
    '--task-file', context.taskFile,
    '--profile', profile,
    '--workspace', context.workspace,
    '--backend', 'claude',
  ];
  await ctl(prepareArgs, context.env);
  const run = JSON.parse((await ctl(['run', '--run-id', runId], context.env)).stdout);
  const secretaryResult = JSON.parse((await ctl(['result', '--run-id', runId], context.env)).stdout);
  const modeLabel = mode === 'offline' ? OFFLINE_MODE_LABEL : LIVE_MODE_LABEL;
  const sourceLabel = mode === 'offline' ? `canned=${cannedName}` : 'backend=real';
  console.log(`${modeLabel} scenario=${context.scenario.id} ${sourceLabel} controller_phase=${run.phase}`);
  return {
    mode,
    mode_label: modeLabel,
    scenario_id: context.scenario.id,
    source: sourceLabel,
    secretary_result: secretaryResult,
  };
}

async function main() {
  const [command, scenarioDirectory] = process.argv.slice(2);
  if (command !== 'live' || !scenarioDirectory) {
    throw new Error('usage: SECRETARY_LIVE=1 node tests/behaviour/harness.mjs live <scenario-directory>');
  }
  await runScenario(scenarioDirectory, { mode: 'live' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
