import { access, lstat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { ensurePrivateDir, stateParent } from '../core.mjs';

export async function prepareIsolatedCodexHome(codexHome, env = process.env) {
  await ensurePrivateDir(codexHome);
  const sourceHome = env.SECRETARY_SOURCE_CODEX_HOME || env.CODEX_HOME || path.join(env.HOME || '', '.codex');
  const sourceAuth = path.join(sourceHome, 'auth.json');
  const targetAuth = path.join(codexHome, 'auth.json');
  try {
    await access(targetAuth);
  } catch {
    try {
      const metadata = await lstat(sourceAuth);
      if (!metadata.isFile() && !metadata.isSymbolicLink()) return { codexHome, authLinked: false };
      await symlink(sourceAuth, targetAuth);
    } catch {
      return { codexHome, authLinked: false };
    }
  }
  return { codexHome, authLinked: true };
}

export function buildCodexInvocation({ neutralCwd, codexHome, model, outputSchema, env = process.env, binary = process.env.SECRETARY_CODEX_BIN || 'codex' }) {
  if (!outputSchema) throw new Error('Codex output schema path is required');
  const writableParent = stateParent(env);
  const args = [
    'exec',
    '--json',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '--output-schema', outputSchema,
    '-s', 'read-only',
    '-c', 'sandbox_workspace_write.network_access=true',
    '-c', `sandbox_workspace_write.writable_roots=["${writableParent}"]`,
    '-c', 'approval_policy="never"',
    '-C', neutralCwd,
  ];
  if (model) args.push('-m', model);
  args.push('-');
  return { command: binary, args, env: { ...env, CODEX_HOME: codexHome } };
}

export function parseCodexResult({ exitCode, stdout, stderr, timedOut = false }) {
  if (timedOut) return { ok: false, error: 'Codex run timed out', raw: { stdout, stderr, exitCode } };
  const events = [];
  for (const [index, line] of stdout.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      return { ok: false, error: `Codex JSONL line ${index + 1} is not JSON`, raw: { stdout, stderr, exitCode } };
    }
  }
  const failed = events.find((event) => event.type === 'turn.failed');
  if (failed) return { ok: false, error: failed.error?.message || 'Codex turn failed', events };
  if (exitCode !== 0) return { ok: false, error: `Codex exited ${exitCode}: ${stderr}`.trim(), events };
  if (!events.some((event) => event.type === 'turn.completed')) return { ok: false, error: 'Codex output lacks turn.completed', events };
  const messages = events
    .filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message')
    .map((event) => event.item.text)
    .filter((text) => typeof text === 'string');
  if (messages.length === 0) return { ok: false, error: 'Codex output lacks a completed agent message', events };
  let structuredOutput;
  try {
    structuredOutput = JSON.parse(messages.at(-1));
  } catch {
    return { ok: false, error: 'Codex final agent message is not JSON', events };
  }
  if (!structuredOutput || typeof structuredOutput !== 'object' || Array.isArray(structuredOutput)) {
    return { ok: false, error: 'Codex final agent message is not a JSON object', events };
  }
  const envelope = { type: 'result', is_error: false, structured_output: structuredOutput };
  return { ok: true, envelope, structuredOutput, events };
}

export function parseCodexPreflight(input) {
  const parsed = parseCodexResult(input);
  if (!parsed.ok) return parsed;
  if (parsed.structuredOutput.ok !== true) return { ok: false, error: 'Codex preflight response was not ok', events: parsed.events };
  return parsed;
}
