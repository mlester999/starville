import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/operations/release-live-ops/page.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../app/(protected)/operations/release-live-ops/page.module.css', import.meta.url),
  'utf8',
);
const operations = readFileSync(
  new URL('../app/(protected)/operations/page.tsx', import.meta.url),
  'utf8',
);
const metadata = readFileSync(new URL('../lib/admin-route-meta.ts', import.meta.url), 'utf8');

describe('Phase 13C Release and Live Ops dashboard', () => {
  it('is protected, read-only, and linked from the existing operations area', () => {
    expect(page).toContain("requireAuthorizedAdmin('operations.read')");
    expect(page).not.toContain('<form');
    expect(page).toContain('never connects to production');
    expect(operations).toContain('href="/operations/release-live-ops"');
    expect(metadata).toContain("path: '/operations/release-live-ops'");
  });

  it('shows truthful manifests, capabilities, and disabled owner gates', () => {
    expect(page).toContain('85 ordered migrations');
    expect(page).toContain('STARVILLE_OPERATIONAL_CAPABILITIES.map');
    expect(page).toContain('Phase 13D commissioning pending');
    expect(page).toContain('checked={false}');
    expect(page).toContain('disabled');
  });

  it('has responsive, safe-area, and reduced-motion treatment', () => {
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
