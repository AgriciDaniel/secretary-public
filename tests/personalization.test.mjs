import assert from 'node:assert/strict';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { stateRoot } from '../lib/core.mjs';
import {
  buildPersonalizationSnapshot,
  deletePersonalization,
  doctorPersonalization,
  exportPersonalization,
  getPersonalizationStatus,
  initializePersonalization,
  pausePersonalization,
  personalizationPaths,
  resetPersonalization,
  resumePersonalization,
  setPersonalization,
  setPersonalizationProviderUse,
  showPersonalization,
  unsetPersonalization,
} from '../lib/personalization.mjs';

const FIXED_TIME = '2026-08-17T12:00:00.000Z';
const LATER_TIME = '2026-08-17T13:00:00.000Z';
const fixedClock = () => new Date(FIXED_TIME);
const laterClock = () => new Date(LATER_TIME);

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'secretary-personalization-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    env: { ...process.env, XDG_STATE_HOME: directory },
  };
}

async function writePrivateJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(file), 0o700);
  await chmod(path.dirname(path.dirname(file)), 0o700);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function initializePersistent(env, overrides = {}) {
  return initializePersonalization({
    mode: 'persistent',
    providerUse: true,
    preferences: {
      language: 'English',
      secretary_name: 'Mira',
      principal_address: 'Daniel',
      default_profile: 'research-secretary',
      tone: 'direct and warm',
      answer_length: 'concise',
      response_structure: 'decision-memo',
      document_formats: ['Markdown'],
      clarify_before_drafting: true,
    },
    env,
    clock: fixedClock,
    ...overrides,
  });
}

test('persistent setup writes closed consent and profile records with private permissions', async (t) => {
  const { env } = await fixture(t);
  const initialized = await initializePersistent(env);
  const paths = personalizationPaths(env);

  assert.equal(initialized.status, 'ready_persistent');
  assert.equal(initialized.consent.revision, 1);
  assert.equal(initialized.profile.preferences.secretary_name, 'Mira');
  assert.equal((await lstat(stateRoot(env))).mode & 0o777, 0o700);
  assert.equal((await lstat(paths.root)).mode & 0o777, 0o700);
  assert.equal((await lstat(paths.consent)).mode & 0o777, 0o600);
  assert.equal((await lstat(paths.profile)).mode & 0o777, 0o600);

  const snapshot = await buildPersonalizationSnapshot({ env });
  assert.equal(snapshot.version, 'secretary.personalization-snapshot/1');
  assert.equal(Object.hasOwn(snapshot.preferences, 'default_profile'), false);
  assert.match(snapshot.sha256, /^[a-f0-9]{64}$/);
  assert.ok(snapshot.byte_length <= 4096);
});

test('session-only setup returns ready_session and performs no durable writes', async (t) => {
  const { env } = await fixture(t);
  const result = await initializePersonalization({
    mode: 'session',
    providerUse: true,
    preferences: { language: 'Română', secretary_name: 'Secretara' },
    env,
  });

  assert.equal(result.status, 'ready_session');
  assert.equal(result.durable, false);
  assert.equal(result.session.preferences.language, 'Română');
  await assert.rejects(() => lstat(stateRoot(env)), { code: 'ENOENT' });
  const snapshot = await buildPersonalizationSnapshot({ env, session: result.session });
  assert.equal(snapshot.preferences.secretary_name, 'Secretara');
  assert.equal(snapshot.consent_revision, null);
});

test('remembered decline stores only its decision and minimal versioned metadata', async (t) => {
  const { env } = await fixture(t);
  const result = await initializePersonalization({ mode: 'declined', env, clock: fixedClock });
  const paths = personalizationPaths(env);
  const stored = JSON.parse(await readFile(paths.consent, 'utf8'));

  assert.equal(result.status, 'declined_remembered');
  assert.deepEqual(Object.keys(stored).sort(), ['created_at', 'decision', 'revision', 'updated_at', 'version']);
  assert.equal(stored.decision, 'declined');
  await assert.rejects(() => lstat(paths.profile), { code: 'ENOENT' });
  assert.equal(await buildPersonalizationSnapshot({ env }), null);
});

test('declined consent containing provider or pause fields is rejected', async (t) => {
  const { env } = await fixture(t);
  const paths = personalizationPaths(env);
  await writePrivateJson(paths.consent, {
    version: 'secretary.principal-consent/1',
    revision: 1,
    decision: 'declined',
    provider_use: false,
    paused: false,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  });

  const status = await getPersonalizationStatus({ env });
  assert.equal(status.status, 'invalid');
  assert.match(status.issues.join('; '), /declined consent must not store provider_use/);
  assert.equal(await buildPersonalizationSnapshot({ env }), null);
});

