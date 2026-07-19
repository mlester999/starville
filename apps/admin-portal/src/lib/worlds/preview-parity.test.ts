import { describe, expect, it } from 'vitest';

import { exactDraftPreviewAssetPins } from './preview-parity';
import type { WorldDraftAssetPin } from './contracts';

const MAP_ID = '3e067bf0-a684-4ed6-96dc-0c5b7fc15d66';
const VERSION_ID = '4f2b0e0e-0607-4d65-bd33-f3d50bdaff45';
const CHECKSUM = 'a'.repeat(64);
const TREE_ASSET_ID = '1a0976ff-992e-4df2-8b91-4d723e25ed75';
const LAMP_ASSET_ID = '0dfb85d0-3a42-40df-9f9d-f45457455e7c';

function pin(assetKey: string, assetId: string): WorldDraftAssetPin {
  return {
    assetId,
    assetKey,
    pinnedVersion: { sourceKind: 'repository_procedural' },
  } as unknown as WorldDraftAssetPin;
}

const preview = { map: { id: MAP_ID }, version: { id: VERSION_ID, checksum: CHECKSUM } };

function draft(assetPins: readonly WorldDraftAssetPin[]) {
  return {
    map: { id: MAP_ID },
    version: { id: VERSION_ID, checksum: CHECKSUM },
    assetPins,
  };
}

describe('exact Draft Preview asset-pin parity', () => {
  it('returns complete retained pins unchanged, including canonical bundled repository pins', () => {
    const pins = [pin('tree-pine', TREE_ASSET_ID), pin('lamp-square', LAMP_ASSET_ID)];
    expect(exactDraftPreviewAssetPins(preview, draft(pins), ['tree-pine', 'lamp-square'])).toBe(
      pins,
    );
  });

  it('fails closed for a mismatched map, version, checksum, or missing checksum', () => {
    const exactDraft = draft([pin('tree-pine', TREE_ASSET_ID)]);

    expect(
      exactDraftPreviewAssetPins(preview, { ...exactDraft, map: { id: crypto.randomUUID() } }, [
        'tree-pine',
      ]),
    ).toBe(null);
    expect(
      exactDraftPreviewAssetPins(
        preview,
        {
          ...exactDraft,
          version: { ...exactDraft.version, id: crypto.randomUUID() },
        },
        ['tree-pine'],
      ),
    ).toBe(null);
    expect(
      exactDraftPreviewAssetPins(
        preview,
        {
          ...exactDraft,
          version: { ...exactDraft.version, checksum: 'b'.repeat(64) },
        },
        ['tree-pine'],
      ),
    ).toBe(null);
    expect(
      exactDraftPreviewAssetPins(
        { ...preview, version: { ...preview.version, checksum: null } },
        exactDraft,
        ['tree-pine'],
      ),
    ).toBe(null);
  });

  it('fails closed when pins are empty or only partially cover the manifest assets', () => {
    expect(exactDraftPreviewAssetPins(preview, draft([]), ['tree-pine'])).toBe(null);
    expect(
      exactDraftPreviewAssetPins(preview, draft([pin('tree-pine', TREE_ASSET_ID)]), [
        'tree-pine',
        'lamp-square',
      ]),
    ).toBe(null);
  });

  it('fails closed for duplicate pin keys, duplicate asset identities, or duplicate manifest keys', () => {
    expect(
      exactDraftPreviewAssetPins(
        preview,
        draft([pin('tree-pine', TREE_ASSET_ID), pin('tree-pine', LAMP_ASSET_ID)]),
        ['tree-pine', 'lamp-square'],
      ),
    ).toBe(null);
    expect(
      exactDraftPreviewAssetPins(
        preview,
        draft([pin('tree-pine', TREE_ASSET_ID), pin('lamp-square', TREE_ASSET_ID)]),
        ['tree-pine', 'lamp-square'],
      ),
    ).toBe(null);
    expect(
      exactDraftPreviewAssetPins(
        preview,
        draft([pin('tree-pine', TREE_ASSET_ID), pin('lamp-square', LAMP_ASSET_ID)]),
        ['tree-pine', 'tree-pine'],
      ),
    ).toBe(null);
  });

  it('fails closed when retained pins contain an asset key outside the manifest', () => {
    expect(
      exactDraftPreviewAssetPins(
        preview,
        draft([pin('tree-pine', TREE_ASSET_ID), pin('lamp-square', LAMP_ASSET_ID)]),
        ['tree-pine', 'rock-small'],
      ),
    ).toBe(null);
  });
});
