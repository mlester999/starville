import { mapManifestSchema, type MapManifestInput, type TerrainArea } from './manifest';
import { STARVILLE_VISUAL_TOKENS } from './visual-policy';

type TerrainKind = TerrainArea['terrain'];
type TerrainDependencyManifest = Readonly<{
  id: string;
  width: number;
  height: number;
  assets: readonly string[];
  terrain: readonly TerrainArea[];
}>;

export const WORLD_TERRAIN_ASSET_KEYS = [
  'world.terrain.grass.base',
  'world.terrain.grass.clover',
  'world.terrain.path.stone',
  'world.terrain.plaza',
  'world.terrain.water',
  'world.terrain.bridge',
] as const;

function stableTerrainHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function usesAlternateGrassTerrainAsset(mapId: string, x: number, y: number): boolean {
  const patchSize = STARVILLE_VISUAL_TOKENS.terrain.variationPatchTiles;
  const patchX = Math.floor(x / patchSize);
  const patchY = Math.floor(y / patchSize);
  return stableTerrainHash(`${mapId}:${String(patchX)}:${String(patchY)}`) % 7 === 0;
}

export function worldAssetKeyForTerrain(terrain: TerrainKind, alternate: boolean): string {
  if (terrain === 'grass') {
    return alternate ? 'world.terrain.grass.clover' : 'world.terrain.grass.base';
  }
  if (terrain === 'plaza') return 'world.terrain.plaza';
  if (terrain === 'path') return 'world.terrain.path.stone';
  if (terrain === 'water') return 'world.terrain.water';
  return 'world.terrain.bridge';
}

function terrainKindAt(orderedTerrain: readonly TerrainArea[], x: number, y: number): TerrainKind {
  return (
    orderedTerrain.find(
      (area) => x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height,
    )?.terrain ?? 'grass'
  );
}

/**
 * Exact stable terrain keys selected by the production renderer for this
 * immutable map composition. The result is deterministic and contains no
 * client-authored state.
 */
export function terrainAssetDependencyKeys(manifest: TerrainDependencyManifest): readonly string[] {
  const keys = new Set<string>();
  const orderedTerrain = [...manifest.terrain].sort((left, right) => right.order - left.order);
  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      keys.add(
        worldAssetKeyForTerrain(
          terrainKindAt(orderedTerrain, x, y),
          usesAlternateGrassTerrainAsset(manifest.id, x, y),
        ),
      );
    }
  }
  return [...keys].sort();
}

export function worldAssetDependencyKeys(manifest: TerrainDependencyManifest): readonly string[] {
  const keys = new Set(manifest.assets);
  for (const key of terrainAssetDependencyKeys(manifest)) keys.add(key);
  return [...keys];
}

/**
 * Server-side write normalization for new draft revisions. Parsing itself
 * remains backward compatible so historical immutable revisions without
 * explicit terrain pins still load through the bundled fallback path.
 */
export function normalizeMapManifestAssetDependencies(value: unknown): MapManifestInput {
  const manifest = mapManifestSchema.parse(value);
  return mapManifestSchema.parse({
    ...manifest,
    assets: worldAssetDependencyKeys(manifest),
  });
}
