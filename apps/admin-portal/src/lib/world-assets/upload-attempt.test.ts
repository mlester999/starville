import { describe, expect, it } from 'vitest';

import { resolveAssetUploadAttempt } from './upload-attempt';

describe('asset upload retry idempotency', () => {
  it('reuses a key for the same payload and rotates it when payload identity changes', () => {
    let next = 0;
    const createKey = () => `key-${String(++next)}`;
    const first = resolveAssetUploadAttempt(null, 'file-a|oak-tree', createKey);
    const retry = resolveAssetUploadAttempt(first, 'file-a|oak-tree', createKey);
    const changed = resolveAssetUploadAttempt(retry, 'file-a|pine-tree', createKey);

    expect(retry).toBe(first);
    expect(retry.idempotencyKey).toBe('key-1');
    expect(changed.idempotencyKey).toBe('key-2');
  });
});
