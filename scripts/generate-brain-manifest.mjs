#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBrainManifest, renderBrainManifest } from '../lib/brain-manifest.mjs';
import { atomicWrite, PROJECT_ROOT } from '../lib/core.mjs';

export const BRAIN_MANIFEST_PATH = 'references/brain-manifest.json';

export async function generateBrainManifest(root = PROJECT_ROOT) {
  const manifest = await buildBrainManifest(root);
  const output = renderBrainManifest(manifest);
  await atomicWrite(path.join(root, BRAIN_MANIFEST_PATH), output);
  return BRAIN_MANIFEST_PATH;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${await generateBrainManifest()}\n`);
}
