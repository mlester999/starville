import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const required = [
  'docs/architecture/phase-10c-world-composer.md',
  'docs/admin/phase-10c-world-composer-operations.md',
  'docs/security/phase-10c-world-publication-trust-boundary.md',
  'docs/deployment/phase-10c-owner-acceptance.md',
] as const;
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Phase 10C documentation boundary', () => {
  it('ships substantive architecture, operations, security, and owner guides', () => {
    for (const path of required) {
      const content = source(path);
      expect(content.length, path).toBeGreaterThan(1_500);
      expect(content, path).toContain('Phase 10C');
    }
  });

  it('documents the complete lifecycle and authority separation', () => {
    const content = required.map(source).join('\n').toLowerCase();
    for (const term of [
      'active world asset',
      'use in world draft',
      'save revision',
      'game test',
      'record passed',
      'review publish impact',
      'public players',
      'immutable',
      'version pin',
      'rollback',
      'restore as new draft',
      'maps.rollback',
      'forced-rls',
    ]) {
      expect(content, term).toContain(term);
    }
  });

  it('keeps hosted, publication, deployment, and owner acceptance claims pending', () => {
    const content = required.map(source).join('\n');
    expect(content).toContain('hosted validation pending');
    expect(content).toContain('intentionally not marked passed');
    expect(content).toContain('No hosted write');
    expect(content).not.toMatch(/owner acceptance (?:is )?complete/iu);
  });

  it('registers every guide in the repository README', () => {
    const readme = source('README.md');
    for (const path of required) expect(readme).toContain(path);
    expect(readme).toContain('Phase 10C: World Composer');
  });
});
