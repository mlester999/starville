import { loadGameplayAssetOverrides } from './gameplay-asset-overrides-client';
import { loadCurrentPublishedWorld } from './world-client';

/** Starts both independent protected reads immediately after player entry. */
export function beginGameWorldReads(apiUrl: string, signal: AbortSignal) {
  return {
    world: loadCurrentPublishedWorld(apiUrl, signal),
    assetOverrides: loadGameplayAssetOverrides(apiUrl, signal),
  } as const;
}
