import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_ROOT,
  canonicalJson,
  sha256,
  stateRoot,
  validateSchema,
} from './core.mjs';

const CONSENT_VERSION = 'secretary.principal-consent/1';
const PROFILE_VERSION = 'secretary.principal-profile/1';
const SESSION_VERSION = 'secretary.principal-session/1';
const EXPORT_VERSION = 'secretary.principal-export/1';
const SNAPSHOT_VERSION = 'secretary.personalization-snapshot/1';
const MAX_RECORD_BYTES = 64 * 1024;
const INVALID_LOCK_RECOVERY_MS = 5 * 60 * 1000;
export const MAX_PERSONALIZATION_SNAPSHOT_BYTES = 4096;

export const GOVERNED_PROFILE_IDS = Object.freeze([
  'general-secretary',
  'communications-secretary',
  'operations-secretary',
  'research-secretary',
  'agent-chief-of-staff',
]);

export const PERSONALIZATION_FIELDS = Object.freeze([
  'language',
  'secretary_name',
  'principal_address',
  'default_profile',
  'tone',
  'answer_length',
  'response_structure',
  'document_formats',
  'clarify_before_drafting',
]);

const PERSONALIZATION_FIELD_SET = new Set(PERSONALIZATION_FIELDS);
const schemaCache = new Map();

export class PersonalizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PersonalizationError';
    this.code = code;
  }
}

function personalizationError(code, message) {
  return new PersonalizationError(code, message);
}

function timestamp(clock = () => new Date()) {
  const observed = typeof clock === 'function' ? clock() : clock;
  const date = observed instanceof Date ? observed : new Date(observed);
  if (Number.isNaN(date.getTime())) throw personalizationError('ERR_PERSONALIZATION_CLOCK', 'personalization clock returned an invalid date');
  return date.toISOString();
}

export function personalizationPaths(env = process.env) {
  const root = path.join(stateRoot(env), 'personalization');
  return {
    root,
    consent: path.join(root, 'consent.json'),
    profile: path.join(root, 'global.json'),
  };
}

async function loadSchema(name) {
  if (!schemaCache.has(name)) {
    const file = path.join(PROJECT_ROOT, 'schemas', name);
    schemaCache.set(name, JSON.parse(await readFile(file, 'utf8')));
  }
  return schemaCache.get(name);
}

function modeBits(metadata) {
  return metadata.mode & 0o777;
}

// Windows reports every NTFS entry as 0666 or 0444 regardless of any chmod, so a POSIX mode
// comparison there rejects state the platform cannot represent and personalization can never
// initialize. Access is governed by NTFS ACLs instead. Symlink, file-type, and size checks
// stay enforced on every platform.
const POSIX_MODES_ENFORCED = process.platform !== 'win32';

async function lstatOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectDirectory(directory, label) {
  const metadata = await lstatOrNull(directory);
  if (metadata === null) return { exists: false, issues: [], mode: null };
  const issues = [];
  if (metadata.isSymbolicLink()) issues.push(`${label} must not be a symbolic link`);
  else if (!metadata.isDirectory()) issues.push(`${label} must be a directory`);
  else if (POSIX_MODES_ENFORCED && modeBits(metadata) !== 0o700) issues.push(`${label} permissions must be 0700`);
  return { exists: true, issues, mode: modeBits(metadata).toString(8).padStart(4, '0') };
}

async function inspectRoots(env) {
  const paths = personalizationPaths(env);
  const personalization = await inspectDirectory(paths.root, 'personalization directory');
  if (!personalization.exists) return { issues: [], paths, state: null, personalization };
  const state = await inspectDirectory(stateRoot(env), 'Secretary state directory');
  return { issues: [...state.issues, ...personalization.issues], paths, state, personalization };
}

