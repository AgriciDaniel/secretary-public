import { actionSha256, assertContainedPath, atomicWrite, grantSha256, sha256 } from '../core.mjs';

export function buildFileWriteApproval({ approvalId, target, content, reason }) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  const action = { target, content_sha256: sha256(bytes) };
  return {
    approval_id: approvalId,
    action_type: 'file.write',
    action,
    action_sha256: actionSha256('file.write', action),
    reason,
  };
}

export async function executeApprovedFileWrite({ runId, approvalRequest, humanApproval, content, allowedRoot, now = Date.now() }) {
  if (approvalRequest.action_type !== 'file.write') throw new Error('file-write adapter received the wrong action type');
  if (humanApproval?.approved !== true) throw new Error('human approval is required');
  if (humanApproval.run_id !== runId) throw new Error('run ID does not match');
  if (humanApproval.approval_id !== approvalRequest.approval_id) throw new Error('approval ID does not match');
  if (humanApproval.action_sha256 !== approvalRequest.action_sha256) throw new Error('approved action hash does not match');
  const expectedActionHash = actionSha256(approvalRequest.action_type, approvalRequest.action);
  if (expectedActionHash !== approvalRequest.action_sha256) throw new Error('approval request action hash is invalid');
  if (humanApproval.allowed_root !== allowedRoot) throw new Error('allowed root does not match');
  const expiresAt = Date.parse(humanApproval.expires_at);
  if (!Number.isFinite(expiresAt)) throw new Error('approval expiry is invalid');
  const expectedGrantHash = grantSha256({
    runId,
    approvalId: approvalRequest.approval_id,
    actionType: approvalRequest.action_type,
    action: approvalRequest.action,
    expiresAt: humanApproval.expires_at,
    allowedRoot,
  });
  if (humanApproval.grant_sha256 !== expectedGrantHash) throw new Error('approved grant hash does not match');
  if (expiresAt <= now) throw new Error('approval grant has expired');
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  if (sha256(bytes) !== approvalRequest.action.content_sha256) throw new Error('approved content hash does not match');
  const target = await assertContainedPath(allowedRoot, approvalRequest.action.target, { mustExist: false, allowRoot: false });
  await atomicWrite(target, bytes);
  return { action_type: 'file.write', target, action_sha256: approvalRequest.action_sha256 };
}
