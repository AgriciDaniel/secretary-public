#!/usr/bin/env node
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT, parseOptions } from '../lib/core.mjs';
import { assertPrivateCorpusBytesAbsent, verifyPublicTree } from './public-export.mjs';

const TAR_BLOCK_BYTES = 512;
const TAR_END_BYTES = TAR_BLOCK_BYTES * 2;
const MAX_TAR_BYTES = 256 * 1024 * 1024;
const GZIP_HEADER = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]);
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function writeString(header, offset, length, value, label) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new Error(`${label} exceeds the ustar field limit`);
  bytes.copy(header, offset);
}

function writeOctal(header, offset, length, value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is not a safe non-negative integer`);
  const octal = value.toString(8);
  if (octal.length > length - 1) throw new Error(`${label} exceeds the ustar numeric field limit`);
  header.write(octal.padStart(length - 1, '0'), offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
}

function splitUstarPath(relative) {
  if (
    relative === ''
    || path.posix.isAbsolute(relative)
    || relative.split('/').includes('..')
    || relative.startsWith('-')
    || /[\u0000-\u001f\u007f]/u.test(relative)
  ) {
    throw new Error(`public archive refuses unsafe member path: ${JSON.stringify(relative)}`);
  }
  if (Buffer.byteLength(relative, 'utf8') <= 100) return { name: relative, prefix: '' };
  for (let index = relative.lastIndexOf('/'); index > 0; index = relative.lastIndexOf('/', index - 1)) {
    const prefix = relative.slice(0, index);
    const name = relative.slice(index + 1);
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`public archive path exceeds ustar name and prefix limits: ${relative}`);
}

function createUstarHeader(relative, size, mode) {
  const { name, prefix } = splitUstarPath(relative);
  const header = Buffer.alloc(TAR_BLOCK_BYTES);
  writeString(header, 0, 100, name, 'ustar member name');
  writeOctal(header, 100, 8, mode, 'ustar member mode');
  writeOctal(header, 108, 8, 0, 'ustar owner ID');
  writeOctal(header, 116, 8, 0, 'ustar group ID');
  writeOctal(header, 124, 12, size, 'ustar member size');
  writeOctal(header, 136, 12, 0, 'ustar modification time');
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeString(header, 257, 6, 'ustar\0', 'ustar magic');
  writeString(header, 263, 2, '00', 'ustar version');
  writeString(header, 345, 155, prefix, 'ustar member prefix');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const encodedChecksum = checksum.toString(8);
  if (encodedChecksum.length > 6) throw new Error(`ustar header checksum overflow: ${relative}`);
  header.write(encodedChecksum.padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

async function createUstar(root, files) {
  const metadata = [];
  let totalBytes = TAR_END_BYTES;
  for (const relative of files) {
    splitUstarPath(relative);
    const stats = await lstat(path.join(root, relative));
    if (!stats.isFile()) throw new Error(`public archive refuses non-regular staged entry: ${relative}`);
    const padding = (TAR_BLOCK_BYTES - (stats.size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES;
    totalBytes += TAR_BLOCK_BYTES + stats.size + padding;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TAR_BYTES) {
      throw new Error(`public archive exceeds the ${MAX_TAR_BYTES}-byte deterministic writer limit`);
    }
    metadata.push({ relative, size: stats.size, mode: stats.mode & 0o111 ? 0o755 : 0o644, padding });
  }

  const chunks = [];
  for (const entry of metadata) {
    const bytes = await readFile(path.join(root, entry.relative));
    if (bytes.length !== entry.size) throw new Error(`public archive staged file changed size during read: ${entry.relative}`);
    chunks.push(createUstarHeader(entry.relative, entry.size, entry.mode), bytes);
    if (entry.padding > 0) chunks.push(Buffer.alloc(entry.padding));
  }
  chunks.push(Buffer.alloc(TAR_END_BYTES));
  return Buffer.concat(chunks, totalBytes);
}

function gzipStored(tarBytes) {
  const blocks = [];
  for (let offset = 0; offset < tarBytes.length;) {
    const length = Math.min(0xffff, tarBytes.length - offset);
    const final = offset + length === tarBytes.length;
    const header = Buffer.alloc(5);
    header[0] = final ? 0x01 : 0x00;
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE((~length) & 0xffff, 3);
    blocks.push(header, tarBytes.subarray(offset, offset + length));
    offset += length;
  }
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(tarBytes), 0);
  trailer.writeUInt32LE(tarBytes.length >>> 0, 4);
  return Buffer.concat([GZIP_HEADER, ...blocks, trailer]);
}

function readNullTerminated(bytes) {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString('utf8');
}

function readOctal(bytes, label) {
  const value = readNullTerminated(bytes).trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error(`${label} is not canonical octal`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer limit`);
  return parsed;
}

