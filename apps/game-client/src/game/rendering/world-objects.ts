import type Phaser from 'phaser';

import {
  resolveWorldAssetDelivery,
  type AssetResolutionContext,
  type ResolvedAsset,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  STARVILLE_VISUAL_TOKENS,
  depthForFootPosition,
  projectWorld,
  resolveWorldContactShadowLayers,
  resolveWorldObjectContactShadow,
  resolveWorldObjectVisualScale,
  type MapManifest,
  type MapObject,
  type WorldVisualQuality,
} from '@starville/game-core';

import { WORLD_COLORS } from './palette';
import {
  resolvedWorldAssetRenderPlacement,
  resolvedWorldAssetTextureKey,
} from './world-asset-textures';

export interface RenderedWorldObject {
  readonly id: string;
  readonly container: Phaser.GameObjects.Container;
  readonly shadow?: Phaser.GameObjects.Graphics;
}

export interface WorldObjectRenderOptions {
  readonly shadows?: boolean;
  readonly quality?: WorldVisualQuality;
  readonly assetResolutionContext?: AssetResolutionContext;
}

function drawBuilding(graphics: Phaser.GameObjects.Graphics, sage: boolean): void {
  graphics.fillStyle(sage ? 0x6c8064 : 0xa46c49).fillRoundedRect(-92, -115, 184, 112, 10);
  graphics.fillStyle(sage ? 0x415a4b : 0x714433).fillPoints(
    [
      { x: -112, y: -108 },
      { x: 0, y: -185 },
      { x: 112, y: -108 },
      { x: 82, y: -88 },
      { x: 0, y: -146 },
      { x: -82, y: -88 },
    ],
    true,
  );
  graphics.fillStyle(0x4a3328).fillRoundedRect(-20, -72, 40, 69, 7);
  graphics.fillStyle(WORLD_COLORS.gold, 0.9).fillCircle(11, -39, 3);
  for (const x of [-61, 51]) {
    graphics.fillStyle(0xf3d780, 0.92).fillRoundedRect(x, -82, 26, 31, 5);
    graphics.lineStyle(3, 0x5d4334, 0.8).strokeRoundedRect(x, -82, 26, 31, 5);
  }
  graphics.fillStyle(0x5e4735).fillRect(48, -164, 22, 55);
  graphics.fillStyle(0xd9b461, 0.7).fillCircle(-72, -23, 5);
  graphics.fillCircle(69, -18, 4);
}

function drawTree(graphics: Phaser.GameObjects.Graphics, maple: boolean): void {
  graphics.fillStyle(0x594332).fillRoundedRect(-11, -89, 22, 88, 8);
  const colors = maple
    ? ([0x8e6f45, 0xa4804a, 0x73855a] as const)
    : ([0x426c4e, 0x4f7b58, 0x5c8962] as const);
  const circles = [
    { x: -29, y: -105, r: 34, c: colors[1] },
    { x: 25, y: -112, r: 36, c: colors[0] },
    { x: -2, y: -145, r: 43, c: colors[2] },
    { x: 4, y: -91, r: 36, c: colors[1] },
  ];
  for (const circle of circles) {
    graphics.fillStyle(circle.c, 1).fillCircle(circle.x, circle.y, circle.r);
  }
  graphics.fillStyle(0xc6d99b, 0.22).fillCircle(-16, -153, 13);
}

function drawFence(graphics: Phaser.GameObjects.Graphics): void {
  graphics.lineStyle(10, 0x765a3e, 1);
  graphics.lineBetween(-104, -35, 104, -35);
  graphics.lineStyle(6, 0xb08a5b, 1);
  graphics.lineBetween(-104, -52, 104, -52);
  for (const x of [-96, -48, 0, 48, 96]) {
    graphics.fillStyle(0x7f6042).fillRoundedRect(x - 5, -71, 10, 68, 3);
  }
}

function drawLamp(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x3d443b).fillRoundedRect(-4, -98, 8, 96, 3);
  graphics.fillStyle(WORLD_COLORS.gold, 0.17).fillCircle(0, -105, 35);
  graphics.fillStyle(0xf7dc83).fillCircle(0, -105, 12);
  graphics.lineStyle(4, 0x4e4938).strokeCircle(0, -105, 16);
  graphics.fillStyle(0x4e4938).fillTriangle(-20, -119, 20, -119, 0, -141);
}

function drawNotice(graphics: Phaser.GameObjects.Graphics): void {
  graphics.fillStyle(0x6f5035).fillRoundedRect(-5, -73, 10, 72, 3);
  graphics.fillStyle(0x9b7548).fillRoundedRect(-43, -91, 86, 50, 7);
  graphics.lineStyle(3, 0xd5b66c, 0.55).strokeRoundedRect(-43, -91, 86, 50, 7);
  graphics.fillStyle(0xe8d49b, 0.8).fillRect(-27, -77, 54, 4);
  graphics.fillRect(-22, -65, 44, 3);
}

function drawSmallObject(
  graphics: Phaser.GameObjects.Graphics,
  object: Pick<MapObject, 'kind'>,
): void {
  if (object.kind === 'rock') {
    graphics.fillStyle(0x788176).fillPoints(
      [
        { x: -34, y: -8 },
        { x: -19, y: -42 },
        { x: 18, y: -49 },
        { x: 38, y: -16 },
        { x: 23, y: -3 },
      ],
      true,
    );
    graphics.fillStyle(0x95a489, 0.5).fillEllipse(-7, -34, 23, 11);
    return;
  }
  if (object.kind === 'flowers') {
    const flowers: readonly (readonly [number, number])[] = [
      [-15, -14],
      [0, -23],
      [17, -11],
      [8, -35],
    ];
    for (const [x, y] of flowers) {
      graphics.lineStyle(2, 0x496b4b).lineBetween(x, y, x, 0);
      graphics.fillStyle(0xd8c1e8).fillCircle(x, y, 6);
      graphics.fillStyle(0xf1d477).fillCircle(x, y, 2);
    }
    return;
  }
  graphics.fillStyle(0x527453).fillCircle(-20, -22, 25);
  graphics.fillStyle(0x63865c).fillCircle(13, -25, 30);
  graphics.fillStyle(0x77986a, 0.65).fillCircle(2, -39, 17);
}

