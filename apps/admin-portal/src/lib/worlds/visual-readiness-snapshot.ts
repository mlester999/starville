import type { WorldRevision } from './contracts';
import {
  analyzeAdminWorldVisualReadiness,
  adminWorldCameraFrame,
  type AdminWorldVisualReadiness,
} from './visual-policy';
import {
  WORLD_VISUAL_REVIEW_VIEWPORTS,
  type WorldVisualReviewViewportId,
} from './visual-readiness-review';

export interface AdminWorldVisualReadinessCameraFrame {
  readonly viewportId: WorldVisualReviewViewportId;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly apronTiles: number;
  readonly projectedWidth: number;
  readonly projectedHeight: number;
}

export interface AdminWorldVisualReadinessSnapshot {
  readonly mapId: string;
  readonly mapName: string;
  readonly mapSlug: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly lifecycleStatus: WorldRevision['version']['lifecycleStatus'];
  readonly validationStatus: WorldRevision['version']['validationStatus'];
  readonly checksum: string | null;
  readonly manifestName: string;
  readonly readiness: AdminWorldVisualReadiness;
  readonly cameraFrames: readonly AdminWorldVisualReadinessCameraFrame[];
}

/** Builds a serializable, read-only review projection for one immutable server-loaded revision. */
export function createAdminWorldVisualReadinessSnapshot(
  revision: WorldRevision,
): AdminWorldVisualReadinessSnapshot {
  return {
    mapId: revision.map.id,
    mapName: revision.map.displayName,
    mapSlug: revision.map.slug,
    versionId: revision.version.id,
    versionNumber: revision.version.versionNumber,
    lifecycleStatus: revision.version.lifecycleStatus,
    validationStatus: revision.version.validationStatus,
    checksum: revision.version.checksum,
    manifestName: revision.manifest.name,
    readiness: analyzeAdminWorldVisualReadiness(revision.manifest),
    cameraFrames: WORLD_VISUAL_REVIEW_VIEWPORTS.map((viewport) => {
      const frame = adminWorldCameraFrame(revision.manifest, viewport);
      return {
        viewportId: viewport.id,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        zoom: frame.zoom,
        apronTiles: frame.apronTiles,
        projectedWidth: frame.bounds.width,
        projectedHeight: frame.bounds.height,
      };
    }),
  };
}
