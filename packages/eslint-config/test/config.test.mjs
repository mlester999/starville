import assert from 'node:assert/strict';
import test from 'node:test';

import { baseConfig, browserConfig, nodeConfig, reactConfig } from '../index.js';

test('all exported flat configurations contain rules', () => {
  for (const config of [baseConfig, browserConfig, nodeConfig, reactConfig]) {
    assert.ok(Array.isArray(config));
    assert.ok(config.some((entry) => entry.rules !== undefined));
  }
});

test('the React configuration installs hooks and refresh rules', () => {
  const reactEntry = reactConfig.find((entry) => entry.plugins?.['react-hooks'] !== undefined);

  assert.ok(reactEntry);
  assert.equal(reactEntry.rules['react-hooks/rules-of-hooks'], 'error');
});
