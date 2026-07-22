import type Phaser from 'phaser';

import {
  resolveWorldAssetDelivery,
  type AssetResolutionContext,
  type ResolvedAsset,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  STARVILLE_VISUAL_TOKENS,
  projectWorld,
  terrainAt,
  terrainAssetDependencyKeys,
  type MapManifest,
  type WorldVisualQuality,
  usesAlternateGrassTerrainAsset,
  worldAssetKeyForTerrain,
} from '@starville/game-core';

import { WORLD_COLORS } from './palette';
import {
  resolvedWorldAssetRenderPlacement,
  resolvedWorldAssetTextureKey,
} from './world-asset-textures';

const MAP_PALETTES = {
  village: {
    grass: WORLD_COLORS.grass,
    alternate: WORLD_COLORS.grassAlternate,
    path: WORLD_COLORS.path,
  },
  meadow: { grass: 0x5f8f62, alternate: 0x709f6c, path: 0xa99873 },
  brook: { grass: 0x477a66, alternate: 0x568b72, path: 0x9d9a7f },
  hearth: { grass: 0x718454, alternate: 0x83945c, path: 0xb09363 },
  forest: { grass: 0x365f49, alternate: 0x416b50, path: 0x7e806d },
} as const;

type TerrainKind = ReturnType<typeof terrainAt>;

const PRODUCTION_SLICE_TERRAIN_KEYS = {
  grassLight: 'world.terrain.grass.light',
  grassDark: 'world.terrain.grass.dark',
  grassWorn: 'world.terrain.grass.worn',
  grassFlowers: 'world.terrain.grass.flowers',
  grassPathEdge: 'world.terrain.grass.path-edge',
  grassShore: 'world.terrain.grass.shore',
  waterDeep: 'world.terrain.water.deep',
  waterShallow: 'world.terrain.water.shallow',
  waterShore: 'world.terrain.water.shore',
  waterDisturbance: 'world.terrain.water.disturbance',
  interiorFloor: 'v3.interior.floor',
} as const;

const TERRAIN_CHUNK_SIZE = 8;

interface TerrainChunkRecord {
  readonly id: string;
  readonly tileNodes: Phaser.GameObjects.Image[];
  readonly auxiliaryNodes: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Graphics>;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  visible: boolean;
}

export interface TerrainCullingMetrics {
  readonly activeChunks: number;
  readonly totalChunks: number;
  readonly visibleNodes: number;
  readonly totalNodes: number;
  readonly culledNodes: number;
  readonly visibleAuxiliaryNodes: number;
  readonly totalAuxiliaryNodes: number;
}

const TERRAIN_CHUNKS = new WeakMap<Phaser.GameObjects.Container, TerrainChunkRecord[]>();
const TERRAIN_GLOBAL_AUXILIARY = new WeakMap<
  Phaser.GameObjects.Container,
  Array<Phaser.GameObjects.Graphics>
>();

function terrainChunk(
  chunks: Map<string, TerrainChunkRecord>,
  x: number,
  y: number,
): TerrainChunkRecord {
  const id = `${String(Math.floor(x / TERRAIN_CHUNK_SIZE))}:${String(
    Math.floor(y / TERRAIN_CHUNK_SIZE),
  )}`;
  const existing = chunks.get(id);
  if (existing !== undefined) return existing;
  const created: TerrainChunkRecord = {
    id,
    tileNodes: [],
    auxiliaryNodes: [],
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    visible: true,
  };
  chunks.set(id, created);
  return created;
}

export interface TerrainRenderOptions {
  readonly apronTiles?: number;
  readonly reducedMotion?: boolean;
  readonly quality?: WorldVisualQuality;
  readonly animatedWater?: boolean;
  readonly ambientEffects?: boolean;
  readonly assetResolutionContext?: AssetResolutionContext;
  readonly assetDeliveries?: readonly WorldAssetDelivery[];
}

export interface TerrainRenderBudget {
  readonly playableTiles: number;
  readonly maximumImageNodes: number;
  readonly apronImageNodes: number;
  readonly maximumAmbientMotes: number;
}

