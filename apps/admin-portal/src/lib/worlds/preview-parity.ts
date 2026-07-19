import type { WorldDraftAssetPin } from './contracts';

interface ExactWorldRevisionIdentity {
  readonly map: Readonly<{ id: string }>;
  readonly version: Readonly<{ id: string; checksum: string | null }>;
}

interface ExactWorldDraftIdentity extends ExactWorldRevisionIdentity {
  readonly assetPins: readonly WorldDraftAssetPin[];
}

/**
 * Returns retained pins only when the independently authorized draft read identifies the exact
 * validated preview revision. The caller keeps the preview response as the authority gate; this
 * helper cannot make a draft previewable or change publication state.
 */
export function exactDraftPreviewAssetPins(
  preview: ExactWorldRevisionIdentity,
  draft: ExactWorldDraftIdentity,
  manifestAssetKeys: readonly string[],
): readonly WorldDraftAssetPin[] | null {
  if (
    preview.map.id !== draft.map.id ||
    preview.version.id !== draft.version.id ||
    preview.version.checksum === null ||
    preview.version.checksum !== draft.version.checksum
  ) {
    return null;
  }

  const expectedKeys = new Set(manifestAssetKeys);
  if (
    expectedKeys.size !== manifestAssetKeys.length ||
    draft.assetPins.length !== manifestAssetKeys.length
  ) {
    return null;
  }

  const pinnedKeys = new Set<string>();
  const pinnedAssetIds = new Set<string>();
  for (const pin of draft.assetPins) {
    if (
      !expectedKeys.has(pin.assetKey) ||
      pinnedKeys.has(pin.assetKey) ||
      pinnedAssetIds.has(pin.assetId)
    ) {
      return null;
    }
    pinnedKeys.add(pin.assetKey);
    pinnedAssetIds.add(pin.assetId);
  }

  if (pinnedKeys.size !== expectedKeys.size) return null;
  return draft.assetPins;
}
