import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { PROJECT_ROOT, deriveWireSchema, validateSchema } from '../lib/core.mjs';

const execFileAsync = promisify(execFile);

async function gitProjectFiles(root) {
  try {
    const { stdout: topLevelOutput } = await execFileAsync(
      'git',
      ['-C', root, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    const topLevel = await realpath(topLevelOutput.trim());
    if (topLevel !== await realpath(root)) return null;
    const { stdout } = await execFileAsync(
      'git',
      ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout
      .split('\0')
      .filter(Boolean)
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  } catch {
    return null;
  }
}

async function projectArtifactFiles(root) {
  const selected = await gitProjectFiles(root);
  if (selected) return selected;
  const skip = new Set(['.git', '.probe', 'node_modules']);
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute));
    }
  }
  await walk(root);
  return files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

async function emDashViolations(root) {
  const violations = [];
  for (const relative of await projectArtifactFiles(root)) {
    const isVerbatimExtract = relative.startsWith('references/evidence/') && path.basename(relative) === 'extract.md';
    if (!isVerbatimExtract && (await readFile(path.join(root, relative))).includes(Buffer.from([0xe2, 0x80, 0x94]))) {
      violations.push(relative);
    }
  }
  return violations;
}

function objectSchemas(node, location = '$', output = []) {
  if (!node || typeof node !== 'object') return output;
  const declaresObject = node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'));
  if (declaresObject && (Object.hasOwn(node, 'properties') || Object.hasOwn(node, 'additionalProperties'))) output.push([location, node]);
  if (Array.isArray(node)) node.forEach((child, index) => objectSchemas(child, `${location}[${index}]`, output));
  else for (const [key, child] of Object.entries(node)) objectSchemas(child, `${location}.${key}`, output);
  return output;
}

const OPENAI_STRIPPED_KEYWORDS = [
  'uniqueItems',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'pattern',
  'format',
];

function assertKeywordsAbsent(node, keywords, location = '$') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertKeywordsAbsent(child, keywords, `${location}[${index}]`));
    return;
  }
  for (const keyword of keywords) assert.equal(Object.hasOwn(node, keyword), false, `${location} retained ${keyword}`);
  for (const [key, child] of Object.entries(node)) assertKeywordsAbsent(child, keywords, `${location}.${key}`);
}

function assertExhaustiveRequired(node, location = '$') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertExhaustiveRequired(child, `${location}[${index}]`));
    return;
  }
  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    assert.deepEqual(node.required, Object.keys(node.properties), `${location} required is not exhaustive`);
  }
  for (const [key, child] of Object.entries(node)) assertExhaustiveRequired(child, `${location}.${key}`);
}

test('all declared object schemas are closed and dissent is mandatory', async () => {
  const schemaNames = (await readdir(path.join(PROJECT_ROOT, 'schemas'))).filter((name) => name.endsWith('.json'));
  assert.deepEqual(schemaNames.sort(), [
    'audit-event.json',
    'principal-consent.v1.json',
    'principal-profile.v1.json',
    'profile.json',
    'quality-job.v1.json',
    'quality-review-result.v1.json',
    'run-request.json',
    'run-result.json',
    'run-state.json',
    'source-ledger.json',
  ]);
  for (const name of schemaNames) {
    const schema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', name), 'utf8'));
    for (const [location, objectSchema] of objectSchemas(schema)) assert.equal(objectSchema.additionalProperties, false, `${name} ${location}`);
  }
  const result = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
  assert.ok(result.required.includes('dissent'));
  assert.ok(result.required.includes('evidence'));
  assert.ok(result.required.includes('quality_control'));
  assert.equal(result.properties.dissent.type, 'array');
  assert.ok(result.properties.verification.required.includes('unverified_claims'));
  assert.ok(result.properties.verification.required.includes('contradictions'));
  assert.ok(result.properties.verification.required.includes('observed_injection_attempts'));
  assert.ok(result.properties.status.enum.includes('completed'));
  assert.deepEqual(result.properties.sources.items.properties.provenance.enum, ['[RAW]', '[FETCH]', '[SEARCH]', '[INFER]']);
  assert.ok(result.properties.quality_control.properties.outcome.enum.includes('inconclusive'));
});

