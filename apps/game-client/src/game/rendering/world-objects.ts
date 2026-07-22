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
  readonly assetId: string;
  readonly kind: MapObject['kind'];
  readonly world: Readonly<{ x: number; y: number }>;
  readonly scale: number;
  readonly container: Phaser.GameObjects.Container;
  readonly shadow?: Phaser.GameObjects.Graphics;
  readonly foreground?: Phaser.GameObjects.Container;
  readonly screen: Readonly<{ x: number; y: number }>;
  readonly layerPolicy: WorldObjectLayerPolicy;
}

export interface WorldObjectCullingMetrics {
  readonly visibleObjects: number;
  readonly totalObjects: number;
  readonly culledObjects: number;
}

export interface WorldObjectRenderOptions {
  readonly shadows?: boolean;
  readonly quality?: WorldVisualQuality;
  readonly assetResolutionContext?: AssetResolutionContext;
}

export interface WorldObjectOcclusionPolicy {
  readonly lateralRadius: number;
  readonly behindDepth: number;
  readonly baseAlpha: number;
  readonly foregroundAlpha: number;
}

export interface WorldObjectLayerPolicy {
  readonly foregroundSplit: number | undefined;
  readonly foregroundDepthOffset: number;
  readonly occlusion: WorldObjectOcclusionPolicy | undefined;
}

export interface WorldObjectOcclusionMetrics {
  readonly occludedObjects: number;
}

const CANONICAL_WORLD_OBJECT_LAYER_POLICY: WorldObjectLayerPolicy = Object.freeze({
  foregroundSplit: undefined,
  foregroundDepthOffset: 0,
  occlusion: undefined,
});

/**
 * Flat decals that hang on the interior back wall (windows, framed art) share the
 * wall panels' depth band. Because the wall billboards overlap heavily to read as
 * one continuous wall, a neighbouring panel would otherwise draw over the decal.
 * Lifting the decal a few depth rows keeps it painted onto its wall while still
 * sitting behind any furniture standing in front of it.
 */
const WALL_MOUNTED_DECAL_ASSET_IDS: ReadonlySet<string> = new Set([
  'v3.interior.window',
  'v3.interior.wall-art',
]);
const WALL_MOUNTED_DECAL_DEPTH_BONUS = 2_200_000;

/** Explicit A.1 capability check; unrelated future numeric versions stay on canonical layering. */
export function usesProductionSliceObjectProfile(manifest: MapManifest): boolean {
  return (
    manifest.developmentArt.temporary && manifest.developmentArt.label.includes('Phase 12F-A.1')
  );
}

const INTERIOR_LAYER_POLICIES: Readonly<
  Record<string, Readonly<{ split: number; depthOffset: number }>>
> = {
  'v3.interior.bed': { split: 0.57, depthOffset: 0.46 },
  'v3.interior.bedside-table': { split: 0.52, depthOffset: 0.26 },
  'v3.interior.dining-table': { split: 0.53, depthOffset: 0.48 },
  'v3.interior.dining-chair': { split: 0.57, depthOffset: 0.3 },
  'v3.interior.chest': { split: 0.54, depthOffset: 0.32 },
  'v3.interior.wardrobe': { split: 0.6, depthOffset: 0.5 },
  'v3.interior.fireplace': { split: 0.62, depthOffset: 0.48 },
  'v3.interior.cooking-counter': { split: 0.55, depthOffset: 0.44 },
  'v3.interior.floor-lamp': { split: 0.62, depthOffset: 0.34 },
  'v3.interior.houseplant': { split: 0.6, depthOffset: 0.3 },
};

/**
 * Tall V3 artwork is split at an authored/category-aware silhouette boundary.
 * The upper slice stays in front until the player's foot anchor has cleared the
 * object's usable depth; flat rugs, wall decor, and structural wall panels are
 * deliberately left unsplit.
 */
