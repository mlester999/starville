import { describe, expect, it } from 'vitest';

import { buildLandingContentSecurityPolicy } from './content-security-policy';

describe('Landing and Reown content security policy', () => {
  it('uses exact API, Supabase, and repository-locked Reown origins', () => {
    const policy = buildLandingContentSecurityPolicy({
      apiUrl: 'https://api.starville.example/api/v1',
      supabaseUrl: 'https://project.supabase.co',
    });

    expect(policy).toContain(
      "connect-src 'self' https://api.starville.example https://project.supabase.co wss://project.supabase.co",
    );
    expect(policy).toContain('wss://relay.walletconnect.org');
    expect(policy).toContain('https://rpc.walletconnect.org');
    expect(policy).toContain('frame-src https://secure.walletconnect.org');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('*');
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('allows evaluation only for the Next development runtime', () => {
    const policy = buildLandingContentSecurityPolicy({
      apiUrl: 'http://localhost:4000',
      supabaseUrl: 'http://127.0.0.1:54321',
      development: true,
    });
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});
