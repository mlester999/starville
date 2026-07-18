import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVerifiedAccessToken } from '../../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../../lib/public-config';
import { createAdminServerClient } from '../../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../../lib/world-assets/authorization';
import { POST } from './route';

vi.mock('../../../../../lib/auth/api-session', () => ({
  getVerifiedAccessToken: vi.fn(),
}));
vi.mock('../../../../../lib/public-config', () => ({
  parseAdminPublicConfig: vi.fn(),
}));
vi.mock('../../../../../lib/supabase/server', () => ({
  createAdminServerClient: vi.fn(),
}));
vi.mock('../../../../../lib/world-assets/authorization', () => ({
  isAssetManagerRequestAuthorized: vi.fn(),
}));

const assetId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const originalApproval = process.env['SUPABASE_REMOTE_WRITES_APPROVED'];

function context() {
  return { params: Promise.resolve({ assetId }) };
}

function uploadRequest(type = 'image/png'): Request {
  const body = new FormData();
  body.set('sourceVersionId', '33333333-3333-4333-8333-333333333333');
  body.set('configurationMode', 'copy');
  body.set('expectedAssetRevision', '3');
  body.set('reason', 'Replace the procedural pine tree with reviewed transparent artwork.');
  body.set('idempotencyKey', requestId);
  body.set('file', new File([Buffer.from('bounded-local-image')], 'tree-pine.png', { type }));
  return new Request(`http://localhost:3002/api/world-assets/${assetId}/versions`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3002',
      'content-length': '1024',
      'x-request-id': requestId,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SUPABASE_REMOTE_WRITES_APPROVED'] = 'true';
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

afterEach(() => {
  if (originalApproval === undefined) delete process.env['SUPABASE_REMOTE_WRITES_APPROVED'];
  else process.env['SUPABASE_REMOTE_WRITES_APPROVED'] = originalApproval;
  vi.unstubAllGlobals();
});

describe('same-origin administrator asset-version upload proxy', () => {
  it('blocks before multipart parsing or upstream fetch when hosted writes are not approved', async () => {
    process.env['SUPABASE_REMOTE_WRITES_APPROVED'] = 'false';
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await POST(uploadRequest(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: 'ASSET_REMOTE_WRITES_DISABLED',
        message:
          'Remote asset uploads are currently disabled because hosted writes have not been approved for this session.',
      },
      requestId,
    });
    expect(upstream).not.toHaveBeenCalled();
    expect(createAdminServerClient).not.toHaveBeenCalled();
  });

  it('reports a friendly API-unavailable error without leaking connection details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('connect ECONNREFUSED'))),
    );

    const response = await POST(uploadRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      error: {
        code: 'ASSET_VERSION_UPLOAD_UNAVAILABLE',
        message: expect.stringContaining('trusted asset API is unavailable'),
      },
    });
    expect(JSON.stringify(payload)).not.toContain('ECONNREFUSED');
  });

  it.each([
    ['ASSET_STORAGE_UNAVAILABLE', 'protected asset storage service is unavailable'],
    ['ASSET_MANAGEMENT_UNAVAILABLE', 'asset database operation is unavailable'],
  ])('preserves the safe %s upstream category and owner guidance', async (code, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { success: false, error: { code, message: 'discarded upstream wording' }, requestId },
          { status: 503 },
        ),
      ),
    );

    const response = await POST(uploadRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ error: { code, message: expect.stringContaining(message) } });
    expect(JSON.stringify(payload)).not.toContain('discarded upstream wording');
  });

  it('rejects malformed multipart before authentication forwarding', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await POST(
      new Request(`http://localhost:3002/api/world-assets/${assetId}/versions`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3002',
          'content-length': '16',
          'content-type': 'multipart/form-data; boundary=missing',
          'x-request-id': requestId,
        },
        body: 'not multipart',
      }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_ASSET_REQUEST' } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects unsupported files before the API or storage boundary', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await POST(uploadRequest('text/plain'), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'ASSET_FILE_UNSUPPORTED' } });
    expect(upstream).not.toHaveBeenCalled();
  });
});
