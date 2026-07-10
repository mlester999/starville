import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const directory = new URL('../', import.meta.url);

async function readConfig(name) {
  return JSON.parse(await readFile(new URL(name, directory), 'utf8'));
}

test('the base configuration keeps TypeScript strict and non-emitting', async () => {
  const config = await readConfig('base.json');

  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
});

test('application configurations extend the shared base', async () => {
  for (const name of ['node.json', 'nextjs.json', 'vite-react.json']) {
    const config = await readConfig(name);
    assert.equal(config.extends, './base.json');
  }
});
