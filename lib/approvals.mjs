import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  actionSha256,
  atomicWriteJson,
  canonicalJson,
  grantSha256,
  readJson,
  runDirectory,
  secretaryError,
} from './core.mjs';

const APPROVAL_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const GRANT_ENVELOPE_VERSION = 'secretary.signed-grant/1';
const GRANT_PAYLOAD_VERSION = 'secretary.approval-grant/1';

export function validateApprovalId(approvalId) {
  if (!APPROVAL_ID_PATTERN.test(approvalId || '')) {
    throw secretaryError('no_such_approval', 'approval ID is invalid');
  }
  return approvalId;
}

export function approvalsDirectory(runId, env = process.env) {
  return path.join(runDirectory(runId, env), 'approvals');
}

export function grantRecordFile(runId, approvalId, env = process.env) {
  return path.join(approvalsDirectory(runId, env), `${validateApprovalId(approvalId)}.grant.json`);
}

export function denialRecordFile(runId, approvalId, env = process.env) {
  return path.join(approvalsDirectory(runId, env), `${validateApprovalId(approvalId)}.denial.json`);
}

function grantSecretFile(runId, env) {
  return path.join(runDirectory(runId, env), 'approval-hmac.key');
}

function signedGrantTag(secret, payload) {
  return createHmac('sha256', secret).update(canonicalJson(payload)).digest('hex');
}

function tagsEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function loadApprovalRequest(runId, approvalId, env = process.env) {
  validateApprovalId(approvalId);
  let result;
  try {
    result = await readJson(path.join(runDirectory(runId, env), 'result.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw secretaryError('no_such_approval', `no approval request exists for run ${runId}`);
    }
    throw error;
  }
  const request = result?.status === 'needs_approval' ? result.approval_request : null;
  if (!request || request.approval_id !== approvalId) {
    throw secretaryError('no_such_approval', `no approval ${approvalId} exists for run ${runId}`);
  }
  const expectedActionHash = actionSha256(request.action_type, request.action);
  if (request.action_sha256 !== expectedActionHash) {
    throw secretaryError('grant_mismatch', 'approval request action hash does not match its typed action');
  }
  return request;
}

export async function createGrant({
  runId,
  approvalRequest,
  allowedRoot,
  expiresAt,
  approvedBy,
  approvedAt,
  env = process.env,
}) {
  const computedGrantHash = grantSha256({
    runId,
    approvalId: approvalRequest.approval_id,
    actionType: approvalRequest.action_type,
    action: approvalRequest.action,
    expiresAt,
    allowedRoot,
  });
  const payload = {
    version: GRANT_PAYLOAD_VERSION,
    approved: true,
    run_id: runId,
    approval_id: approvalRequest.approval_id,
    action_type: approvalRequest.action_type,
    action: approvalRequest.action,
    action_sha256: approvalRequest.action_sha256,
    allowed_root: allowedRoot,
    expires_at: expiresAt,
    grant_sha256: computedGrantHash,
    approved_by: approvedBy,
    approved_at: approvedAt,
  };
  const secret = await readFile(grantSecretFile(runId, env));
  const envelope = {
    version: GRANT_ENVELOPE_VERSION,
    payload,
    hmac_sha256: signedGrantTag(secret, payload),
  };
  const file = grantRecordFile(runId, approvalRequest.approval_id, env);
  try {
    await writeFile(file, `${JSON.stringify(envelope)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(file, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw secretaryError('grant_mismatch', `approval ${approvalRequest.approval_id} already has a grant`);
    }
    throw error;
  }
  return payload;
}

export async function loadVerifiedGrant(runId, approvalId, env = process.env) {
  validateApprovalId(approvalId);
  let envelope;
  let secret;
  try {
    envelope = await readJson(grantRecordFile(runId, approvalId, env));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw secretaryError('no_such_approval', `approval ${approvalId} has no grant`);
    }
    throw secretaryError('grant_integrity_failed', `approval grant cannot be read: ${error.message}`);
  }
  try {
    secret = await readFile(grantSecretFile(runId, env));
  } catch (error) {
    throw secretaryError('grant_integrity_failed', `approval grant key cannot be read: ${error.message}`);
  }
  try {
    if (envelope?.version !== GRANT_ENVELOPE_VERSION || !envelope.payload || typeof envelope.payload !== 'object') {
      throw new Error('grant envelope is invalid');
    }
    const expectedTag = signedGrantTag(secret, envelope.payload);
    if (!tagsEqual(envelope.hmac_sha256, expectedTag)) throw new Error('grant HMAC does not match');
  } catch (error) {
    throw secretaryError('grant_integrity_failed', error.message);
  }
  return envelope.payload;
}

export function verifyGrantBindings({ runId, approvalRequest, grant, allowedRoot }) {
  const expectedActionHash = actionSha256(approvalRequest.action_type, approvalRequest.action);
  if (
    grant.version !== GRANT_PAYLOAD_VERSION
    || grant.approved !== true
    || grant.run_id !== runId
    || grant.approval_id !== approvalRequest.approval_id
    || grant.action_type !== approvalRequest.action_type
    || canonicalJson(grant.action) !== canonicalJson(approvalRequest.action)
    || approvalRequest.action_sha256 !== expectedActionHash
    || grant.action_sha256 !== expectedActionHash
    || grant.allowed_root !== allowedRoot
  ) {
    throw secretaryError('grant_mismatch', 'approval grant does not match the run and typed action');
  }
  const expectedGrantHash = grantSha256({
    runId,
    approvalId: approvalRequest.approval_id,
    actionType: approvalRequest.action_type,
    action: approvalRequest.action,
    expiresAt: grant.expires_at,
    allowedRoot,
  });
  if (grant.grant_sha256 !== expectedGrantHash) {
    throw secretaryError('grant_mismatch', 'approval grant hash does not match its bound fields');
  }
  return grant;
}

export async function writeDenial({ runId, approvalId, reason, deniedBy, deniedAt, env = process.env }) {
  const record = {
    version: 'secretary.approval-denial/1',
    run_id: runId,
    approval_id: validateApprovalId(approvalId),
    reason,
    denied_by: deniedBy,
    denied_at: deniedAt,
  };
  await atomicWriteJson(denialRecordFile(runId, approvalId, env), record);
  return record;
}

export async function readDenial(runId, approvalId, env = process.env) {
  try {
    return await readJson(denialRecordFile(runId, approvalId, env));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