test('approval state and audit vocabularies include the hardening lifecycle', async () => {
  const runState = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-state.json'), 'utf8'));
  for (const phase of ['awaiting_approval', 'approved', 'executing', 'executed', 'expired']) {
    assert.ok(runState.properties.phase.enum.includes(phase));
  }
  const auditEvent = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'audit-event.json'), 'utf8'));
  assert.ok(auditEvent.required.includes('prev_event_sha256'));
  assert.deepEqual(auditEvent.properties.prev_event_sha256.type, ['string', 'null']);
  assert.equal(auditEvent.properties.prev_event_sha256.pattern, '^[a-f0-9]{64}$');
  for (const kind of ['approval_granted', 'approval_denied', 'approval_expired', 'approval_executed']) {
    assert.ok(auditEvent.properties.kind.enum.includes(kind));
  }
});

test('OpenAI wire schemas strip unsupported constraints and require every property', async () => {
  const schemaNames = (await readdir(path.join(PROJECT_ROOT, 'schemas'))).filter((name) => name.endsWith('.json')).sort();
  for (const name of schemaNames) {
    const fullSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', name), 'utf8'));
    const original = structuredClone(fullSchema);
    const wireSchema = deriveWireSchema(fullSchema, { dialect: 'openai' });
    assert.equal(JSON.stringify(fullSchema), JSON.stringify(original), `${name} source was mutated`);
    assert.equal(Object.hasOwn(wireSchema, '$schema'), false, `${name} retained $schema`);
    assert.equal(Object.hasOwn(wireSchema, '$id'), false, `${name} retained $id`);
    for (const keyword of ['oneOf', 'allOf', 'anyOf']) assert.equal(Object.hasOwn(wireSchema, keyword), false, `${name} retained ${keyword}`);
    assertKeywordsAbsent(wireSchema, OPENAI_STRIPPED_KEYWORDS, name);
    assertExhaustiveRequired(wireSchema, name);
  }
});

test('Anthropic wire schemas remove metadata and top-level combinators only', async () => {
  const fullSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
  const original = structuredClone(fullSchema);
  const wireSchema = deriveWireSchema(fullSchema, { dialect: 'anthropic' });
  assert.deepEqual(fullSchema, original);
  assert.equal(Object.hasOwn(wireSchema, '$schema'), false);
  assert.equal(Object.hasOwn(wireSchema, '$id'), false);
  for (const keyword of ['oneOf', 'allOf', 'anyOf']) assert.equal(Object.hasOwn(wireSchema, keyword), false, `retained ${keyword}`);
  assert.equal(wireSchema.properties.authority.properties.requested.uniqueItems, true);
  const optionalFullSchema = {
    type: 'object',
    required: ['required_value'],
    properties: {
      required_value: { type: 'string', minLength: 1 },
      optional_value: { type: 'string', pattern: '^optional$' },
    },
  };
  const optionalWireSchema = deriveWireSchema(optionalFullSchema, { dialect: 'anthropic' });
  assert.deepEqual(optionalWireSchema.required, ['required_value']);
  assert.equal(optionalWireSchema.properties.required_value.minLength, 1);
  assert.equal(optionalWireSchema.properties.optional_value.pattern, '^optional$');
});

test('unknown wire schema dialect defaults to strict OpenAI behavior', async () => {
  const fullSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
  const wireSchema = deriveWireSchema(fullSchema, { dialect: 'future-provider' });
  assertKeywordsAbsent(wireSchema, OPENAI_STRIPPED_KEYWORDS);
  assertExhaustiveRequired(wireSchema);
});

test('full result schema retains and enforces the approval conditional', async () => {
  const fullSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
  assert.ok(Array.isArray(fullSchema.allOf));
  const result = {
    run_id: 'approval-001',
    status: 'needs_approval',
    recommendation: 'Request approval.',
    outbound_document: 'Approval required.',
    dissent: [],
    escalations: [],
    sources: [],
    authority: { requested: ['file.write'], effective: [], approvals_used: [] },
    verification: { performed: [], not_performed: [], unverified_claims: [], contradictions: [], observed_injection_attempts: [] },
    quality_control: {
      fit: 'fit',
      acceptance_criteria: ['Request exact approval.'],
      outcome: 'needs_human_decision',
      stop_reason: 'authority_boundary',
      review: { required: false, performed: false, independent: false, reviewer: 'none', limitations: [] },
    },
    evidence: { manifest_sha256: 'a'.repeat(64), truncated: false, included_files: 0, included_bytes: 0, omissions: [] },
  };
  assert.match(validateSchema(result, fullSchema).join('; '), /approval_request is required/);
  result.approval_request = null;
  assert.match(validateSchema(result, fullSchema).join('; '), /approval_request must be object/);
});