function colorForTerrain(
  terrain: TerrainKind,
  alternate: boolean,
  paletteName: keyof typeof MAP_PALETTES,
): number {
  const palette = MAP_PALETTES[paletteName];
  if (terrain === 'grass') return alternate ? palette.alternate : palette.grass;
  if (terrain === 'plaza') return WORLD_COLORS.plaza;
  if (terrain === 'path') return palette.path;
  if (terrain === 'water') return WORLD_COLORS.water;
  return WORLD_COLORS.bridge;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Low-frequency, map-stable variation that avoids a checkerboard tile grid. */
export function usesAlternateGrassTile(mapId: string, x: number, y: number): boolean {
  return usesAlternateGrassTerrainAsset(mapId, x, y);
}

export function estimateTerrainRenderBudget(
  manifest: Pick<MapManifest, 'width' | 'height'>,
  quality: WorldVisualQuality = 'balanced',
): TerrainRenderBudget {
  const playableTiles = manifest.width * manifest.height;
  return {
    playableTiles,
    maximumImageNodes:
      playableTiles * STARVILLE_VISUAL_TOKENS.terrain.maximumImageNodesPerPlayableTile + 48,
    apronImageNodes: 48,
    maximumAmbientMotes:
      quality === 'low' ? 0 : STARVILLE_VISUAL_TOKENS.terrain.maximumAmbientMotes,
  };
}

export function bundledTerrainAssetKey(terrain: TerrainKind, alternate: boolean): string {
  return worldAssetKeyForTerrain(terrain, alternate);
}

export function bundledTerrainAssetKeysForManifest(manifest: MapManifest): readonly string[] {
  return terrainAssetDependencyKeys(manifest);
}

function resolvedTerrainVisual(
  scene: Phaser.Scene,
  assetKey: string,
  delivery: WorldAssetDelivery | undefined,
  context: AssetResolutionContext,
): ResolvedAsset | undefined {
  const selected = resolveWorldAssetDelivery({
    assetKey,
    context,
    ...(delivery === undefined ? {} : { delivery }),
  });
  if (scene.textures.exists(resolvedWorldAssetTextureKey(selected))) return selected;

  const bundled = resolveWorldAssetDelivery({ assetKey, context });
  if (scene.textures.exists(resolvedWorldAssetTextureKey(bundled))) return bundled;

  const missing = resolveWorldAssetDelivery({ assetKey: 'system.missing-asset', context });
  return scene.textures.exists(resolvedWorldAssetTextureKey(missing)) ? missing : undefined;
}

function diamondPoints(
  center: Readonly<{ x: number; y: number }>,
  halfWidth: number,
  halfHeight: number,
) {
  return [
    { x: center.x, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y },
    { x: center.x, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y },
  ];
}

function terrainAtOrUndefined(
  manifest: MapManifest,
  x: number,
  y: number,
): TerrainKind | undefined {
  if (x < 0 || y < 0 || x >= manifest.width || y >= manifest.height) return undefined;
  return terrainAt(manifest, x, y);
}

interface TerrainNeighbors {
  readonly north: TerrainKind | undefined;
  readonly east: TerrainKind | undefined;
  readonly south: TerrainKind | undefined;
  readonly west: TerrainKind | undefined;
}

function terrainNeighbors(manifest: MapManifest, x: number, y: number): TerrainNeighbors {
  return {
    north: terrainAtOrUndefined(manifest, x, y - 1),
    east: terrainAtOrUndefined(manifest, x + 1, y),
    south: terrainAtOrUndefined(manifest, x, y + 1),
    west: terrainAtOrUndefined(manifest, x - 1, y),
  };
}

function adjacentTerrain(manifest: MapManifest, x: number, y: number): readonly TerrainKind[] {
  return Object.values(terrainNeighbors(manifest, x, y)).filter(
    (terrain): terrain is TerrainKind => terrain !== undefined,
  );
}

/** Capability check for the unpublished A.1 render profile; avoids numeric-version fallthrough. */
export function usesProductionSliceTerrainProfile(manifest: MapManifest): boolean {
  return (
    manifest.developmentArt.temporary && manifest.developmentArt.label.includes('Phase 12F-A.1')
  );
}

/** The rejected A.1 staging remains inspectable, while A.1R opts into the curated rescue pass. */
export function usesProductionSliceRescueTerrainProfile(manifest: MapManifest): boolean {
  return (
    usesProductionSliceTerrainProfile(manifest) &&
    manifest.developmentArt.label.includes('Phase 12F-A.1R RESCUE')
  );
}

/** Stable V3 material selection; published V1/V2 continue through the canonical resolver. */
export function productionSliceTerrainAssetKey(
  manifest: MapManifest,
  x: number,
  y: number,
  terrain: TerrainKind,
): string {
  const productionSliceProfile = usesProductionSliceTerrainProfile(manifest);
  const rescueProfile = usesProductionSliceRescueTerrainProfile(manifest);
  if (productionSliceProfile && manifest.name === 'Amber Cottage Interior' && terrain === 'plaza') {
    return PRODUCTION_SLICE_TERRAIN_KEYS.interiorFloor;
  }
  if (!productionSliceProfile) {
    return bundledTerrainAssetKey(terrain, usesAlternateGrassTile(manifest.id, x, y));
  }

  const neighbors = adjacentTerrain(manifest, x, y);
  const hash = stableHash(
    `${manifest.id}:v3-material:${String(Math.floor((x + y * 0.35) / 5))}:${String(
      Math.floor((y + x * 0.2) / 5),
    )}`,
  );
  const detailHash = stableHash(`${manifest.id}:v3-detail:${String(x)}:${String(y)}`);
  if (terrain === 'grass') {
    // Directional banks are rendered from adjacency below. A single authored
    // edge tile cannot be rotated safely for all four isometric sides and was
    // the source of rectangular bars and corrupt corner pixels.
    if (detailHash % 43 === 0) return PRODUCTION_SLICE_TERRAIN_KEYS.grassFlowers;
    if (detailHash % 31 === 0) return 'world.terrain.grass.clover';
    const bucket = rescueProfile ? (hash + (detailHash % 17)) % 100 : hash % 100;
    // Keep material variation sparse and regional. Closely related base tiles
    // are preferred so the ground reads as one meadow instead of a checkerboard.
    if (bucket < (rescueProfile ? 12 : 6)) return PRODUCTION_SLICE_TERRAIN_KEYS.grassLight;
    if (bucket < (rescueProfile ? 23 : 11)) return PRODUCTION_SLICE_TERRAIN_KEYS.grassDark;
    if (bucket < (rescueProfile ? 34 : 15)) return PRODUCTION_SLICE_TERRAIN_KEYS.grassWorn;
    return 'world.terrain.grass.base';
  }
  if (terrain === 'water') {
    if (neighbors.includes('bridge')) {
      return PRODUCTION_SLICE_TERRAIN_KEYS.waterDisturbance;
    }
    if (rescueProfile) {
      const neighborKinds = terrainNeighbors(manifest, x, y);
      const connectedWaterSides = Object.values(neighborKinds).filter(
        (neighbor) => neighbor === 'water' || neighbor === 'bridge',
      ).length;
      return connectedWaterSides >= 2
        ? PRODUCTION_SLICE_TERRAIN_KEYS.waterDeep
        : PRODUCTION_SLICE_TERRAIN_KEYS.waterShallow;
    }
    return PRODUCTION_SLICE_TERRAIN_KEYS.waterShallow;
  }
  return bundledTerrainAssetKey(terrain, false);
}

export function updateTerrainCulling(
  terrainLayer: Phaser.GameObjects.Container,
  worldView: Readonly<{ x: number; y: number; width: number; height: number }>,
): TerrainCullingMetrics {
  const chunks = TERRAIN_CHUNKS.get(terrainLayer) ?? [];
  const padding = 192;
  const view = {
    minX: worldView.x - padding,
    minY: worldView.y - padding,
    maxX: worldView.x + worldView.width + padding,
    maxY: worldView.y + worldView.height + padding,
  };
  let activeChunks = 0;
  let visibleNodes = 0;
  let totalNodes = 0;
  let visibleAuxiliaryNodes = TERRAIN_GLOBAL_AUXILIARY.get(terrainLayer)?.length ?? 0;
  let totalAuxiliaryNodes = visibleAuxiliaryNodes;
  for (const chunk of chunks) {
    const visible = !(
      chunk.maxX < view.minX ||
      chunk.minX > view.maxX ||
      chunk.maxY < view.minY ||
      chunk.minY > view.maxY
    );
    if (visible !== chunk.visible) {
      chunk.visible = visible;
      for (const node of [...chunk.tileNodes, ...chunk.auxiliaryNodes]) {
        node.setVisible(visible);
      }
    }
    totalNodes += chunk.tileNodes.length;
    totalAuxiliaryNodes += chunk.auxiliaryNodes.length;
    if (visible) {
      activeChunks += 1;
      visibleNodes += chunk.tileNodes.length;
      visibleAuxiliaryNodes += chunk.auxiliaryNodes.length;
    }
  }
  return {
    activeChunks,
    totalChunks: chunks.length,
    visibleNodes,
    totalNodes,
    culledNodes: totalNodes - visibleNodes,
    visibleAuxiliaryNodes,
    totalAuxiliaryNodes,
  };
}

function drawRegionEdges(
  graphics: Phaser.GameObjects.Graphics,
  manifest: MapManifest,
  x: number,
  y: number,
  terrain: TerrainKind,
  points: ReturnType<typeof diamondPoints>,
): void {
  if (terrain !== 'water' && terrain !== 'path' && terrain !== 'plaza') return;
  const neighbors = Object.values(terrainNeighbors(manifest, x, y));
  const connected = (neighbor: TerrainKind | undefined): boolean =>
    terrain === 'water'
      ? neighbor === 'water' || neighbor === 'bridge'
      : neighbor === terrain || (terrain === 'path' && neighbor === 'plaza');
  const productionSliceProfile = usesProductionSliceTerrainProfile(manifest);
  const rescueProfile = usesProductionSliceRescueTerrainProfile(manifest);
  const palette = MAP_PALETTES[manifest.background.palette];
  const color =
    terrain === 'water'
      ? productionSliceProfile
        ? rescueProfile
          ? 0xb6dfc7
          : 0x6f9a78
        : STARVILLE_VISUAL_TOKENS.water.shorelineColor
      : terrain === 'path'
        ? 0x755f47
        : 0xb99b70;
  const alpha =
    terrain === 'water'
      ? productionSliceProfile
        ? 0.46
        : STARVILLE_VISUAL_TOKENS.water.shorelineAlpha
      : STARVILLE_VISUAL_TOKENS.paths.edgeAlpha;
  for (let side = 0; side < 4; side += 1) {
    if (connected(neighbors[side])) continue;
    const start = points[side];
    const end = points[(side + 1) % points.length];
    if (start !== undefined && end !== undefined) {
      if (productionSliceProfile) {
        if (rescueProfile && terrain === 'water') {
          // Two planted bank shoulders cover the full-tile cyan silhouette and
          // preserve a thin pale waterline. The bank remains modular and is
          // derived from authored water adjacency rather than a flattened mask.
          graphics.lineStyle(14, palette.alternate, 0.5);
          graphics.lineBetween(start.x, start.y, end.x, end.y);
          graphics.lineStyle(7, palette.grass, 0.72);
          graphics.lineBetween(start.x, start.y, end.x, end.y);
        }
        // A broad low-alpha shoulder visually mixes the two materials, while
        // stable notches keep long rivers and paths from reading as rectangles.
        graphics.lineStyle(terrain === 'water' ? 7 : 5, color, alpha * 0.2);
        graphics.lineBetween(start.x, start.y, end.x, end.y);
        const notchSeed = stableHash(`${manifest.id}:bank:${String(x)}:${String(y)}:${side}`);
        for (let notch = 1; notch <= 2; notch += 1) {
          const progress = notch / 3 + (((notchSeed >> (notch * 3)) % 9) - 4) / 100;
          const notchX = start.x + (end.x - start.x) * progress;
          const notchY = start.y + (end.y - start.y) * progress;
          graphics.fillStyle(
            rescueProfile && terrain === 'water' ? palette.alternate : color,
            rescueProfile && terrain === 'water' ? 0.68 : alpha * 0.28,
          );
          graphics.fillCircle(
            notchX,
            notchY,
            terrain === 'water' ? (rescueProfile ? 3.4 : 2.5) : 1.8,
          );
        }
      }
      graphics.lineStyle(
        terrain === 'water' ? (rescueProfile ? 2.4 : 1.8) : 1.25,
        color,
        rescueProfile && terrain === 'water' ? 0.55 : alpha,
      );
      graphics.lineBetween(start.x, start.y, end.x, end.y);
    }
  }
}

function apronCorners(
  manifest: MapManifest,
  inset: number,
  projection: Readonly<{
    tileWidth: number;
    tileHeight: number;
    originX: number;
    originY: number;
  }>,
) {
  return [
    projectWorld({ x: -inset, y: -inset }, projection),
    projectWorld({ x: manifest.width + inset, y: -inset }, projection),
    projectWorld({ x: manifest.width + inset, y: manifest.height + inset }, projection),
    projectWorld({ x: -inset, y: manifest.height + inset }, projection),
  ];
}

function renderApron(
  scene: Phaser.Scene,
  manifest: MapManifest,
  apronTiles: number,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const halfWidth = manifest.tileWidth / 2;
  const halfHeight = manifest.tileHeight / 2;
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const palette = MAP_PALETTES[manifest.background.palette];
  const productionSliceProfile = usesProductionSliceTerrainProfile(manifest);
  const interior = productionSliceProfile && manifest.name === 'Amber Cottage Interior';
  const effectiveApronTiles = interior ? Math.min(apronTiles, 3) : apronTiles;
  const corners = apronCorners(manifest, effectiveApronTiles, projection);
  graphics.fillStyle(interior ? 0x17140f : palette.grass, 1);
  graphics.fillPoints(corners, true);
  if (productionSliceProfile) {
    // Layered environmental framing keeps camera edges intentional without
    // allocating apron tile images or presenting a flat out-of-world wedge.
    const middleInset = Math.max(effectiveApronTiles * 0.78, 0.8);
    const innerInset = Math.max(effectiveApronTiles * 0.42, 0.35);
    graphics.fillStyle(interior ? 0x34291f : palette.grass, interior ? 0.96 : 1);
    graphics.fillPoints(apronCorners(manifest, middleInset, projection), true);
    graphics.fillStyle(interior ? 0x6b533b : palette.grass, interior ? 0.88 : 1);
    graphics.fillPoints(apronCorners(manifest, innerInset, projection), true);
    if (!interior) {
      for (let index = 0; index < 20; index += 1) {
        const horizontalSpan = manifest.width + apronTiles * 2;
        const verticalSpan = manifest.height + apronTiles * 2;
        const x =
          -apronTiles +
          (stableHash(`${manifest.id}:apron-patch-x:${String(index)}`) %
            Math.max(1, Math.floor(horizontalSpan)));
        const y =
          -apronTiles +
          (stableHash(`${manifest.id}:apron-patch-y:${String(index)}`) %
            Math.max(1, Math.floor(verticalSpan)));
        const center = projectWorld({ x, y }, projection);
        graphics.fillStyle(index % 3 === 0 ? palette.alternate : palette.grass, 0.045);
        graphics.fillEllipse(
          center.x,
          center.y,
          manifest.tileWidth * 4.5,
          manifest.tileHeight * 2.6,
        );
      }
      for (let side = 0; side < 4; side += 1) {
        for (let index = 0; index < 20; index += 1) {
          const progress = (index + 0.5) / 20;
          const offset = 0.9 + (index % 4) * 0.85;
          const world =
            side === 0
              ? { x: manifest.width * progress, y: -offset }
              : side === 1
                ? { x: manifest.width + offset, y: manifest.height * progress }
                : side === 2
                  ? { x: manifest.width * (1 - progress), y: manifest.height + offset }
                  : { x: -offset, y: manifest.height * (1 - progress) };
          const center = projectWorld(world, projection);
          graphics.fillStyle(index % 2 === 0 ? palette.alternate : 0x315f47, 0.025);
          graphics.fillEllipse(
            center.x,
            center.y,
            manifest.tileWidth * 4.5,
            manifest.tileHeight * 2.8,
          );
        }
      }
    }
  }

  if (interior) return graphics;

  // One cheap underlay plus capped boundary tufts gives the playable diamond a
  // soft edge without creating thousands of hidden apron image nodes.
  const edgeLength = (manifest.width + manifest.height) * 2;
  const tuftCount = Math.min(
    Math.ceil(
      (edgeLength / 100) * STARVILLE_VISUAL_TOKENS.terrain.boundaryTuftsPerHundredEdgeTiles,
    ),
    24,
  );
  for (let index = 0; index < tuftCount; index += 1) {
    const side = index % 4;
    const progress = (index + 0.5) / tuftCount;
    const world =
      side === 0
        ? { x: manifest.width * progress, y: -0.18 }
        : side === 1
          ? { x: manifest.width + 0.18, y: manifest.height * progress }
          : side === 2
            ? { x: manifest.width * (1 - progress), y: manifest.height + 0.18 }
            : { x: -0.18, y: manifest.height * (1 - progress) };
    const screen = projectWorld(world, projection);
    const height =
      halfHeight * (0.18 + (stableHash(`${manifest.id}:edge:${String(index)}`) % 5) / 30);
    graphics.lineStyle(1.5, interior ? 0x9f835f : palette.alternate, interior ? 0.18 : 0.42);
    graphics.lineBetween(screen.x, screen.y, screen.x - halfWidth * 0.04, screen.y - height);
    graphics.lineBetween(screen.x, screen.y, screen.x + halfWidth * 0.04, screen.y - height * 0.8);
  }
  return graphics;
}

function renderEnvironmentalFrame(
  scene: Phaser.Scene,
  manifest: MapManifest,
  resolutionContext: AssetResolutionContext,
  deliveriesByKey: ReadonlyMap<string, WorldAssetDelivery>,
):
  | Readonly<{
      container: Phaser.GameObjects.Container;
      nodes: readonly Readonly<{
        image: Phaser.GameObjects.Image;
        screen: Readonly<{ x: number; y: number }>;
        world: Readonly<{ x: number; y: number }>;
      }>[];
    }>
  | undefined {
  if (!usesProductionSliceTerrainProfile(manifest) || manifest.name === 'Amber Cottage Interior') {
    return undefined;
  }
  if (usesProductionSliceRescueTerrainProfile(manifest)) return undefined;
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const nodes: Array<{
    image: Phaser.GameObjects.Image;
    screen: Readonly<{ x: number; y: number }>;
    world: Readonly<{ x: number; y: number }>;
  }> = [];
  const keys = ['tree-pine', 'tree-maple', 'bush-round', 'tree-maple'] as const;
  for (let side = 0; side < 4; side += 1) {
    for (let index = 0; index < 12; index += 1) {
      const progress = (index + 0.5) / 12;
      const offset = 1.8 + (index % 2) * 1.35;
      const world =
        side === 0
          ? { x: manifest.width * progress, y: -offset }
          : side === 1
            ? { x: manifest.width + offset, y: manifest.height * progress }
            : side === 2
              ? { x: manifest.width * (1 - progress), y: manifest.height + offset }
              : { x: -offset, y: manifest.height * (1 - progress) };
      const assetKey = keys[(side + index) % keys.length] ?? 'tree-pine';
      const resolved = resolvedTerrainVisual(
        scene,
        assetKey,
        deliveriesByKey.get(assetKey),
        resolutionContext,
      );
      if (resolved === undefined) continue;
      const center = projectWorld(world, projection);
      const placement = resolvedWorldAssetRenderPlacement(resolved);
      const image = scene.add.image(center.x, center.y, resolvedWorldAssetTextureKey(resolved));
      const frameScale = assetKey === 'bush-round' ? 0.64 : 0.56 + (index % 3) * 0.035;
      image.setOrigin(placement.originX, placement.originY);
      image.setDisplaySize(
        resolved.render.renderWidth * resolved.render.scale * frameScale,
        resolved.render.renderHeight * resolved.render.scale * frameScale,
      );
      image.setAlpha(0.68);
      nodes.push({ image, screen: center, world });
    }
  }
  return nodes.length === 0
    ? undefined
    : {
        container: scene.add.container(
          0,
          0,
          nodes.map(({ image }) => image),
        ),
        nodes,
      };
}

function renderPerimeterBlend(
  scene: Phaser.Scene,
  manifest: MapManifest,
): Phaser.GameObjects.Graphics | undefined {
  if (!usesProductionSliceTerrainProfile(manifest) || manifest.name === 'Amber Cottage Interior') {
    return undefined;
  }
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const corners = [
    projectWorld({ x: 0, y: 0 }, projection),
    projectWorld({ x: manifest.width, y: 0 }, projection),
    projectWorld({ x: manifest.width, y: manifest.height }, projection),
    projectWorld({ x: 0, y: manifest.height }, projection),
  ];
  const graphics = scene.add.graphics();
  const palette = MAP_PALETTES[manifest.background.palette];
  graphics.lineStyle(12, palette.grass, 0.72);
  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];
    if (start !== undefined && end !== undefined) {
      graphics.lineBetween(start.x, start.y, end.x, end.y);
    }
  }
  return graphics;
}

