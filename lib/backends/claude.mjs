export function buildClaudeInvocation({ model, workspace, schema, allowedTools = [], binary = process.env.SECRETARY_CLAUDE_BIN || 'claude' }) {
  if (allowedTools.includes('Bash')) throw new Error('Claude Bash access is forbidden');
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', model,
    '--safe-mode',
    '--strict-mcp-config',
    '--tools', allowedTools.join(','),
    '--permission-mode', 'dontAsk',
    '--add-dir', workspace,
    '--no-session-persistence',
    '--json-schema', JSON.stringify(schema),
  ];
  return { command: binary, args };
}

export function parseClaudeResult({ exitCode, stdout, stderr, timedOut = false }) {
  if (timedOut) return { ok: false, error: 'Claude run timed out', raw: { stdout, stderr, exitCode } };
  if (exitCode !== 0) return { ok: false, error: `Claude exited ${exitCode}: ${stderr || stdout}`.trim(), raw: { stdout, stderr, exitCode } };
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return { ok: false, error: `Claude did not return JSON: ${stderr || stdout}`.trim(), raw: { stdout, stderr, exitCode } };
  }
  if (envelope.type !== 'result') return { ok: false, error: 'Claude output type is not result', envelope };
  if (envelope.is_error !== false) return { ok: false, error: 'Claude result is_error is not false', envelope };
  if (!Object.hasOwn(envelope, 'structured_output')) return { ok: false, error: 'Claude result lacks top-level structured_output', envelope };
  if (!envelope.structured_output || typeof envelope.structured_output !== 'object' || Array.isArray(envelope.structured_output)) {
    return { ok: false, error: 'Claude structured_output is not an object', envelope };
  }
  return { ok: true, envelope, structuredOutput: envelope.structured_output };
}

export function parseClaudePreflight({ exitCode, stdout, stderr, timedOut = false }) {
  const parsed = parseClaudeResult({ exitCode, stdout, stderr, timedOut });
  if (!parsed.ok) return parsed;
  if (parsed.structuredOutput.ok !== true) return { ok: false, error: 'Claude preflight response was not ok', envelope: parsed.envelope };
  return parsed;
}