function decodeStoredGzip(archiveBytes) {
  if (archiveBytes.length < GZIP_HEADER.length + 8 || !archiveBytes.subarray(0, 10).equals(GZIP_HEADER)) {
    throw new Error('public archive does not have the deterministic gzip header');
  }
  const chunks = [];
  let offset = GZIP_HEADER.length;
  let final = false;
  while (!final) {
    if (offset + 5 > archiveBytes.length - 8) throw new Error('public archive has a truncated DEFLATE block');
    const flags = archiveBytes[offset];
    if (flags !== 0x00 && flags !== 0x01) throw new Error('public archive contains a non-canonical DEFLATE block');
    final = flags === 0x01;
    const length = archiveBytes.readUInt16LE(offset + 1);
    const complement = archiveBytes.readUInt16LE(offset + 3);
    if ((((~length) & 0xffff) !== complement) || offset + 5 + length > archiveBytes.length - 8) {
      throw new Error('public archive has an invalid stored DEFLATE block');
    }
    chunks.push(archiveBytes.subarray(offset + 5, offset + 5 + length));
    offset += 5 + length;
  }
  if (offset !== archiveBytes.length - 8) throw new Error('public archive has trailing bytes before the gzip trailer');
  const tarBytes = Buffer.concat(chunks);
  const expectedCrc = archiveBytes.readUInt32LE(offset);
  const expectedSize = archiveBytes.readUInt32LE(offset + 4);
  if (crc32(tarBytes) !== expectedCrc || (tarBytes.length >>> 0) !== expectedSize) {
    throw new Error('public archive gzip trailer does not match its tar bytes');
  }
  return tarBytes;
}