function renderMacroGroundVariation(
  scene: Phaser.Scene,
  manifest: MapManifest,
): Phaser.GameObjects.Graphics | undefined {
  if (!usesProductionSliceTerrainProfile(manifest) || manifest.name === 'Amber Cottage Interior') {
    return undefined;
  }
  const graphics = scene.add.graphics();
  const palette = MAP_PALETTES[manifest.background.palette];
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const rescueProfile = usesProductionSliceRescueTerrainProfile(manifest);
  const patchCount = rescueProfile
    ? Math.min(30, Math.max(16, Math.ceil((manifest.width * manifest.height) / 72)))
    : Math.min(18, Math.max(8, Math.ceil((manifest.width * manifest.height) / 320)));
  let renderedPatches = 0;
  for (let index = 0; index < patchCount * 3 && renderedPatches < patchCount; index += 1) {
    const x = stableHash(`${manifest.id}:macro-ground-x:${String(index)}`) % manifest.width;
    const y = stableHash(`${manifest.id}:macro-ground-y:${String(index)}`) % manifest.height;
    if (terrainAt(manifest, x, y) !== 'grass') continue;
    const center = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
    const span = 4 + (stableHash(`${manifest.id}:macro-ground-span:${String(index)}`) % 5);
    const patchColor =
      index % 4 === 0 ? 0x8aa45f : index % 3 === 0 ? palette.alternate : palette.grass;
    graphics.fillStyle(patchColor, rescueProfile ? 0.05 : 0.035);
    graphics.fillEllipse(
      center.x,
      center.y,
      manifest.tileWidth * span,
      manifest.tileHeight * span * 0.62,
    );
    if (rescueProfile) {
      graphics.fillStyle(index % 2 === 0 ? palette.grass : palette.alternate, 0.026);
      graphics.fillEllipse(
        center.x + manifest.tileWidth * 0.7,
        center.y - manifest.tileHeight * 0.25,
        manifest.tileWidth * span * 0.62,
        manifest.tileHeight * span * 0.35,
      );
    }
    renderedPatches += 1;
  }
  return graphics;
}

