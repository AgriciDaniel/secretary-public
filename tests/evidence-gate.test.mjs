import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, cpSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(testDirectory);
const scriptPath = join(repositoryRoot, "scripts", "check-evidence.mjs");
const fixtureRoot = join(testDirectory, "fixtures", "evidence");
let outputSequence = 0;

function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "secretary-evidence-gate-"));
  cpSync(fixtureRoot, root, { recursive: true });
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function evidencePath(root) {
  return join(root, "references", "claim-evidence.json");
}

function extractPath(root) {
  return join(root, "references", "evidence", "synthetic-source", "extract.md");
}

function readRows(root) {
  return JSON.parse(readFileSync(evidencePath(root), "utf8"));
}

function writeRows(root, rows) {
  writeFileSync(evidencePath(root), `${JSON.stringify(rows, null, 2)}\n`);
}

function runGate(root, ...arguments_) {
  outputSequence += 1;
  const stdoutPath = join(root, `.gate-stdout-${outputSequence}`);
  const stderrPath = join(root, `.gate-stderr-${outputSequence}`);
  const stdout = openSync(stdoutPath, "w");
  const stderr = openSync(stderrPath, "w");
  let result;
  try {
    result = spawnSync(process.execPath, [scriptPath, "--root", root, ...arguments_], {
      env: {},
      stdio: ["ignore", stdout, stderr]
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  return {
    ...result,
    stdout: readFileSync(stdoutPath, "utf8"),
    stderr: readFileSync(stderrPath, "utf8")
  };
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

test("accepts a unique NFC-normalized quote with a matching hash and human attestation", (t) => {
  const root = makeFixture(t);
  const result = runGate(root);

  assert.equal(result.status, 0, combinedOutput(result));
  assert.equal(result.stdout, "Evidence locator gate passed: 1 claim-evidence row checked; human support: 1 supports, 0 partial, 0 pending.\n");
  assert.equal(result.stderr, "");
});

test("strict support gate accepts a named human supports attestation", (t) => {
  const root = makeFixture(t);
  const result = runGate(root, "--require-human-support");

  assert.equal(result.status, 0, combinedOutput(result));
});

test("accepts an empty claim-evidence registry", (t) => {
  const root = makeFixture(t);
  writeRows(root, []);
  const result = runGate(root);

  assert.equal(result.status, 0, combinedOutput(result));
  assert.equal(result.stdout, "Evidence locator gate passed: 0 claim-evidence rows checked; human support: 0 supports, 0 partial, 0 pending.\n");
});

test("strict support gate rejects an empty public projection as an omission, not a pass", (t) => {
  const root = makeFixture(t);
  writeRows(root, []);
  writeFileSync(join(root, "references", "public-export.json"), `${JSON.stringify({ omitted_claim_evidence: true })}\n`);
  const result = runGate(root, "--require-human-support");

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /public export omits the private claim evidence/u);
});

test("negative control: rejects a quote absent from the extract", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].locator.exact = "This quote is absent";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator\.exact was not found/u);
});

test("negative control: rejects a quote that appears twice", (t) => {
  const root = makeFixture(t);
  const extract = readFileSync(extractPath(root), "utf8");
  const duplicatedExtract = `${extract}\nCafé leaders choose a short passage for a claim.\n`;
  writeFileSync(extractPath(root), duplicatedExtract);
  const rows = readRows(root);
  rows[0].extract_sha256 = createHash("sha256").update(duplicatedExtract).digest("hex");
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator\.exact matched 2 times/u);
});

test("negative control: rejects the wrong extract hash", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].extract_sha256 = "0".repeat(64);
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /extract_sha256 mismatch/u);
});

test("negative control: rejects a missing extract file", (t) => {
  const root = makeFixture(t);
  rmSync(extractPath(root));
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /extract file is missing/u);
});

test("negative control: rejects a malformed locator", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  delete rows[0].locator.suffix;
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator\.suffix must be a string/u);
});

test("negative control: rejects missing verified_by", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  delete rows[0].locator_verification.verified_by;
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator_verification\.verified_by must be a non-empty string/u);
});

test("rejects locator context that does not match at the unique quote", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].locator.suffix = " with mismatched context";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator\.suffix does not match/u);
});

test("rejects a source_id absent from the source ledger", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].source_id = "unknown-source";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /does not resolve in references\/source-ledger\.json/u);
});

test("reports insufficient human support as a blocker", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].support_attestation.status = "insufficient";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /human support is insufficient and blocks the claim/u);
});

test("rejects a malformed verified_at date-time", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].locator_verification.verified_at = "2026-02-30T10:30:00Z";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /locator_verification\.verified_at must be a well-formed RFC 3339 date-time/u);
});

test("negative control: assistant locator verification cannot masquerade as human support", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].support_attestation.attester_type = "none";
  rows[0].support_attestation.attested_by = "Research assistant";
  writeRows(root, rows);
  const result = runGate(root);

  assert.equal(result.status, 1, combinedOutput(result));
  assert.match(result.stderr, /support decision requires attester_type human/u);
});

test("pending support passes locator checks but fails the strict human support gate", (t) => {
  const root = makeFixture(t);
  const rows = readRows(root);
  rows[0].support_attestation = {
    status: "pending",
    attester_type: "none",
    attested_by: null,
    attested_at: null
  };
  writeRows(root, rows);

  const locatorOnly = runGate(root);
  assert.equal(locatorOnly.status, 0, combinedOutput(locatorOnly));
  assert.match(locatorOnly.stdout, /0 supports, 0 partial, 1 pending/u);

  const strict = runGate(root, "--require-human-support");
  assert.equal(strict.status, 1, combinedOutput(strict));
  assert.match(strict.stderr, /strict support gate requires a named human supports attestation/u);
});

test("report mode lists bare domains and ledger sources without claim evidence without failing", (t) => {
  const root = makeFixture(t);
  const result = runGate(root, "--report");

  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.stdout, /Bare-domain source-ledger entries: 1/u);
  assert.match(result.stdout, /- bare-source: https:\/\/bare\.example\.test/u);
  assert.match(result.stdout, /Source-ledger entries without claim evidence: 1/u);
  assert.match(result.stdout, /- bare-source: https:\/\/bare\.example\.test/u);
  assert.match(result.stdout, /Human support attestations: 1 supports, 0 partial, 0 pending, 0 insufficient/u);
});

test("JSON report mode returns structured dashboard counts", (t) => {
  const root = makeFixture(t);
  const result = runGate(root, "--report", "--json");

  assert.equal(result.status, 0, combinedOutput(result));
  const report = JSON.parse(result.stdout);
  assert.equal(report.bare_domain_entries.count, 1);
  assert.equal(report.source_ledger_entries_without_claim_evidence.count, 1);
  assert.deepEqual(report.support_attestations, { supports: 1, partial: 0, pending: 0, insufficient: 0 });
});