async function boundedNoFollowRead(file) {
  const metadata = await lstatOrNull(file);
  if (metadata === null) return { kind: 'absent', mode: null };
  if (metadata.isSymbolicLink()) return { kind: 'invalid', issue: `${path.basename(file)} must not be a symbolic link`, mode: modeBits(metadata) };
  if (!metadata.isFile()) return { kind: 'invalid', issue: `${path.basename(file)} must be a regular file`, mode: modeBits(metadata) };
  if (metadata.size > MAX_RECORD_BYTES) return { kind: 'invalid', issue: `${path.basename(file)} exceeds ${MAX_RECORD_BYTES} bytes`, mode: modeBits(metadata) };
  if (POSIX_MODES_ENFORCED && modeBits(metadata) !== 0o600) return { kind: 'invalid', issue: `${path.basename(file)} permissions must be 0600`, mode: modeBits(metadata) };

  let handle;
  try {
    handle = await open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile()) return { kind: 'invalid', issue: `${path.basename(file)} must be a regular file`, mode: modeBits(opened) };
    if (opened.size > MAX_RECORD_BYTES) return { kind: 'invalid', issue: `${path.basename(file)} exceeds ${MAX_RECORD_BYTES} bytes`, mode: modeBits(opened) };
    const bytes = await handle.readFile();
    if (bytes.length > MAX_RECORD_BYTES) return { kind: 'invalid', issue: `${path.basename(file)} exceeds ${MAX_RECORD_BYTES} bytes`, mode: modeBits(opened) };
    return { kind: 'bytes', bytes, mode: modeBits(opened) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'absent', mode: null };
    if (error?.code === 'ELOOP') return { kind: 'invalid', issue: `${path.basename(file)} must not be a symbolic link`, mode: metadata === null ? null : modeBits(metadata) };
    return { kind: 'invalid', issue: `${path.basename(file)} could not be read safely: ${error.message}`, mode: metadata === null ? null : modeBits(metadata) };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function inspectRecord(file, expectedVersion, schemaName, semanticValidate) {
  const read = await boundedNoFollowRead(file);
  if (read.kind !== 'bytes') return read;
  let value;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch {
    return { kind: 'invalid', issue: `${path.basename(file)} is not valid JSON`, mode: read.mode };
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.version === 'string' && value.version !== expectedVersion) {
    return { kind: 'unknown', issue: `${path.basename(file)} uses unsupported version ${JSON.stringify(value.version)}`, mode: read.mode };
  }
  const errors = validateSchema(value, await loadSchema(schemaName));
  if (errors.length > 0) return { kind: 'invalid', issue: `${path.basename(file)} is invalid: ${errors.join('; ')}`, mode: read.mode };
  const semanticErrors = semanticValidate(value);
  if (semanticErrors.length > 0) return { kind: 'invalid', issue: `${path.basename(file)} is invalid: ${semanticErrors.join('; ')}`, mode: read.mode };
  return { kind: 'valid', value, mode: read.mode };
}

function validateConsentSemantics(consent) {
  const errors = [];
  if (consent.decision === 'declined') {
    if (Object.hasOwn(consent, 'provider_use')) errors.push('declined consent must not store provider_use');
    if (Object.hasOwn(consent, 'paused')) errors.push('declined consent must not store paused');
  }
  if (consent.decision === 'persistent') {
    if (typeof consent.provider_use !== 'boolean') errors.push('persistent consent requires provider_use');
    if (typeof consent.paused !== 'boolean') errors.push('persistent consent requires paused');
  }
  if (Date.parse(consent.updated_at) < Date.parse(consent.created_at)) errors.push('updated_at must not precede created_at');
  return errors;
}

function validateProfileSemantics(profile) {
  const errors = [];
  if (Date.parse(profile.updated_at) < Date.parse(profile.created_at)) errors.push('updated_at must not precede created_at');
  return errors;
}

function normalizeString(value) {
  return value.normalize('NFC').trim();
}

function normalizePreferences(preferences) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw personalizationError('ERR_PERSONALIZATION_INPUT', 'preferences must be an object');
  }
  const normalized = {};
  for (const [field, value] of Object.entries(preferences)) {
    if (!PERSONALIZATION_FIELD_SET.has(field)) {
      throw personalizationError('ERR_PERSONALIZATION_FIELD', `personalization field is not allowed: ${field}`);
    }
    if (Array.isArray(value)) normalized[field] = value.map((item) => typeof item === 'string' ? normalizeString(item) : item);
    else normalized[field] = typeof value === 'string' ? normalizeString(value) : value;
  }
  return normalized;
}

