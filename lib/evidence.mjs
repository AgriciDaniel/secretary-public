import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, readlink } from 'node:fs/promises';
import path from 'node:path';
import { assertContainedPath, sha256 } from './core.mjs';

const SNIFF_BYTES = 8192;
const CAP_REASONS = new Set(['file_count_cap', 'per_file_byte_cap', 'total_byte_cap']);

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function discoverEntries(workspace) {
  const entries = [];
  async function walk(directory, relativeDirectory = '') {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => comparePaths(left.name, right.name));
    for (const child of children) {
      const relative = path.posix.join(relativeDirectory.split(path.sep).join(path.posix.sep), child.name);
      const absolute = path.join(directory, child.name);
      if (child.isDirectory()) {
        const safeDirectory = await assertContainedPath(workspace, absolute);
        const metadata = await lstat(safeDirectory);
        if (!metadata.isDirectory()) throw new Error(`evidence directory changed while being walked: ${relative}`);
        await walk(safeDirectory, path.join(relativeDirectory, child.name));
      } else {
        entries.push({ absolute, relative, root: workspace, origin: 'workspace' });
      }
    }
  }
  await walk(workspace);
  entries.sort((left, right) => comparePaths(left.relative, right.relative));
  return entries;
}

function sniffMagic(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return true;
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return true;
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return true;
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return true;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
  return false;
}

function textKind(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const kinds = new Map([
    ['.css', 'text/css'],
    ['.csv', 'text/csv'],
    ['.htm', 'text/html'],
    ['.html', 'text/html'],
    ['.js', 'text/javascript'],
    ['.json', 'application/json'],
    ['.jsonl', 'application/x-ndjson'],
    ['.jsx', 'text/jsx'],
    ['.md', 'text/markdown'],
    ['.mjs', 'text/javascript'],
    ['.toml', 'application/toml'],
    ['.ts', 'text/typescript'],
    ['.tsx', 'text/tsx'],
    ['.txt', 'text/plain'],
    ['.xml', 'application/xml'],
    ['.yaml', 'application/yaml'],
    ['.yml', 'application/yaml'],
  ]);
  return kinds.get(extension) || 'text/plain';
}

function validUtf8Prefix(bytes) {
  for (let end = bytes.length; end >= Math.max(0, bytes.length - 3); end -= 1) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end));
      return bytes.subarray(0, end);
    } catch {}
  }
  return Buffer.alloc(0);
}

async function readRegularFile(absolute, captureLimit, override) {
  if (override) {
    const prefix = override.subarray(0, captureLimit);
    return {
      bytesRead: override.length,
      digest: sha256(override),
      prefix,
      binary: sniffMagic(override.subarray(0, SNIFF_BYTES)) || override.includes(0),
    };
  }
  const handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`evidence path is not a regular file: ${absolute}`);
    const digest = createHash('sha256');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks = [];
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead = 0;
    let captured = 0;
    let controlBytes = 0;
    let binary = false;
    let sniff = Buffer.alloc(0);
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      const chunk = Buffer.from(buffer.subarray(0, read.bytesRead));
      digest.update(chunk);
      bytesRead += chunk.length;
      if (sniff.length < SNIFF_BYTES) sniff = Buffer.concat([sniff, chunk.subarray(0, SNIFF_BYTES - sniff.length)]);
      if (chunk.includes(0)) binary = true;
      for (const byte of chunk) {
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) controlBytes += 1;
      }
      if (!binary) {
        try {
          decoder.decode(chunk, { stream: true });
        } catch {
          binary = true;
        }
      }
      if (captured < captureLimit) {
        const part = chunk.subarray(0, captureLimit - captured);
        chunks.push(part);
        captured += part.length;
      }
    }
    if (!binary) {
      try {
        decoder.decode();
      } catch {
        binary = true;
      }
    }
    if (sniffMagic(sniff)) binary = true;
    if (bytesRead > 0 && controlBytes / bytesRead > 0.05) binary = true;
    const finalMetadata = await handle.stat();
    if (finalMetadata.size !== bytesRead) throw new Error(`evidence file changed while being read: ${absolute}`);
    return { bytesRead, digest: digest.digest('hex'), prefix: Buffer.concat(chunks), binary };
  } finally {
    await handle.close();
  }
}

function omission(entry) {
  return {
    path: entry.path,
    reason: entry.omission_reason,
    included_bytes: entry.included_bytes,
    omitted_bytes: Math.max(0, entry.size - entry.included_bytes),
  };
}

export function evidenceReport(manifest, manifestHash) {
  return {
    manifest_sha256: manifestHash,
    truncated: manifest.entries.some((entry) => CAP_REASONS.has(entry.omission_reason)),
    included_files: manifest.entries.filter((entry) => entry.disposition !== 'omitted').length,
    included_bytes: manifest.entries.reduce((total, entry) => total + entry.included_bytes, 0),
    omissions: manifest.entries.filter((entry) => entry.omission_reason !== null).map(omission),
  };
}

