import { isPositionWalkable, PLAYER_FOOT_RADIUS } from './collision';
import type { MapManifest, MapObject } from './manifest';

export type WorldVisualQuality = 'low' | 'balanced' | 'high';

/**
 * User-facing renderer controls. Callers may provide a partial object and let
 * {@link resolveWorldVisualSettings} fill stable, quality-aware defaults.
 */
export interface WorldVisualSettings {
  readonly quality: WorldVisualQuality;
  readonly shadows: boolean;
  readonly ambientEffects: boolean;
  readonly animatedWater: boolean;
  readonly remoteLabels: boolean;
  readonly chatBubbles: boolean;
}

export type WorldVisualFindingSeverity = 'error' | 'warning' | 'recommendation';

export interface WorldVisualFinding {
  readonly code: string;
  readonly severity: WorldVisualFindingSeverity;
  readonly message: string;
  readonly objectIds?: readonly string[];
}

export interface WorldVisualReadinessAnalysis {
  readonly ready: boolean;
  readonly errors: readonly WorldVisualFinding[];
  readonly warnings: readonly WorldVisualFinding[];
  readonly recommendations: readonly WorldVisualFinding[];
}

/**
 * Manifest surface consumed by presentation-only diagnostics. Admin drafts do
 * not carry the runtime-only resolved `spawn` field, so visual policy must not
 * accidentally depend on it.
 */
export type WorldVisualManifest = Pick<
  MapManifest,
  | 'width'
  | 'height'
  | 'tileWidth'
  | 'tileHeight'
  | 'id'
  | 'projectionOrigin'
  | 'safeSaveBounds'
  | 'defaultSpawnId'
  | 'spawns'
  | 'terrain'
  | 'objects'
  | 'collisions'
  | 'interactions'
  | 'exits'
  | 'developmentArt'
>;

export interface WorldCameraFrameInput {
  readonly manifest: Pick<
    MapManifest,
    'width' | 'height' | 'tileWidth' | 'tileHeight' | 'projectionOrigin' | 'safeSaveBounds'
  >;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly reducedMotion?: boolean;
}

export interface WorldCameraFrame {
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly zoom: number;
  readonly deadzone: Readonly<{ width: number; height: number }>;
  readonly apronTiles: number;
}

export interface WorldObjectContactShadow {
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly offsetY: number;
  readonly softnessPx: number;
}

export interface WorldContactShadowLayer {
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly offsetY: number;
}

export interface WorldLabelDistanceThresholds {
  readonly fullOpacityDistance: number;
  readonly hiddenDistance: number;
}

const OBJECT_SCALE_BY_KIND: Readonly<Record<MapObject['kind'], number>> = {
  building: 1.1,
  tree: 0.58,
  rock: 0.54,
  fence: 0.72,
  lamp: 0.46,
  sign: 0.52,
  flowers: 0.38,
  bush: 0.38,
  farm_plot: 0.72,
  shop: 1,
  cooking_station: 0.58,
  crafting_station: 0.58,
  home_entrance: 0.9,
  furniture: 0.58,
};

const CONTACT_SHADOW_BY_KIND: Readonly<
  Record<
    MapObject['kind'],
    Readonly<{ width: number; height: number; alpha: number; offsetY: number }>
  >
> = {
  building: { width: 186, height: 34, alpha: 0.2, offsetY: 2 },
  tree: { width: 88, height: 24, alpha: 0.2, offsetY: 2 },
  rock: { width: 65, height: 18, alpha: 0.18, offsetY: 1 },
  fence: { width: 150, height: 18, alpha: 0.17, offsetY: 1 },
  lamp: { width: 42, height: 13, alpha: 0.18, offsetY: 1 },
  sign: { width: 58, height: 16, alpha: 0.18, offsetY: 1 },
  flowers: { width: 38, height: 10, alpha: 0.12, offsetY: 1 },
  bush: { width: 62, height: 17, alpha: 0.16, offsetY: 1 },
  farm_plot: { width: 126, height: 28, alpha: 0.14, offsetY: 1 },
  shop: { width: 205, height: 36, alpha: 0.21, offsetY: 2 },
  cooking_station: { width: 82, height: 22, alpha: 0.18, offsetY: 1 },
  crafting_station: { width: 96, height: 24, alpha: 0.18, offsetY: 1 },
  home_entrance: { width: 128, height: 27, alpha: 0.18, offsetY: 1 },
  furniture: { width: 72, height: 18, alpha: 0.15, offsetY: 1 },
};

