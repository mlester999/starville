import { describe, expect, it } from 'vitest';

import { buildAdminContentSecurityPolicy } from './content-security-policy';

describe('admin asset content security policy', () => {
  it('uses exact validated origins without wildcards or private storage paths', () => {
    const policy = buildAdminContentSecurityPolicy({
      apiUrl: 'https://api.starville.example/api/v1',
      supabaseUrl: 'https://project.supabase.co',
    });

    expect(policy).toContain("img-src 'self' data: blob: https://project.supabase.co");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain(
      "connect-src 'self' https://api.starville.example https://project.supabase.co wss://project.supabase.co",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('*');
    expect(policy).not.toContain('asset-intake');
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('allows development evaluation only for the Next development runtime', () => {
    const policy = buildAdminContentSecurityPolicy({
      apiUrl: 'http://localhost:4000',
      supabaseUrl: 'http://127.0.0.1:54321',
      development: true,
    });

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });
});
