import type { WorldAssetStatus, WorldAssetValidationRecord } from '@starville/game-core';

export const WORLD_ASSET_CATEGORIES = [
  'terrain',
  'path',
  'water',
  'bridge',
  'building',
  'tree',
  'rock',
  'fence',
  'lamp',
  'flower',
  'sign',
  'decoration',
] as const;

export type WorldAssetCategory = (typeof WORLD_ASSET_CATEGORIES)[number];

export interface RepositoryWorldAsset extends WorldAssetValidationRecord {
  readonly category: WorldAssetCategory;
  readonly source: 'repository-procedural';
  readonly revision: number;
  readonly developmentArt: true;
}

function asset(key: string, category: WorldAssetCategory): RepositoryWorldAsset {
  return {
    key,
    category,
    status: 'approved',
    source: 'repository-procedural',
    revision: 1,
    developmentArt: true,
  };
}

export const WORLD_ASSETS = [
  asset('cottage-amber', 'building'),
  asset('cottage-sage', 'building'),
  asset('tree-pine', 'tree'),
  asset('tree-maple', 'tree'),
  asset('rock-moss', 'rock'),
  asset('fence-willow', 'fence'),
  asset('lamp-star', 'lamp'),
  asset('notice-board', 'sign'),
  asset('flowers-moon', 'flower'),
  asset('bush-round', 'decoration'),
  asset('moonstone-marker', 'rock'),
  asset('brooklight-sign', 'sign'),
  asset('orchard-road-sign', 'sign'),
  asset('whisperpine-gate', 'fence'),
  asset('closed-route-marker', 'fence'),
] as const satisfies readonly RepositoryWorldAsset[];

export const WORLD_ASSET_CATALOG: ReadonlyMap<string, RepositoryWorldAsset> = new Map(
  WORLD_ASSETS.map((entry) => [entry.key, entry]),
);

export function worldAssetStatus(key: string): WorldAssetStatus | undefined {
  return WORLD_ASSET_CATALOG.get(key)?.status;
}
