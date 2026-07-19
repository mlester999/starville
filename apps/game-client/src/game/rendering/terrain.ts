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
import { resolvedWorldAssetTextureKey } from './world-asset-textures';

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
  readonly apronImageNodes: 0;
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
      playableTiles * STARVILLE_VISUAL_TOKENS.terrain.maximumImageNodesPerPlayableTile,
    apronImageNodes: 0,
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

function drawRegionEdges(
  graphics: Phaser.GameObjects.Graphics,
  manifest: MapManifest,
  x: number,
  y: number,
  terrain: TerrainKind,
  points: ReturnType<typeof diamondPoints>,
): void {
  if (terrain !== 'water' && terrain !== 'path' && terrain !== 'plaza') return;
  const neighbors = [
    terrainAtOrUndefined(manifest, x, y - 1),
    terrainAtOrUndefined(manifest, x + 1, y),
    terrainAtOrUndefined(manifest, x, y + 1),
    terrainAtOrUndefined(manifest, x - 1, y),
  ];
  const connected = (neighbor: TerrainKind | undefined): boolean =>
    terrain === 'water'
      ? neighbor === 'water' || neighbor === 'bridge'
      : neighbor === terrain || (terrain === 'path' && neighbor === 'plaza');
  const color =
    terrain === 'water'
      ? STARVILLE_VISUAL_TOKENS.water.shorelineColor
      : terrain === 'path'
        ? 0x755f47
        : 0xb99b70;
  const alpha =
    terrain === 'water'
      ? STARVILLE_VISUAL_TOKENS.water.shorelineAlpha
      : STARVILLE_VISUAL_TOKENS.paths.edgeAlpha;
  graphics.lineStyle(terrain === 'water' ? 2 : 1.5, color, alpha);
  for (let side = 0; side < 4; side += 1) {
    if (connected(neighbors[side])) continue;
    const start = points[side];
    const end = points[(side + 1) % points.length];
    if (start !== undefined && end !== undefined) {
      graphics.lineBetween(start.x, start.y, end.x, end.y);
    }
  }
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
  const corners = [
    projectWorld({ x: -apronTiles, y: -apronTiles }, projection),
    projectWorld({ x: manifest.width + apronTiles, y: -apronTiles }, projection),
    projectWorld({ x: manifest.width + apronTiles, y: manifest.height + apronTiles }, projection),
    projectWorld({ x: -apronTiles, y: manifest.height + apronTiles }, projection),
  ];
  const palette = MAP_PALETTES[manifest.background.palette];
  graphics.fillStyle(palette.grass, 1).fillPoints(corners, true);

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
    graphics.lineStyle(1.5, palette.alternate, 0.42);
    graphics.lineBetween(screen.x, screen.y, screen.x - halfWidth * 0.04, screen.y - height);
    graphics.lineBetween(screen.x, screen.y, screen.x + halfWidth * 0.04, screen.y - height * 0.8);
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
  let hasFallback = false;
  let rippleGroups = 0;
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
  terrainLayer.add(renderApron(scene, manifest, apronTiles));
  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      const center = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
      const terrain = terrainAt(manifest, x, y);
      const alternate = usesAlternateGrassTile(manifest.id, x, y);
      const assetKey = bundledTerrainAssetKey(terrain, alternate);
      const resolved = resolvedTerrainVisual(
        scene,
        assetKey,
        deliveriesByKey.get(assetKey),
        resolutionContext,
      );
      if (resolved !== undefined) {
        const tile = scene.add.image(center.x, center.y, resolvedWorldAssetTextureKey(resolved));
        tile.setOrigin(0.5, 0.5);
        tile.setDisplaySize(manifest.tileWidth, manifest.tileHeight);
        terrainLayer.add(tile);
        seamWash
          .fillStyle(
            colorForTerrain(terrain, alternate, manifest.background.palette),
            terrain === 'grass' ? 0.2 : 0.12,
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
      drawRegionEdges(regionEdges, manifest, x, y, terrain, points);
      if (
        terrain === 'water' &&
        rippleGroups < STARVILLE_VISUAL_TOKENS.water.maximumRippleGroups &&
        stableHash(`${manifest.id}:water:${String(x)}:${String(y)}`) % 3 === 0
      ) {
        rippleGroups += 1;
        waterEffects.lineStyle(1.5, 0xc5efea, STARVILLE_VISUAL_TOKENS.water.rippleAlpha);
        waterEffects.lineBetween(center.x - 17, center.y + 1, center.x + 7, center.y + 1);
        waterEffects.lineBetween(center.x - 5, center.y + 6, center.x + 15, center.y + 6);
      }
      if (
        (terrain === 'path' || terrain === 'plaza') &&
        stableHash(`${manifest.id}:path:${String(x)}:${String(y)}`) % 11 === 0
      ) {
        regionEdges.lineStyle(1, 0x755f47, 0.2);
        regionEdges.lineBetween(center.x - 8, center.y + 2, center.x + 5, center.y + 4);
      }
    }
  }

  if (hasFallback) terrainLayer.addAt(fallbackGraphics, 1);
  else fallbackGraphics.destroy();
  terrainLayer.add(seamWash);
  terrainLayer.add(regionEdges);
  terrainLayer.add(waterEffects);

  const quality = options.quality ?? 'balanced';
  if (
    rippleGroups > 0 &&
    options.animatedWater !== false &&
    options.reducedMotion !== true &&
    quality !== 'low'
  ) {
    scene.tweens?.add({
      targets: waterEffects,
      alpha: { from: 0.55, to: 1 },
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
  return terrainLayer;
}
