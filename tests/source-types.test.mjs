import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { makeWorklist, validateLedger, vocabularyIdentifiers } from '../scripts/check-source-types.mjs';

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIRECTORY, '..');
const FIXTURE_DIRECTORY = path.join(TEST_DIRECTORY, 'fixtures', 'source-types');
const EXPECTED_IDENTIFIERS = [
  'primary_record',
  'archival_reproduction',
  'official_publication',
  'regulation_or_rule',
  'standards_body',
  'peer_reviewed',
  'preprint',
  'textbook',
  'practitioner_publication',
  'vendor_documentation',
  'news_or_magazine',
  'encyclopedia',
  'local_synthesis',
  'cited_but_unlinked',
];

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

const [schema, vocabulary] = await Promise.all([
  readJson(path.join(PROJECT_ROOT, 'schemas', 'source-ledger.json')),
  readJson(path.join(PROJECT_ROOT, 'references', 'source-types.json')),
]);

async function validateFixture(name) {
  const ledger = await readJson(path.join(FIXTURE_DIRECTORY, name));
  return validateLedger(ledger, schema, vocabulary);
}

test('controlled vocabulary contains exactly the 14 governed identifiers with definitions and exclusions', () => {
  assert.deepEqual(vocabularyIdentifiers(vocabulary), EXPECTED_IDENTIFIERS);
  assert.match(vocabulary.governing_rule, /genre only/i);
  assert.match(vocabulary.governing_rule, /not evidentiary strength/i);
  assert.match(vocabulary.governing_rule, /not institutional authority/i);
  for (const identifier of EXPECTED_IDENTIFIERS) {
    const entry = vocabulary.source_types[identifier];
    assert.equal(typeof entry.definition, 'string');
    assert.ok(entry.definition.trim().length > 0, `${identifier} lacks a definition`);
    assert.equal(typeof entry.does_not_include, 'string');
    assert.ok(entry.does_not_include.trim().length > 0, `${identifier} lacks a does_not_include clarifier`);
  }
});

test('valid controlled source type passes the ledger schema', async () => {
  assert.deepEqual(await validateFixture('valid.json'), []);
});

test('free-text source type is rejected', async () => {
  const errors = await validateFixture('free-text.json');
  assert.ok(errors.some((error) => error.includes('source_type') && error.includes('allowed enum')));
});

test('near-miss source type is rejected', async () => {
  const errors = await validateFixture('near-miss.json');
  assert.ok(errors.some((error) => error.includes('source_type') && error.includes('allowed enum')));
});

test('missing source_type is rejected', async () => {
  const errors = await validateFixture('missing-source-type.json');
  assert.ok(errors.some((error) => error.includes('source_type') && error.includes('required')));
});

test('worklist preserves current values and offers no target classification', async () => {
  const ledger = await readJson(path.join(FIXTURE_DIRECTORY, 'free-text.json'));
  const worklist = makeWorklist(ledger);
  assert.equal(worklist.target_suggestions_included, false);
  assert.equal(worklist.summary.entries, 1);
  assert.equal(worklist.summary.distinct_current_source_types, 1);
  assert.equal(worklist.groups[0].current_source_type, 'institutional structure with contested origin');
  assert.deepEqual(Object.keys(worklist.groups[0].entries[0]), ['id', 'current_source_type', 'url']);
  assert.equal(JSON.stringify(worklist).includes('target_source_type'), false);
});
