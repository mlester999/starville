import {
  bundledAssetVariant,
  getBundledAsset,
  resolveAssetSource,
  type BundledAssetEntry,
} from '@starville/asset-management';

import type { WorldEditorAssetCandidate } from '../world-assets/contracts';
import { adminAssetMediaPath, availableAdminAssetMediaPath } from '../world-assets/media';
import type { AdminWorldManifest, WorldDraftAssetPin } from './contracts';

export const WORLD_OBJECT_RENDER_MODES = ['mixed', 'assets', 'markers', 'collision'] as const;
export type WorldObjectRenderMode = (typeof WORLD_OBJECT_RENDER_MODES)[number];

export type WorldObjectRenderReason =
  | 'pinned_asset'
  | 'active_asset'
  | 'bundled_default'
  | 'bundled_fallback'
  | 'safe_placeholder'
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
  readonly source:
    'uploaded_pin' | 'uploaded_active' | 'bundled_default' | 'safe_placeholder' | 'marker';
  readonly sourceLabel: string;
  readonly explanation: string;
  readonly nextSafeAction: string;
  readonly pin: WorldDraftAssetPin | null;
  readonly candidate: WorldEditorAssetCandidate | null;
  readonly replacementCandidate: WorldEditorAssetCandidate | null;
  readonly renderedVersionId: string | null;
  readonly renderedVersionNumber: number | null;
  readonly renderedMediaId: string | null;
  readonly mediaUrl: string | null;
  readonly bundledAsset: BundledAssetEntry | null;
  readonly render: WorldDraftAssetPin['pinnedVersion']['render'] | null;
  readonly supportedRotations: readonly (0 | 90 | 180 | 270)[];
  readonly usesAuthoredRotation: boolean;
  readonly bundledVariantId: string | null;
}

type MapObject = AdminWorldManifest['objects'][number];

function markerResolution(input: {
  reason: Exclude<WorldObjectRenderReason, 'pinned_asset' | 'active_asset'>;
  explanation: string;
  nextSafeAction: string;
  pin?: WorldDraftAssetPin | null | undefined;
  candidate?: WorldEditorAssetCandidate | null | undefined;
  replacementCandidate?: WorldEditorAssetCandidate | null | undefined;
}): WorldObjectRenderResolution {
  return {
    status: 'marker',
    reason: input.reason,
    source: 'marker',
    sourceLabel: 'Fallback marker',
    explanation: input.explanation,
    nextSafeAction: input.nextSafeAction,
    pin: input.pin ?? null,
    candidate: input.candidate ?? null,
    replacementCandidate: input.replacementCandidate ?? null,
    renderedVersionId: null,
    renderedVersionNumber: null,
    renderedMediaId: null,
    mediaUrl: null,
    bundledAsset: null,
    render: null,
    supportedRotations: [0],
    usesAuthoredRotation: false,
    bundledVariantId: null,
  };
}

function bundledRender(asset: BundledAssetEntry): WorldDraftAssetPin['pinnedVersion']['render'] {
  return {
    renderWidth: asset.width,
    renderHeight: asset.height,
    scale: asset.recommendedScale,
    anchor: asset.anchor,
    footAnchor: asset.footAnchor,
    depthAnchor: asset.depthAnchor,
    supportedRotations: asset.supportedRotations,
    defaultRotation: asset.defaultRotation,
  };
}

function bundledMedia(
  asset: BundledAssetEntry,
  rotation: 0 | 90 | 180 | 270,
): Readonly<{
  url: string;
  mediaId: string;
  variantId: string | null;
  authoredRotation: boolean;
}> {
  const resolvedRotation = asset.supportedRotations.includes(rotation)
    ? rotation
    : asset.defaultRotation;
  const variant = bundledAssetVariant(asset, { rotation: resolvedRotation });
  const authoredRotation =
    resolvedRotation === asset.defaultRotation || variant?.rotation === resolvedRotation;
  const resolved = resolveAssetSource({
    assetKey: asset.key,
    context: 'admin_preview',
    allowActiveOverride: false,
    rotation: resolvedRotation,
    mediaSurface: 'admin',
  });
  return {
    url: resolved.url,
    mediaId: resolved.cacheIdentity,
    variantId: variant?.id ?? null,
    authoredRotation,
  };
}

