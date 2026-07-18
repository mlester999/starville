import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const required = [
  'docs/architecture/phase-10a-modular-avatar-system.md',
  'docs/game-design/phase-10a-character-customization.md',
  'docs/security/phase-10a-avatar-trust-boundaries.md',
  'docs/admin/phase-10a-avatar-content-operations.md',
  'docs/deployment/phase-10a-owner-acceptance.md',
] as const;

const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Phase 10A documentation boundary', () => {
  it('ships substantive architecture, design, security, operations, and acceptance guides', () => {
    for (const path of required) {
      const content = source(path);
      expect(content.length, path).toBeGreaterThan(1_500);
      expect(content, path).toMatch(/Phase 10A/u);
      expect(content, path).toMatch(/local|locally/u);
    }
  });

  it('keeps hosted deployment, publication, production art, and owner acceptance truthful', () => {
    const content = required.map(source).join('\n');
    expect(content).toContain('hosted deployment');
    expect(content).toContain('owner acceptance');
    expect(content).toContain('production artwork');
    expect(content.toLowerCase()).toContain('no content was published');
    expect(content).not.toMatch(/hosted (?:is )?complete|owner acceptance (?:is )?complete/iu);
  });

  it('documents the player, realtime, asset, database, and administrator trust boundaries', () => {
    const architecture = source(required[0]);
    const security = source(required[2]);
    for (const term of [
      'Game client',
      'Game API',
      'Realtime server',
      'PostgreSQL',
      'Admin portal',
      'World Asset Manager',
    ]) {
      expect(architecture).toContain(term);
    }
    for (const term of [
      'forced Row Level Security',
      'raw URL',
      'expected revisions',
      'append-only audit',
      'wallet eligibility',
    ]) {
      expect(security).toContain(term);
    }
  });

  it('keeps Phase 10B and financial cosmetic systems outside the active scope', () => {
    const content = required.map(source).join('\n');
    for (const boundary of [
      'paid cosmetics',
      'DUST cosmetic purchases',
      'token-gated cosmetics',
      'NFTs',
      'marketplace',
      'stat bonuses',
    ]) {
      expect(content).toContain(boundary);
    }
    expect(content).not.toMatch(
      /(?:NFT|paid cosmetic|DUST cosmetic purchase)s? (?:is|are) active/iu,
    );
  });

  it('registers the public customization guide and preserves Phase 10A under the current Phase 10B scope', () => {
    expect(source('apps/landing/src/content/docs/pages-avatar.ts')).toContain(
      "route: '/docs/character-customization'",
    );
    expect(source('apps/landing/src/content/docs/pages.ts')).toContain(
      'characterCustomizationPage',
    );
    expect(source('README.md')).toContain('Phase 10B: Wardrobes, emotes, cosmetic collections');
    expect(source('README.md')).toContain('Phases 1–10A remain intact');
  });
});