export function inspectPublicArchive(archiveBytes) {
  const tarBytes = decodeStoredGzip(archiveBytes);
  const entries = [];
  const seen = new Set();
  let offset = 0;
  while (offset + TAR_BLOCK_BYTES <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (header.every((byte) => byte === 0)) {
      if (offset + TAR_END_BYTES !== tarBytes.length || !tarBytes.subarray(offset).every((byte) => byte === 0)) {
        throw new Error('public archive has a non-canonical tar terminator');
      }
      return entries;
    }
    const checksum = readOctal(header.subarray(148, 156), 'ustar checksum');
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    let actualChecksum = 0;
    for (const byte of checksumHeader) actualChecksum += byte;
    if (checksum !== actualChecksum) throw new Error('public archive has an invalid ustar checksum');
    if (readNullTerminated(header.subarray(257, 263)) !== 'ustar' || header.subarray(263, 265).toString('ascii') !== '00') {
      throw new Error('public archive member is not canonical ustar');
    }
    if (header[156] !== 0x30) throw new Error('public archive contains a non-regular member');
    const name = readNullTerminated(header.subarray(0, 100));
    const prefix = readNullTerminated(header.subarray(345, 500));
    const relative = prefix ? `${prefix}/${name}` : name;
    splitUstarPath(relative);
    if (seen.has(relative)) throw new Error(`public archive contains a duplicate member: ${relative}`);
    if (entries.length > 0 && byteSort(entries.at(-1).path, relative) >= 0) {
      throw new Error('public archive member order is not canonical');
    }
    seen.add(relative);
    const size = readOctal(header.subarray(124, 136), `ustar size for ${relative}`);
    const mode = readOctal(header.subarray(100, 108), `ustar mode for ${relative}`);
    const dataStart = offset + TAR_BLOCK_BYTES;
    const dataEnd = dataStart + size;
    if (dataEnd > tarBytes.length - TAR_END_BYTES) throw new Error(`public archive member is truncated: ${relative}`);
    entries.push({ path: relative, mode, bytes: Buffer.from(tarBytes.subarray(dataStart, dataEnd)) });
    offset = dataEnd + ((TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES);
  }
  throw new Error('public archive is missing its two-block tar terminator');
}

export async function createPublicArchive({
  source,
  output,
  canonicalRoot = PROJECT_ROOT,
}) {
  if (!source) throw new Error('public archive requires a source projection');
  if (!output) throw new Error('public archive requires an output file');
  const absoluteSource = path.resolve(source);
  const absoluteOutput = path.resolve(output);
  if (isInside(absoluteSource, absoluteOutput)) throw new Error('public archive output must be outside the source projection');
  if (await exists(absoluteOutput)) throw new Error(`refusing to overwrite existing public archive: ${absoluteOutput}`);

  await assertPrivateCorpusBytesAbsent(path.resolve(canonicalRoot), absoluteSource);
  const verified = await verifyPublicTree(absoluteSource);
  if (verified.failures.length > 0) {
    throw new Error(`public archive source verification failed:\n${verified.failures.join('\n')}`);
  }

  await mkdir(path.dirname(absoluteOutput), { recursive: true, mode: 0o700 });
  const temporaryRoot = await mkdtemp(path.join(path.dirname(absoluteOutput), '.secretary-public-archive-'));
  const stagedRoot = path.join(temporaryRoot, 'tree');
  const compressedPath = path.join(temporaryRoot, 'secretary-public.tar.gz');
  try {
    await mkdir(stagedRoot, { recursive: true, mode: 0o700 });
    for (const relative of verified.files) {
      const sourcePath = path.join(absoluteSource, relative);
      const metadata = await lstat(sourcePath);
      if (!metadata.isFile()) throw new Error(`public archive refuses non-regular source entry: ${relative}`);
      const destination = path.join(stagedRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(sourcePath, destination);
    }

    await assertPrivateCorpusBytesAbsent(path.resolve(canonicalRoot), stagedRoot);
    const stagedVerification = await verifyPublicTree(stagedRoot);
    if (stagedVerification.failures.length > 0) {
      throw new Error(`staged public archive verification failed:\n${stagedVerification.failures.join('\n')}`);
    }

    const tarBytes = await createUstar(stagedRoot, stagedVerification.files);
    await writeFile(compressedPath, gzipStored(tarBytes), { flag: 'wx', mode: 0o600 });
    const archivedEntries = inspectPublicArchive(await readFile(compressedPath));
    const archivedPaths = archivedEntries.map((entry) => entry.path);
    if (JSON.stringify(archivedPaths) !== JSON.stringify(stagedVerification.files)) {
      throw new Error('public archive member list does not match the verified manifest tree');
    }
    const finalVerification = await verifyPublicTree(stagedRoot);
    if (finalVerification.failures.length > 0) {
      throw new Error(`public archive staged tree changed during archive creation:\n${finalVerification.failures.join('\n')}`);
    }
    if (JSON.stringify(finalVerification.files) !== JSON.stringify(stagedVerification.files)) {
      throw new Error('public archive staged file list changed during archive creation');
    }
    for (const entry of archivedEntries) {
      const [expectedBytes, metadata] = await Promise.all([
        readFile(path.join(stagedRoot, entry.path)),
        lstat(path.join(stagedRoot, entry.path)),
      ]);
      const expectedMode = metadata.mode & 0o111 ? 0o755 : 0o644;
      if (entry.mode !== expectedMode || !entry.bytes.equals(expectedBytes)) {
        throw new Error(`public archive member bytes or mode do not match the verified tree: ${entry.path}`);
      }
    }
    await rename(compressedPath, absoluteOutput);
    return { output: absoluteOutput, files: archivedPaths.length };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2), { source: 'string', output: 'string' });
  const result = await createPublicArchive({ source: options.source, output: options.output });
  const archiveBytes = await readFile(result.output);
  process.stdout.write(`public archive created ${result.output} with ${result.files} files (${archiveBytes.length} bytes)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
