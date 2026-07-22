import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/operations/beta-readiness/page.tsx', import.meta.url),
  'utf8',
);
const operationsPage = readFileSync(
  new URL('../app/(protected)/operations/page.tsx', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../lib/beta-readiness/repository.ts', import.meta.url),
  'utf8',
);
const model = readFileSync(new URL('../lib/beta-readiness/model.ts', import.meta.url), 'utf8');
const routeMetadata = readFileSync(new URL('../lib/admin-route-meta.ts', import.meta.url), 'utf8');

describe('Operations Beta Readiness route contract', () => {
  it('reuses the existing operations authorization and navigation', () => {
    expect(page).toContain("requireAuthorizedAdmin('operations.read')");
    expect(operationsPage).toContain('href="/operations/beta-readiness"');
    expect(routeMetadata).toContain("path: '/operations/beta-readiness'");
    expect(routeMetadata).toContain("parentHref: '/operations'");
  });

  it('loads read-only local evidence without adding a mutation path', () => {
    expect(page).toContain('loadLocalBetaReadiness()');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('action=');
    expect(repository).toContain("spawnSync('git'");
    expect(repository).toContain("['status', '--short']");
    expect(repository).toContain("['diff', '--check']");
    expect(repository).not.toContain('writeFile');
    expect(repository).not.toContain('execSync');
  });

  it('surfaces the closed-beta security and operations gates explicitly', () => {
    expect(page).toContain('Closed-Beta Readiness');
    for (const label of [
      'Role Access Matrix',
      'Abuse Protections',
      'Realtime Readiness',
      'Exact-Once Guarantees',
      'Worker Status',
      'Rollback Checklist',
    ]) {
      expect(model).toContain(label);
    }
  });

  it('states the local-only boundary and keeps owner controls disabled', () => {
    expect(page).toContain('does not query hosted');
    expect(page).toContain('mark owner acceptance');
    expect(page).toContain('defaultChecked={item.accepted}');
    expect(page).toContain('disabled');
    expect(model).toContain('immutable V1 default');
    expect(model).toContain(
      'V2 remains inactive; activation requires a separate protected decision',
    );
  });
});
