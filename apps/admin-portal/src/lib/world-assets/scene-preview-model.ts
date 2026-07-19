import type { AssetType } from '@starville/asset-management';
import {
  depthForFootPosition,
  depthOffsetForAnchors,
  mapManifestSchema,
  type CollisionShape,
  type Point,
} from '@starville/game-core';
import { z } from 'zod';

import type { AssetDraftConfiguration, WorldAssetVersion } from './contracts';
import {
  worldMapSchema,
  worldVersionSummarySchema,
  type AdminWorldManifest,
  type WorldDirectory,
} from '../worlds/contracts';

export const assetSceneWorldSourceSchema = z.enum(['published', 'draft']);
export type AssetSceneWorldSource = z.infer<typeof assetSceneWorldSourceSchema>;

export interface AssetSceneWorldOption {
  readonly mapId: string;
  readonly versionId: string;
  readonly displayName: string;
  readonly slug: string;
  readonly source: AssetSceneWorldSource;
  readonly recordVersion: number;
  readonly versionNumber: number | null;
  readonly validationStatus: 'pending' | 'valid' | 'invalid' | null;
}

export interface AssetSceneWorldDirectory {
  readonly status: 'loaded' | 'denied' | 'unavailable';
  readonly items: readonly AssetSceneWorldOption[];
  readonly message: string;
}

export function sceneWorldOptionsFromDirectory(
  directory: WorldDirectory,
  canPreviewDrafts: boolean,
): AssetSceneWorldOption[] {
  const items: AssetSceneWorldOption[] = [];
  for (const map of directory.items) {
    if (map.activePublishedVersionId !== null && map.activeVersionNumber !== null) {
      items.push({
        mapId: map.id,
        versionId: map.activePublishedVersionId,
        displayName: map.displayName,
        slug: map.slug,
        source: 'published',
        recordVersion: map.recordVersion,
        versionNumber: map.activeVersionNumber,
        validationStatus: 'valid',
      });
    }
    if (canPreviewDrafts && map.draftVersionId !== null && map.draftValidationStatus === 'valid') {
      items.push({
        mapId: map.id,
        versionId: map.draftVersionId,
        displayName: map.displayName,
        slug: map.slug,
        source: 'draft',
        recordVersion: map.recordVersion,
        versionNumber: null,
        validationStatus: map.draftValidationStatus,
      });
    }
  }
  items.sort((left, right) => {
    const leftLantern = left.slug === 'lantern-square' ? 0 : 1;
    const rightLantern = right.slug === 'lantern-square' ? 0 : 1;
    const leftSource = left.source === 'draft' ? 0 : 1;
    const rightSource = right.source === 'draft' ? 0 : 1;
    return (
      leftLantern - rightLantern ||
      leftSource - rightSource ||
      left.displayName.localeCompare(right.displayName)
    );
  });
  return items;
}

export const assetSceneWorldContextSchema = z
  .object({
    status: z.literal('loaded'),
    source: assetSceneWorldSourceSchema,
    readOnly: z.literal(true),
    map: worldMapSchema,
    version: worldVersionSummarySchema,
    manifest: mapManifestSchema,
  })
  .strict();

export type AssetSceneWorldContext = z.infer<typeof assetSceneWorldContextSchema>;
type MapObject = AdminWorldManifest['objects'][number];
type MapObjectKind = MapObject['kind'];

export interface AssetSceneRenderOverride {
  readonly targetObjectId: string;
  readonly assetId: string;
  readonly assetKey: string;
  readonly friendlyName: string;
  readonly version: WorldAssetVersion;
  readonly configuration: AssetDraftConfiguration;
  readonly mediaUrl: string | null;
  readonly presentation: 'active' | 'candidate';
}

const COMPATIBLE_KINDS: Readonly<Partial<Record<AssetType, readonly MapObjectKind[]>>> = {
  building: ['building'],
  shop: ['shop'],
  cooking_station: ['cooking_station'],
  crafting_station: ['crafting_station'],
  home_entrance: ['home_entrance'],
  furniture: ['furniture'],
  decoration: ['flowers', 'bush'],
  tree: ['tree'],
  rock: ['rock'],
  fence: ['fence'],
  lamp: ['lamp'],
  sign: ['sign'],
  farm_plot: ['farm_plot'],
} as const;