/**
 * Renderer-owned presentation tokens. Gameplay coordinates, collision shapes,
 * interaction ranges, and persistence bounds intentionally do not appear here.
 */
export const STARVILLE_VISUAL_TOKENS = {
  version: 1,
  projection: {
    tileWidth: 96,
    tileHeight: 48,
    tileAspectRatio: 2,
    lightDirection: 'upper-left',
    shadowDirection: 'lower-right',
    objectBase: 'bottom-center',
  },
  referencePixels: {
    characterHeight: 112,
    doorHeight: 132,
    treeHeight: 184,
    lampHeight: 132,
    bushHeight: 72,
    benchWidth: 104,
    buildingHeight: 422,
    storefrontHeight: 416,
    furnitureHeight: 88,
  },
  outline: {
    color: 0x24362f,
    standardThickness: 2,
    maximumThickness: 3,
    distantAlpha: 0.72,
  },
  scale: {
    player: 1.12,
    playerReferenceSize: { width: 58, height: 98 },
    objects: OBJECT_SCALE_BY_KIND,
  },
  camera: {
    referenceWidth: 1_280,
    referenceHeight: 720,
    minimumZoom: 0.9,
    maximumZoom: 1.15,
    minimumApronTiles: 18,
    maximumApronTiles: 28,
  },
  depth: {
    terrain: -1_000_000_000,
    terrainDetails: -999_999_900,
    shadowOffset: 2,
    interactionMarker: 999_999_500,
    worldLabel: 2_000_000_000,
  },
  shadows: {
    color: 0x10221b,
    softnessPx: 10,
    layers: [
      { softnessMultiplier: 1, alphaMultiplier: 0.18 },
      { softnessMultiplier: 0.5, alphaMultiplier: 0.3 },
      { softnessMultiplier: 0, alphaMultiplier: 0.52 },
    ],
    direction: { x: 0.45, y: 1 },
    maximumAlpha: 0.24,
    player: {
      idle: { width: 43, height: 15, alpha: 0.2, offsetY: 0 },
      moving: { width: 39, height: 13, alpha: 0.22, offsetY: 0 },
    },
    objects: CONTACT_SHADOW_BY_KIND,
  },
  color: {
    minimumSaturation: 0.28,
    maximumSaturation: 0.72,
    minimumSubjectContrast: 2.4,
    maximumTerrainContrast: 1.45,
  },
  labels: {
    fullOpacityDistance: 7.5,
    hiddenDistance: 11,
    lowQualityDistanceMultiplier: 0.72,
    playerOffsetY: 112,
  },
  chatBubbles: {
    lifetimeMs: 7_000,
    maximumVisible: 6,
    maximumCharacters: 180,
    fullOpacityDistance: 6.5,
    hiddenDistance: 10,
    offsetY: 137,
  },
  terrain: {
    seamCropX: 3,
    seamCropY: 2,
    maximumAmbientMotes: 18,
    variationPatchTiles: 3,
    surfaceDetailsPerHundredTiles: 9,
    maximumImageNodesPerPlayableTile: 1,
    boundaryTuftsPerHundredEdgeTiles: 24,
  },
  performance: {
    maximumWorldAssetDimension: 2_048,
    maximumAnimationFrames: 16,
    maximumAnimationFramePixels: 512 * 512,
  },
  paths: {
    edgeAlpha: 0.34,
    minimumDetailSpacingTiles: 3,
    maximumDetailDensity: 0.16,
  },
  water: {
    shallowColor: 0x79b9b2,
    deepColor: 0x3f7f7b,
    shorelineColor: 0xc8d7aa,
    shorelineAlpha: 0.48,
    rippleAlpha: 0.3,
    maximumRippleGroups: 20,
  },
  ui: {
    spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24 },
    worldLabelPadding: { x: 8, y: 4 },
    safeEdgeInset: 16,
  },
  timeOfDay: {
    dawn: { ambientTint: 0xffd7bc, ambientAlpha: 0.12, lanternAlpha: 0.24 },
    day: { ambientTint: 0xffffff, ambientAlpha: 0, lanternAlpha: 0.08 },
    dusk: { ambientTint: 0x9f91be, ambientAlpha: 0.16, lanternAlpha: 0.48 },
    night: { ambientTint: 0x486286, ambientAlpha: 0.25, lanternAlpha: 0.72 },
  },
} as const;

