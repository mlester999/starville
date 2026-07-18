import type { WorldEditorAssetCandidate } from '../world-assets/contracts';
import { adminAssetMediaPath, availableAdminAssetMediaPath } from '../world-assets/media';
import type { AdminWorldManifest, WorldDraftAssetPin } from './contracts';

export const WORLD_OBJECT_RENDER_MODES = ['mixed', 'assets', 'markers', 'collision'] as const;
export type WorldObjectRenderMode = (typeof WORLD_OBJECT_RENDER_MODES)[number];

export type WorldObjectRenderReason =
  | 'pinned_asset'
  | 'active_asset'
  | 'marker_mode'
  | 'collision_debug_mode'
  | 'unlisted_asset_key'
  | 'explicit_replacement_required'
  | 'pinned_version_unavailable'
  | 'active_version_unavailable'
  | 'development_marker'
  | 'unsafe_version_state'
  | 'processed_media_unavailable'
  | 'media_load_failed';

export interface WorldObjectRenderResolution {
  readonly status: 'asset' | 'marker';
  readonly reason: WorldObjectRenderReason;
  readonly explanation: string;
  readonly nextSafeAction: string;
  readonly pin: WorldDraftAssetPin | null;
  readonly candidate: WorldEditorAssetCandidate | null;
  readonly replacementCandidate: WorldEditorAssetCandidate | null;
  readonly renderedVersionId: string | null;
  readonly renderedVersionNumber: number | null;
  readonly mediaUrl: string | null;
}

type MapObject = AdminWorldManifest['objects'][number];

function markerResolution(input: {
  reason: Exclude<WorldObjectRenderReason, 'pinned_asset' | 'active_asset'>;
  explanation: string;
  nextSafeAction: string;
  pin?: WorldDraftAssetPin | null;
  candidate?: WorldEditorAssetCandidate | null;
  replacementCandidate?: WorldEditorAssetCandidate | null;
}): WorldObjectRenderResolution {
  return {
    status: 'marker',
    reason: input.reason,
    explanation: input.explanation,
    nextSafeAction: input.nextSafeAction,
    pin: input.pin ?? null,
    candidate: input.candidate ?? null,
    replacementCandidate: input.replacementCandidate ?? null,
    renderedVersionId: null,
    renderedVersionNumber: null,
    mediaUrl: null,
  };
}

/**
 * Resolves editor-only presentation without mutating the manifest or substituting a different
 * asset key. Exact retained pins take priority over current active-version discovery.
 */
