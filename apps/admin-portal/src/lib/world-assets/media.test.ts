import { describe, expect, it } from 'vitest';

import { availableAdminAssetMediaPath } from './media';

describe('admin asset media availability', () => {
  it('does not synthesize a request for procedural markers without derivatives', () => {
    expect(
      availableAdminAssetMediaPath(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'thumbnail',
        null,
      ),
    ).toBeNull();
  });

  it('replaces an available API media descriptor with the reauthorized same-origin route', () => {
    expect(
      availableAdminAssetMediaPath(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'preview',
        '/api/v1/admin/world-assets/source',
      ),
    ).toBe(
      '/api/world-assets/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/preview',
    );
  });

  it('keeps an uploaded original behind the same reauthorized route boundary', () => {
    expect(
      availableAdminAssetMediaPath(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'original',
        '/api/v1/admin/world-assets/source',
      ),
    ).toBe(
      '/api/world-assets/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/original',
    );
  });
});
