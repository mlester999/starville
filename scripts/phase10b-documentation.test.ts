import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE

const root = resolve(import.meta.dirname, '..');
const required = [
  'docs/architecture/phase-10b-cosmetic-platform.md',
  'docs/admin/phase-10b-cosmetic-operations.md',
  'docs/security/phase-10b-cosmetic-trust-boundaries.md',
  'docs/economy/phase-10b-cosmetic-simulation.md',
  'docs/deployment/phase-10b-hosted-readiness.md',
  'docs/deployment/phase-10b-local-validation-report.md',
] as const;

const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Phase 10B documentation boundary', () => {
  it('ships substantive architecture, operations, security, simulation, and deployment guides', () => {
    for (const path of required) {
      const content = source(path);
      expect(content.length, path).toBeGreaterThan(1_500);
      expect(content, path).toMatch(/Phase 10B/u);
      expect(content, path).toMatch(/local|locally/u);
    }
  });

  it('keeps deployment, publication, shop activation, and owner acceptance truthful', () => {
    const content = required.map(source).join('\n');
    expect(content).toContain('hosted migrations');
    expect(content).toContain('owner acceptance pending');
    expect(content).toContain('No content or platform configuration was published');
    expect(content).toMatch(/There is no\s+purchase RPC/u);
    expect(content).not.toMatch(/hosted (?:is )?complete|owner acceptance (?:is )?complete/iu);
  });

  it('documents every required authority and failure boundary', () => {
    const content = required.map(source).join('\n');
    const normalized = content.toLowerCase();
    for (const term of [
      'forced rls',
      'five',
      'emote',
      'collection',
      'exactly-once',
      'revocation',
      'request id',
      'world asset manager',
      'dust',
      'token claim',
      'service_role',
      'public_name',
      '360×800',
      '1920×1080',
    ]) {
      expect(normalized, term).toContain(term);
    }
  });

  it('records the exact forward migration chain and next owner command', () => {
    const deployment = source(required[4]);
    for (const timestamp of [
      '20260716110500',
      '20260716110700',
      '20260716111000',
      '20260716112000',
      '20260716113000',
    ]) {
      expect(deployment).toContain(timestamp);
    }
    expect(deployment).toContain('pnpm db:migrations:push');
    expect(deployment).toContain('Do not edit, delete, repair, or reapply');
  });

  it('registers the Phase 10B references and current scope in the README', () => {
    const readme = source('README.md');
    for (const path of required) expect(readme).toContain(path);
    expect(readme).toContain('Phase 10B: Wardrobes, emotes, cosmetic collections');
    expect(readme).toContain('purchase RPC');
  });
});