export function resolveWorldObjectLayerPolicy(
  object: Pick<MapObject, 'kind' | 'assetId' | 'scale'>,
): WorldObjectLayerPolicy {
  if (object.assetId === 'v3.interior.wall') {
    return {
      foregroundSplit: undefined,
      foregroundDepthOffset: 0,
      occlusion: {
        lateralRadius: 4.1 * object.scale,
        behindDepth: 5.5 * object.scale,
        baseAlpha: 0.34,
        foregroundAlpha: 0.34,
      },
    };
  }
  if (object.assetId === 'v3.interior.door') {
    return {
      foregroundSplit: 0.64,
      foregroundDepthOffset: 0.38,
      occlusion: {
        lateralRadius: 1.7 * object.scale,
        behindDepth: 3.2 * object.scale,
        baseAlpha: 0.46,
        foregroundAlpha: 0.34,
      },
    };
  }

  const interiorPolicy = INTERIOR_LAYER_POLICIES[object.assetId];
  if (interiorPolicy !== undefined) {
    return {
      foregroundSplit: interiorPolicy.split,
      foregroundDepthOffset: interiorPolicy.depthOffset,
      occlusion: undefined,
    };
  }

  if (object.assetId.startsWith('v3.interior.')) {
    return { foregroundSplit: undefined, foregroundDepthOffset: 0, occlusion: undefined };
  }

  if (object.assetId === 'cottage-amber') {
    return {
      foregroundSplit: 0.48,
      foregroundDepthOffset: 0.58,
      occlusion: {
        lateralRadius: 3 * object.scale,
        behindDepth: 4.6 * object.scale,
        baseAlpha: 0.62,
        foregroundAlpha: 0.34,
      },
    };
  }

  if (object.kind === 'tree') {
    return {
      foregroundSplit: 0.6,
      foregroundDepthOffset: 0.72,
      occlusion: {
        lateralRadius: 1.6 * object.scale,
        behindDepth: 2.7 * object.scale,
        baseAlpha: 0.58,
        foregroundAlpha: 0.34,
      },
    };
  }
  if (object.kind === 'building' || object.kind === 'shop') {
    return {
      foregroundSplit: 0.57,
      foregroundDepthOffset: 1.05,
      occlusion: {
        lateralRadius: 2.55 * object.scale,
        behindDepth: 3.4 * object.scale,
        baseAlpha: 0.7,
        foregroundAlpha: 0.46,
      },
    };
  }
  if (object.kind === 'furniture') {
    return { foregroundSplit: 0.54, foregroundDepthOffset: 0.4, occlusion: undefined };
  }
  if (object.kind === 'crafting_station' || object.kind === 'cooking_station') {
    return { foregroundSplit: 0.56, foregroundDepthOffset: 0.48, occlusion: undefined };
  }
  if (object.kind === 'home_entrance') {
    return {
      foregroundSplit: 0.64,
      foregroundDepthOffset: 0.38,
      occlusion: {
        lateralRadius: 1.7 * object.scale,
        behindDepth: 3.2 * object.scale,
        baseAlpha: 0.46,
        foregroundAlpha: 0.34,
      },
    };
  }
  return { foregroundSplit: undefined, foregroundDepthOffset: 0, occlusion: undefined };
}

function hasAuthoredRotation(
  resolved: ResolvedAsset,
  rotation: NonNullable<MapObject['rotation']>,
) {
  if (resolved.source === 'pinned_uploaded' || resolved.source === 'active_uploaded') {
    return resolved.render.defaultRotation === rotation;
  }
  return (
    resolved.bundled.defaultRotation === rotation ||
    resolved.bundled.variants.some((variant) => variant.rotation === rotation)
  );
}

/**
 * The current V3 interior wall has one authored isometric axis. A perpendicular
 * wall is the horizontal mirror of that raster in screen space; rotating the
 * bitmap by 90 degrees would break the isometric projection. Once an authored
 * directional variant exists, the resolver selects it and this fallback stays
 * inactive.
 */
function applyAssetSafeWorldOrientation(
  image: Phaser.GameObjects.Image,
  manifest: MapManifest,
  object: Readonly<{
    assetId: MapObject['assetId'];
    rotation: MapObject['rotation'] | undefined;
  }>,
  resolved: ResolvedAsset,
): void {
  const rotation = object.rotation;
  if (
    !usesProductionSliceObjectProfile(manifest) ||
    object.assetId !== 'v3.interior.wall' ||
    resolved.visualKey !== object.assetId ||
    (rotation !== 90 && rotation !== 270) ||
    hasAuthoredRotation(resolved, rotation)
  ) {
    return;
  }
  image.setFlipX(true);
}

function playerOccludesObject(
  object: Pick<RenderedWorldObject, 'world' | 'layerPolicy'>,
  player: Readonly<{ x: number; y: number }>,
): boolean {
  const policy = object.layerPolicy.occlusion;
  if (policy === undefined) return false;

  // Rotate logical coordinates into the isometric screen axes. A positive
  // depth distance means the player's foot anchor is geometrically behind the
  // object's foot anchor; lateral distance keeps unrelated nearby rows opaque.
  const lateralDistance =
    Math.abs(player.x - player.y - (object.world.x - object.world.y)) * Math.SQRT1_2;
  const behindDistance = (object.world.x + object.world.y - player.x - player.y) * Math.SQRT1_2;
  return (
    behindDistance >= 0 &&
    behindDistance <= policy.behindDepth &&
    lateralDistance <= policy.lateralRadius
  );
}

/**
 * Fades only tall layered objects that geometrically cover the local player's
 * foot anchor. Alpha is restored immediately after the player moves to the
 * front or leaves the object's lateral/depth footprint.
 */
