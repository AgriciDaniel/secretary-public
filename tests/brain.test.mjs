import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PROJECT_ROOT } from '../lib/core.mjs';

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

function frontmatter(text, file) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${file} lacks frontmatter`);
  return match[1];
}

const requiredKeys = [
  'type',
  'title',
  'domain',
  'status',
  'created',
  'updated',
  'tags',
  'confidence',
  'related',
  'source_urls',
];

test('brain notes obey frontmatter, structure, depth, and link contracts', async () => {
  const wikiRoot = path.join(PROJECT_ROOT, 'wiki');
  const files = (await walk(wikiRoot)).filter((file) => file.endsWith('.md'));
  assert.ok(files.length >= 50);
  const substantiveDomains = new Set(['communication', 'judgment', 'escalation', 'ethics', 'duties', 'roles', 'failure-modes']);
  const sections = ['Operating Summary', 'Source-Led Facts', 'Operating Procedure', 'Boundaries', 'Sources', 'See Also'];
  for (const file of files) {
    const relative = path.relative(PROJECT_ROOT, file).split(path.sep).join('/');
    const text = await readFile(file, 'utf8');
    const metadata = frontmatter(text, relative);
    for (const key of requiredKeys) assert.match(metadata, new RegExp(`^${key}:`, 'm'), `${relative} lacks ${key}`);
    const confidence = metadata.match(/^confidence:\s*["']?([^\n"']+)/m)?.[1]?.trim();
    const confidenceTags = [...metadata.matchAll(/#confidence\/([a-z-]+)/g)].map((match) => match[1]);
    assert.equal(confidenceTags.length, 1, `${relative} needs exactly one confidence tag`);
    assert.equal(confidence, confidenceTags[0], `${relative} confidence and tag differ`);
    assert.equal([...metadata.matchAll(/#domain\/[a-z-]+/g)].length, 1, `${relative} needs exactly one domain tag`);
    assert.equal([...metadata.matchAll(/#type\/[a-z-]+/g)].length, 1, `${relative} needs exactly one type tag`);
    const domain = metadata.match(/^domain:\s*["']?([^\n"']+)/m)?.[1]?.trim();
    const substantive = substantiveDomains.has(domain) && path.basename(file) !== '_index.md';
    if (substantive) {
      assert.ok(text.split('\n').length - 1 >= 80, `${relative} is below 80 physical lines`);
      for (const section of sections) assert.match(text, new RegExp(`^## ${section}$`, 'm'), `${relative} lacks ${section}`);
      assert.ok((text.match(/\[\[/g) || []).length >= 8, `${relative} has fewer than eight wikilinks`);
    }
    if (path.basename(file) === '_index.md') assert.match(text, /^## What lives here$/m, `${relative} lacks the hub table heading`);
  }
  const hot = await readFile(path.join(wikiRoot, 'hot.md'), 'utf8');
  const body = hot.replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.ok((body.match(/\b[\w'-]+\b/g) || []).length < 500, 'wiki/hot.md exceeds 500 words');
});

test('profiles declare the manifest, Tier 1 hubs, gaps, and questions', async () => {
  const domainHubs = (await walk(path.join(PROJECT_ROOT, 'wiki')))
    .filter((file) => path.basename(file) === '_index.md')
    .map((file) => path.relative(PROJECT_ROOT, file).split(path.sep).join('/'));
  const requiredAlwaysLoad = new Set([
    'wiki/hot.md',
    'wiki/index.md',
    'wiki/meta/CONVENTIONS.md',
    'references/CONFIDENCE_TAGS.md',
    'references/claim-evidence.json',
    ...domainHubs,
  ]);
  const profiles = (await readdir(path.join(PROJECT_ROOT, 'profiles'))).filter((name) => name.endsWith('.json')).sort();
  for (const name of profiles) {
    const profile = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'profiles', name), 'utf8'));
    assert.equal(profile.brain.root, '.');
    assert.equal(profile.brain.retrieval.manifest_path, 'references/brain-manifest.json');
    assert.deepEqual(new Set(profile.brain.retrieval.always_load), requiredAlwaysLoad);
    assert.ok(profile.brain.retrieval.max_note_tokens > 0);
    assert.ok(profile.brain.retrieval.max_notes > 0);
    assert.ok(profile.brain.retrieval.always_load.includes('wiki/gaps/_index.md'));
    assert.ok(profile.brain.retrieval.always_load.includes('wiki/questions/_index.md'));
  }
});

test('source and claim ledgers resolve their governed identifiers and note paths', async () => {
  const sourceLedger = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'references', 'source-ledger.json'), 'utf8'));
  assert.ok(sourceLedger.sources.length > 0);
  const sourceIds = new Set();
  for (const source of sourceLedger.sources) {
    for (const key of ['id', 'title', 'url', 'source_type', 'retrieved', 'refresh_due', 'confidence', 'claims']) {
      assert.ok(Object.hasOwn(source, key), `${source.id || 'source'} lacks ${key}`);
    }
    assert.match(source.url, /^https:\/\//);
    assert.equal(sourceIds.has(source.id), false, `duplicate source id ${source.id}`);
    sourceIds.add(source.id);
  }
  const claimLedger = await readFile(path.join(PROJECT_ROOT, 'references', 'claim-ledger.md'), 'utf8');
  const rows = [...claimLedger.matchAll(/\| `([^`]+\.md)` \| [^|]+ \| [^|]+ \| ([^|]+) \|/g)];
  assert.ok(rows.length > 0);
  const allowedStatuses = new Set(['verified absence', 'digest-only-incident-summary', 'iaap-site-enumeration']);
  for (const row of rows) {
    await access(path.join(PROJECT_ROOT, row[1]));
    for (const sourceId of row[2].split(',').map((value) => value.trim())) {
      assert.ok(sourceIds.has(sourceId) || allowedStatuses.has(sourceId), `unknown source id ${sourceId}`);
    }
  }
});