export function resolveWorldObjectRendering(input: {
  readonly manifestAssetKeys: ReadonlySet<string>;
  readonly object: MapObject;
  readonly pins?: readonly WorldDraftAssetPin[];
  readonly candidates: readonly WorldEditorAssetCandidate[];
  readonly mode: WorldObjectRenderMode;
  readonly allowUnpinnedActive?: boolean;
  readonly failedVersionIds?: ReadonlySet<string>;
}): WorldObjectRenderResolution {
  const pin = input.pins?.find(({ assetKey }) => assetKey === input.object.assetId) ?? null;
  const candidate =
    input.candidates.find(({ assetKey }) => assetKey === input.object.assetId) ?? null;
  const replacementCandidate =
    input.candidates.find(
      ({ asset }) => asset.developmentMarkerReplacementKey === input.object.assetId,
    ) ?? null;

  if (input.mode === 'markers') {
    return markerResolution({
      reason: 'marker_mode',
      explanation:
        'Marker-only mode is selected. Eligible pinned or active media remains intentionally hidden.',
      nextSafeAction: 'Switch to Mixed or Assets mode to preview eligible processed media.',
      pin,
      candidate,
      replacementCandidate,
    });
  }
  if (input.mode === 'collision') {
    return markerResolution({
      reason: 'collision_debug_mode',
      explanation:
        'Collision Debug mode uses compact markers so blocking footprints remain legible.',
      nextSafeAction: 'Switch to Mixed or Assets mode after reviewing collision geometry.',
      pin,
      candidate,
      replacementCandidate,
    });
  }
  if (!input.manifestAssetKeys.has(input.object.assetId)) {
    return markerResolution({
      reason: 'unlisted_asset_key',
      explanation:
        'The object asset key is not declared by this manifest, so no managed media is resolved.',
      nextSafeAction: 'Repair and validate the draft asset declaration before saving.',
      pin,
      candidate,
      replacementCandidate,
    });
  }

  if (pin !== null) {
    const pinned = pin.pinnedVersion;
    if (pin.productionStatus === 'development_marker' || pinned.sourceKind !== 'storage_raster') {
      return markerResolution({
        reason: 'development_marker',
        explanation: `This world draft is pinned to Version ${pinned.versionNumber}, an explicit development marker without processed game artwork.`,
        nextSafeAction:
          'Keep the retained marker or explicitly replace it with an approved production asset in a draft.',
        pin,
        candidate,
        replacementCandidate,
      });
    }
    if (
      !['active', 'deprecated'].includes(pinned.lifecycleStatus) ||
      pinned.validationStatus !== 'valid' ||
      pinned.processingStatus !== 'completed'
    ) {
      return markerResolution({
        reason: 'unsafe_version_state',
        explanation: `Pinned Version ${pinned.versionNumber} does not satisfy the historical active/deprecated, processed, and valid rendering policy.`,
        nextSafeAction: 'Inspect the retained version; do not rewrite the pin implicitly.',
        pin,
        candidate,
        replacementCandidate,
      });
    }
    if (!pinned.processedSourceAvailable) {
      return markerResolution({
        reason: 'processed_media_unavailable',
        explanation: `Pinned Version ${pinned.versionNumber} has no eligible sanitized processed-source derivative.`,
        nextSafeAction: 'Keep the historical marker or explicitly replace the binding in a draft.',
        pin,
        candidate,
        replacementCandidate,
      });
    }
    if (input.failedVersionIds?.has(pinned.id) === true) {
      return markerResolution({
        reason: 'media_load_failed',
        explanation:
          'The protected pinned derivative could not be loaded, so this object fell back safely.',
        nextSafeAction:
          'Retry after checking the protected media route; the retained world pin was not changed.',
        pin,
        candidate,
        replacementCandidate,
      });
    }
    return {
      status: 'asset',
      reason: 'pinned_asset',
      explanation: `Rendering immutable Version ${pinned.versionNumber}, the exact version pinned by this world draft. Later activation does not rewrite this reference.`,
      nextSafeAction: 'Inspect the rendered version or explicitly replace the binding in a draft.',
      pin,
      candidate,
      replacementCandidate,
      renderedVersionId: pinned.id,
      renderedVersionNumber: pinned.versionNumber,
      mediaUrl: adminAssetMediaPath(pin.assetId, pinned.id, 'source'),
    };
  }

  if (!input.allowUnpinnedActive) {
    return markerResolution({
      reason: 'pinned_version_unavailable',
      explanation:
        'No retained version pin is available, and this view does not permit active discovery.',
      nextSafeAction: 'Reload the draft pin material or keep the marker; do not guess a version.',
      candidate,
      replacementCandidate,
    });
  }
  if (candidate === null) {
    if (replacementCandidate !== null) {
      return markerResolution({
        reason: 'explicit_replacement_required',
        explanation: `${replacementCandidate.asset.friendlyName} is an approved active replacement, but this object still references ${input.object.assetId}.`,
        nextSafeAction:
          'Use Replace asset on an editable draft after reviewing collision and interaction impact.',
        replacementCandidate,
      });
    }
    return markerResolution({
      reason: 'active_version_unavailable',
      explanation:
        'No eligible active asset version is available in the authorized editor catalog.',
      nextSafeAction: 'Keep the marker or activate an approved version through the asset workflow.',
    });
  }
  if (candidate.asset.productionStatus === 'development_marker') {
    return markerResolution({
      reason: 'development_marker',
      explanation:
        'This is an explicit repository-owned development marker and has no processed delivery file.',
      nextSafeAction:
        'Keep the marker or explicitly replace it with an approved production asset in a draft.',
      candidate,
      replacementCandidate,
    });
  }
  if (
    candidate.asset.lifecycleStatus !== 'active' ||
    candidate.asset.activeVersionId !== candidate.versionId ||
    candidate.activeVersion.lifecycleStatus !== 'active' ||
    candidate.activeVersion.validationStatus !== 'valid' ||
    candidate.activeVersion.processingStatus !== 'completed'
  ) {
    return markerResolution({
      reason: 'unsafe_version_state',
      explanation:
        'The active candidate does not satisfy the processed and valid rendering policy.',
      nextSafeAction:
        'Review the asset lifecycle; validated non-active versions are never selected automatically.',
      candidate,
      replacementCandidate,
    });
  }
  const mediaUrl = availableAdminAssetMediaPath(
    candidate.asset.id,
    candidate.versionId,
    'source',
    candidate.activeVersion.sourceUrl,
  );
  if (mediaUrl === null) {
    return markerResolution({
      reason: 'processed_media_unavailable',
      explanation: 'The active version has no declared sanitized processed-source derivative.',
      nextSafeAction: 'Keep the marker and repair the processing output in the asset workflow.',
      candidate,
      replacementCandidate,
    });
  }
  if (input.failedVersionIds?.has(candidate.versionId) === true) {
    return markerResolution({
      reason: 'media_load_failed',
      explanation:
        'The protected processed derivative could not be loaded, so the canvas fell back safely.',
      nextSafeAction:
        'Retry after checking the protected media route; the world reference was not changed.',
      candidate,
      replacementCandidate,
    });
  }
  return {
    status: 'asset',
    reason: 'active_asset',
    explanation: `Using current active immutable Version ${candidate.activeVersion.versionNumber} for a newly introduced draft key. Saving the draft pins this exact version.`,
    nextSafeAction:
      'Save and validate the draft to retain this version, or explicitly replace the asset first.',
    pin: null,
    candidate,
    replacementCandidate,
    renderedVersionId: candidate.versionId,
    renderedVersionNumber: candidate.activeVersion.versionNumber,
    mediaUrl,
  };
}