function bundledResolution(input: {
  readonly object: MapObject;
  readonly asset: BundledAssetEntry;
  readonly reason: 'bundled_default' | 'bundled_fallback' | 'safe_placeholder';
  readonly explanation: string;
  readonly nextSafeAction: string;
  readonly failedMediaIds?: ReadonlySet<string> | undefined;
  readonly pin?: WorldDraftAssetPin | null | undefined;
  readonly candidate?: WorldEditorAssetCandidate | null | undefined;
  readonly replacementCandidate?: WorldEditorAssetCandidate | null | undefined;
}): WorldObjectRenderResolution {
  const rotation = input.object.rotation ?? input.asset.defaultRotation;
  const media = bundledMedia(input.asset, rotation);
  if (input.failedMediaIds?.has(media.mediaId) === true) {
    const placeholder = getBundledAsset('system.missing-asset');
    if (input.asset.key !== 'system.missing-asset' && placeholder !== undefined) {
      return bundledResolution({
        ...input,
        asset: placeholder,
        reason: 'safe_placeholder',
        explanation: `Bundled media for ${input.object.assetId} could not be loaded. The stable Starville missing-asset visual is shown without changing the object.`,
        nextSafeAction:
          'Repair the bundled file and rerun asset validation; object placement is unchanged.',
      });
    }
    return markerResolution({
      reason: 'media_load_failed',
      explanation:
        'The bundled safe placeholder could not be loaded, so a compact marker is shown.',
      nextSafeAction: 'Repair the allowlisted bundled media files and rerun asset validation.',
      pin: input.pin,
      candidate: input.candidate,
      replacementCandidate: input.replacementCandidate,
    });
  }
  return {
    status: 'asset',
    reason: input.reason,
    source: input.reason === 'safe_placeholder' ? 'safe_placeholder' : 'bundled_default',
    sourceLabel:
      input.reason === 'safe_placeholder' ? 'Safe missing-asset fallback' : 'Bundled Default',
    explanation: input.explanation,
    nextSafeAction: input.nextSafeAction,
    pin: input.pin ?? null,
    candidate: input.candidate ?? null,
    replacementCandidate: input.replacementCandidate ?? null,
    renderedVersionId: null,
    renderedVersionNumber: null,
    renderedMediaId: media.mediaId,
    mediaUrl: media.url,
    bundledAsset: input.asset,
    render: bundledRender(input.asset),
    supportedRotations: input.asset.supportedRotations,
    usesAuthoredRotation: media.authoredRotation,
    bundledVariantId: media.variantId,
  };
}

