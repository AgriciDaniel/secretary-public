import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function markdownFiles(directory) {
  const files = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
    }
  }
  await walk(directory);
  return files;
}

function frontmatter(text, relativePath) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`brain manifest source lacks frontmatter: ${relativePath}`);
  return match[1];
}

function scalar(metadata, key, relativePath) {
  const match = metadata.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) throw new Error(`brain manifest source lacks ${key}: ${relativePath}`);
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function cleanMarkdown(value) {
  return value
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentence(value) {
  const cleaned = cleanMarkdown(value);
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] || cleaned).trim();
}

function sectionParagraph(lines, heading) {
  const start = lines.findIndex((line) => line === heading);
  if (start === -1) return null;
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) break;
    collected.push(lines[index]);
  }
  return firstParagraph(collected);
}

function firstParagraph(lines) {
  let paragraph = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    if (line.startsWith('|') || line.startsWith('#')) continue;
    paragraph.push(line);
  }
  return paragraph.length > 0 ? paragraph.join(' ') : null;
}

function operatingSummary(text, relativePath) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  const lines = body.split('\n');
  const explicit = sectionParagraph(lines, '## Operating Summary');
  if (explicit) return firstSentence(explicit);

  const h1 = lines.findIndex((line) => line.startsWith('# '));
  const lead = firstParagraph(lines.slice(h1 === -1 ? 0 : h1 + 1));
  if (lead) return firstSentence(lead);

  const firstSection = lines.findIndex((line) => line.startsWith('## '));
  const fallback = firstSection === -1 ? null : firstParagraph(lines.slice(firstSection + 1));
  if (fallback) return firstSentence(fallback);
  throw new Error(`brain manifest source lacks an operating summary: ${relativePath}`);
}

export async function buildBrainManifest(projectRoot) {
  const wikiRoot = path.join(projectRoot, 'wiki');
  const notes = [];
  for (const absolute of await markdownFiles(wikiRoot)) {
    const relativePath = path.relative(projectRoot, absolute).split(path.sep).join(path.posix.sep);
    const text = await readFile(absolute, 'utf8');
    const metadata = frontmatter(text, relativePath);
    const tags = [...metadata.matchAll(/#[a-z0-9-]+\/[a-z0-9-]+/gi)].map((match) => match[0]);
    const confidenceTag = tags.find((tag) => tag.startsWith('#confidence/'));
    if (!confidenceTag) throw new Error(`brain manifest source lacks confidence tag: ${relativePath}`);
    notes.push({
      path: relativePath,
      title: scalar(metadata, 'title', relativePath),
      domain: scalar(metadata, 'domain', relativePath),
      confidence_tag: confidenceTag,
      tags,
      operating_summary: operatingSummary(text, relativePath),
    });
  }
  notes.sort((left, right) => comparePaths(left.path, right.path));
  return { version: 1, notes };
}

export function renderBrainManifest(manifest) {
  return `${JSON.stringify(manifest)}\n`;
}
