import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { atomicWrite, ensurePrivateDir } from './core.mjs';
import path from 'node:path';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function assertProcessGroupCancellationSupported(platform = process.platform) {
  if (platform === 'win32') throw new Error('cancellation is unsupported on Windows; Secretary requires POSIX process-group signals');
}

async function verifiedProcessGroup(child) {
  const pid = child.pid;
  if (process.platform !== 'linux') return pid;
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  const closing = stat.lastIndexOf(')');
  if (closing < 0) throw new Error(`cannot parse process identity for ${pid}`);
  const fields = stat.slice(closing + 2).trim().split(/\s+/);
  const pgid = Number(fields[2]);
  const session = Number(fields[3]);
  if (pgid !== pid || session !== pid) {
    child.kill('SIGKILL');
    throw new Error(`child ${pid} lacks a dedicated process group and session`);
  }
  return pgid;
}

export function isProcessGroupAlive(pgid) {
  if (!Number.isInteger(pgid) || pgid < 2) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export async function terminateProcessGroup(pgid, options = {}) {
  assertProcessGroupCancellationSupported();
  const graceMs = options.graceMs ?? 2000;
  const pollMs = options.pollMs ?? 25;
  if (!Number.isInteger(pgid) || pgid < 2) throw new Error('refusing to signal an invalid process group');
  try {
    process.kill(-pgid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && isProcessGroupAlive(pgid)) await delay(pollMs);
  let escalated = false;
  if (isProcessGroupAlive(pgid)) {
    escalated = true;
    try {
      process.kill(-pgid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const verifyDeadline = Date.now() + Math.max(500, graceMs);
  while (Date.now() < verifyDeadline && isProcessGroupAlive(pgid)) await delay(pollMs);
  if (isProcessGroupAlive(pgid)) throw new Error(`process group ${pgid} still has descendants after SIGKILL`);
  return { pgid, escalated, verified_empty: true };
}

export async function spawnCaptured({ command, args, cwd, env, stdin, stdoutFile, stderrFile, timeoutMs = 0, onSpawn }) {
  await ensurePrivateDir(path.dirname(stdoutFile));
  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  const pgid = await verifiedProcessGroup(child);
  await onSpawn?.({ pid: child.pid, pgid });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  child.stdin.end(stdin);
  let timedOut = false;
  let timeout;
  let timeoutTermination;
  let timeoutTerminationError;
  if (timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      timeoutTermination = terminateProcessGroup(pgid).catch((error) => {
        timeoutTerminationError = error;
      });
    }, timeoutMs);
    timeout.unref();
  }
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timeout));
  if (timeoutTermination) await timeoutTermination;
  if (timeoutTerminationError) throw timeoutTerminationError;
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  await Promise.all([atomicWrite(stdoutFile, stdout), atomicWrite(stderrFile, stderr)]);
  return { ...outcome, pgid, timedOut, stdout, stderr };
}