test('corrupt and unknown-version state fail closed without being overwritten', async (t) => {
  const corruptFixture = await fixture(t);
  const corruptPaths = personalizationPaths(corruptFixture.env);
  await mkdir(corruptPaths.root, { recursive: true, mode: 0o700 });
  await chmod(stateRoot(corruptFixture.env), 0o700);
  await chmod(corruptPaths.root, 0o700);
  await writeFile(corruptPaths.consent, '{not-json', { mode: 0o600 });
  const corruptBefore = await readFile(corruptPaths.consent);
  assert.equal((await getPersonalizationStatus({ env: corruptFixture.env })).status, 'invalid');
  assert.equal(await buildPersonalizationSnapshot({ env: corruptFixture.env }), null);
  assert.deepEqual(await readFile(corruptPaths.consent), corruptBefore);
  await assert.rejects(() => initializePersistent(corruptFixture.env), /already invalid/);
  assert.deepEqual(await readFile(corruptPaths.consent), corruptBefore);

  const unknownFixture = await fixture(t);
  const unknownPaths = personalizationPaths(unknownFixture.env);
  await writePrivateJson(unknownPaths.consent, {
    version: 'secretary.principal-consent/2',
    revision: 1,
    decision: 'persistent',
    provider_use: true,
    paused: false,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  });
  const unknownBefore = await readFile(unknownPaths.consent);
  const unknownStatus = await getPersonalizationStatus({ env: unknownFixture.env });
  assert.equal(unknownStatus.status, 'needs_reconsent');
  assert.equal(await buildPersonalizationSnapshot({ env: unknownFixture.env }), null);
  await assert.rejects(() => initializePersistent(unknownFixture.env), /already needs_reconsent/);
  assert.deepEqual(await readFile(unknownPaths.consent), unknownBefore);
});

test('final-target symlinks are rejected and never read as personalization', async (t) => {
  const { env, directory } = await fixture(t);
  const paths = personalizationPaths(env);
  const outside = path.join(directory, 'outside-secret.json');
  const secret = 'PERSONALIZATION_SYMLINK_SECRET';
  await writeFile(outside, secret, { mode: 0o600 });
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await chmod(stateRoot(env), 0o700);
  await chmod(paths.root, 0o700);
  await symlink(outside, paths.consent);

  const status = await getPersonalizationStatus({ env });
  assert.equal(status.status, 'invalid');
  assert.match(status.issues.join('; '), /must not be a symbolic link/);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(secret));
  assert.equal(await buildPersonalizationSnapshot({ env }), null);
});

test('mutations enforce revisions and reject unallowlisted or raw-content fields', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);

  await assert.rejects(() => setPersonalization({
    changes: { tone: 'formal' },
    expectedRevision: 99,
    env,
  }), (error) => error.code === 'ERR_PERSONALIZATION_CONFLICT');

  const changed = await setPersonalization({
    changes: { tone: 'formal' },
    expectedRevision: 1,
    env,
    clock: laterClock,
  });
  assert.equal(changed.profile.revision, 2);
  assert.equal(changed.profile.preferences.tone, 'formal');
  assert.equal(changed.profile.updated_at, LATER_TIME);

  const unset = await unsetPersonalization({ fields: ['principal_address'], expectedRevision: 2, env, clock: laterClock });
  assert.equal(unset.profile.revision, 3);
  assert.equal(Object.hasOwn(unset.profile.preferences, 'principal_address'), false);

  await assert.rejects(() => setPersonalization({
    changes: { raw_conversation: 'secret' },
    expectedRevision: 3,
    env,
  }), /field is not allowed/);
  await assert.rejects(() => setPersonalization({
    changes: { permissions: 'send email' },
    expectedRevision: 3,
    env,
  }), /field is not allowed/);
});

test('pause, resume, and provider-use consent gate snapshot exposure', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);

  const paused = await pausePersonalization({ expectedRevision: 1, env, clock: laterClock });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.consent.revision, 2);
  assert.equal(await buildPersonalizationSnapshot({ env }), null);

  const resumed = await resumePersonalization({ expectedRevision: 2, env, clock: laterClock });
  assert.equal(resumed.status, 'ready_persistent');
  assert.ok(await buildPersonalizationSnapshot({ env }));

  const providerOff = await setPersonalizationProviderUse({ providerUse: false, expectedRevision: 3, env, clock: laterClock });
  assert.equal(providerOff.provider_use, false);
  assert.equal(await buildPersonalizationSnapshot({ env }), null);
});

