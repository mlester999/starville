import type Phaser from 'phaser';

import { projectWorld, terrainAt, type MapManifest } from '@starville/game-core';

import { WORLD_COLORS } from './palette';

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

export function renderTerrain(
  scene: Phaser.Scene,
  manifest: MapManifest,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  const halfWidth = manifest.tileWidth / 2;
  const halfHeight = manifest.tileHeight / 2;

  for (let y = 0; y < manifest.height; y += 1) {
    for (let x = 0; x < manifest.width; x += 1) {
      const center = projectWorld({ x: x + 0.5, y: y + 0.5 }, projection);
      const terrain = terrainAt(manifest, x, y);
      graphics.fillStyle(
        colorForTerrain(terrain, (x + y) % 2 === 0, manifest.background.palette),
        1,
      );
      graphics.fillPoints(
        [
          { x: center.x, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y },
          { x: center.x, y: center.y + halfHeight },
          { x: center.x - halfWidth, y: center.y },
        ],
        true,
      );
      graphics.lineStyle(1, WORLD_COLORS.outline, terrain === 'water' ? 0.28 : 0.18);
      graphics.strokePoints(
        [
          { x: center.x, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y },
          { x: center.x, y: center.y + halfHeight },
          { x: center.x - halfWidth, y: center.y },
        ],
        true,
      );

      if (terrain === 'water' && (x + y) % 3 === 0) {
        graphics.lineStyle(2, 0xa7d9d4, 0.24);
        graphics.lineBetween(center.x - 17, center.y + 2, center.x + 10, center.y + 2);
      }
    }
  }

  graphics.setDepth(-1_000_000_000);
  return graphics;
}
