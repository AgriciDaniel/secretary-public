#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';
import { actionSha256 } from '../../lib/core.mjs';

const prompt = readFileSync(0, 'utf8');
const isCodex = process.argv.includes('exec');
const preflight = prompt.includes('API reachability preflight');
const mode = process.env.SECRETARY_FAKE_MODE || 'success';

function wireSchema() {
  if (isCodex) {
    const option = process.argv.indexOf('--output-schema');
    if (option < 0 || !process.argv[option + 1]) throw new Error('missing Codex output schema');
    return JSON.parse(readFileSync(process.argv[option + 1], 'utf8'));
  }
  const option = process.argv.indexOf('--json-schema');
  if (option < 0 || !process.argv[option + 1]) throw new Error('missing Claude JSON schema');
  return JSON.parse(process.argv[option + 1]);
}

const boundSchema = wireSchema();
for (const keyword of ['$schema', '$id', 'oneOf', 'allOf', 'anyOf']) {
  if (Object.hasOwn(boundSchema, keyword)) throw new Error(`wire schema retained ${keyword}`);
}

const unsupportedCodexKeywords = new Set([
  'uniqueItems',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'pattern',
  'format',
]);

function assertStrictCodexSchema(node, location = '$') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertStrictCodexSchema(child, `${location}[${index}]`));
    return;
  }
  for (const keyword of unsupportedCodexKeywords) {
    if (Object.hasOwn(node, keyword)) throw new Error(`Codex wire schema retained ${keyword} at ${location}`);
  }
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    const properties = Object.keys(node.properties);
    const required = Array.isArray(node.required) ? node.required : [];
    if (required.length !== properties.length || properties.some((property) => !required.includes(property))) {
      throw new Error(`Codex wire schema has non-exhaustive required at ${location}`);
    }
  }
  for (const [key, child] of Object.entries(node)) assertStrictCodexSchema(child, `${location}.${key}`);
}

if (isCodex) assertStrictCodexSchema(boundSchema);

function runId() {
  return prompt.match(/Run ID: ([A-Za-z0-9._-]+)/)?.[1] || 'run-0001';
}

function expectedEvidence() {
  const match = prompt.match(/<(SECRETARY_EXPECTED_EVIDENCE_[A-F0-9]{64})>\n([\s\S]*?)\n<\/\1>/);
  if (!match) throw new Error('prompt lacks controller-bound evidence result');
  return JSON.parse(match[2]);
}

function result() {
  return {
    run_id: runId(),
    status: 'completed',
    recommendation: 'Proceed with the prepared staff work.',
    outbound_document: 'Ready for signature.',
    dissent: [],
    escalations: [],
    sources: [],
    authority: { requested: [], effective: [], approvals_used: [] },
    verification: {
      performed: ['fixture execution'],
      not_performed: [],
      unverified_claims: [],
      contradictions: [],
      observed_injection_attempts: [],
    },
    quality_control: {
      fit: 'fit',
      acceptance_criteria: ['Return a schema-valid staff-work result.'],
      outcome: 'passed',
      stop_reason: 'acceptance_met',
      review: {
        required: false,
        performed: false,
        independent: false,
        reviewer: 'none',
        limitations: ['Fixture output is not an independent quality review.'],
      },
    },
    evidence: expectedEvidence(),
    approval_request: null,
  };
}

function brainEvidenceText() {
  const sections = [];
  const pattern = /Evidence path: [^\n]+\nEvidence origin: brain\nEvidence kind: [^\n]+\nEvidence file SHA-256: [a-f0-9]+\nEvidence bytes supplied: [^\n]+\n<(SECRETARY_EVIDENCE_[A-F0-9_]+)>\n([\s\S]*?)\n<\/\1>/g;
  for (const match of prompt.matchAll(pattern)) sections.push(match[2]);
  return sections.join('\n');
}

