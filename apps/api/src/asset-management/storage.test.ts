import { describe, expect, it, vi } from 'vitest';

import {
  AssetStorageError,
  assertInternalStoragePath,
  createSupabaseAssetStorage,
  privateDerivativePaths,
  publicDerivativePaths,
} from './storage.js';

describe('asset storage boundaries', () => {
  it('builds distinct private version paths and immutable public version paths', () => {
    const privatePaths = privateDerivativePaths(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );
    const publicPaths = publicDerivativePaths('willow-cottage', 3);

    expect(privatePaths.source).toBe(
      'starville/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/processed/source.webp',
    );
    expect(publicPaths.source).toBe('starville/willow-cottage/v3/source.webp');
    expect(publicPaths.preview).not.toBe(publicPaths.source);
  });

  it.each([
    '../secret',
    '/starville/asset/source.webp',
    'starville//source.webp',
    'starville/../source.webp',
    'starville/source.webp/',
  ])('rejects unsafe bucket-relative object key %s', (path) => {
    expect(() => assertInternalStoragePath(path)).toThrow(AssetStorageError);
  });

  it('treats an immutable same-checksum retry as a replay instead of overwriting', async () => {
    const bytes = Buffer.from('immutable-asset');
    const bucket = {
      upload: vi.fn(async () => ({ data: null, error: { message: 'already exists' } })),
      download: vi.fn(async () => ({ data: new Blob([bytes]), error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://assets.example.test/file' } })),
    };
    const client = { storage: { from: vi.fn(() => bucket) } };
    const storage = createSupabaseAssetStorage(client as never);

    await expect(
      storage.storePrivateImmutable('starville/asset/upload/original.png', bytes, 'image/png'),
    ).resolves.toBe('replayed');
    expect(bucket.upload).toHaveBeenCalledWith(
      'starville/asset/upload/original.png',
      bytes,
      expect.objectContaining({ upsert: false, cacheControl: '0' }),
    );
  });

  it('fails an immutable retry when existing bytes have different integrity', async () => {
    const bucket = {
      upload: vi.fn(async () => ({ data: null, error: { message: 'already exists' } })),
      download: vi.fn(async () => ({ data: new Blob(['different']), error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://assets.example.test/file' } })),
    };
    const storage = createSupabaseAssetStorage({ storage: { from: vi.fn(() => bucket) } } as never);

    await expect(
      storage.storePublicImmutable('starville/willow-tree/v1/source.webp', Buffer.from('new')),
    ).rejects.toEqual(expect.objectContaining({ code: 'STORAGE_CONTENT_CONFLICT' }));
  });

  it('removes only validated private keys during partial-failure cleanup', async () => {
    const bucket = {
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = { storage: { from: vi.fn(() => bucket) } };
    const storage = createSupabaseAssetStorage(client as never);

    await expect(
      storage.removePrivate([
        'starville/asset/version/processed/source.webp',
        'starville/asset/version/processed/preview.webp',
      ]),
    ).resolves.toBeUndefined();
    expect(bucket.remove).toHaveBeenCalledWith([
      'starville/asset/version/processed/source.webp',
      'starville/asset/version/processed/preview.webp',
    ]);
    await expect(storage.removePrivate(['../unsafe'])).rejects.toBeInstanceOf(AssetStorageError);
  });
});
