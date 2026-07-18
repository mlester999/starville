import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { assetSlugSchema, assetUuidSchema } from '@starville/asset-management';

export const ASSET_INTAKE_BUCKET = 'asset-intake';
export const GAME_ASSET_DELIVERY_BUCKET = 'game-assets';
export const ASSET_GAME_ID = 'starville';

export type AssetStorageErrorCode =
  | 'INVALID_STORAGE_PATH'
  | 'PRIVATE_STORAGE_UNAVAILABLE'
  | 'PUBLIC_STORAGE_UNAVAILABLE'
  | 'STORAGE_CONTENT_CONFLICT';

export class AssetStorageError extends Error {
  public constructor(public readonly code: AssetStorageErrorCode) {
    super('Asset storage operation failed.');
    this.name = 'AssetStorageError';
  }
}

export interface AssetStorage {
  storePrivateImmutable(
    path: string,
    bytes: Buffer,
    mediaType: 'image/png' | 'image/webp',
  ): Promise<'stored' | 'replayed'>;
  readPrivate(path: string): Promise<Buffer>;
  removePrivate(paths: readonly string[]): Promise<void>;
  storePublicImmutable(path: string, bytes: Buffer): Promise<'stored' | 'replayed'>;
  publicUrl(path: string): string;
}

const storagePathPattern = /^[a-z0-9][a-z0-9/_.-]{2,319}$/u;

export function assertInternalStoragePath(path: string): string {
  if (
    !storagePathPattern.test(path) ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new AssetStorageError('INVALID_STORAGE_PATH');
  }
  return path;
}

export function privateDerivativePaths(assetId: string, versionId: string) {
  const safeAssetId = assetUuidSchema.parse(assetId);
  const safeVersionId = assetUuidSchema.parse(versionId);
  const prefix = `${ASSET_GAME_ID}/${safeAssetId}/${safeVersionId}/processed`;
  return Object.freeze({
    source: `${prefix}/source.webp`,
    preview: `${prefix}/preview.webp`,
    thumbnail: `${prefix}/thumbnail.webp`,
  });
}

export function publicDerivativePaths(slug: string, versionNumber: number) {
  const safeSlug = assetSlugSchema.parse(slug);
  if (!Number.isInteger(versionNumber) || versionNumber < 1 || versionNumber > 2_147_483_647) {
    throw new AssetStorageError('INVALID_STORAGE_PATH');
  }
  const prefix = `${ASSET_GAME_ID}/${safeSlug}/v${String(versionNumber)}`;
  return Object.freeze({
    source: `${prefix}/source.webp`,
    preview: `${prefix}/preview.webp`,
    thumbnail: `${prefix}/thumbnail.webp`,
  });
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function blobBuffer(value: Blob): Promise<Buffer> {
  return Buffer.from(await value.arrayBuffer());
}

export function createSupabaseAssetStorage(client: SupabaseClient): AssetStorage {
  async function read(bucket: string, path: string, code: AssetStorageErrorCode): Promise<Buffer> {
    const safePath = assertInternalStoragePath(path);
    const result = await client.storage.from(bucket).download(safePath);
    if (result.error !== null || result.data === null) throw new AssetStorageError(code);
    return blobBuffer(result.data);
  }

  async function store(
    bucket: string,
    path: string,
    bytes: Buffer,
    mediaType: 'image/png' | 'image/webp',
    code: AssetStorageErrorCode,
    cacheControl: string,
  ): Promise<'stored' | 'replayed'> {
    const safePath = assertInternalStoragePath(path);
    const result = await client.storage.from(bucket).upload(safePath, bytes, {
      cacheControl,
      contentType: mediaType,
      upsert: false,
    });
    if (result.error === null) return 'stored';

    try {
      const existing = await read(bucket, safePath, code);
      if (checksum(existing) === checksum(bytes)) return 'replayed';
      throw new AssetStorageError('STORAGE_CONTENT_CONFLICT');
    } catch (error) {
      if (error instanceof AssetStorageError && error.code === 'STORAGE_CONTENT_CONFLICT') {
        throw error;
      }
      throw new AssetStorageError(code);
    }
  }

  return {
    storePrivateImmutable(path, bytes, mediaType) {
      return store(ASSET_INTAKE_BUCKET, path, bytes, mediaType, 'PRIVATE_STORAGE_UNAVAILABLE', '0');
    },
    readPrivate(path) {
      return read(ASSET_INTAKE_BUCKET, path, 'PRIVATE_STORAGE_UNAVAILABLE');
    },
    async removePrivate(paths) {
      const safePaths = paths.map(assertInternalStoragePath);
      if (safePaths.length === 0) return;
      const result = await client.storage.from(ASSET_INTAKE_BUCKET).remove(safePaths);
      if (result.error !== null) {
        throw new AssetStorageError('PRIVATE_STORAGE_UNAVAILABLE');
      }
    },
    storePublicImmutable(path, bytes) {
      return store(
        GAME_ASSET_DELIVERY_BUCKET,
        path,
        bytes,
        'image/webp',
        'PUBLIC_STORAGE_UNAVAILABLE',
        '31536000',
      );
    },
    publicUrl(path) {
      const safePath = assertInternalStoragePath(path);
      const result = client.storage.from(GAME_ASSET_DELIVERY_BUCKET).getPublicUrl(safePath);
      let url: URL;
      try {
        url = new URL(result.data.publicUrl);
      } catch {
        throw new AssetStorageError('PUBLIC_STORAGE_UNAVAILABLE');
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new AssetStorageError('PUBLIC_STORAGE_UNAVAILABLE');
      }
      return url.toString();
    },
  };
}