function bundledOrPlaceholder(input: {
  readonly object: MapObject;
  readonly reason: 'bundled_default' | 'bundled_fallback';
  readonly explanation: string;
  readonly nextSafeAction: string;
  readonly failedMediaIds?: ReadonlySet<string> | undefined;
  readonly pin?: WorldDraftAssetPin | null | undefined;
  readonly candidate?: WorldEditorAssetCandidate | null | undefined;
  readonly replacementCandidate?: WorldEditorAssetCandidate | null | undefined;
}): WorldObjectRenderResolution {
  const asset = getBundledAsset(input.object.assetId);
  if (asset !== undefined) return bundledResolution({ ...input, asset });
  const placeholder = getBundledAsset('system.missing-asset');
  if (placeholder !== undefined) {
    return bundledResolution({
      ...input,
      asset: placeholder,
      reason: 'safe_placeholder',
      explanation: `No bundled or eligible uploaded media exists for ${input.object.assetId}. The stable Starville missing-asset visual is shown.`,
      nextSafeAction:
        'Add the stable key to the bundled manifest or activate an approved override.',
    });
  }
  return markerResolution({
    reason: 'active_version_unavailable',
    explanation: input.explanation,
    nextSafeAction: input.nextSafeAction,
    pin: input.pin,
    candidate: input.candidate,
    replacementCandidate: input.replacementCandidate,
  });
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
      return bundledOrPlaceholder({
        object: input.object,
        reason: 'bundled_default',
        explanation: `This exact world pin is repository-owned Version ${pinned.versionNumber}, so its stable key resolves to the bundled default without rewriting the pin.`,
        nextSafeAction:
          'Keep the bundled default or explicitly select an approved override in a draft.',
        failedMediaIds: input.failedVersionIds,
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
      return bundledOrPlaceholder({
        object: input.object,
        reason: 'bundled_fallback',
        explanation: `Pinned Version ${pinned.versionNumber} is not safe to render, so the bundled default is used without changing the retained pin.`,
        nextSafeAction: 'Inspect the retained uploaded version and repair its lifecycle evidence.',
        failedMediaIds: input.failedVersionIds,
        pin,
        candidate,
        replacementCandidate,
      });
    }
    if (!pinned.processedSourceAvailable) {
      return bundledOrPlaceholder({
        object: input.object,
        reason: 'bundled_fallback',
        explanation: `Pinned Version ${pinned.versionNumber} has no eligible processed derivative, so the bundled default is used without changing the retained pin.`,
        nextSafeAction:
          'Repair the immutable derivative or explicitly replace the binding in a draft.',
        failedMediaIds: input.failedVersionIds,
        pin,
        candidate,
        replacementCandidate,
      });
    }
    if (input.failedVersionIds?.has(pinned.id) === true) {
      return bundledOrPlaceholder({
        object: input.object,
        reason: 'bundled_fallback',
        explanation:
          'The protected pinned derivative could not be loaded, so the bundled default is shown without changing the world pin.',
        nextSafeAction: 'Retry or inspect the protected uploaded-media route.',
        failedMediaIds: input.failedVersionIds,
        pin,
        candidate,
        replacementCandidate,
      });
    }
    return {
      status: 'asset',
      reason: 'pinned_asset',
      source: 'uploaded_pin',
      sourceLabel: 'Exact uploaded pin',
      explanation: `Rendering immutable Version ${pinned.versionNumber}, the exact version pinned by this world draft. Later activation does not rewrite this reference.`,
      nextSafeAction: 'Inspect the rendered version or explicitly replace the binding in a draft.',
      pin,
      candidate,
      replacementCandidate,
      renderedVersionId: pinned.id,
      renderedVersionNumber: pinned.versionNumber,
      renderedMediaId: pinned.id,
      mediaUrl: adminAssetMediaPath(pin.assetId, pinned.id, 'source'),
      bundledAsset: getBundledAsset(input.object.assetId) ?? null,
      render: pinned.render,
      supportedRotations: pinned.render.supportedRotations,
      usesAuthoredRotation: false,
      bundledVariantId: null,
    };
  }

  if (!input.allowUnpinnedActive) {
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_default',
      explanation:
        'No exact uploaded pin is available in this stable view, so the stable key resolves to its bundled default. Active discovery was not consulted.',
      nextSafeAction:
        'Reload exact pin material if this view is expected to show an uploaded version.',
      failedMediaIds: input.failedVersionIds,
      candidate,
      replacementCandidate,
    });
  }
  if (candidate === null) {
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_default',
      explanation:
        replacementCandidate === null
          ? 'No eligible active uploaded version is available, so the stable key resolves to its bundled default.'
          : `${replacementCandidate.asset.friendlyName} is available as an explicit replacement, while this stable key continues to render its bundled default.`,
      nextSafeAction:
        replacementCandidate === null
          ? 'Keep the bundled default or activate an approved same-key override.'
          : 'Use Replace asset only if changing the stable key is intentional.',
      failedMediaIds: input.failedVersionIds,
      replacementCandidate,
    });
  }
  if (candidate.asset.productionStatus === 'development_marker') {
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_default',
      explanation:
        'The active record is repository-owned, so its stable key resolves to the bundled default.',
      nextSafeAction: 'Keep the bundled default or create an approved same-key uploaded version.',
      failedMediaIds: input.failedVersionIds,
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
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_fallback',
      explanation:
        'The active uploaded candidate is not safe to render, so the bundled default is used.',
      nextSafeAction:
        'Review the uploaded asset lifecycle; non-active versions are never selected.',
      failedMediaIds: input.failedVersionIds,
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
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_fallback',
      explanation:
        'The active uploaded version has no declared processed derivative, so the bundled default is used.',
      nextSafeAction: 'Repair the uploaded processing output in the asset workflow.',
      failedMediaIds: input.failedVersionIds,
      candidate,
      replacementCandidate,
    });
  }
  if (input.failedVersionIds?.has(candidate.versionId) === true) {
    return bundledOrPlaceholder({
      object: input.object,
      reason: 'bundled_fallback',
      explanation:
        'The protected uploaded derivative could not be loaded, so the bundled default is shown.',
      nextSafeAction: 'Retry after checking the protected uploaded-media route.',
      failedMediaIds: input.failedVersionIds,
      candidate,
      replacementCandidate,
    });
  }
  return {
    status: 'asset',
    reason: 'active_asset',
    source: 'uploaded_active',
    sourceLabel: 'Active uploaded override',
    explanation: `Using current active immutable Version ${candidate.activeVersion.versionNumber} for a newly introduced draft key. Saving the draft pins this exact version.`,
    nextSafeAction:
      'Save and validate the draft to retain this version, or explicitly replace the asset first.',
    pin: null,
    candidate,
    replacementCandidate,
    renderedVersionId: candidate.versionId,
    renderedVersionNumber: candidate.activeVersion.versionNumber,
    renderedMediaId: candidate.versionId,
    mediaUrl,
    bundledAsset: getBundledAsset(input.object.assetId) ?? null,
    render: candidate.activeVersion.render,
    supportedRotations: candidate.activeVersion.render.supportedRotations,
    usesAuthoredRotation: false,
    bundledVariantId: null,
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
  const friendlyName =
    resolution.pin?.friendlyName ??
    resolution.candidate?.asset.friendlyName ??
    resolution.bundledAsset?.displayName;
  if (friendlyName !== undefined) return friendlyName;
  return object.assetId
    .replace(/^phase7[-_]/u, '')
    .replace(/[-_]+marker$/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}