export async function buildEvidenceBundle({ workspace, profile, contentOverrides = new Map(), orderedEntries = [] }) {
  const caps = {
    max_file_bytes: profile.max_evidence_file_bytes,
    max_total_bytes: profile.max_evidence_total_bytes,
    max_files: profile.max_evidence_files,
  };
  for (const [name, value] of Object.entries(caps)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid evidence cap ${name}`);
  }
  if (!Array.isArray(orderedEntries)) throw new Error('ordered evidence entries must be an array');
  const discovered = [
    ...orderedEntries.map((entry) => ({ ...entry, origin: entry.origin || 'brain' })),
    ...await discoverEntries(workspace),
  ];
  const seenPaths = new Set();
  for (const entry of discovered) {
    if (!entry || typeof entry.absolute !== 'string' || typeof entry.relative !== 'string' || typeof entry.root !== 'string') {
      throw new Error('ordered evidence entry is incomplete');
    }
    if (!['brain', 'workspace'].includes(entry.origin)) throw new Error(`invalid evidence origin: ${entry.origin}`);
    if (seenPaths.has(entry.relative)) throw new Error(`duplicate evidence path: ${entry.relative}`);
    seenPaths.add(entry.relative);
  }
  const manifestEntries = [];
  const contents = new Map();
  let includedFiles = 0;
  let includedBytes = 0;
  for (const discoveredEntry of discovered) {
    const metadata = await lstat(discoveredEntry.absolute);
    if (metadata.isSymbolicLink()) {
      const target = await readlink(discoveredEntry.absolute);
      const linkBytes = Buffer.from(target, 'utf8');
      manifestEntries.push({
        path: discoveredEntry.relative,
        origin: discoveredEntry.origin,
        size: metadata.size,
        sha256: sha256(linkBytes),
        kind: 'inode/symlink',
        included_bytes: 0,
        included_sha256: null,
        disposition: 'omitted',
        omission_reason: 'symlink_not_followed',
      });
      continue;
    }
    if (!metadata.isFile()) {
      manifestEntries.push({
        path: discoveredEntry.relative,
        origin: discoveredEntry.origin,
        size: metadata.size,
        sha256: sha256(Buffer.alloc(0)),
        kind: 'inode/special',
        included_bytes: 0,
        included_sha256: null,
        disposition: 'omitted',
        omission_reason: 'special_file',
      });
      continue;
    }
    const safePath = await assertContainedPath(discoveredEntry.root, discoveredEntry.absolute);
    const countAvailable = includedFiles < caps.max_files;
    const totalAvailable = Math.max(0, caps.max_total_bytes - includedBytes);
    const captureLimit = countAvailable ? Math.min(caps.max_file_bytes, totalAvailable) : 0;
    const override = contentOverrides.get(discoveredEntry.absolute) || contentOverrides.get(safePath);
    const read = await readRegularFile(safePath, captureLimit, override);
    if (read.bytesRead !== metadata.size && !override) throw new Error(`evidence file size changed while being read: ${discoveredEntry.relative}`);
    if (read.binary) {
      manifestEntries.push({
        path: discoveredEntry.relative,
        origin: discoveredEntry.origin,
        size: read.bytesRead,
        sha256: read.digest,
        kind: 'application/octet-stream',
        included_bytes: 0,
        included_sha256: null,
        disposition: 'omitted',
        omission_reason: 'binary_file',
      });
      continue;
    }
    let prefix = validUtf8Prefix(read.prefix);
    let reason = null;
    if (!countAvailable) {
      reason = 'file_count_cap';
      prefix = Buffer.alloc(0);
    } else if (totalAvailable === 0 && read.bytesRead > 0) {
      reason = 'total_byte_cap';
      prefix = Buffer.alloc(0);
    } else if (prefix.length < read.bytesRead) {
      reason = caps.max_file_bytes <= totalAvailable && caps.max_file_bytes < read.bytesRead
        ? 'per_file_byte_cap'
        : 'total_byte_cap';
    }
    const disposition = prefix.length === read.bytesRead ? 'included' : prefix.length > 0 ? 'truncated' : 'omitted';
    const entry = {
      path: discoveredEntry.relative,
      origin: discoveredEntry.origin,
      size: read.bytesRead,
      sha256: read.digest,
      kind: textKind(discoveredEntry.relative),
      included_bytes: prefix.length,
      included_sha256: prefix.length > 0 || read.bytesRead === 0 ? sha256(prefix) : null,
      disposition,
      omission_reason: reason,
    };
    manifestEntries.push(entry);
    if (disposition !== 'omitted') {
      includedFiles += 1;
      includedBytes += prefix.length;
      contents.set(entry.path, prefix.toString('utf8'));
    }
  }
  const manifest = {
    version: 2,
    caps,
    entries: manifestEntries,
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestHash = sha256(manifestText);
  return {
    manifest,
    manifestText,
    manifestHash,
    contents,
    report: evidenceReport(manifest, manifestHash),
  };
}
