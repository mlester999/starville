import { createContext, useContext } from 'react';

import type { GameplayAssetOverride } from '@starville/asset-management';

export const EMPTY_GAMEPLAY_ASSET_OVERRIDES: ReadonlyMap<string, GameplayAssetOverride> = new Map();
export const GameplayAssetOverrideContext = createContext(EMPTY_GAMEPLAY_ASSET_OVERRIDES);

export function useGameplayAssetOverride(
  assetKey: string | null | undefined,
): GameplayAssetOverride | undefined {
  return useContext(GameplayAssetOverrideContext).get(assetKey ?? '');
}
