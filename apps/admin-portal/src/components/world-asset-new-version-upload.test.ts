import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { assetVersionUploadErrorMessage } from '../lib/world-assets/version-upload-errors';

describe('asset-version upload owner messages', () => {
  it('explains the remote-write approval gate instead of showing a generic 503', () => {
    expect(assetVersionUploadErrorMessage(503, 'ASSET_REMOTE_WRITES_DISABLED')).toBe(
      'Remote asset uploads are currently disabled because hosted writes have not been approved for this session.',
    );
  });

  it('distinguishes API, storage, and database availability failures', () => {
    expect(assetVersionUploadErrorMessage(503, 'ASSET_VERSION_UPLOAD_UNAVAILABLE')).toContain(
      'trusted asset API',
    );
    expect(assetVersionUploadErrorMessage(503, 'ASSET_STORAGE_UNAVAILABLE')).toContain(
      'protected asset storage',
    );
    expect(assetVersionUploadErrorMessage(503, 'ASSET_MANAGEMENT_UNAVAILABLE')).toContain(
      'asset database operation',
    );
  });

  it('keeps the canonical page, selected file, and reason available after a failed request', () => {
    const source = readFileSync(
      new URL('./world-asset-new-version-upload.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('useRouter');
    expect(source).not.toMatch(/window\.location|router\.(?:push|replace)|redirect\(/u);
    expect(source).toContain(
      'setMessage(assetVersionUploadErrorMessage(xhr.status, errorCode(envelope)))',
    );
    expect(source).toContain('value={reason}');
    expect(source).toContain('file === null');
  });
});
