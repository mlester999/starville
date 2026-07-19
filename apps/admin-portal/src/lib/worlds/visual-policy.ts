import {
  STARVILLE_VISUAL_TOKENS,
  analyzeWorldVisualReadiness,
  computeWorldCameraFrame,
  resolveWorldContactShadowLayers,
  resolveWorldObjectContactShadow,
  resolveWorldObjectVisualScale,
  resolveWorldPlayerContactShadow,
  type WorldCameraFrame,
  type WorldVisualFinding,
  type WorldVisualFindingSeverity,
  type MapManifest,
} from '@starville/game-core';

import type { AdminWorldManifest } from './contracts';

export interface AdminWorldVisualFinding extends WorldVisualFinding {
  readonly path: string | null;
}

export interface AdminWorldVisualReadiness {
  /** Shared policy readiness only. It never changes trusted map validation or publication state. */
  readonly ready: boolean;
  readonly findings: readonly AdminWorldVisualFinding[];
  readonly counts: Readonly<Record<WorldVisualFindingSeverity, number>>;
}

function findingPath(manifest: AdminWorldManifest, finding: WorldVisualFinding): string | null {
  const objectId = finding.objectIds?.[0];
  if (objectId === undefined) return null;
  const objectIndex = manifest.objects.findIndex(({ id }) => id === objectId);
  return objectIndex < 0 ? null : `objects[${String(objectIndex)}]`;
}

function runtimeManifest(manifest: AdminWorldManifest): MapManifest {
  const selectedSpawn =
    manifest.spawns.find(({ id }) => id === manifest.defaultSpawnId) ?? manifest.spawns[0];
  return {
    ...manifest,
    spawn:
      selectedSpawn === undefined ? { x: 0, y: 0 } : { x: selectedSpawn.x, y: selectedSpawn.y },
  };
}

/**
 * Thin Admin adapter over the shared renderer policy. Findings are deliberately advisory in the
 * Composer: they do not alter the manifest, trusted validation, Draft Preview, or publication.
 */
export function analyzeAdminWorldVisualReadiness(
  manifest: AdminWorldManifest,
): AdminWorldVisualReadiness {
  const analysis = analyzeWorldVisualReadiness(runtimeManifest(manifest));
  const findings = [...analysis.errors, ...analysis.warnings, ...analysis.recommendations].map(
    (finding) => ({ ...finding, path: findingPath(manifest, finding) }),
  );
  return {
    ready: analysis.ready,
    findings,
    counts: {
      error: analysis.errors.length,
      warning: analysis.warnings.length,
      recommendation: analysis.recommendations.length,
    },
  };
}

export function adminWorldCameraFrame(
  manifest: AdminWorldManifest,
  viewport: Readonly<{ width: number; height: number }>,
  reducedMotion = false,
): WorldCameraFrame {
  return computeWorldCameraFrame({
    manifest: runtimeManifest(manifest),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    reducedMotion,
  });
}

/**
 * Converts canonical source pixels into the fitted Composer SVG coordinate system. The shared
 * category policy supplies presentation scale; the manifest and fitted half-tile projection
 * supply the only viewport conversion. No arbitrary percentage or pixel clamp is applied.
 */
export function adminWorldAssetProjectionScale(input: {
  readonly kind: AdminWorldManifest['objects'][number]['kind'];
  readonly authoredScale: number;
  readonly tileWidth: number;
  readonly projectedHalfTileWidth: number;
}): number {
  const sourceHalfTileWidth = input.tileWidth / 2;
  if (!Number.isFinite(sourceHalfTileWidth) || sourceHalfTileWidth <= 0) return 0;
  const viewportScale = input.projectedHalfTileWidth / sourceHalfTileWidth;
  return resolveWorldObjectVisualScale(input.kind, input.authoredScale) * viewportScale;
}

export function adminWorldObjectContactShadow(input: {
  readonly kind: AdminWorldManifest['objects'][number]['kind'];
  readonly authoredScale: number;
  readonly tileWidth: number;
  readonly projectedHalfTileWidth: number;
}): Readonly<{
  width: number;
  height: number;
  offsetY: number;
  alpha: number;
  color: string;
  layers: readonly Readonly<{ width: number; height: number; offsetY: number; alpha: number }>[];
}> {
  const sourceHalfTileWidth = input.tileWidth / 2;
  const viewportScale =
    !Number.isFinite(sourceHalfTileWidth) || sourceHalfTileWidth <= 0
      ? 0
      : input.projectedHalfTileWidth / sourceHalfTileWidth;
  const shadow = resolveWorldObjectContactShadow(input.kind, input.authoredScale);
  return {
    width: shadow.width * viewportScale,
    height: shadow.height * viewportScale,
    offsetY: shadow.offsetY * viewportScale,
    alpha: shadow.alpha,
    color: `#${STARVILLE_VISUAL_TOKENS.shadows.color.toString(16).padStart(6, '0')}`,
    layers: resolveWorldContactShadowLayers(shadow).map((layer) => ({
      width: layer.width * viewportScale,
      height: layer.height * viewportScale,
      offsetY: layer.offsetY * viewportScale,
      alpha: layer.alpha,
    })),
  };
}

export function adminWorldReferencePlayerMetrics(input: {
  readonly tileWidth: number;
  readonly projectedHalfTileWidth: number;
}): Readonly<{ width: number; height: number }> {
  const sourceHalfTileWidth = input.tileWidth / 2;
  const viewportScale =
    !Number.isFinite(sourceHalfTileWidth) || sourceHalfTileWidth <= 0
      ? 0
      : input.projectedHalfTileWidth / sourceHalfTileWidth;
  const playerScale = STARVILLE_VISUAL_TOKENS.scale.player * viewportScale;
  return {
    width: STARVILLE_VISUAL_TOKENS.scale.playerReferenceSize.width * playerScale,
    height: STARVILLE_VISUAL_TOKENS.scale.playerReferenceSize.height * playerScale,
  };
}

export function adminWorldReferencePlayerShadow(input: {
  readonly tileWidth: number;
  readonly projectedHalfTileWidth: number;
}): Readonly<{
  color: string;
  layers: readonly Readonly<{ width: number; height: number; offsetY: number; alpha: number }>[];
}> {
  const sourceHalfTileWidth = input.tileWidth / 2;
  const viewportScale =
    !Number.isFinite(sourceHalfTileWidth) || sourceHalfTileWidth <= 0
      ? 0
      : input.projectedHalfTileWidth / sourceHalfTileWidth;
  const playerScale = STARVILLE_VISUAL_TOKENS.scale.player * viewportScale;
  return {
    color: `#${STARVILLE_VISUAL_TOKENS.shadows.color.toString(16).padStart(6, '0')}`,
    layers: resolveWorldContactShadowLayers(resolveWorldPlayerContactShadow()).map((layer) => ({
      width: layer.width * playerScale,
      height: layer.height * playerScale,
      offsetY: layer.offsetY * playerScale,
      alpha: layer.alpha,
    })),
  };
}
