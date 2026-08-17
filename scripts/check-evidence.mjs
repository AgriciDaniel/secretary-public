import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import process from "node:process";

const ALLOWED_ROW_KEYS = new Set([
  "claim_id",
  "note_path",
  "source_id",
  "locator",
  "extract_sha256",
  "locator_verification",
  "support_attestation",
  "archive_url",
  "archive_date",
  "access_status"
]);
const ALLOWED_LOCATOR_KEYS = new Set(["exact", "prefix", "suffix"]);
const ALLOWED_LOCATOR_VERIFICATION_KEYS = new Set(["method", "actor_type", "verified_by", "verified_at"]);
const ALLOWED_SUPPORT_ATTESTATION_KEYS = new Set(["status", "attester_type", "attested_by", "attested_at"]);
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const HTTPS_PATTERN = /^https:\/\//u;

function parseArguments(argv) {
  const options = { json: false, report: false, requireHumanSupport: false, root: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--report") {
      options.report = true;
    } else if (argument === "--require-human-support") {
      options.requireHumanSupport = true;
    } else if (argument === "--root") {
      const root = argv[index + 1];
      if (!root || root.startsWith("--")) {
        throw new Error("--root requires a directory path");
      }
      options.root = resolve(root);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return options;
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read at ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON at ${path}: ${error.message}`);
  }
}

async function readOptionalPublicExportMarker(root) {
  const markerPath = resolve(root, "references", "public-export.json");
  let text;
  try {
    text = await readFile(markerPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`public export marker could not be read at ${markerPath}: ${error.message}`);
  }
  let marker;
  try {
    marker = JSON.parse(text);
  } catch (error) {
    throw new Error(`public export marker is not valid JSON at ${markerPath}: ${error.message}`);
  }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
    throw new Error("references/public-export.json must contain an object");
  }
  return marker;
}

function ledgerSources(ledger) {
  if (!ledger || typeof ledger !== "object" || !Array.isArray(ledger.sources)) {
    throw new Error("references/source-ledger.json must contain a sources array");
  }
  return ledger.sources;
}

function evidenceRows(evidence) {
  if (!Array.isArray(evidence)) {
    throw new Error("references/claim-evidence.json must contain a JSON array");
  }
  return evidence;
}

function normalizedText(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ");
}

function matchPositions(text, quote) {
  const positions = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const position = text.indexOf(quote, cursor);
    if (position === -1) {
      break;
    }
    positions.push(position);
    cursor = position + 1;
  }
  return positions;
}

function isCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return Boolean(match && isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])));
}

function isDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  return isCalendarDate(Number(year), Number(month), Number(day))
    && Number(hour) <= 23
    && Number(minute) <= 59
    && Number(second) <= 59
    && (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59));
}

function isNotePath(value) {
  if (typeof value !== "string" || !value.startsWith("wiki/") || !value.endsWith(".md") || value.includes("\\") || /[\r\n]/u.test(value)) {
    return false;
  }
  const segments = value.split("/");
  return segments.length >= 2 && segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function labelFor(row, index) {
  const claim = row && typeof row.claim_id === "string" && row.claim_id.trim() ? row.claim_id : "missing claim_id";
  return `row ${index + 1} (${claim})`;
}

function validateRowShape(row, index, errors, options) {
  const label = labelFor(row, index);
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    errors.push(`${label}: row must be an object`);
    return false;
  }

  for (const key of Object.keys(row)) {
    if (!ALLOWED_ROW_KEYS.has(key)) {
      errors.push(`${label}: unexpected property ${key}`);
    }
  }
  if (typeof row.claim_id !== "string" || !row.claim_id.trim()) {
    errors.push(`${label}: claim_id must be a non-empty string`);
  }
  if (!isNotePath(row.note_path)) {
    errors.push(`${label}: note_path must match wiki/...md without empty or traversal segments`);
  }
  if (typeof row.source_id !== "string" || !SOURCE_ID_PATTERN.test(row.source_id)) {
    errors.push(`${label}: source_id must match ${SOURCE_ID_PATTERN}`);
  }
  if (typeof row.extract_sha256 !== "string" || !HASH_PATTERN.test(row.extract_sha256)) {
    errors.push(`${label}: extract_sha256 must contain exactly 64 lowercase hexadecimal characters`);
  }
  const locatorVerification = row.locator_verification;
  if (!locatorVerification || typeof locatorVerification !== "object" || Array.isArray(locatorVerification)) {
    errors.push(`${label}: locator_verification must be an object`);
  } else {
    for (const key of Object.keys(locatorVerification)) {
      if (!ALLOWED_LOCATOR_VERIFICATION_KEYS.has(key)) errors.push(`${label}: locator_verification has unexpected property ${key}`);
    }
    if (locatorVerification.method !== "raw_bytes_exact_match") {
      errors.push(`${label}: locator_verification.method must be raw_bytes_exact_match`);
    }
    if (!["human", "assistant", "tool"].includes(locatorVerification.actor_type)) {
      errors.push(`${label}: locator_verification.actor_type must be human, assistant, or tool`);
    }
    if (typeof locatorVerification.verified_by !== "string" || !locatorVerification.verified_by.trim()) {
      errors.push(`${label}: locator_verification.verified_by must be a non-empty string`);
    }
    if (typeof locatorVerification.verified_at !== "string" || !isDateTime(locatorVerification.verified_at)) {
      errors.push(`${label}: locator_verification.verified_at must be a well-formed RFC 3339 date-time`);
    }
  }
  const supportAttestation = row.support_attestation;
  if (!supportAttestation || typeof supportAttestation !== "object" || Array.isArray(supportAttestation)) {
    errors.push(`${label}: support_attestation must be an object`);
  } else {
    for (const key of Object.keys(supportAttestation)) {
      if (!ALLOWED_SUPPORT_ATTESTATION_KEYS.has(key)) errors.push(`${label}: support_attestation has unexpected property ${key}`);
    }
    const supportStatuses = ["pending", "supports", "partial", "insufficient"];
    if (!supportStatuses.includes(supportAttestation.status)) {
      errors.push(`${label}: support_attestation.status must be pending, supports, partial, or insufficient`);
    }
    if (supportAttestation.status === "pending") {
      if (supportAttestation.attester_type !== "none") errors.push(`${label}: pending support must use attester_type none`);
      if (supportAttestation.attested_by !== null) errors.push(`${label}: pending support must use null attested_by`);
      if (supportAttestation.attested_at !== null) errors.push(`${label}: pending support must use null attested_at`);
    } else {
      if (supportAttestation.attester_type !== "human") errors.push(`${label}: a support decision requires attester_type human`);
      if (typeof supportAttestation.attested_by !== "string" || !supportAttestation.attested_by.trim()) {
        errors.push(`${label}: a support decision requires a named human attested_by`);
      }
      if (typeof supportAttestation.attested_at !== "string" || !isDateTime(supportAttestation.attested_at)) {
        errors.push(`${label}: a support decision requires a well-formed RFC 3339 attested_at`);
      }
    }
    if (supportAttestation.status === "insufficient") {
      errors.push(`${label}: human support is insufficient and blocks the claim`);
    }
    if (options.requireHumanSupport && supportAttestation.status !== "supports") {
      errors.push(`${label}: strict support gate requires a named human supports attestation`);
    }
  }
  if (row.archive_url !== undefined && (typeof row.archive_url !== "string" || !HTTPS_PATTERN.test(row.archive_url))) {
    errors.push(`${label}: archive_url must be an HTTPS URL`);
  }
  if (row.archive_date !== undefined && (typeof row.archive_date !== "string" || !isDate(row.archive_date))) {
    errors.push(`${label}: archive_date must be a well-formed full date`);
  }
  if (row.access_status !== undefined && (typeof row.access_status !== "string" || !row.access_status.trim())) {
    errors.push(`${label}: access_status must be a non-empty string`);
  }

  const locator = row.locator;
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) {
    errors.push(`${label}: locator must be an object with exact, prefix, and suffix strings`);
    return false;
  }
  for (const key of Object.keys(locator)) {
    if (!ALLOWED_LOCATOR_KEYS.has(key)) {
      errors.push(`${label}: locator has unexpected property ${key}`);
    }
  }
  for (const key of ALLOWED_LOCATOR_KEYS) {
    if (typeof locator[key] !== "string") {
      errors.push(`${label}: locator.${key} must be a string`);
    }
  }
  if (typeof locator.exact === "string" && !normalizedText(locator.exact).trim()) {
    errors.push(`${label}: locator.exact must be non-empty after normalization`);
  }
  for (const key of ["prefix", "suffix"]) {
    if (typeof locator[key] === "string" && [...locator[key].normalize("NFC")].length > 32) {
      errors.push(`${label}: locator.${key} must not exceed 32 characters`);
    }
  }
  return ALLOWED_LOCATOR_KEYS.size === Object.keys(locator).length
    && [...ALLOWED_LOCATOR_KEYS].every((key) => typeof locator[key] === "string")
    && normalizedText(locator.exact).trim().length > 0;
}

async function validateEvidence(root, sources, rows, options) {
  const errors = [];
  const sourceIds = new Set();
  for (const source of sources) {
    if (source && typeof source.id === "string") {
      sourceIds.add(source.id);
    }
  }
  const evidenceRoot = resolve(root, "references", "evidence");

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const locatorIsUsable = validateRowShape(row, index, errors, options);
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const label = labelFor(row, index);
    const safeSourceId = typeof row.source_id === "string" && SOURCE_ID_PATTERN.test(row.source_id);
    if (safeSourceId && !sourceIds.has(row.source_id)) {
      errors.push(`${label}: source_id ${row.source_id} does not resolve in references/source-ledger.json`);
    }
    if (!safeSourceId) {
      continue;
    }

    const extractPath = resolve(evidenceRoot, row.source_id, "extract.md");
    if (!extractPath.startsWith(`${evidenceRoot}${sep}`)) {
      errors.push(`${label}: extract path escapes references/evidence`);
      continue;
    }
    let extract;
    try {
      extract = await readFile(extractPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        errors.push(`${label}: extract file is missing: references/evidence/${row.source_id}/extract.md`);
      } else {
        errors.push(`${label}: extract file could not be read: ${error.message}`);
      }
      continue;
    }

    const actualHash = createHash("sha256").update(extract).digest("hex");
    if (typeof row.extract_sha256 === "string" && HASH_PATTERN.test(row.extract_sha256) && actualHash !== row.extract_sha256) {
      errors.push(`${label}: extract_sha256 mismatch, expected ${row.extract_sha256}, got ${actualHash}`);
    }
    if (!locatorIsUsable) {
      continue;
    }

    const text = normalizedText(extract.toString("utf8"));
    const exact = normalizedText(row.locator.exact);
    const positions = matchPositions(text, exact);
    if (positions.length === 0) {
      errors.push(`${label}: locator.exact was not found in references/evidence/${row.source_id}/extract.md`);
      continue;
    }
    if (positions.length !== 1) {
      errors.push(`${label}: locator.exact matched ${positions.length} times in references/evidence/${row.source_id}/extract.md, expected exactly once`);
      continue;
    }

    const position = positions[0];
    const prefix = normalizedText(row.locator.prefix);
    const suffix = normalizedText(row.locator.suffix);
    if (prefix && !text.slice(0, position).endsWith(prefix)) {
      errors.push(`${label}: locator.prefix does not match at the unique exact quote position`);
    }
    if (suffix && !text.slice(position + exact.length).startsWith(suffix)) {
      errors.push(`${label}: locator.suffix does not match at the unique exact quote position`);
    }
  }

  return errors;
}

function attestationCounts(rows) {
  const counts = { supports: 0, partial: 0, pending: 0, insufficient: 0 };
  for (const row of rows) {
    const status = row?.support_attestation?.status;
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  return counts;
}

function makeReport(sources, rows) {
  const evidencedSourceIds = new Set(rows
    .filter((row) => row && typeof row === "object" && typeof row.source_id === "string")
    .map((row) => row.source_id));
  const bareDomains = sources.filter((source) => {
    try {
      return new URL(source.url).pathname === "/";
    } catch {
      return false;
    }
  });
  const withoutEvidence = sources.filter((source) => !evidencedSourceIds.has(source.id));
  return { bareDomains, withoutEvidence, attestations: attestationCounts(rows) };
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify({
      bare_domain_entries: {
        count: report.bareDomains.length,
        entries: report.bareDomains.map(({ id, url }) => ({ id, url }))
      },
      source_ledger_entries_without_claim_evidence: {
        count: report.withoutEvidence.length,
        entries: report.withoutEvidence.map(({ id, url }) => ({ id, url }))
      },
      support_attestations: report.attestations
    }, null, 2));
    return;
  }

  console.log(`Bare-domain source-ledger entries: ${report.bareDomains.length}`);
  for (const source of report.bareDomains) {
    console.log(`- ${source.id}: ${source.url}`);
  }
  console.log(`Source-ledger entries without claim evidence: ${report.withoutEvidence.length}`);
  for (const source of report.withoutEvidence) {
    console.log(`- ${source.id}: ${source.url}`);
  }
  console.log(`Human support attestations: ${report.attestations.supports} supports, ${report.attestations.partial} partial, ${report.attestations.pending} pending, ${report.attestations.insufficient} insufficient`);
}

function printFailure(errors, json) {
  if (json) {
    console.error(JSON.stringify({ ok: false, violations: errors }, null, 2));
    return;
  }
  console.error(`Evidence gate failed with ${errors.length} violation${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const ledger = await readJson(resolve(options.root, "references", "source-ledger.json"), "source ledger");
    const evidence = await readJson(resolve(options.root, "references", "claim-evidence.json"), "claim evidence");
    const publicExport = await readOptionalPublicExportMarker(options.root);
    const sources = ledgerSources(ledger);
    const rows = evidenceRows(evidence);

    if (options.report) {
      printReport(makeReport(sources, rows), options.json);
      return;
    }

    const errors = await validateEvidence(options.root, sources, rows, options);
    if (options.requireHumanSupport && publicExport?.omitted_claim_evidence === true) {
      errors.push("strict support gate is unavailable because this public export omits the private claim evidence");
    }
    if (errors.length > 0) {
      printFailure(errors, options.json);
      process.exitCode = 1;
      return;
    }
    const attestations = attestationCounts(rows);
    if (options.json) {
      console.log(JSON.stringify({ ok: true, rows_checked: rows.length, support_attestations: attestations }, null, 2));
    } else {
      console.log(`Evidence locator gate passed: ${rows.length} claim-evidence row${rows.length === 1 ? "" : "s"} checked; human support: ${attestations.supports} supports, ${attestations.partial} partial, ${attestations.pending} pending.`);
    }
  } catch (error) {
    printFailure([error.message], options?.json ?? false);
    process.exitCode = 1;
  }
}

await main();