const DEFAULT_VISUAL_SETTINGS: WorldVisualSettings = {
  quality: 'balanced',
  shadows: true,
  ambientEffects: true,
  animatedWater: true,
  remoteLabels: true,
  chatBubbles: true,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function resolveWorldVisualSettings(
  input: Partial<WorldVisualSettings> = {},
): WorldVisualSettings {
  const quality = input.quality ?? DEFAULT_VISUAL_SETTINGS.quality;
  const qualityDefaults =
    quality === 'low'
      ? { ambientEffects: false, animatedWater: false }
      : { ambientEffects: true, animatedWater: true };
  return {
    quality,
    shadows: quality === 'low' ? false : (input.shadows ?? DEFAULT_VISUAL_SETTINGS.shadows),
    ambientEffects:
      quality === 'low' ? false : (input.ambientEffects ?? qualityDefaults.ambientEffects),
    animatedWater:
      quality === 'low' ? false : (input.animatedWater ?? qualityDefaults.animatedWater),
    remoteLabels: input.remoteLabels ?? DEFAULT_VISUAL_SETTINGS.remoteLabels,
    chatBubbles: input.chatBubbles ?? DEFAULT_VISUAL_SETTINGS.chatBubbles,
  };
}

export function resolveWorldObjectVisualScale(kind: MapObject['kind'], authoredScale = 1): number {
  const safeAuthoredScale = Number.isFinite(authoredScale) ? clamp(authoredScale, 0.1, 4) : 1;
  return OBJECT_SCALE_BY_KIND[kind] * safeAuthoredScale;
}

export function resolveWorldObjectContactShadow(
  kind: MapObject['kind'],
  authoredScale = 1,
): WorldObjectContactShadow {
  const spec = CONTACT_SHADOW_BY_KIND[kind];
  const safeAuthoredScale = Number.isFinite(authoredScale) ? clamp(authoredScale, 0.1, 4) : 1;
  return {
    width: spec.width * safeAuthoredScale,
    height: spec.height * safeAuthoredScale,
    alpha: spec.alpha,
    offsetY: spec.offsetY,
    softnessPx: STARVILLE_VISUAL_TOKENS.shadows.softnessPx * safeAuthoredScale,
  };
}

export function resolveWorldPlayerContactShadow(moving = false): WorldObjectContactShadow {
  const spec = moving
    ? STARVILLE_VISUAL_TOKENS.shadows.player.moving
    : STARVILLE_VISUAL_TOKENS.shadows.player.idle;
  return {
    ...spec,
    softnessPx: STARVILLE_VISUAL_TOKENS.shadows.softnessPx,
  };
}

/**
 * Resolves a soft contact shadow into three bounded translucent ellipses. The
 * layers keep softness deterministic in Phaser and SVG without a GPU blur or
 * a DOM filter, and their alpha multipliers sum to the authored shadow alpha.
 */
export function resolveWorldContactShadowLayers(
  shadow: WorldObjectContactShadow,
): readonly WorldContactShadowLayer[] {
  return STARVILLE_VISUAL_TOKENS.shadows.layers.map(({ softnessMultiplier, alphaMultiplier }) => ({
    width: shadow.width + shadow.softnessPx * 2 * softnessMultiplier,
    height: shadow.height + shadow.softnessPx * softnessMultiplier,
    alpha: Math.min(shadow.alpha * alphaMultiplier, STARVILLE_VISUAL_TOKENS.shadows.maximumAlpha),
    offsetY: shadow.offsetY,
  }));
}

export function resolveWorldLabelDistanceThresholds(
  quality: WorldVisualQuality,
): WorldLabelDistanceThresholds {
  const multiplier =
    quality === 'low' ? STARVILLE_VISUAL_TOKENS.labels.lowQualityDistanceMultiplier : 1;
  return {
    fullOpacityDistance: STARVILLE_VISUAL_TOKENS.labels.fullOpacityDistance * multiplier,
    hiddenDistance: STARVILLE_VISUAL_TOKENS.labels.hiddenDistance * multiplier,
  };
}

/**
 * Returns a resize-safe camera frame backed by a projected terrain apron. The
 * apron is presentation-only and never expands walkable or saveable space.
 */
export function computeWorldCameraFrame(input: WorldCameraFrameInput): WorldCameraFrame {
  const { manifest } = input;
  const viewportWidth = Math.max(
    Number.isFinite(input.viewportWidth) ? input.viewportWidth : 0,
    320,
  );
  const viewportHeight = Math.max(
    Number.isFinite(input.viewportHeight) ? input.viewportHeight : 0,
    240,
  );
  const dynamicApron = Math.ceil(
    Math.max(viewportWidth / manifest.tileWidth, viewportHeight / manifest.tileHeight) / 2 + 2,
  );
  const apronTiles = clamp(
    dynamicApron,
    STARVILLE_VISUAL_TOKENS.camera.minimumApronTiles,
    STARVILLE_VISUAL_TOKENS.camera.maximumApronTiles,
  );
  const halfTileWidth = manifest.tileWidth / 2;
  const halfTileHeight = manifest.tileHeight / 2;
  const minimumX = manifest.projectionOrigin.x - (manifest.height + apronTiles * 2) * halfTileWidth;
  const maximumX = manifest.projectionOrigin.x + (manifest.width + apronTiles * 2) * halfTileWidth;
  const minimumY = manifest.projectionOrigin.y - apronTiles * manifest.tileHeight;
  const maximumY =
    manifest.projectionOrigin.y +
    (manifest.width + manifest.height + apronTiles * 2) * halfTileHeight;
  const referenceArea =
    STARVILLE_VISUAL_TOKENS.camera.referenceWidth * STARVILLE_VISUAL_TOKENS.camera.referenceHeight;
  const viewportArea = viewportWidth * viewportHeight;
  const zoom = clamp(
    Math.sqrt(viewportArea / referenceArea),
    STARVILLE_VISUAL_TOKENS.camera.minimumZoom,
    STARVILLE_VISUAL_TOKENS.camera.maximumZoom,
  );

  return {
    bounds: {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX,
      height: maximumY - minimumY,
    },
    zoom,
    deadzone: input.reducedMotion
      ? { width: 0, height: 0 }
      : {
          width: clamp(viewportWidth * 0.055, 48, 80),
          height: clamp(viewportHeight * 0.055, 34, 52),
        },
    apronTiles,
  };
}

function finding(
  severity: WorldVisualFindingSeverity,
  code: string,
  message: string,
  objectIds?: readonly string[],
): WorldVisualFinding {
  return {
    code,
    severity,
    message,
    ...(objectIds === undefined ? {} : { objectIds }),
  };
}

function hasNearbyBlockingCollision(
  manifest: Pick<WorldVisualManifest, 'collisions'>,
  object: Pick<MapObject, 'id' | 'kind' | 'x' | 'y'>,
): boolean {
  return manifest.collisions.some((collision) => {
    if (!collision.blocking) return false;
    if (collision.shape === 'circle') {
      return Math.hypot(collision.x - object.x, collision.y - object.y) <= collision.radius + 0.8;
    }
    if (collision.shape === 'capsule') {
      const centerX = (collision.startX + collision.endX) / 2;
      const centerY = (collision.startY + collision.endY) / 2;
      const halfLength =
        Math.hypot(collision.endX - collision.startX, collision.endY - collision.startY) / 2;
      return (
        Math.hypot(centerX - object.x, centerY - object.y) <= halfLength + collision.radius + 0.8
      );
    }
    const nearestX = clamp(object.x, collision.x, collision.x + collision.width);
    const nearestY = clamp(object.y, collision.y, collision.y + collision.height);
    return Math.hypot(nearestX - object.x, nearestY - object.y) <= 0.8;
  });
}

function findUncoveredTerrainTiles(
  manifest: Pick<WorldVisualManifest, 'width' | 'height' | 'terrain'>,
  limit: number,
): readonly string[] {
  const width = Math.max(0, Math.trunc(manifest.width));
  const height = Math.max(0, Math.trunc(manifest.height));
  if (width === 0 || height === 0) return [];

  // A clipped 2D difference grid keeps coverage analysis bounded to terrain
  // areas plus map tiles, even when many large terrain rectangles overlap.
  const stride = width + 1;
  const coverage = new Int32Array((height + 1) * stride);
  for (const area of manifest.terrain) {
    const startX = clamp(Math.ceil(area.x), 0, width);
    const startY = clamp(Math.ceil(area.y), 0, height);
    const endX = clamp(Math.ceil(area.x + area.width), 0, width);
    const endY = clamp(Math.ceil(area.y + area.height), 0, height);
    if (startX >= endX || startY >= endY) continue;
    const topLeft = startY * stride + startX;
    const topRight = startY * stride + endX;
    const bottomLeft = endY * stride + startX;
    const bottomRight = endY * stride + endX;
    coverage[topLeft] = coverage[topLeft]! + 1;
    coverage[topRight] = coverage[topRight]! - 1;
    coverage[bottomLeft] = coverage[bottomLeft]! - 1;
    coverage[bottomRight] = coverage[bottomRight]! + 1;
  }

  const uncovered: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * stride + x;
      const left = x === 0 ? 0 : coverage[index - 1]!;
      const above = y === 0 ? 0 : coverage[index - stride]!;
      const diagonal = x === 0 || y === 0 ? 0 : coverage[index - stride - 1]!;
      coverage[index] = coverage[index]! + left + above - diagonal;
      if (coverage[index] <= 0 && uncovered.length < limit) {
        uncovered.push(`${String(x)},${String(y)}`);
      }
    }
  }
  return uncovered;
}