function drawObject(
  graphics: Phaser.GameObjects.Graphics,
  object: Pick<MapObject, 'assetId' | 'kind'>,
): void {
  if (object.kind === 'building') {
    drawBuilding(graphics, object.assetId.includes('sage'));
  } else if (object.kind === 'tree') {
    drawTree(graphics, object.assetId.includes('maple'));
  } else if (object.kind === 'fence') {
    drawFence(graphics);
  } else if (object.kind === 'lamp') {
    drawLamp(graphics);
  } else if (object.kind === 'sign') {
    drawNotice(graphics);
  } else {
    drawSmallObject(graphics, object);
  }
}

function resolvedVisual(
  scene: Phaser.Scene,
  object: Readonly<{
    assetId: MapObject['assetId'];
    rotation: MapObject['rotation'] | undefined;
  }>,
  delivery: WorldAssetDelivery | undefined,
  context: AssetResolutionContext,
): ResolvedAsset | undefined {
  const rotation = object.rotation ?? delivery?.defaultRotation ?? 0;
  const selected = resolveWorldAssetDelivery({
    assetKey: object.assetId,
    context,
    ...(delivery === undefined ? {} : { delivery }),
    rotation,
  });

  /*
   * The current upload contract exposes one immutable image, not directional
   * frames. Never fake an isometric turn by rotating that flat image; use the
   * authored bundled direction until uploaded variant delivery is supported.
   */
  const uploadCanRepresentDirection =
    selected.source !== 'pinned_uploaded' || delivery?.defaultRotation === rotation;
  if (
    uploadCanRepresentDirection &&
    scene.textures.exists(resolvedWorldAssetTextureKey(selected))
  ) {
    return selected;
  }

  const bundled = resolveWorldAssetDelivery({
    assetKey: object.assetId,
    context,
    rotation,
  });
  if (scene.textures.exists(resolvedWorldAssetTextureKey(bundled))) return bundled;

  const missing = resolveWorldAssetDelivery({
    assetKey: 'system.missing-asset',
    context,
  });
  return scene.textures.exists(resolvedWorldAssetTextureKey(missing)) ? missing : undefined;
}

export function renderWorldObjects(
  scene: Phaser.Scene,
  manifest: MapManifest,
  deliveries: readonly WorldAssetDelivery[] = [],
  options: WorldObjectRenderOptions = {},
): readonly RenderedWorldObject[] {
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };

  const deliveriesByKey = new Map(deliveries.map((delivery) => [delivery.assetKey, delivery]));
  const resolutionContext = options.assetResolutionContext ?? 'published_world';

  return manifest.objects.map((object) => {
    const screen = projectWorld(object, projection);
    const delivery = deliveriesByKey.get(object.assetId);
    const resolved = resolvedVisual(
      scene,
      { assetId: object.assetId, rotation: object.rotation },
      delivery,
      resolutionContext,
    );
    let visual: Phaser.GameObjects.GameObject;
    let depthOffset = 0;
    const categoryScale = resolveWorldObjectVisualScale(object.kind);
    const visualScale = resolveWorldObjectVisualScale(object.kind, object.scale);

    if (resolved !== undefined) {
      const placement = resolvedWorldAssetRenderPlacement(resolved);
      const image = scene.add.image(0, 0, resolvedWorldAssetTextureKey(resolved));
      image.setOrigin(placement.originX, placement.originY);
      image.setDisplaySize(
        resolved.render.renderWidth * resolved.render.scale,
        resolved.render.renderHeight * resolved.render.scale,
      );
      visual = image;
      depthOffset = placement.depthOffset;
    } else {
      const graphics = scene.add.graphics();
      drawObject(graphics, object);
      // Procedural fallbacks were authored directly at canonical screen size.
      // Normalize them so the shared category scale still applies uniformly at
      // the container boundary without shrinking the development fallback.
      graphics.setScale(1 / categoryScale);
      visual = graphics;
    }

    const baseDepth = depthForFootPosition(object.x, object.y, object.id);
    const container = scene.add.container(screen.x, screen.y, [visual]);
    container.setScale(visualScale);
    container.setDepth(baseDepth + depthOffset);

    if (options.shadows === false) return { id: object.id, container };
    const shadowSpec = resolveWorldObjectContactShadow(object.kind, object.scale);
    const shadow = scene.add.graphics();
    const qualityAlpha = options.quality === 'low' ? shadowSpec.alpha * 0.76 : shadowSpec.alpha;
    for (const layer of resolveWorldContactShadowLayers({
      ...shadowSpec,
      alpha: qualityAlpha,
    })) {
      shadow
        .fillStyle(STARVILLE_VISUAL_TOKENS.shadows.color, layer.alpha)
        .fillEllipse(0, layer.offsetY, layer.width, layer.height);
    }
    shadow
      .setPosition(screen.x, screen.y)
      .setDepth(baseDepth - STARVILLE_VISUAL_TOKENS.depth.shadowOffset);
    return { id: object.id, container, shadow };
  });
}
