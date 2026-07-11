import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('administrator token-access boundary', () => {
  it('requires token-gate read permission before rendering real configuration', () => {
    const page = readSource('src/app/(protected)/token-access/page.tsx');

    expect(page).toContain("requireAuthorizedAdmin('token_gate.read')");
    expect(page).toContain('loadAdminTokenGateConfig()');
    expect(page).not.toContain('fake');
  });

  it('requires configure permission and optimistic concurrency for every mutation', () => {
    const actions = readSource('src/app/actions/token-gate.ts');

    expect(actions.match(/requireAuthorizedAdmin\('token_gate\.configure'\)/gu)).toHaveLength(2);
    expect(actions).toContain('expectedConfigVersion');
    expect(actions).toContain("readString(formData, 'commitment', 16)");
    expect(actions).toContain("commitment as 'confirmed' | 'finalized'");
    expect(actions).toContain('confirmed');
    expect(actions).toContain('reason');
  });

  it('never accepts an RPC URL or credential in the administrator form', () => {
    const form = readSource('src/components/token-gate-form.tsx');

    expect(form).not.toMatch(/name=["'](?:rpc|rpcUrl|serviceRole|secret)/u);
    expect(form).toContain('server-owned RPC');
  });
});