function noDataResult() {
  const brain = brainEvidenceText();
  if (brain.length === 0) throw new Error('prompt lacks supplied brain evidence');
  if (brain.includes('Project Atlas-9') || brain.includes('September 17, 2041')) {
    throw new Error('no-data fixture claim unexpectedly appears in brain evidence');
  }
  if (!prompt.includes('If the manifest does not cover the matter, say `no data`')) {
    throw new Error('prompt lacks the controlling no-data rule');
  }
  const value = result();
  value.recommendation = 'no data. The supplied brain has no support for the Project Atlas-9 launch date.';
  value.outbound_document = 'no data. Record the unsupported Project Atlas-9 launch-date claim as a research gap and propose a claim-ledger update.';
  value.dissent = ['Do not confirm the Project Atlas-9 launch date from model memory.'];
  value.verification.unverified_claims = ['Project Atlas-9 launch date'];
  value.quality_control.fit = 'needs_input';
  value.quality_control.outcome = 'inconclusive';
  value.quality_control.stop_reason = 'missing_evidence';
  return value;
}

function approvalResult() {
  const value = result();
  const action = {
    target: process.env.SECRETARY_FAKE_ACTION_TARGET || '/tmp/outbound.txt',
    content_sha256: process.env.SECRETARY_FAKE_CONTENT_SHA256 || 'a'.repeat(64),
  };
  value.status = 'needs_approval';
  value.recommendation = 'Approve the exact typed action.';
  value.authority.requested = ['file.write'];
  value.quality_control.outcome = 'needs_human_decision';
  value.quality_control.stop_reason = 'authority_boundary';
  value.approval_request = {
    approval_id: 'approval-0001',
    action_type: 'file.write',
    action,
    action_sha256: actionSha256('file.write', action),
    reason: 'Write the approved artifact.',
  };
  return value;
}

function emitSuccess(value) {
  if (isCodex) {
    writeSync(1, `${JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' })}\n`);
    writeSync(1, `${JSON.stringify({ type: 'turn.started' })}\n`);
    if (mode === 'codex-nonfatal') writeSync(1, `${JSON.stringify({ type: 'error', message: 'transient fixture error' })}\n`);
    writeSync(1, `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(value) } })}\n`);
    writeSync(1, `${JSON.stringify({ type: 'turn.completed' })}\n`);
  } else {
    writeSync(1, `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(value), structured_output: value })}\n`);
  }
}

if (preflight && mode === 'preflight-fail') {
  writeSync(2, 'network unavailable\n');
  process.exitCode = 1;
} else if (preflight) {
  emitSuccess({ ok: true });
} else if (mode === 'claude-is-error') {
  writeSync(1, `${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, terminal_reason: 'aborted_streaming' })}\n`);
  process.exitCode = 1;
} else if (mode === 'claude-subtype-success-error') {
  writeSync(1, `${JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: Invalid URL' })}\n`);
  process.exitCode = 1;
} else if (mode === 'non-json') {
  writeSync(2, 'Error: --json-schema is not valid JSON\n');
  process.exitCode = 1;
} else if (mode === 'codex-turn-failed') {
  writeSync(1, `${JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' })}\n`);
  writeSync(1, `${JSON.stringify({ type: 'turn.started' })}\n`);
  writeSync(1, `${JSON.stringify({ type: 'turn.failed', error: { message: 'stream disconnected before completion' } })}\n`);
  process.exitCode = 1;
} else if (mode === 'timeout') {
  process.on('SIGTERM', () => process.exit(143));
  setInterval(() => {}, 1000);
} else if (mode === 'cancel') {
  const child = spawn(process.execPath, [new URL('stubborn-child.mjs', import.meta.url).pathname], { stdio: 'ignore' });
  child.unref();
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (mode === 'brain-no-data') {
  emitSuccess(noDataResult());
} else if (mode === 'needs-approval') {
  emitSuccess(approvalResult());
} else {
  emitSuccess(result());
}