async function validatePreferences(preferences) {
  const normalized = normalizePreferences(preferences);
  const now = '2000-01-01T00:00:00.000Z';
  const candidate = {
    version: PROFILE_VERSION,
    revision: 1,
    preferences: normalized,
    created_at: now,
    updated_at: now,
  };
  const errors = validateSchema(candidate, await loadSchema('principal-profile.v1.json'));
  if (errors.length > 0) throw personalizationError('ERR_PERSONALIZATION_INPUT', `invalid personalization preferences: ${errors.join('; ')}`);
  return normalized;
}

function sessionStatus(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return { valid: false, issue: 'session personalization must be an object' };
  }
  const keys = Object.keys(session).sort();
  if (canonicalJson(keys) !== canonicalJson(['preferences', 'provider_use', 'version'])) {
    return { valid: false, issue: 'session personalization contains unsupported fields' };
  }
  if (session.version !== SESSION_VERSION) return { valid: false, issue: 'session personalization has an unsupported version' };
  if (typeof session.provider_use !== 'boolean') return { valid: false, issue: 'session provider_use must be boolean' };
  try {
    normalizePreferences(session.preferences);
  } catch (error) {
    return { valid: false, issue: error.message };
  }
  return { valid: true };
}

async function inspectState({ env = process.env, session } = {}) {
  if (session !== undefined) {
    const checked = sessionStatus(session);
    if (!checked.valid) {
      return { status: 'invalid', durable: false, provider_use: false, consent_revision: null, profile_revision: null, issues: [checked.issue], consent: null, profile: null, session: null };
    }
    try {
      const preferences = await validatePreferences(session.preferences);
      return {
        status: 'ready_session',
        durable: false,
        provider_use: session.provider_use,
        consent_revision: null,
        profile_revision: null,
        issues: [],
        consent: null,
        profile: null,
        session: { ...session, preferences },
      };
    } catch (error) {
      return { status: 'invalid', durable: false, provider_use: false, consent_revision: null, profile_revision: null, issues: [error.message], consent: null, profile: null, session: null };
    }
  }

  const roots = await inspectRoots(env);
  if (!roots.personalization.exists) {
    return { status: 'absent', durable: false, provider_use: false, consent_revision: null, profile_revision: null, issues: [], consent: null, profile: null, session: null };
  }
  if (roots.issues.length > 0) {
    return { status: 'invalid', durable: true, provider_use: false, consent_revision: null, profile_revision: null, issues: roots.issues, consent: null, profile: null, session: null };
  }
  const [consent, profile] = await Promise.all([
    inspectRecord(roots.paths.consent, CONSENT_VERSION, 'principal-consent.v1.json', validateConsentSemantics),
    inspectRecord(roots.paths.profile, PROFILE_VERSION, 'principal-profile.v1.json', validateProfileSemantics),
  ]);
  const records = [consent, profile];
  if (records.some((record) => record.kind === 'unknown')) {
    return { status: 'needs_reconsent', durable: true, provider_use: false, consent_revision: null, profile_revision: null, issues: records.filter((record) => record.issue).map((record) => record.issue), consent: null, profile: null, session: null };
  }
  if (records.some((record) => record.kind === 'invalid')) {
    return { status: 'invalid', durable: true, provider_use: false, consent_revision: null, profile_revision: null, issues: records.filter((record) => record.issue).map((record) => record.issue), consent: null, profile: null, session: null };
  }
  if (consent.kind === 'absent' && profile.kind === 'absent') {
    return { status: 'absent', durable: false, provider_use: false, consent_revision: null, profile_revision: null, issues: [], consent: null, profile: null, session: null };
  }
  if (consent.kind !== 'valid') {
    return { status: 'invalid', durable: true, provider_use: false, consent_revision: null, profile_revision: profile.value?.revision ?? null, issues: ['global.json exists without valid consent.json'], consent: null, profile: null, session: null };
  }
  if (consent.value.decision === 'declined') {
    if (profile.kind !== 'absent') {
      return { status: 'invalid', durable: true, provider_use: false, consent_revision: consent.value.revision, profile_revision: profile.value?.revision ?? null, issues: ['declined consent must not have a saved profile'], consent: null, profile: null, session: null };
    }
    return { status: 'declined_remembered', durable: true, provider_use: false, consent_revision: consent.value.revision, profile_revision: null, issues: [], consent: consent.value, profile: null, session: null };
  }
  if (profile.kind !== 'valid') {
    return { status: 'invalid', durable: true, provider_use: false, consent_revision: consent.value.revision, profile_revision: null, issues: ['persistent consent requires a valid global.json'], consent: null, profile: null, session: null };
  }
  return {
    status: consent.value.paused ? 'paused' : 'ready_persistent',
    durable: true,
    provider_use: consent.value.provider_use,
    consent_revision: consent.value.revision,
    profile_revision: profile.value.revision,
    issues: [],
    consent: consent.value,
    profile: profile.value,
    session: null,
  };
}

