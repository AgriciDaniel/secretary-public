#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from '../lib/core.mjs';
import { buildBrainManifest, renderBrainManifest } from '../lib/brain-manifest.mjs';
import { BRAIN_MANIFEST_PATH } from './generate-brain-manifest.mjs';
import { renderSourceLedger, SOURCE_LEDGER_JSON_PATH, SOURCE_LEDGER_MARKDOWN_PATH } from './generate-source-ledger.mjs';
import { renderSurfaces } from './generate-surfaces.mjs';

export async function checkGenerated(root = PROJECT_ROOT) {
  const contract = await readFile(path.join(root, 'contracts', 'secretary-core.md'), 'utf8');
  const drift = [];
  for (const [relative, expected] of renderSurfaces(contract)) {
    try {
      const actual = await readFile(path.join(root, relative));
      if (!actual.equals(Buffer.from(expected))) drift.push(relative);
    } catch {
      drift.push(relative);
    }
  }
  const expectedManifest = renderBrainManifest(await buildBrainManifest(root));
  try {
    const actualManifest = await readFile(path.join(root, BRAIN_MANIFEST_PATH));
    if (!actualManifest.equals(Buffer.from(expectedManifest))) drift.push(BRAIN_MANIFEST_PATH);
  } catch {
    drift.push(BRAIN_MANIFEST_PATH);
  }
  try {
    const sourceLedger = JSON.parse(await readFile(path.join(root, SOURCE_LEDGER_JSON_PATH), 'utf8'));
    const expectedSourceLedger = renderSourceLedger(sourceLedger);
    try {
      const actualSourceLedger = await readFile(path.join(root, SOURCE_LEDGER_MARKDOWN_PATH));
      if (!actualSourceLedger.equals(Buffer.from(expectedSourceLedger))) drift.push(SOURCE_LEDGER_MARKDOWN_PATH);
    } catch {
      drift.push(SOURCE_LEDGER_MARKDOWN_PATH);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return drift;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const drift = await checkGenerated();
  if (drift.length > 0) {
    process.stderr.write(`generated surface drift:\n${drift.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('generated surfaces are current\n');
  }
}
