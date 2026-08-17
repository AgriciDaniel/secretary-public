import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildFileWriteApproval, executeApprovedFileWrite } from '../lib/adapters/file-write.mjs';
import { grantSha256 } from '../lib/core.mjs';

function humanApproval({ runId, request, allowedRoot, expiresAt = '2999-01-01T00:00:00.000Z' }) {
  return {
    approved: true,
    run_id: runId,
    approval_id: request.approval_id,
    action_sha256: request.action_sha256,
    expires_at: expiresAt,
    allowed_root: allowedRoot,
    grant_sha256: grantSha256({
      runId,
      approvalId: request.approval_id,
      actionType: request.action_type,
      action: request.action,
      expiresAt,
      allowedRoot,
    }),
  };
}

test('grant hash is stable and separates otherwise identical actions by run', () => {
  const input = {
    approvalId: 'approval-0001',
    actionType: 'file.write',
    action: { target: '/tmp/outbound.txt', content_sha256: 'a'.repeat(64) },
    expiresAt: '2030-01-01T00:00:00.000Z',
    allowedRoot: '/tmp',
  };
  const first = grantSha256({ ...input, runId: 'grant-run-0001' });
  const repeated = grantSha256({ ...input, runId: 'grant-run-0001' });
  const secondRun = grantSha256({ ...input, runId: 'grant-run-0002' });
  assert.equal(first, repeated);
  assert.notEqual(first, secondRun);
});

test('file-write adapter executes only the exact human-approved typed action', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'secretary-action-')));
  const runId = 'action-run-0001';
  const target = path.join(root, 'outbound.txt');
  const content = 'Approved outbound document.\n';
  const request = buildFileWriteApproval({ approvalId: 'approval-0001', target, content, reason: 'Write the approved artifact.' });
  const approval = humanApproval({ runId, request, allowedRoot: root });
  await assert.rejects(() => executeApprovedFileWrite({ runId, approvalRequest: request, humanApproval: null, content, allowedRoot: root }), /human approval/);
  await assert.rejects(() => executeApprovedFileWrite({
    runId,
    approvalRequest: { ...request, action: { ...request.action, target: path.join(root, 'changed.txt') } },
    humanApproval: approval,
    content,
    allowedRoot: root,
  }), /action hash is invalid/);
  await assert.rejects(() => executeApprovedFileWrite({
    runId,
    approvalRequest: request,
    humanApproval: { ...approval, grant_sha256: '0'.repeat(64) },
    content,
    allowedRoot: root,
  }), /grant hash/);
  await assert.rejects(() => executeApprovedFileWrite({
    runId,
    approvalRequest: request,
    humanApproval: approval,
    content: 'changed',
    allowedRoot: root,
  }), /content hash/);
  const expiredAt = '2020-01-01T00:00:00.000Z';
  await assert.rejects(() => executeApprovedFileWrite({
    runId,
    approvalRequest: request,
    humanApproval: humanApproval({ runId, request, allowedRoot: root, expiresAt: expiredAt }),
    content,
    allowedRoot: root,
  }), /expired/);
  const result = await executeApprovedFileWrite({
    runId,
    approvalRequest: request,
    humanApproval: approval,
    content,
    allowedRoot: root,
  });
  assert.equal(result.target, target);
  assert.equal(await readFile(target, 'utf8'), content);
});