export async function getPersonalizationStatus(options = {}) {
  const observed = await inspectState(options);
  return {
    status: observed.status,
    durable: observed.durable,
    provider_use: observed.provider_use,
    consent_revision: observed.consent_revision,
    profile_revision: observed.profile_revision,
    issues: observed.issues,
  };
}

export async function showPersonalization(options = {}) {
  const observed = await inspectState(options);
  return {
    status: observed.status,
    durable: observed.durable,
    provider_use: observed.provider_use,
    consent_revision: observed.consent_revision,
    profile_revision: observed.profile_revision,
    issues: observed.issues,
    consent: observed.consent,
    profile: observed.profile,
    session: observed.session,
  };
}

async function ensureSafePrivateDirectory(directory) {
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  let handle;
  try {
    handle = await open(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isDirectory()) throw personalizationError('ERR_PERSONALIZATION_PATH', `${directory} must be a directory`);
    try {
      await handle.chmod(0o700);
    } catch (error) {
      // Windows cannot fchmod a directory handle (EPERM); NTFS ACLs govern access instead.
      if (process.platform !== 'win32') throw error;
    }
  } catch (error) {
    if (error?.code === 'ELOOP') throw personalizationError('ERR_PERSONALIZATION_PATH', `${directory} must not be a symbolic link`);
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function ensurePersonalizationRoot(env) {
  const state = stateRoot(env);
  await mkdir(path.dirname(state), { recursive: true, mode: 0o700 });
  await ensureSafePrivateDirectory(state);
  const paths = personalizationPaths(env);
  await ensureSafePrivateDirectory(paths.root);
  return paths;
}

async function atomicPrivateJson(file, value, env) {
  const paths = await ensurePersonalizationRoot(env);
  if (path.dirname(file) !== paths.root) throw personalizationError('ERR_PERSONALIZATION_PATH', 'personalization writes must stay in the personalization directory');
  const temporary = path.join(paths.root, `.${path.basename(file)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
    let directoryHandle;
    try {
      directoryHandle = await open(paths.root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      try {
        await directoryHandle.sync();
      } catch (error) {
        // Windows cannot fsync a directory handle (EPERM); the file handle above was already synced.
        if (process.platform !== 'win32') throw error;
      }
    } finally {
      await directoryHandle?.close().catch(() => {});
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function withMutationLock(env, operation) {
  const paths = await ensurePersonalizationRoot(env);
  const lock = path.join(paths.root, '.mutation.lock');
  let handle;
  try {
    handle = await open(lock, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify({
      version: 'secretary.personalization-lock/1',
      pid: process.pid,
      created_at: new Date().toISOString(),
    })}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ELOOP') {
      throw personalizationError('ERR_PERSONALIZATION_BUSY', 'another personalization mutation is already in progress');
    }
    throw error;
  }
  try {
    return await operation(paths);
  } finally {
    await handle.close().catch(() => {});
    await unlink(lock).catch(() => {});
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

async function inspectMutationLock(paths) {
  const lock = path.join(paths.root, '.mutation.lock');
  const metadata = await lstatOrNull(lock);
  if (metadata === null) return { status: 'absent', pid: null, recoverable: false, issue: null };
  const invalidRecoverable = Date.now() - metadata.mtimeMs >= INVALID_LOCK_RECOVERY_MS;
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: 'mutation lock must be a regular non-symlinked file' };
  }
  if (metadata.size > 4096 || (POSIX_MODES_ENFORCED && modeBits(metadata) !== 0o600)) {
    return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: 'mutation lock has invalid size or permissions' };
  }
  let handle;
  try {
    handle = await open(lock, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > 4096) return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: 'mutation lock is not safely readable' };
    const bytes = await handle.readFile();
    if (bytes.length > 4096) return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: 'mutation lock exceeds 4096 bytes' };
    const value = JSON.parse(bytes.toString('utf8'));
    if (value?.version !== 'secretary.personalization-lock/1' || !Number.isSafeInteger(value.pid) || value.pid <= 0 || Number.isNaN(Date.parse(value.created_at))) {
      return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: 'mutation lock record is invalid' };
    }
    const active = processIsAlive(value.pid);
    return { status: active ? 'active' : 'stale', pid: value.pid, recoverable: !active, issue: null };
  } catch (error) {
    return { status: 'invalid', pid: null, recoverable: invalidRecoverable, issue: `mutation lock could not be verified: ${error.message}` };
  } finally {
    await handle?.close().catch(() => {});
  }
}

function assertRevision(actual, expected, label) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw personalizationError('ERR_PERSONALIZATION_REVISION', `expected ${label} revision must be a positive integer`);
  }
  if (actual !== expected) {
    throw personalizationError('ERR_PERSONALIZATION_CONFLICT', `${label} revision conflict: expected ${expected}, observed ${actual}`);
  }
}

function assertMutableProfile(observed) {
  if (!['ready_persistent', 'paused'].includes(observed.status)) {
    throw personalizationError('ERR_PERSONALIZATION_STATE', `saved preferences cannot be changed while personalization status is ${observed.status}`);
  }
}

export async function initializePersonalization({ mode, preferences = {}, providerUse = false, env = process.env, clock = () => new Date() } = {}) {
  if (!['persistent', 'session', 'declined'].includes(mode)) {
    throw personalizationError('ERR_PERSONALIZATION_INPUT', 'personalization mode must be persistent, session, or declined');
  }
  if (typeof providerUse !== 'boolean') throw personalizationError('ERR_PERSONALIZATION_INPUT', 'providerUse must be boolean');
  if (mode === 'session') {
    const normalized = await validatePreferences(preferences);
    const session = { version: SESSION_VERSION, provider_use: providerUse, preferences: normalized };
    return showPersonalization({ env, session });
  }
  if (mode === 'declined' && (Object.keys(preferences).length > 0 || providerUse)) {
    throw personalizationError('ERR_PERSONALIZATION_INPUT', 'declined personalization cannot store preferences or provider consent');
  }
  const normalized = mode === 'persistent' ? await validatePreferences(preferences) : {};
  return withMutationLock(env, async (paths) => {
    const current = await inspectState({ env });
    if (current.status !== 'absent') {
      throw personalizationError('ERR_PERSONALIZATION_STATE', `personalization is already ${current.status}`);
    }
    const now = timestamp(clock);
    if (mode === 'declined') {
      await atomicPrivateJson(paths.consent, {
        version: CONSENT_VERSION,
        revision: 1,
        decision: 'declined',
        created_at: now,
        updated_at: now,
      }, env);
      return showPersonalization({ env });
    }
    const profile = {
      version: PROFILE_VERSION,
      revision: 1,
      preferences: normalized,
      created_at: now,
      updated_at: now,
    };
    const consent = {
      version: CONSENT_VERSION,
      revision: 1,
      decision: 'persistent',
      provider_use: providerUse,
      paused: false,
      created_at: now,
      updated_at: now,
    };
    await atomicPrivateJson(paths.profile, profile, env);
    try {
      await atomicPrivateJson(paths.consent, consent, env);
    } catch (error) {
      await unlink(paths.profile).catch(() => {});
      throw error;
    }
    return showPersonalization({ env });
  });
}

export async function setPersonalization({ changes, expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  const normalizedChanges = await validatePreferences(changes);
  if (Object.keys(normalizedChanges).length === 0) throw personalizationError('ERR_PERSONALIZATION_INPUT', 'at least one personalization field is required');
  return withMutationLock(env, async (paths) => {
    const current = await inspectState({ env });
    assertMutableProfile(current);
    assertRevision(current.profile.revision, expectedRevision, 'profile');
    const preferences = await validatePreferences({ ...current.profile.preferences, ...normalizedChanges });
    await atomicPrivateJson(paths.profile, {
      ...current.profile,
      revision: current.profile.revision + 1,
      preferences,
      updated_at: timestamp(clock),
    }, env);
    return showPersonalization({ env });
  });
}

export async function unsetPersonalization({ fields, expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  if (!Array.isArray(fields) || fields.length === 0) throw personalizationError('ERR_PERSONALIZATION_INPUT', 'fields must be a non-empty array');
  for (const field of fields) {
    if (!PERSONALIZATION_FIELD_SET.has(field)) throw personalizationError('ERR_PERSONALIZATION_FIELD', `personalization field is not allowed: ${field}`);
  }
  if (new Set(fields).size !== fields.length) throw personalizationError('ERR_PERSONALIZATION_INPUT', 'fields must not contain duplicates');
  return withMutationLock(env, async (paths) => {
    const current = await inspectState({ env });
    assertMutableProfile(current);
    assertRevision(current.profile.revision, expectedRevision, 'profile');
    const preferences = { ...current.profile.preferences };
    for (const field of fields) delete preferences[field];
    await atomicPrivateJson(paths.profile, {
      ...current.profile,
      revision: current.profile.revision + 1,
      preferences,
      updated_at: timestamp(clock),
    }, env);
    return showPersonalization({ env });
  });
}

async function updateConsent({ expectedRevision, env, clock, update }) {
  return withMutationLock(env, async (paths) => {
    const current = await inspectState({ env });
    assertMutableProfile(current);
    assertRevision(current.consent.revision, expectedRevision, 'consent');
    const next = update(current.consent);
    await atomicPrivateJson(paths.consent, {
      ...next,
      revision: current.consent.revision + 1,
      updated_at: timestamp(clock),
    }, env);
    return showPersonalization({ env });
  });
}

export async function pausePersonalization({ expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  return updateConsent({ expectedRevision, env, clock, update: (consent) => ({ ...consent, paused: true }) });
}

export async function resumePersonalization({ expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  return updateConsent({ expectedRevision, env, clock, update: (consent) => ({ ...consent, paused: false }) });
}

export async function setPersonalizationProviderUse({ providerUse, expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  if (typeof providerUse !== 'boolean') throw personalizationError('ERR_PERSONALIZATION_INPUT', 'providerUse must be boolean');
  return updateConsent({ expectedRevision, env, clock, update: (consent) => ({ ...consent, provider_use: providerUse }) });
}

export async function exportPersonalization({ env = process.env, session, clock = () => new Date() } = {}) {
  const current = await inspectState({ env, session });
  return {
    version: EXPORT_VERSION,
    exported_at: timestamp(clock),
    status: current.status,
    consent: current.consent,
    profile: current.profile,
    session: current.session,
  };
}

export async function resetPersonalization({ expectedRevision, env = process.env, clock = () => new Date() } = {}) {
  return withMutationLock(env, async (paths) => {
    const current = await inspectState({ env });
    assertMutableProfile(current);
    assertRevision(current.profile.revision, expectedRevision, 'profile');
    await atomicPrivateJson(paths.profile, {
      ...current.profile,
      revision: current.profile.revision + 1,
      preferences: {},
      updated_at: timestamp(clock),
    }, env);
    return showPersonalization({ env });
  });
}

export async function deletePersonalization({ env = process.env, confirm } = {}) {
  if (confirm !== 'DELETE') throw personalizationError('ERR_PERSONALIZATION_CONFIRMATION', 'deleting personalization requires confirm: DELETE');
  const paths = personalizationPaths(env);
  const stateMetadata = await lstatOrNull(stateRoot(env));
  if (stateMetadata?.isSymbolicLink() || (stateMetadata !== null && !stateMetadata.isDirectory())) {
    throw personalizationError('ERR_PERSONALIZATION_PATH', 'Secretary state directory must be a real directory before deletion');
  }
  const metadata = await lstatOrNull(paths.root);
  if (metadata === null) return { status: 'absent', deleted: false };
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw personalizationError('ERR_PERSONALIZATION_PATH', 'personalization directory must be a real directory before deletion');
  }
  const lock = await inspectMutationLock(paths);
  if (lock.status === 'active' || (lock.status === 'invalid' && !lock.recoverable)) {
    const owner = lock.pid ? ` in process ${lock.pid}` : '';
    throw personalizationError('ERR_PERSONALIZATION_BUSY', `personalization mutation may still be active${owner}`);
  }
  if (lock.recoverable) {
    await unlink(path.join(paths.root, '.mutation.lock')).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  await withMutationLock(env, async (lockedPaths) => {
    // Node does not expose openat-style mutation. No-follow opens and same-directory
    // replacement close final-target attacks. A malicious same-user parent swap is
    // outside this boundary and remains a residual host risk.
    await rm(lockedPaths.root, { recursive: true, force: false });
  });
  return { status: 'absent', deleted: true };
}

export async function doctorPersonalization({ env = process.env, session } = {}) {
  const paths = personalizationPaths(env);
  const current = await inspectState({ env, session });
  const rootMetadata = await lstatOrNull(paths.root);
  const consentMetadata = await lstatOrNull(paths.consent);
  const profileMetadata = await lstatOrNull(paths.profile);
  const mutationLock = rootMetadata && !rootMetadata.isSymbolicLink() && rootMetadata.isDirectory()
    ? await inspectMutationLock(paths)
    : { status: 'absent', pid: null, recoverable: false, issue: null };
  const issues = [...current.issues, ...(mutationLock.issue ? [mutationLock.issue] : [])];
  return {
    status: current.status,
    healthy: ['absent', 'ready_persistent', 'ready_session', 'declined_remembered', 'paused'].includes(current.status) && issues.length === 0,
    issues,
    mutation_lock: { status: mutationLock.status, pid: mutationLock.pid, recoverable: mutationLock.recoverable },
    paths,
    permissions: {
      root: rootMetadata && !rootMetadata.isSymbolicLink() ? modeBits(rootMetadata).toString(8).padStart(4, '0') : null,
      consent: consentMetadata && !consentMetadata.isSymbolicLink() ? modeBits(consentMetadata).toString(8).padStart(4, '0') : null,
      profile: profileMetadata && !profileMetadata.isSymbolicLink() ? modeBits(profileMetadata).toString(8).padStart(4, '0') : null,
    },
  };
}

export async function buildPersonalizationSnapshot({ env = process.env, session, maxBytes = MAX_PERSONALIZATION_SNAPSHOT_BYTES } = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PERSONALIZATION_SNAPSHOT_BYTES) {
    throw personalizationError('ERR_PERSONALIZATION_SNAPSHOT', `maxBytes must be between 1 and ${MAX_PERSONALIZATION_SNAPSHOT_BYTES}`);
  }
  const current = await inspectState({ env, session });
  if (!['ready_persistent', 'ready_session'].includes(current.status) || !current.provider_use) return null;
  const preferences = { ...(current.session?.preferences ?? current.profile.preferences) };
  // The controller already resolves the governed profile locally. Sending the
  // unused default would disclose extra state and could contradict an explicit
  // profile chosen for this run.
  delete preferences.default_profile;
  const payload = {
    version: SNAPSHOT_VERSION,
    preferences,
    consent_revision: current.consent_revision,
    profile_revision: current.profile_revision,
  };
  const canonical = canonicalJson(payload);
  const digest = sha256(canonical);
  let byteLength = 0;
  let snapshot;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    snapshot = { ...payload, sha256: digest, byte_length: byteLength };
    const observed = Buffer.byteLength(canonicalJson(snapshot), 'utf8');
    if (observed === byteLength) break;
    byteLength = observed;
  }
  snapshot = { ...payload, sha256: digest, byte_length: byteLength };
  if (Buffer.byteLength(canonicalJson(snapshot), 'utf8') > maxBytes) {
    throw personalizationError('ERR_PERSONALIZATION_SNAPSHOT', `personalization snapshot exceeds ${maxBytes} bytes`);
  }
  return snapshot;
}
