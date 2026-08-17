#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateJsonSchema(value, schema, location = '$') {
  const errors = [];

  function visit(current, rule, at) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      errors.push(`${at}: schema rule must be an object`);
      return;
    }

    if (rule.type !== undefined && valueType(current) !== rule.type) {
      errors.push(`${at}: expected ${rule.type}, got ${valueType(current)}`);
      return;
    }
    if (Array.isArray(rule.enum) && !rule.enum.some((allowed) => sameJsonValue(current, allowed))) {
      errors.push(`${at}: value ${JSON.stringify(current)} is not in the allowed enum`);
    }
    if (rule.const !== undefined && !sameJsonValue(current, rule.const)) {
      errors.push(`${at}: expected ${JSON.stringify(rule.const)}`);
    }

    if (typeof current === 'string') {
      if (rule.minLength !== undefined && [...current].length < rule.minLength) {
        errors.push(`${at}: string must contain at least ${rule.minLength} character${rule.minLength === 1 ? '' : 's'}`);
      }
      if (rule.pattern !== undefined && !new RegExp(rule.pattern, 'u').test(current)) {
        errors.push(`${at}: value does not match ${rule.pattern}`);
      }
      if (rule.format === 'date' && !isCalendarDate(current)) {
        errors.push(`${at}: value must be a valid full date in YYYY-MM-DD form`);
      }
    }

    if (typeof current === 'number' && rule.minimum !== undefined && current < rule.minimum) {
      errors.push(`${at}: value must be at least ${rule.minimum}`);
    }

    if (Array.isArray(current)) {
      if (rule.minItems !== undefined && current.length < rule.minItems) {
        errors.push(`${at}: array must contain at least ${rule.minItems} item${rule.minItems === 1 ? '' : 's'}`);
      }
      if (rule.uniqueItems === true) {
        const serialized = current.map((item) => JSON.stringify(item));
        if (new Set(serialized).size !== serialized.length) errors.push(`${at}: array items must be unique`);
      }
      if (rule.items) current.forEach((item, index) => visit(item, rule.items, `${at}[${index}]`));
    }

    if (current && typeof current === 'object' && !Array.isArray(current)) {
      for (const required of rule.required || []) {
        if (!Object.hasOwn(current, required)) errors.push(`${at}.${required}: property is required`);
      }
      const properties = rule.properties || {};
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!Object.hasOwn(properties, key)) errors.push(`${at}.${key}: unexpected property`);
        }
      }
      for (const [key, childRule] of Object.entries(properties)) {
        if (Object.hasOwn(current, key)) visit(current[key], childRule, `${at}.${key}`);
      }
    }
  }

  visit(value, schema, location);
  return errors;
}

export function vocabularyIdentifiers(vocabulary) {
  if (!vocabulary || typeof vocabulary !== 'object' || Array.isArray(vocabulary)) return [];
  if (!vocabulary.source_types || typeof vocabulary.source_types !== 'object' || Array.isArray(vocabulary.source_types)) return [];
  return Object.keys(vocabulary.source_types);
}

function schemaSourceTypeIdentifiers(schema) {
  const identifiers = schema?.properties?.sources?.items?.properties?.source_type?.enum;
  return Array.isArray(identifiers) ? identifiers : [];
}

export function validateLedger(ledger, schema, vocabulary) {
  const errors = validateJsonSchema(ledger, schema);
  const vocabularyIds = vocabularyIdentifiers(vocabulary);
  const schemaIds = schemaSourceTypeIdentifiers(schema);
  if (!sameJsonValue(schemaIds, vocabularyIds)) {
    errors.unshift('$.sources[*].source_type: schema enum does not match references/source-types.json');
  }
  return errors;
}

function normalizedWorklistValue(value, missingLabel) {
  return typeof value === 'string' && value.length > 0 ? value : missingLabel;
}

export function makeWorklist(ledger) {
  const sources = Array.isArray(ledger?.sources) ? ledger.sources : [];
  const groups = new Map();
  for (const source of sources) {
    const currentSourceType = normalizedWorklistValue(source?.source_type, '[missing source_type]');
    if (!groups.has(currentSourceType)) groups.set(currentSourceType, []);
    groups.get(currentSourceType).push({
      id: normalizedWorklistValue(source?.id, '[missing id]'),
      current_source_type: currentSourceType,
      url: normalizedWorklistValue(source?.url, '[missing URL]'),
    });
  }
  const groupedEntries = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currentSourceType, entries]) => ({
      current_source_type: currentSourceType,
      count: entries.length,
      entries,
    }));
  return {
    mode: 'source-type-migration-worklist',
    target_suggestions_included: false,
    groups: groupedEntries,
    summary: {
      entries: sources.length,
      distinct_current_source_types: groupedEntries.length,
    },
  };
}

export function renderWorklist(worklist) {
  const lines = [
    'Source type migration worklist',
    'Target type suggestions: none. Human classification is required.',
    '',
  ];
  for (const group of worklist.groups) {
    lines.push(`Current source_type: ${group.current_source_type} (${group.count})`);
    for (const entry of group.entries) lines.push(`- ${entry.id} | ${entry.current_source_type} | ${entry.url}`);
    lines.push('');
  }
  lines.push(`Summary: ${worklist.summary.entries} entries across ${worklist.summary.distinct_current_source_types} distinct current source_type values.`);
  return `${lines.join('\n')}\n`;
}

function parseArguments(argv) {
  const options = { json: false, worklist: false };
  for (const argument of argv) {
    if (argument === '--json') options.json = true;
    else if (argument === '--worklist') options.worklist = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (options.json && !options.worklist) throw new Error('--json is only valid with --worklist');
  return options;
}

async function readJson(relativePath) {
  const text = await readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');
  return JSON.parse(text);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const ledger = await readJson('references/source-ledger.json');
    if (options.worklist) {
      const worklist = makeWorklist(ledger);
      process.stdout.write(options.json ? `${JSON.stringify(worklist, null, 2)}\n` : renderWorklist(worklist));
      return;
    }

    const [schema, vocabulary] = await Promise.all([
      readJson('schemas/source-ledger.json'),
      readJson('references/source-types.json'),
    ]);
    const errors = validateLedger(ledger, schema, vocabulary);
    if (errors.length > 0) {
      process.stderr.write(`Source type gate failed with ${errors.length} violation${errors.length === 1 ? '' : 's'}:\n`);
      for (const error of errors) process.stderr.write(`- ${error}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Source type gate passed: ${ledger.sources.length} source ledger entries checked.\n`);
  } catch (error) {
    const message = `Source type check could not run: ${error.message}\n`;
    if (options?.worklist) {
      process.stdout.write(message);
      return;
    }
    process.stderr.write(message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