export function worldAssetCanvasMetrics(
  source: WorldEditorAssetCandidate | WorldDraftAssetPin,
): Readonly<{
  width: number;
  height: number;
  x: number;
  y: number;
}> {
  const render =
    'pinnedVersion' in source ? source.pinnedVersion.render : source.activeVersion.render;
  return worldAssetCanvasMetricsForRender(render);
}

export function worldAssetCanvasMetricsForRender(
  render: Readonly<{
    renderWidth: number;
    renderHeight: number;
    scale: number;
    footAnchor: Readonly<{ x: number; y: number }>;
  }>,
): Readonly<{
  width: number;
  height: number;
  x: number;
  y: number;
}> {
  const ratio = render.renderWidth / render.renderHeight;
  const height = Math.min(180, Math.max(28, render.renderHeight * render.scale * 0.25));
  const width = Math.min(220, Math.max(20, height * ratio));
  return {
    width,
    height,
    x: -width * render.footAnchor.x,
    y: -height * render.footAnchor.y,
  };
}

export function worldObjectFriendlyLabel(
  object: MapObject,
  resolution: WorldObjectRenderResolution,
): string {
  const friendlyName = resolution.pin?.friendlyName ?? resolution.candidate?.asset.friendlyName;
  if (friendlyName !== undefined) return friendlyName;
  return object.assetId
    .replace(/^phase7[-_]/u, '')
    .replace(/[-_]+marker$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}