function renderWaterDepthBand(
  scene: Phaser.Scene,
  manifest: MapManifest,
): Phaser.GameObjects.Graphics | undefined {
  if (
    !usesProductionSliceTerrainProfile(manifest) ||
    !usesProductionSliceRescueTerrainProfile(manifest) ||
    manifest.name === 'Amber Cottage Interior'
  ) {
    return undefined;
  }
  const graphics = scene.add.graphics();
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  let previous: Readonly<{ x: number; y: number }> | undefined;
  let segments = 0;
  const outerThickness = Math.max(24, manifest.tileHeight * 0.7);
  const coreThickness = Math.max(13, manifest.tileHeight * 0.36);
  for (let x = 0; x < manifest.width; x += 1) {
    const waterRows: number[] = [];
    for (let y = 0; y < manifest.height; y += 1) {
      if (terrainAt(manifest, x, y) === 'water') waterRows.push(y);
    }
    if (waterRows.length < 3) {
      previous = undefined;
      continue;
    }
    const first = waterRows[0];
    const last = waterRows.at(-1);
    if (first === undefined || last === undefined) continue;
    const center = projectWorld({ x: x + 0.5, y: (first + last + 1) / 2 }, projection);
    graphics.fillStyle(0x2b7781, 0.13);
    graphics.fillCircle(center.x, center.y, outerThickness / 2);
    graphics.fillStyle(0x185f73, 0.2);
    graphics.fillCircle(center.x, center.y, coreThickness / 2);
    if (previous !== undefined) {
      graphics.lineStyle(outerThickness, 0x2b7781, 0.13);
      graphics.lineBetween(previous.x, previous.y, center.x, center.y);
      graphics.lineStyle(coreThickness, 0x185f73, 0.2);
      graphics.lineBetween(previous.x, previous.y, center.x, center.y);
      segments += 1;
    }
    previous = center;
  }
  if (segments === 0) {
    graphics.destroy();
    return undefined;
  }
  return graphics;
}

