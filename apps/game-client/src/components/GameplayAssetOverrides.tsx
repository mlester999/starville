import { useMemo, type ReactNode } from 'react';

import type { GameplayAssetOverride } from '@starville/asset-management';

import { GameplayAssetOverrideContext } from '../app/gameplay-asset-overrides-context';

export function GameplayAssetOverrideProvider({
  overrides,
  children,
}: Readonly<{ overrides: readonly GameplayAssetOverride[]; children: ReactNode }>) {
  const byKey = useMemo(
    () => new Map(overrides.map((override) => [override.assetKey, override])),
    [overrides],
  );
  return (
    <GameplayAssetOverrideContext.Provider value={byKey}>
      {children}
    </GameplayAssetOverrideContext.Provider>
  );
}