test('reset clears preferences but preserves consent and advances only profile revision', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const before = await showPersonalization({ env });
  const reset = await resetPersonalization({ expectedRevision: 1, env, clock: laterClock });

  assert.deepEqual(reset.profile.preferences, {});
  assert.equal(reset.profile.revision, 2);
  assert.deepEqual(reset.consent, before.consent);
  assert.equal(reset.status, 'ready_persistent');
});

test('export never deletes, while deletion requires explicit confirmation', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const exported = await exportPersonalization({ env, clock: laterClock });
  assert.equal(exported.version, 'secretary.principal-export/1');
  assert.equal(exported.exported_at, LATER_TIME);
  assert.equal((await getPersonalizationStatus({ env })).status, 'ready_persistent');

  await assert.rejects(() => deletePersonalization({ env }), (error) => error.code === 'ERR_PERSONALIZATION_CONFIRMATION');
  assert.equal((await getPersonalizationStatus({ env })).status, 'ready_persistent');
  assert.deepEqual(await deletePersonalization({ env, confirm: 'DELETE' }), { status: 'absent', deleted: true });
  assert.equal((await getPersonalizationStatus({ env })).status, 'absent');
});

test('snapshot hashing is stable, bounded, and includes only confirmed allowlisted preferences', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const first = await buildPersonalizationSnapshot({ env });
  const second = await buildPersonalizationSnapshot({ env });

  assert.deepEqual(second, first);
  assert.deepEqual(Object.keys(first.preferences).sort(), [
    'answer_length',
    'clarify_before_drafting',
    'document_formats',
    'language',
    'principal_address',
    'response_structure',
    'secretary_name',
    'tone',
  ]);
  assert.equal(Object.hasOwn(first, 'raw_conversation'), false);
  await assert.rejects(() => buildPersonalizationSnapshot({ env, maxBytes: first.byte_length - 1 }), /snapshot exceeds/);
  await assert.rejects(() => buildPersonalizationSnapshot({ env, maxBytes: 4097 }), /between 1 and 4096/);
});

test('doctor reports statuses and permission failures without returning record contents', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const paths = personalizationPaths(env);
  let report = await doctorPersonalization({ env });
  assert.equal(report.healthy, true);
  assert.deepEqual(report.mutation_lock, { status: 'absent', pid: null, recoverable: false });
  assert.deepEqual(report.permissions, { root: '0700', consent: '0600', profile: '0600' });

  await chmod(paths.profile, 0o644);
  report = await doctorPersonalization({ env });
  assert.equal(report.status, 'invalid');
  assert.equal(report.healthy, false);
  assert.match(report.issues.join('; '), /permissions must be 0600/);
  assert.equal(Object.hasOwn(report, 'profile'), false);
});

test('doctor detects a stale lock and confirmed delete recovers it', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const paths = personalizationPaths(env);
  await writeFile(path.join(paths.root, '.mutation.lock'), '', { mode: 0o600 });
  const old = new Date(Date.now() - 10 * 60 * 1000);
  await utimes(path.join(paths.root, '.mutation.lock'), old, old);

  const report = await doctorPersonalization({ env });
  assert.equal(report.healthy, false);
  assert.equal(report.mutation_lock.status, 'invalid');
  assert.equal(report.mutation_lock.recoverable, true);
  assert.match(report.issues.join('; '), /mutation lock/);
  assert.deepEqual(await deletePersonalization({ env, confirm: 'DELETE' }), { status: 'absent', deleted: true });
});

test('confirmed delete refuses a recent invalid lock that may still be initializing', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const paths = personalizationPaths(env);
  await writeFile(path.join(paths.root, '.mutation.lock'), '', { mode: 0o600 });

  const report = await doctorPersonalization({ env });
  assert.deepEqual(report.mutation_lock, { status: 'invalid', pid: null, recoverable: false });
  await assert.rejects(
    () => deletePersonalization({ env, confirm: 'DELETE' }),
    (error) => error.code === 'ERR_PERSONALIZATION_BUSY',
  );
  assert.equal((await getPersonalizationStatus({ env })).status, 'ready_persistent');
});

test('doctor reports a live mutation owner and confirmed delete stays busy', async (t) => {
  const { env } = await fixture(t);
  await initializePersistent(env);
  const paths = personalizationPaths(env);
  await writeFile(path.join(paths.root, '.mutation.lock'), `${JSON.stringify({
    version: 'secretary.personalization-lock/1',
    pid: process.pid,
    created_at: new Date().toISOString(),
  })}\n`, { mode: 0o600 });

  const report = await doctorPersonalization({ env });
  assert.deepEqual(report.mutation_lock, { status: 'active', pid: process.pid, recoverable: false });
  await assert.rejects(
    () => deletePersonalization({ env, confirm: 'DELETE' }),
    (error) => error.code === 'ERR_PERSONALIZATION_BUSY',
  );
});
