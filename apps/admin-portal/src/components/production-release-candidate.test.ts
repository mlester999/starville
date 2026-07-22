import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/operations/production-release-candidate/page.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL(
    '../app/(protected)/operations/production-release-candidate/page.module.css',
    import.meta.url,
  ),
  'utf8',
);
const operations = readFileSync(
  new URL('../app/(protected)/operations/page.tsx', import.meta.url),
  'utf8',
);
const metadata = readFileSync(new URL('../lib/admin-route-meta.ts', import.meta.url), 'utf8');

describe('Phase 13D Production Release Candidate dashboard', () => {
  it('is protected, read-only, linked, and never accepts production evidence', () => {
    expect(page).toContain("requireAuthorizedAdmin('operations.read')");
    expect(page).not.toContain('<form');
    expect(page).toContain('never verifies a live');
    expect(operations).toContain('href="/operations/production-release-candidate"');
    expect(metadata).toContain("path: '/operations/production-release-candidate'");
  });

  it('shows the truthful Stage A block, NO-GO, and separate evidence classes', () => {
    expect(page).toContain('Production commissioning blocked by uncommitted release inputs');
    expect(page).toContain('summary.phase14Recommendation');
    expect(page).toContain('STARVILLE_PRODUCTION_RELEASE_EVIDENCE.map');
    expect(page).toContain('Secrets are never displayed');
  });

  it('has balanced desktop, tablet, mobile, safe-area, and reduced-motion rules', () => {
    expect(css).toContain('@media (max-width: 1050px)');
    expect(css).toContain('@media (max-width: 680px)');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
