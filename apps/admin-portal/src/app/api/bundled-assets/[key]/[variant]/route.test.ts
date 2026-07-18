import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isAssetManagerRequestAuthorized } from '../../../../../lib/world-assets/authorization';
import { GET } from './route';

vi.mock('../../../../../lib/world-assets/authorization', () => ({
  isAssetManagerRequestAuthorized: vi.fn(),
}));

function context(key: string, variant: string) {
  return { params: Promise.resolve({ key, variant }) };
}

describe('protected bundled asset media route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAssetManagerRequestAuthorized).mockResolvedValue(true);
  });

  it('fails closed before reading media without assets.read', async () => {
    vi.mocked(isAssetManagerRequestAuthorized).mockResolvedValueOnce(false);
    const response = await GET(
      new Request('http://localhost:3002/api/bundled-assets/tree-pine/source'),
      context('tree-pine', 'source'),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('serves allowlisted source and thumbnail WebPs with private safe headers', async () => {
    for (const variant of ['source', 'thumbnail'] as const) {
      const response = await GET(
        new Request(`http://localhost:3002/api/bundled-assets/tree-pine/${variant}`),
        context('tree-pine', variant),
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }
  });

  it('allows only authored source rotations and rejects malformed input', async () => {
    const rotated = await GET(
      new Request('http://localhost:3002/api/bundled-assets/fence-willow/source?rotation=90'),
      context('fence-willow', 'source'),
    );
    expect(rotated.status).toBe(200);

    const thumbnailRotation = await GET(
      new Request('http://localhost:3002/api/bundled-assets/tree-pine/thumbnail?rotation=90'),
      context('tree-pine', 'thumbnail'),
    );
    expect(thumbnailRotation.status).toBe(400);

    const traversal = await GET(
      new Request('http://localhost:3002/api/bundled-assets/unknown/source'),
      context('../../etc/passwd', 'source'),
    );
    expect(traversal.status).toBe(400);
  });
});
