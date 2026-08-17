import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as predicates from './assertions.mjs';
import { OFFLINE_MODE_LABEL, runScenario } from './harness.mjs';

const scenariosRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenarios');

async function discoverScenarios() {
  const entries = await readdir(scenariosRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name));
  return Promise.all(directories.map(async (entry) => {
    const directory = path.join(scenariosRoot, entry.name);
    const scenario = JSON.parse(await readFile(path.join(directory, 'scenario.json'), 'utf8'));
    return { directory, scenario };
  }));
}

function evaluateExpected(scenario, result) {
  return scenario.expected_assertions.map((expectation) => {
    const predicate = predicates[expectation.predicate];
    assert.equal(typeof predicate, 'function', `unknown predicate ${expectation.predicate}`);
    return {
      predicate: expectation.predicate,
      outcome: predicate(result, ...(expectation.arguments || [])),
    };
  });
}

for (const { directory, scenario } of await discoverScenarios()) {
  test(`${scenario.id}: passing canned result exercises controller and assertions`, async () => {
    const execution = await runScenario(directory, { mode: 'offline', canned: 'passing' });
    assert.equal(execution.mode_label, OFFLINE_MODE_LABEL);
    for (const evaluation of evaluateExpected(scenario, execution.secretary_result)) {
      assert.equal(evaluation.outcome.pass, true, `${evaluation.predicate}: ${evaluation.outcome.reason}`);
    }
  });

  test(`${scenario.id}: failing canned result is a negative control`, async () => {
    const execution = await runScenario(directory, { mode: 'offline', canned: 'failing' });
    assert.equal(execution.mode_label, OFFLINE_MODE_LABEL);
    for (const evaluation of evaluateExpected(scenario, execution.secretary_result)) {
      assert.equal(
        evaluation.outcome.pass,
        false,
        `${evaluation.predicate} did not reject the historical failure mode: ${evaluation.outcome.reason}`,
      );
    }
  });
}