export function updateWorldObjectOcclusion(
  objects: readonly RenderedWorldObject[],
  player: Readonly<{ x: number; y: number }>,
): WorldObjectOcclusionMetrics {
  let occludedObjects = 0;
  for (const object of objects) {
    const policy = object.layerPolicy.occlusion;
    if (policy === undefined) continue;
    const occluded = playerOccludesObject(object, player);
    object.container.setAlpha(occluded ? policy.baseAlpha : 1);
    object.foreground?.setAlpha(occluded ? policy.foregroundAlpha : 1);
    if (occluded) occludedObjects += 1;
  }
  return { occludedObjects };
}

export function updateWorldObjectCulling(
  objects: readonly RenderedWorldObject[],
  worldView: Readonly<{ x: number; y: number; width: number; height: number }>,
): WorldObjectCullingMetrics {
  const padding = 620;
  let visibleObjects = 0;
  for (const object of objects) {
    const visible =
      object.screen.x >= worldView.x - padding &&
      object.screen.x <= worldView.x + worldView.width + padding &&
      object.screen.y >= worldView.y - padding &&
      object.screen.y <= worldView.y + worldView.height + padding;
    object.container.setVisible(visible);
    object.foreground?.setVisible(visible);
    object.shadow?.setVisible(visible);
    if (visible) visibleObjects += 1;
  }
  return {
    visibleObjects,
    totalObjects: objects.length,
    culledObjects: objects.length - visibleObjects,
  };
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
  const productionSliceProfile = usesProductionSliceObjectProfile(manifest);

  return manifest.objects.map((object) => {
    const screen = projectWorld(object, projection);
    const layerPolicy = productionSliceProfile
      ? resolveWorldObjectLayerPolicy(object)
      : CANONICAL_WORLD_OBJECT_LAYER_POLICY;
    const delivery = deliveriesByKey.get(object.assetId);
    const resolved = resolvedVisual(
      scene,
      { assetId: object.assetId, rotation: object.rotation },
      delivery,
      resolutionContext,
    );
    let visual: Phaser.GameObjects.GameObject;
    let foregroundVisual: Phaser.GameObjects.Image | undefined;
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
      applyAssetSafeWorldOrientation(
        image,
        manifest,
        { assetId: object.assetId, rotation: object.rotation },
        resolved,
      );
      const split = layerPolicy.foregroundSplit;
      if (split !== undefined) {
        const width = resolved.render.renderWidth;
        const height = resolved.render.renderHeight;
        const splitY = Math.max(1, Math.round(height * split));
        image.setCrop(0, splitY, width, Math.max(1, height - splitY));
        foregroundVisual = scene.add.image(0, 0, resolvedWorldAssetTextureKey(resolved));
        foregroundVisual.setOrigin(placement.originX, placement.originY);
        foregroundVisual.setDisplaySize(
          resolved.render.renderWidth * resolved.render.scale,
          resolved.render.renderHeight * resolved.render.scale,
        );
        applyAssetSafeWorldOrientation(
          foregroundVisual,
          manifest,
          { assetId: object.assetId, rotation: object.rotation },
          resolved,
        );
        foregroundVisual.setCrop(0, 0, width, splitY);
      }
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

    const decalDepthBonus =
      productionSliceProfile && WALL_MOUNTED_DECAL_ASSET_IDS.has(object.assetId)
        ? WALL_MOUNTED_DECAL_DEPTH_BONUS
        : 0;
    const baseDepth = depthForFootPosition(object.x, object.y, object.id) + decalDepthBonus;
    const container = scene.add.container(screen.x, screen.y, [visual]);
    container.setScale(visualScale);
    container.setDepth(baseDepth + depthOffset);

    const foreground =
      foregroundVisual === undefined
        ? undefined
        : scene.add.container(screen.x, screen.y, [foregroundVisual]);
    if (foreground !== undefined) {
      const offset = layerPolicy.foregroundDepthOffset;
      foreground.setScale(visualScale);
      foreground.setDepth(
        depthForFootPosition(object.x + offset, object.y + offset, `${object.id}-foreground`) +
          depthOffset,
      );
    }

    if (options.shadows === false) {
      return {
        id: object.id,
        assetId: object.assetId,
        kind: object.kind,
        world: { x: object.x, y: object.y },
        scale: object.scale,
        container,
        screen,
        layerPolicy,
        ...(foreground === undefined ? {} : { foreground }),
      };
    }
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
    return {
      id: object.id,
      assetId: object.assetId,
      kind: object.kind,
      world: { x: object.x, y: object.y },
      scale: object.scale,
      container,
      shadow,
      screen,
      layerPolicy,
      ...(foreground === undefined ? {} : { foreground }),
    };
  });
}