/** Pure, deterministic visual QA suitable for both Composer and runtime checks. */
export function analyzeWorldVisualReadiness(
  manifest: WorldVisualManifest,
): WorldVisualReadinessAnalysis {
  const errors: WorldVisualFinding[] = [];
  const warnings: WorldVisualFinding[] = [];
  const recommendations: WorldVisualFinding[] = [];
  const ratio = manifest.tileWidth / manifest.tileHeight;
  if (Math.abs(ratio - STARVILLE_VISUAL_TOKENS.projection.tileAspectRatio) > 0.18) {
    errors.push(
      finding(
        'error',
        'projection-aspect-ratio',
        'Isometric tiles should use an approximately 2:1 width-to-height ratio.',
      ),
    );
  }
  if (
    manifest.tileWidth !== STARVILLE_VISUAL_TOKENS.projection.tileWidth ||
    manifest.tileHeight !== STARVILLE_VISUAL_TOKENS.projection.tileHeight
  ) {
    errors.push(
      finding(
        'error',
        'projection-tile-geometry',
        `World terrain must use the canonical ${String(STARVILLE_VISUAL_TOKENS.projection.tileWidth)} by ${String(STARVILLE_VISUAL_TOKENS.projection.tileHeight)} isometric tile geometry.`,
      ),
    );
  }

  const uncoveredTerrainTiles = findUncoveredTerrainTiles(manifest, 12);
  if (uncoveredTerrainTiles.length > 0) {
    errors.push(
      finding(
        'error',
        'terrain-coverage-gap',
        `Playable tiles are missing terrain coverage near ${uncoveredTerrainTiles.join('; ')}.`,
      ),
    );
  }

  const objectDensity = manifest.objects.length / (manifest.width * manifest.height);
  if (objectDensity < 0.04) {
    warnings.push(
      finding(
        'warning',
        'sparse-composition',
        'The map has large undecorated areas; add restrained object clusters and landmarks.',
      ),
    );
  }

  const assetUsage = new Map<string, { count: number; objectIds: string[] }>();
  for (const object of manifest.objects) {
    const usage = assetUsage.get(object.assetId) ?? { count: 0, objectIds: [] };
    usage.count += 1;
    usage.objectIds.push(object.id);
    assetUsage.set(object.assetId, usage);
  }
  let dominantAsset: { assetId: string; count: number; objectIds: readonly string[] } | undefined;
  for (const [assetId, usage] of assetUsage) {
    if (
      dominantAsset === undefined ||
      usage.count > dominantAsset.count ||
      (usage.count === dominantAsset.count && assetId.localeCompare(dominantAsset.assetId) < 0)
    ) {
      dominantAsset = { assetId, count: usage.count, objectIds: usage.objectIds };
    }
  }
  if (
    manifest.objects.length >= 12 &&
    dominantAsset !== undefined &&
    dominantAsset.count >= 5 &&
    dominantAsset.count / manifest.objects.length > 0.34
  ) {
    warnings.push(
      finding(
        'warning',
        'excessive-asset-repetition',
        `Asset '${dominantAsset.assetId}' dominates the composition; break it into restrained clusters or authored variants.`,
        dominantAsset.objectIds,
      ),
    );
  }

  const collisionExpectedKinds = new Set<MapObject['kind']>([
    'building',
    'tree',
    'rock',
    'lamp',
    'sign',
    'shop',
    'cooking_station',
    'crafting_station',
    'home_entrance',
  ]);
  const unsupportedObjects = manifest.objects
    .filter(
      (object) =>
        collisionExpectedKinds.has(object.kind) && !hasNearbyBlockingCollision(manifest, object),
    )
    .map(({ id }) => id);
  if (unsupportedObjects.length > 0) {
    warnings.push(
      finding(
        'warning',
        'visual-collision-mismatch',
        'Substantial world objects should have a nearby blocking collision footprint.',
        unsupportedObjects,
      ),
    );
  }

  const extremeScaleObjects = manifest.objects
    .filter(({ scale }) => scale < 0.5 || scale > 1.6)
    .map(({ id }) => id);
  if (extremeScaleObjects.length > 0) {
    warnings.push(
      finding(
        'warning',
        'extreme-authored-scale',
        'Authored object scales outside the shared presentation range need visual review.',
        extremeScaleObjects,
      ),
    );
  }

  const unsafeRouteAnchors = [
    ...manifest.spawns
      .filter(({ enabled }) => enabled)
      .map((spawn) => ({ id: `spawn:${spawn.id}`, point: spawn })),
    ...manifest.interactions.map((interaction) => ({
      id: `interaction:${interaction.id}`,
      point: interaction,
    })),
  ]
    .filter(
      ({ point }) =>
        !isPositionWalkable(
          point,
          PLAYER_FOOT_RADIUS,
          manifest.safeSaveBounds,
          manifest.collisions,
        ),
    )
    .map(({ id }) => id);
  if (unsafeRouteAnchors.length > 0) {
    warnings.push(
      finding(
        'warning',
        'onboarding-route-anchor-blocked',
        `Enabled spawn or interaction anchors are not safely walkable: ${unsafeRouteAnchors.join(', ')}.`,
      ),
    );
  }

  const pathLikeTerrain = manifest.terrain.filter(
    ({ terrain }) => terrain === 'path' || terrain === 'plaza' || terrain === 'bridge',
  );
  const exitsWithoutVisualRoute = manifest.exits
    .filter(({ enabled }) => enabled)
    .filter(({ trigger }) => {
      const point = { x: trigger.x + trigger.width / 2, y: trigger.y + trigger.height / 2 };
      return !pathLikeTerrain.some(
        (area) =>
          point.x >= area.x &&
          point.y >= area.y &&
          point.x <= area.x + area.width &&
          point.y <= area.y + area.height,
      );
    })
    .map(({ id }) => id);
  if (exitsWithoutVisualRoute.length > 0) {
    warnings.push(
      finding(
        'warning',
        'exit-route-clarity',
        `Enabled exits need a connected path, plaza, or bridge treatment: ${exitsWithoutVisualRoute.join(', ')}.`,
      ),
    );
  }

  const hasWater = manifest.terrain.some(({ terrain }) => terrain === 'water');
  const hasBridge = manifest.terrain.some(({ terrain }) => terrain === 'bridge');
  if (hasWater && !hasBridge) {
    recommendations.push(
      finding(
        'recommendation',
        'water-edge-structure',
        'Water is present without a bridge area; verify shoreline continuity and route legibility.',
      ),
    );
  }

  const edgeBandX = Math.max(2.5, manifest.width * 0.14);
  const edgeBandY = Math.max(2.5, manifest.height * 0.14);
  const boundaryObjects = manifest.objects.filter(
    ({ x, y }) =>
      x <= edgeBandX ||
      x >= manifest.width - edgeBandX ||
      y <= edgeBandY ||
      y >= manifest.height - edgeBandY,
  );
  if (boundaryObjects.length < 4) {
    recommendations.push(
      finding(
        'recommendation',
        'boundary-coverage',
        'Add natural boundary clusters away from enabled exits so playable edges feel intentional.',
      ),
    );
  }

  if (manifest.id === 'lantern-square') {
    const center = { x: manifest.width / 2, y: manifest.height / 2 };
    const centralLantern = manifest.objects.some(
      ({ kind, x, y }) => kind === 'lamp' && Math.hypot(x - center.x, y - center.y) <= 2.5,
    );
    const primaryKinds = new Set(
      manifest.objects
        .filter(({ kind }) => kind === 'shop' || kind === 'home_entrance')
        .map(({ kind }) => kind),
    );
    if (!centralLantern || primaryKinds.size < 2) {
      warnings.push(
        finding(
          'warning',
          'landmark-hierarchy',
          'Lantern Square needs a central lantern plus distinct General Store and home-entry landmarks.',
        ),
      );
    }
    const secondaryKinds = new Set(
      manifest.objects
        .filter(
          ({ kind }) =>
            kind === 'cooking_station' || kind === 'crafting_station' || kind === 'furniture',
        )
        .map(({ kind }) => kind),
    );
    if (secondaryKinds.size < 3) {
      recommendations.push(
        finding(
          'recommendation',
          'social-landmark-coverage',
          'Add readable cooking, crafting, and social-seating clusters around the primary square.',
        ),
      );
    }
  }

  const decorativeKinds = new Set(
    manifest.objects
      .filter(
        ({ kind }) =>
          kind === 'flowers' || kind === 'bush' || kind === 'rock' || kind === 'furniture',
      )
      .map(({ kind }) => kind),
  );
  if (decorativeKinds.size < 2) {
    recommendations.push(
      finding(
        'recommendation',
        'decorative-variety',
        'Use at least two restrained decorative object families to soften empty terrain.',
      ),
    );
  }
  if (manifest.developmentArt.temporary) {
    recommendations.push(
      finding(
        'recommendation',
        'temporary-development-art',
        'Replace temporary development artwork before final visual sign-off.',
      ),
    );
  }

  return { ready: errors.length === 0 && warnings.length === 0, errors, warnings, recommendations };
}