test('full result schema enforces constraints omitted from OpenAI wire schemas', async () => {
  const fullSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'run-result.json'), 'utf8'));
  const result = {
    run_id: 'completed-001',
    status: 'completed',
    recommendation: 'Proceed.',
    outbound_document: 'Ready.',
    dissent: [],
    escalations: [],
    sources: [],
    authority: { requested: ['file.write', 'file.write'], effective: [], approvals_used: [] },
    verification: { performed: [], not_performed: [], unverified_claims: [], contradictions: [], observed_injection_attempts: [] },
    quality_control: {
      fit: 'fit',
      acceptance_criteria: ['Return a prepared document.'],
      outcome: 'passed',
      stop_reason: 'acceptance_met',
      review: { required: false, performed: false, independent: false, reviewer: 'none', limitations: [] },
    },
    evidence: { manifest_sha256: 'a'.repeat(64), truncated: false, included_files: 0, included_bytes: 0, omissions: [] },
    approval_request: null,
  };
  assert.match(validateSchema(result, fullSchema).join('; '), /requested must contain unique items/);
});

test('the five governed profiles exist', async () => {
  const profiles = (await readdir(path.join(PROJECT_ROOT, 'profiles'))).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(profiles, [
    'agent-chief-of-staff.json',
    'communications-secretary.json',
    'general-secretary.json',
    'operations-secretary.json',
    'research-secretary.json',
  ]);
});

test('profiles declare evidence caps, governed brains, and no child file tools', async () => {
  const profileSchema = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'schemas', 'profile.json'), 'utf8'));
  for (const name of ['agent-chief-of-staff.json', 'general-secretary.json']) {
    const profile = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'profiles', name), 'utf8'));
    assert.deepEqual(validateSchema(profile, profileSchema), []);
    assert.deepEqual(profile.allowed_tools, []);
    assert.ok(profile.max_evidence_file_bytes > 0);
    assert.ok(profile.max_evidence_total_bytes >= profile.max_evidence_file_bytes);
    assert.ok(profile.max_evidence_files > 0);
    assert.equal(profile.brain.root, '.');
    assert.ok(profile.brain.retrieval.always_load.length > 0);
    assert.ok(profile.brain.retrieval.always_load.includes('references/claim-evidence.json'));
    assert.equal(new Set(profile.brain.retrieval.always_load).size, profile.brain.retrieval.always_load.length);
    assert.ok(profile.brain.retrieval.max_note_tokens > 0);
    assert.ok(profile.brain.retrieval.max_notes > 0);
    assert.equal(profile.brain.retrieval.manifest_path, 'references/brain-manifest.json');
    assert.ok(profile.brain.retrieval.profile_domains.length > 0);
    assert.equal(profile.brain.required_citation_mode, 'brain_note_and_primary_url');
  }
});

test('specialized profiles narrow retrieval and never widen the action vocabulary', async () => {
  const names = (await readdir(path.join(PROJECT_ROOT, 'profiles'))).filter((name) => name.endsWith('.json')).sort();
  const domainSets = new Set();
  for (const name of names) {
    const profile = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'profiles', name), 'utf8'));
    assert.ok(profile.action_types.every((action) => action === 'file.write'));
    domainSets.add([...profile.brain.retrieval.profile_domains].sort().join(','));
  }
  assert.equal(domainSets.size, names.length, 'every profile needs a distinct retrieval emphasis');
});

test('project artifacts contain no em dash', async () => {
  // Stored evidence extracts hold verbatim third-party text. Altering a
  // quotation to satisfy a house style rule would defeat the citation gate.
  assert.deepEqual(await emDashViolations(PROJECT_ROOT), []);
});

test('authored-content gate excludes ignored files but retains untracked files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'secretary-artifacts-git-'));
  await execFileAsync('git', ['init', '--quiet', root]);
  await writeFile(path.join(root, '.gitignore'), 'ignored.txt\n');
  await writeFile(path.join(root, 'ignored.txt'), 'ignored \u2014 local\n');
  await writeFile(path.join(root, 'authored.txt'), 'authored \u2014 visible\n');
  assert.deepEqual(await emDashViolations(root), ['authored.txt']);
});
