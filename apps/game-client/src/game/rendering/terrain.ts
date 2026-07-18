import type Phaser from 'phaser';

import { resolveWorldAssetDelivery } from '@starville/asset-management';
import { projectWorld, terrainAt, type MapManifest } from '@starville/game-core';

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

function colorForTerrain(
  terrain: ReturnType<typeof terrainAt>,
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

export function bundledTerrainAssetKey(
  terrain: ReturnType<typeof terrainAt>,
  alternate: boolean,
): string {
  if (terrain === 'grass') {
    return alternate ? 'world.terrain.grass.clover' : 'world.terrain.grass.base';
  }
  if (terrain === 'plaza') return 'world.terrain.plaza';
  if (terrain === 'path') return 'world.terrain.path.stone';
  if (terrain === 'water') return 'world.terrain.water';
  return 'world.terrain.bridge';
}

export function bundledTerrainAssetKeysForManifest(manifest: MapManifest): readonly string[] {
  const keys = new Set<string>();
  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      keys.add(bundledTerrainAssetKey(terrainAt(manifest, x, y), (x + y) % 2 === 0));
    }
  }
  return [...keys].sort();
}

export function renderTerrain(
  scene: Phaser.Scene,
  manifest: MapManifest,
): Phaser.GameObjects.Container {
  const terrainLayer = scene.add.container(0, 0);
  const fallbackGraphics = scene.add.graphics();
  let hasFallback = false;
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const halfWidth = manifest.tileWidth / 2;
  const halfHeight = manifest.tileHeight / 2;
  const missing = resolveWorldAssetDelivery({
    assetKey: 'system.missing-asset',
    context: 'published_world',
  });
  const missingTextureKey = resolvedWorldAssetTextureKey(missing);

  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      const center = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
      const terrain = terrainAt(manifest, x, y);
      const alternate = (x + y) % 2 === 0;
      const resolved = resolveWorldAssetDelivery({
        assetKey: bundledTerrainAssetKey(terrain, alternate),
        context: 'published_world',
      });
      const textureKey = resolvedWorldAssetTextureKey(resolved);
      if (scene.textures.exists(textureKey)) {
        const tile = scene.add.image(center.x, center.y, textureKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDisplaySize(manifest.tileWidth, manifest.tileHeight);
        terrainLayer.add(tile);
        continue;
      }

      if (scene.textures.exists(missingTextureKey)) {
        const tile = scene.add.image(center.x, center.y, missingTextureKey);
        tile.setOrigin(0.5, 0.5);
        tile.setDisplaySize(manifest.tileWidth, manifest.tileHeight);
        terrainLayer.add(tile);
        continue;
      }

      hasFallback = true;
      fallbackGraphics.fillStyle(
        colorForTerrain(terrain, (x + y) % 2 === 0, manifest.background.palette),
        1,
      );
      fallbackGraphics.fillPoints(
        [
          { x: center.x, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y },
          { x: center.x, y: center.y + halfHeight },
          { x: center.x - halfWidth, y: center.y },
        ],
        true,
      );
      fallbackGraphics.lineStyle(1, WORLD_COLORS.outline, terrain === 'water' ? 0.28 : 0.18);
      fallbackGraphics.strokePoints(
        [
          { x: center.x, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y },
          { x: center.x, y: center.y + halfHeight },
          { x: center.x - halfWidth, y: center.y },
        ],
        true,
      );

      if (terrain === 'water' && (x + y) % 3 === 0) {
        fallbackGraphics.lineStyle(2, 0xa7d9d4, 0.24);
        fallbackGraphics.lineBetween(center.x - 17, center.y + 2, center.x + 10, center.y + 2);
      }
    }
  }

  if (hasFallback) terrainLayer.addAt(fallbackGraphics, 0);
  else fallbackGraphics.destroy();
  terrainLayer.setDepth(-1_000_000_000);
  return terrainLayer;
}
