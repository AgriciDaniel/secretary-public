import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildClaudeInvocation, parseClaudeResult } from '../lib/backends/claude.mjs';
import { buildCodexInvocation, parseCodexResult } from '../lib/backends/codex.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name) => readFile(path.join(fixtures, name), 'utf8');

test('Claude argv is hardened, prompt-free, shell-free, and schema-bound', () => {
  const invocation = buildClaudeInvocation({ model: 'claude-sonnet-5', workspace: '/work', schema: { type: 'object' }, allowedTools: ['Read'] });
  assert.deepEqual(invocation.args.slice(0, 5), ['-p', '--output-format', 'json', '--model', 'claude-sonnet-5']);
  for (const flag of ['--safe-mode', '--strict-mcp-config', '--tools', '--no-session-persistence', '--json-schema']) assert.ok(invocation.args.includes(flag));
  assert.ok(!invocation.args.includes('--bare'));
  assert.ok(!invocation.args.includes('Bash'));
  assert.throws(() => buildClaudeInvocation({ model: 'x', workspace: '/work', schema: {}, allowedTools: ['Bash'] }), /forbidden/);
});

test('Codex argv uses exec JSON, exact grants, isolated home, no approval prompt, and no ephemeral thread', () => {
  const env = { XDG_STATE_HOME: '/state', HOME: '/home/test' };
  const invocation = buildCodexInvocation({
    neutralCwd: '/state/secretary/neutral',
    codexHome: '/state/secretary/codex-home',
    model: 'gpt-test',
    outputSchema: '/state/secretary/result-wire-schema.json',
    env,
    binary: 'codex',
  });
  assert.deepEqual(invocation.args.slice(0, 3), ['exec', '--json', '--ignore-user-config']);
  assert.ok(invocation.args.includes('--skip-git-repo-check'));
  assert.deepEqual(invocation.args.slice(invocation.args.indexOf('--output-schema'), invocation.args.indexOf('--output-schema') + 2), [
    '--output-schema',
    '/state/secretary/result-wire-schema.json',
  ]);
  assert.ok(invocation.args.includes('sandbox_workspace_write.network_access=true'));
  assert.ok(invocation.args.includes('sandbox_workspace_write.writable_roots=["/state"]'));
  assert.ok(invocation.args.includes('approval_policy="never"'));
  assert.ok(!invocation.args.includes('--ephemeral'));
  assert.ok(!invocation.args.includes('-a'));
  assert.equal(invocation.env.CODEX_HOME, '/state/secretary/codex-home');
});

test('Claude normalisation accepts only strict top-level structured success', async () => {
  const success = parseClaudeResult({ exitCode: 0, stdout: await read('claude-success.json'), stderr: '' });
  assert.equal(success.ok, true);
  const isError = parseClaudeResult({ exitCode: 1, stdout: await read('claude-is-error.json'), stderr: '' });
  assert.equal(isError.ok, false);
  const misleading = parseClaudeResult({ exitCode: 1, stdout: await read('claude-subtype-success-is-error.json'), stderr: '' });
  assert.equal(misleading.ok, false);
  const misleadingZeroExit = parseClaudeResult({ exitCode: 0, stdout: await read('claude-subtype-success-is-error.json'), stderr: '' });
  assert.equal(misleadingZeroExit.ok, false);
  assert.match(misleadingZeroExit.error, /is_error/);
  const plain = parseClaudeResult({ exitCode: 1, stdout: '', stderr: await read('claude-option-validation.stderr.txt') });
  assert.equal(plain.ok, false);
  assert.match(plain.error, /json-schema/);
  assert.equal(parseClaudeResult({ exitCode: 0, stdout: await read('claude-success.json'), stderr: '', timedOut: true }).ok, false);
});

test('Codex normalisation allows non-fatal error items but rejects turn.failed', async () => {
  assert.equal(parseCodexResult({ exitCode: 0, stdout: await read('codex-success.jsonl'), stderr: '' }).ok, true);
  assert.equal(parseCodexResult({ exitCode: 0, stdout: await read('codex-nonfatal-error.jsonl'), stderr: '' }).ok, true);
  const failed = parseCodexResult({ exitCode: 1, stdout: await read('codex-turn-failed.jsonl'), stderr: '' });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /stream disconnected/);
  assert.equal(parseCodexResult({ exitCode: null, stdout: '', stderr: '', timedOut: true }).ok, false);
});

test('Codex waiting and delegated status events never count as completion', async () => {
  const waiting = parseCodexResult({ exitCode: 0, stdout: await read('codex-waiting-only.jsonl'), stderr: '' });
  assert.equal(waiting.ok, false);
  assert.match(waiting.error, /turn\.completed/);
});
