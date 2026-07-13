import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getVerifiedAccessToken } from '../../../../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../../../../lib/public-config';
import { createAdminServerClient } from '../../../../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../../../../lib/world-assets/authorization';
import { GET } from './route';

vi.mock('../../../../../../../lib/auth/api-session', () => ({
  getVerifiedAccessToken: vi.fn(),
}));
vi.mock('../../../../../../../lib/public-config', () => ({
  parseAdminPublicConfig: vi.fn(),
}));
vi.mock('../../../../../../../lib/supabase/server', () => ({
  createAdminServerClient: vi.fn(),
}));
vi.mock('../../../../../../../lib/world-assets/authorization', () => ({
  isAssetManagerRequestAuthorized: vi.fn(),
}));

const assetId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';

function context(variant: string) {
  return { params: Promise.resolve({ assetId, versionId, variant }) };
}

describe('same-origin administrator asset media proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAssetManagerRequestAuthorized).mockResolvedValue(true);
    vi.mocked(parseAdminPublicConfig).mockReturnValue({
      appEnvironment: 'test',
      appOrigin: 'http://localhost:3002',
      apiUrl: 'http://localhost:4000',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test-anon-key',
    } as never);
    vi.mocked(createAdminServerClient).mockResolvedValue({} as never);
    vi.mocked(getVerifiedAccessToken).mockResolvedValue('verified-access-token');
  });

  it('fails before upstream fetch when the administrator lacks assets.read', async () => {
    vi.mocked(isAssetManagerRequestAuthorized).mockResolvedValueOnce(false);
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await GET(
      new Request('http://localhost:3002/private-media'),
      context('original'),
    );

    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('preserves a canonical PNG original behind private no-store headers', async () => {
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const upstream = vi.fn(async () =>
      Promise.resolve(
        new Response(bytes, {
          status: 200,
          headers: {
            'content-length': String(bytes.length),
            'content-type': 'image/png',
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', upstream);

    const response = await GET(
      new Request('http://localhost:3002/private-media'),
      context('original'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await response.arrayBuffer()).byteLength).toBe(bytes.length);
    expect(upstream).toHaveBeenCalledWith(
      new URL(
        `/api/v1/admin/world-assets/${assetId}/versions/${versionId}/original`,
        'http://localhost:4000',
      ),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          accept: 'image/png, image/webp',
          authorization: 'Bearer verified-access-token',
        }),
      }),
    );
  });

  it('rejects non-raster upstream content instead of reflecting its MIME type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response('<svg/>', {
            status: 200,
            headers: { 'content-length': '6', 'content-type': 'image/svg+xml' },
          }),
        ),
      ),
    );

    const response = await GET(
      new Request('http://localhost:3002/private-media'),
      context('original'),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBeNull();
  });
});
