import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface TurboConfiguration {
  readonly tasks?: Readonly<Record<string, { readonly env?: readonly string[] }>>;
}

describe('Turbo build environment inputs', () => {
  it('scopes the CORS policy build input to the API application', () => {
    const configuration = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '..', 'turbo.json'), 'utf8'),
    ) as TurboConfiguration;

    expect(configuration.tasks?.['@starville/api#build']?.env).toContain('CORS_ALLOWED_ORIGINS');
    expect(configuration.tasks?.['build']?.env ?? []).not.toContain('CORS_ALLOWED_ORIGINS');
  });
});
