#!/usr/bin/env node
import { readFileSync, writeSync } from 'node:fs';

const offlineModeLabel = '[offline: canned result, not behavioural evidence]';

function promptRunId(prompt) {
  return prompt.match(/Run ID: ([A-Za-z0-9._-]+)/)?.[1] || 'behaviour-run-unknown';
}

function expectedEvidence(prompt) {
  const match = prompt.match(/<(SECRETARY_EXPECTED_EVIDENCE_[A-F0-9]{64})>\n([\s\S]*?)\n<\/\1>/);
  if (!match) throw new Error('prompt lacks controller-bound evidence result');
  return JSON.parse(match[2]);
}

function emit(structuredOutput) {
  writeSync(1, `${JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(structuredOutput),
    structured_output: structuredOutput,
  })}\n`);
}

function main() {
  const prompt = readFileSync(0, 'utf8');
  if (prompt.includes('API reachability preflight')) {
    emit({ ok: true });
    return;
  }
  const cannedPath = process.env.SECRETARY_BEHAVIOUR_CANNED_RESULT;
  if (!cannedPath) throw new Error('offline backend lacks a canned result path');
  const canned = JSON.parse(readFileSync(cannedPath, 'utf8'));
  if (canned.mode_label !== offlineModeLabel) throw new Error('canned result lacks the required offline mode label');
  const result = structuredClone(canned.result);
  if (!result.verification?.performed?.includes(offlineModeLabel)) {
    throw new Error('schema result lacks the required offline mode label');
  }
  result.run_id = promptRunId(prompt);
  result.evidence = expectedEvidence(prompt);
  emit(result);
}

try {
  main();
} catch (error) {
  writeSync(2, `${error.message}\n`);
  process.exitCode = 1;
}