export function renderTerrain(
  scene: Phaser.Scene,
  manifest: MapManifest,
  options: TerrainRenderOptions = {},
): Phaser.GameObjects.Container {
  const terrainLayer = scene.add.container(0, 0);
  const resolutionContext = options.assetResolutionContext ?? 'published_world';
  const deliveriesByKey = new Map(
    (options.assetDeliveries ?? []).map((delivery) => [delivery.assetKey, delivery]),
  );
  const fallbackGraphics = scene.add.graphics();
  const seamWash = scene.add.graphics();
  const regionEdges = scene.add.graphics();
  const waterEffects = scene.add.graphics();
  const productionSliceProfile = usesProductionSliceTerrainProfile(manifest);
  const rescueProfile = usesProductionSliceRescueTerrainProfile(manifest);
  let hasFallback = false;
  let rippleGroups = 0;
  const chunksById = new Map<string, TerrainChunkRecord>();
  const chunkStaticGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  const chunkWaterGraphics = new Map<string, Phaser.GameObjects.Graphics>();
  const animatedWaterTargets: Phaser.GameObjects.Graphics[] = [];
  const globalAuxiliary: Phaser.GameObjects.Graphics[] = [];
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const halfWidth = manifest.tileWidth / 2;
  const halfHeight = manifest.tileHeight / 2;
  const apronTiles = Math.max(
    options.apronTiles ?? STARVILLE_VISUAL_TOKENS.camera.minimumApronTiles,
    0,
  );
  const apron = renderApron(scene, manifest, apronTiles);
  terrainLayer.add(apron);
  globalAuxiliary.push(apron);
  const environmentalFrame = renderEnvironmentalFrame(
    scene,
    manifest,
    resolutionContext,
    deliveriesByKey,
  );
  if (environmentalFrame !== undefined) terrainLayer.add(environmentalFrame.container);
  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      const center = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
      const chunk = terrainChunk(chunksById, x, y);
      chunk.minX = Math.min(chunk.minX, center.x - halfWidth);
      chunk.minY = Math.min(chunk.minY, center.y - halfHeight);
      chunk.maxX = Math.max(chunk.maxX, center.x + halfWidth);
      chunk.maxY = Math.max(chunk.maxY, center.y + halfHeight);
      let staticGraphics = productionSliceProfile ? chunkStaticGraphics.get(chunk.id) : undefined;
      if (productionSliceProfile && staticGraphics === undefined) {
        staticGraphics = scene.add.graphics();
        chunkStaticGraphics.set(chunk.id, staticGraphics);
        chunk.auxiliaryNodes.push(staticGraphics);
      }
      const terrain = terrainAt(manifest, x, y);
      const alternate = usesAlternateGrassTile(manifest.id, x, y);
      const assetKey = productionSliceTerrainAssetKey(manifest, x, y, terrain);
      const resolved = resolvedTerrainVisual(
        scene,
        assetKey,
        deliveriesByKey.get(assetKey),
        resolutionContext,
      );
      if (resolved !== undefined) {
        const tile = scene.add.image(center.x, center.y, resolvedWorldAssetTextureKey(resolved));
        tile.setOrigin(0.5, 0.5);
        const productionSliceOverscan = productionSliceProfile ? 1.1 : 1;
        tile.setDisplaySize(
          manifest.tileWidth * productionSliceOverscan,
          manifest.tileHeight * productionSliceOverscan,
        );
        terrainLayer.add(tile);
        chunk.tileNodes.push(tile);
        (staticGraphics ?? seamWash)
          .fillStyle(
            colorForTerrain(
              terrain,
              productionSliceProfile && terrain === 'grass' ? false : alternate,
              manifest.background.palette,
            ),
            productionSliceProfile
              ? rescueProfile
                ? manifest.name === 'Amber Cottage Interior' && terrain === 'plaza'
                  ? 0.06
                  : terrain === 'grass'
                    ? 0.1
                    : terrain === 'water'
                      ? 0.07
                      : terrain === 'path' || terrain === 'plaza'
                        ? 0.09
                        : 0.05
                : manifest.name === 'Amber Cottage Interior' && terrain === 'plaza'
                  ? 0.76
                  : terrain === 'grass'
                    ? 0.82
                    : terrain === 'water'
                      ? 0.62
                      : terrain === 'path' || terrain === 'plaza'
                        ? 0.54
                        : 0.14
              : terrain === 'grass'
                ? 0.2
                : 0.12,
          )
          .fillPoints(diamondPoints(center, halfWidth, halfHeight), true);
      } else {
        hasFallback = true;
        fallbackGraphics.fillStyle(
          colorForTerrain(terrain, alternate, manifest.background.palette),
          1,
        );
        fallbackGraphics.fillPoints(diamondPoints(center, halfWidth, halfHeight), true);
      }

      const points = diamondPoints(center, halfWidth, halfHeight);
      const edgeGraphics = staticGraphics ?? regionEdges;
      drawRegionEdges(edgeGraphics, manifest, x, y, terrain, points);
      if (
        terrain === 'water' &&
        rippleGroups < STARVILLE_VISUAL_TOKENS.water.maximumRippleGroups &&
        stableHash(`${manifest.id}:water:${String(x)}:${String(y)}`) % 3 === 0
      ) {
        rippleGroups += 1;
        let waterGraphics = productionSliceProfile
          ? chunkWaterGraphics.get(chunk.id)
          : waterEffects;
        if (productionSliceProfile && waterGraphics === undefined) {
          waterGraphics = scene.add.graphics();
          chunkWaterGraphics.set(chunk.id, waterGraphics);
          chunk.auxiliaryNodes.push(waterGraphics);
          animatedWaterTargets.push(waterGraphics);
        }
        waterGraphics?.lineStyle(1.5, 0xc5efea, STARVILLE_VISUAL_TOKENS.water.rippleAlpha);
        waterGraphics?.lineBetween(center.x - 17, center.y + 1, center.x + 7, center.y + 1);
        waterGraphics?.lineBetween(center.x - 5, center.y + 6, center.x + 15, center.y + 6);
        waterGraphics?.fillStyle(0xf3fff3, STARVILLE_VISUAL_TOKENS.water.rippleAlpha * 0.45);
        waterGraphics?.fillEllipse(center.x - 4, center.y - 4, 18, 2.2);
      }
      if (
        (terrain === 'path' || terrain === 'plaza') &&
        stableHash(`${manifest.id}:path:${String(x)}:${String(y)}`) % 11 === 0
      ) {
        edgeGraphics.lineStyle(1, 0x755f47, 0.2);
        edgeGraphics.lineBetween(center.x - 8, center.y + 2, center.x + 5, center.y + 4);
      }
    }
  }

  if (hasFallback) {
    terrainLayer.addAt(fallbackGraphics, 1);
    globalAuxiliary.push(fallbackGraphics);
  } else {
    fallbackGraphics.destroy();
  }
  if (productionSliceProfile) {
    seamWash.destroy();
    regionEdges.destroy();
    waterEffects.destroy();
    terrainLayer.add([...chunkStaticGraphics.values()]);
  } else {
    terrainLayer.add(seamWash);
    terrainLayer.add(regionEdges);
    terrainLayer.add(waterEffects);
    globalAuxiliary.push(seamWash, regionEdges, waterEffects);
    if (rippleGroups > 0) animatedWaterTargets.push(waterEffects);
  }
  const waterDepthBand = renderWaterDepthBand(scene, manifest);
  if (waterDepthBand !== undefined) {
    terrainLayer.add(waterDepthBand);
    globalAuxiliary.push(waterDepthBand);
  }
  const macroGround = renderMacroGroundVariation(scene, manifest);
  if (macroGround !== undefined) {
    terrainLayer.add(macroGround);
    globalAuxiliary.push(macroGround);
  }
  const perimeterBlend = renderPerimeterBlend(scene, manifest);
  if (perimeterBlend !== undefined) {
    terrainLayer.add(perimeterBlend);
    globalAuxiliary.push(perimeterBlend);
  }
  if (productionSliceProfile) terrainLayer.add([...chunkWaterGraphics.values()]);

  if (environmentalFrame !== undefined) {
    for (const { image, screen, world } of environmentalFrame.nodes) {
      const chunk = terrainChunk(
        chunksById,
        Math.min(Math.max(Math.floor(world.x), 0), manifest.width - 1),
        Math.min(Math.max(Math.floor(world.y), 0), manifest.height - 1),
      );
      chunk.auxiliaryNodes.push(image);
      chunk.minX = Math.min(chunk.minX, screen.x - manifest.tileWidth * 1.5);
      chunk.minY = Math.min(chunk.minY, screen.y - manifest.tileHeight * 4);
      chunk.maxX = Math.max(chunk.maxX, screen.x + manifest.tileWidth * 1.5);
      chunk.maxY = Math.max(chunk.maxY, screen.y + manifest.tileHeight);
    }
  }

  const quality = options.quality ?? 'balanced';
  if (
    rippleGroups > 0 &&
    options.animatedWater !== false &&
    options.reducedMotion !== true &&
    quality !== 'low'
  ) {
    scene.tweens?.add({
      targets: animatedWaterTargets,
      alpha: { from: 0.55, to: 1 },
      x: rescueProfile ? { from: -2.5, to: 2.5 } : 0,
      duration: 2_400,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  if (options.ambientEffects !== false && quality !== 'low') {
    const motes = scene.add.graphics();
    const maximumMotes = estimateTerrainRenderBudget(manifest, quality).maximumAmbientMotes;
    const count = Math.min(Math.ceil((manifest.width * manifest.height) / 42), maximumMotes);
    for (let index = 0; index < count; index += 1) {
      const x = stableHash(`${manifest.id}:mote-x:${String(index)}`) % manifest.width;
      const y = stableHash(`${manifest.id}:mote-y:${String(index)}`) % manifest.height;
      const screen = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
      motes.fillStyle(index % 3 === 0 ? 0xf2df96 : 0xdcebb8, 0.22);
      motes.fillCircle(screen.x, screen.y - 9 - (index % 4) * 4, index % 3 === 0 ? 1.5 : 1);
    }
    terrainLayer.add(motes);
    globalAuxiliary.push(motes);
    if (options.reducedMotion !== true && count > 0) {
      scene.tweens?.add({
        targets: motes,
        alpha: { from: 0.45, to: 0.8 },
        duration: 3_600,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  terrainLayer.setDepth(STARVILLE_VISUAL_TOKENS.depth.terrain);
  TERRAIN_CHUNKS.set(terrainLayer, [...chunksById.values()]);
  TERRAIN_GLOBAL_AUXILIARY.set(terrainLayer, globalAuxiliary);
  return terrainLayer;
}