export function compatibleSceneTargets(
  manifest: AdminWorldManifest,
  assetType: AssetType,
  assetKey: string,
): readonly MapObject[] {
  const compatible = new Set(COMPATIBLE_KINDS[assetType] ?? []);
  return manifest.objects
    .filter((object) => compatible.has(object.kind))
    .sort((left, right) => {
      const leftExact = left.assetId === assetKey ? 0 : 1;
      const rightExact = right.assetId === assetKey ? 0 : 1;
      return leftExact - rightExact || left.id.localeCompare(right.id);
    });
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createSceneTestPad(
  manifest: AdminWorldManifest,
  assetType: AssetType,
  assetKey: string,
): Readonly<{ manifest: AdminWorldManifest; target: MapObject }> | null {
  const kind = COMPATIBLE_KINDS[assetType]?.[0];
  if (kind === undefined) return null;
  const spawn = manifest.spawns.find(({ id }) => id === manifest.defaultSpawnId);
  const point = spawn ?? { x: manifest.width / 2, y: manifest.height / 2 };
  const target: MapObject = {
    id: 'asset-preview-test-pad',
    assetId: assetKey,
    kind,
    x: bounded(point.x + 1.5, manifest.safeSaveBounds.minX, manifest.safeSaveBounds.maxX),
    y: bounded(point.y - 1.5, manifest.safeSaveBounds.minY, manifest.safeSaveBounds.maxY),
    scale: 1,
  };
  return {
    manifest: {
      ...manifest,
      assets: manifest.assets.includes(assetKey) ? manifest.assets : [...manifest.assets, assetKey],
      objects: [...manifest.objects, target],
    },
    target,
  };
}

function belongsToTarget(collision: CollisionShape, target: MapObject): boolean {
  return collision.id === `${target.id}-base` || collision.id.startsWith(`${target.id}-`);
}

export function candidateCollisionAtTarget(
  configuration: AssetDraftConfiguration,
  target: MapObject,
): CollisionShape | null {
  const collision = configuration.collision;
  if (collision.shape === 'none') return null;
  if (collision.shape === 'rectangle') {
    return {
      id: 'asset-preview-candidate-collision',
      shape: 'rectangle',
      x: target.x + collision.offsetX - collision.width / 2,
      y: target.y + collision.offsetY - collision.height / 2,
      width: collision.width,
      height: collision.height,
      blocking: collision.blocking,
    };
  }
  return {
    id: 'asset-preview-candidate-collision',
    shape: 'capsule',
    startX: target.x + collision.startX,
    startY: target.y + collision.startY,
    endX: target.x + collision.endX,
    endY: target.y + collision.endY,
    radius: collision.radius,
    blocking: collision.blocking,
  };
}

/** Returns a new simulation-only collision set; the source manifest is never edited. */
export function scenePreviewCollisions(
  manifest: AdminWorldManifest,
  target: MapObject,
  configuration: AssetDraftConfiguration,
): CollisionShape[] {
  const retained = manifest.collisions.filter((collision) => !belongsToTarget(collision, target));
  const candidate = candidateCollisionAtTarget(configuration, target);
  return candidate === null ? retained : [...retained, candidate];
}

function pointNear(target: MapObject, delta: Point, manifest: AdminWorldManifest): Point {
  return {
    x: bounded(target.x + delta.x, manifest.safeSaveBounds.minX, manifest.safeSaveBounds.maxX),
    y: bounded(target.y + delta.y, manifest.safeSaveBounds.minY, manifest.safeSaveBounds.maxY),
  };
}

export function referencePlayerPositions(
  manifest: AdminWorldManifest,
  target: MapObject,
): Readonly<Record<'front' | 'behind' | 'beside', Point>> {
  return {
    front: pointNear(target, { x: 0.9, y: 0.9 }, manifest),
    behind: pointNear(target, { x: -0.9, y: -0.9 }, manifest),
    beside: pointNear(target, { x: 0.95, y: -0.95 }, manifest),
  };
}

export function referenceWalkPath(
  manifest: AdminWorldManifest,
  target: MapObject,
  assetType: AssetType,
): readonly Point[] {
  const offsets =
    assetType === 'building' || assetType === 'shop' || assetType === 'home_entrance'
      ? [
          { x: 1.4, y: 1.4 },
          { x: 0.45, y: 0.45 },
          { x: 1.4, y: -1.4 },
          { x: -1.4, y: -1.4 },
          { x: -1.4, y: 1.4 },
          { x: 1.4, y: 1.4 },
        ]
      : [
          { x: 1.2, y: 1.2 },
          { x: 1.2, y: -1.2 },
          { x: -1.2, y: -1.2 },
          { x: -1.2, y: 1.2 },
          { x: 1.2, y: 1.2 },
        ];
  return offsets.map((offset) => pointNear(target, offset, manifest));
}

export function previewDepthRelationship(input: {
  readonly target: MapObject;
  readonly player: Point;
  readonly configuration: AssetDraftConfiguration;
}): 'front' | 'behind' {
  const assetDepth =
    depthForFootPosition(input.target.x, input.target.y, input.target.id) +
    depthOffsetForAnchors(
      input.configuration.render.footAnchor.y,
      input.configuration.render.depthAnchor.y,
    );
  const playerDepth = depthForFootPosition(input.player.x, input.player.y, 'reference-player');
  return playerDepth >= assetDepth ? 'front' : 'behind';
}

export function previewScaleGuidance(
  configuration: AssetDraftConfiguration,
): 'Looks small' | 'Looks balanced' | 'Looks large' {
  const normalizedHeight = configuration.render.renderHeight * configuration.render.scale;
  if (normalizedHeight < 120) return 'Looks small';
  if (normalizedHeight > 440) return 'Looks large';
  return 'Looks balanced';
}

export function nearbySceneObjects(
  manifest: AdminWorldManifest,
  target: MapObject,
  maximum = 12,
): readonly MapObject[] {
  return manifest.objects
    .filter(({ id }) => id !== target.id)
    .map((object) => ({ object, distance: Math.hypot(object.x - target.x, object.y - target.y) }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.object.id.localeCompare(right.object.id),
    )
    .slice(0, maximum)
    .map(({ object }) => object);
}

export function visualReviewChecklist(assetType: AssetType): readonly string[] {
  if (assetType === 'tree') {
    return [
      'Style matches nearby assets',
      'Transparency looks clean',
      'Tree is grounded',
      'Scale looks intentional',
      'Trunk collision looks correct',
      'Branches do not block movement',
      'Player renders correctly in front',
      'Player renders correctly behind',
      'Mobile silhouette remains readable',
    ];
  }
  if (assetType === 'building' || assetType === 'shop' || assetType === 'home_entrance') {
    return [
      'Style matches nearby assets',
      'Door scale fits the player',
      'Building footprint looks grounded',
      'Collision matches the footprint',
      'Doorway remains accessible',
      'Roof overhang behaves visually',
      'Player depth looks correct',
      'Nearby props do not overlap badly',
      'Mobile silhouette remains readable',
    ];
  }
  return [
    'Style matches nearby assets',
    'Transparency looks clean',
    'Asset is grounded',
    'Scale looks intentional',
    'Collision looks appropriate',
    'Player depth looks correct',
    'Mobile silhouette remains readable',
  ];
}

export function scenePreviewNextAction(version: WorldAssetVersion): Readonly<{
  label: string;
  explanation: string;
}> {
  if (['draft', 'validated', 'changes_requested', 'rejected'].includes(version.lifecycleStatus)) {
    return {
      label: 'Create successor draft',
      explanation: 'The current immutable candidate remains unchanged.',
    };
  }
  if (version.lifecycleStatus === 'in_review') {
    return {
      label: 'Return to review workflow',
      explanation: 'Visual preview does not approve or reject this candidate.',
    };
  }
  if (version.lifecycleStatus === 'approved') {
    return {
      label: 'Review activation requirements',
      explanation: 'Approval alone does not change the active version.',
    };
  }
  if (version.lifecycleStatus === 'active') {
    return {
      label: 'Open world draft placement',
      explanation: 'Draft editing is a separate authorized workflow.',
    };
  }
  return {
    label: 'Return to Technical Preview',
    explanation: 'This lifecycle does not offer a direct scene-preview action.',
  };
}

export function sceneWorldContextPath(option: AssetSceneWorldOption): string {
  const parameters = new URLSearchParams({ source: option.source });
  return `/api/world-assets/scene-preview/worlds/${encodeURIComponent(option.mapId)}/versions/${encodeURIComponent(option.versionId)}?${parameters.toString()}`;
}
