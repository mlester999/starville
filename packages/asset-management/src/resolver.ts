import type { AssetCollisionProfile, AssetRotation, WorldAssetDelivery } from './contracts';
import {
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  bundledManifestVersionSchema,
  bundledAssetAdminMediaPath,
  bundledAssetRuntimePath,
  bundledAssetVariant,
  getBundledAsset,
  type BundledManifestVersion,
  type BundledAssetEntry,
} from './bundled-assets';

export type AssetResolutionContext =
  'published_world' | 'draft_world' | 'game_test' | 'admin_preview' | 'gameplay_ui';

export interface ResolvableAssetRender {
  readonly width: number;
  readonly height: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly scale: number;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly footAnchor: Readonly<{ x: number; y: number }>;
  readonly depthAnchor: Readonly<{ x: number; y: number }>;
  readonly collision: AssetCollisionProfile;
  readonly supportedRotations: readonly AssetRotation[];
  readonly defaultRotation: AssetRotation;
}

export interface ManagedAssetCandidate {
  readonly sourceKind: 'uploaded' | 'bundled';
  readonly identity: string;
  readonly versionId: string | null;
  readonly bundledManifestVersion?: string | null;
  readonly eligible: boolean;
  readonly url: string | null;
  readonly thumbnailUrl: string | null;
  readonly checksum: string | null;
  readonly render: ResolvableAssetRender | null;
}

export type AssetResolutionSource =
  'pinned_uploaded' | 'active_uploaded' | 'bundled_default' | 'missing_placeholder';

export type AssetResolutionReason =
  | 'exact_pinned_upload'
  | 'exact_pinned_bundled_version'
  | 'eligible_active_override'
  | 'uploaded_pin_unavailable_bundled_fallback'
  | 'active_override_unavailable_bundled_fallback'
  | 'bundled_default'
  | 'stable_key_unknown'
  | 'bundled_default_unavailable'
  | 'exact_pinned_bundled_identity_mismatch';

export interface ResolvedAsset {
  readonly requestedKey: string;
  readonly visualKey: string;
  readonly source: AssetResolutionSource;
  readonly reason: AssetResolutionReason;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly cacheIdentity: string;
  readonly versionId: string | null;
  readonly bundled: BundledAssetEntry;
  readonly render: ResolvableAssetRender;
  readonly diagnostics: Readonly<{
    requestedKey: string;
    context: AssetResolutionContext;
    exactPinPresent: boolean;
    activeOverrideConsidered: boolean;
    safeFallbackUsed: boolean;
  }>;
}

export interface ResolveAssetInput {
  readonly assetKey: string;
  readonly context: AssetResolutionContext;
  readonly exactPinned?: ManagedAssetCandidate | null;
  readonly activeOverride?: ManagedAssetCandidate | null;
  readonly allowActiveOverride?: boolean;
  readonly failedIdentities?: ReadonlySet<string>;
  readonly rotation?: AssetRotation;
  readonly mediaSurface?: 'game' | 'admin';
  /**
   * Explicit repository candidate used only by local draft/Game Test/Admin
   * inspection. Published and normal gameplay fall back to the immutable v1
   * default unless an exact repository pin names another supported version.
   */
  readonly preferredBundledManifestVersion?: BundledManifestVersion;
}

function bundledRender(asset: BundledAssetEntry): ResolvableAssetRender {
  return {
    width: asset.width,
    height: asset.height,
    renderWidth: asset.width,
    renderHeight: asset.height,
    scale: asset.recommendedScale,
    anchor: asset.anchor,
    footAnchor: asset.footAnchor,
    depthAnchor: asset.depthAnchor,
    collision: asset.collision,
    supportedRotations: asset.supportedRotations,
    defaultRotation: asset.defaultRotation,
  };
}

function candidateAvailable(
  candidate: ManagedAssetCandidate | null | undefined,
  failedIdentities: ReadonlySet<string> | undefined,
): candidate is ManagedAssetCandidate & {
  readonly url: string;
  readonly render: ResolvableAssetRender;
} {
  return (
    candidate !== null &&
    candidate !== undefined &&
    candidate.eligible &&
    candidate.url !== null &&
    candidate.render !== null &&
    failedIdentities?.has(candidate.identity) !== true
  );
}

function bundledMedia(
  asset: BundledAssetEntry,
  surface: 'game' | 'admin',
  rotation: AssetRotation | undefined,
): Readonly<{ url: string; thumbnailUrl: string; cacheIdentity: string }> {
  const authoredVariant =
    rotation === undefined ? undefined : bundledAssetVariant(asset, { rotation });
  const adminSource = bundledAssetAdminMediaPath(asset.key, 'source', asset.bundledVersion);
  const versioned = (path: string): string =>
    `${path}?manifest=${encodeURIComponent(asset.bundledVersion)}`;
  const withRotation = (path: string, value: AssetRotation): string =>
    `${path}${path.includes('?') ? '&' : '?'}rotation=${String(value)}`;
  const url =
    surface === 'admin'
      ? rotation !== undefined && authoredVariant?.rotation === rotation
        ? withRotation(adminSource, rotation)
        : adminSource
      : versioned(bundledAssetRuntimePath(asset, rotation === undefined ? {} : { rotation }));
  const thumbnailUrl =
    surface === 'admin'
      ? bundledAssetAdminMediaPath(asset.key, 'thumbnail', asset.bundledVersion)
      : versioned(asset.thumbnailPath);
  return {
    url,
    thumbnailUrl,
    cacheIdentity: `starville-bundled:${asset.bundledVersion}:${asset.key}:${url}`,
  };
}

function defaultBundledManifestVersion(input: ResolveAssetInput): BundledManifestVersion {
  if (
    input.preferredBundledManifestVersion !== undefined &&
    ['draft_world', 'game_test', 'admin_preview'].includes(input.context)
  ) {
    return input.preferredBundledManifestVersion;
  }
  return STARVILLE_BUNDLED_MANIFEST_VERSION;
}

function resolveBundled(
  input: ResolveAssetInput,
  reason: AssetResolutionReason,
  safeFallbackUsed: boolean,
  versionId: string | null = null,
  manifestVersion: BundledManifestVersion = defaultBundledManifestVersion(input),
): ResolvedAsset {
  const requested = getBundledAsset(input.assetKey, manifestVersion);
  const bundled = requested ?? getBundledAsset('system.missing-asset', manifestVersion);
  if (bundled === undefined) {
    throw new Error('Starville bundled missing-asset material is unavailable.');
  }
  const media = bundledMedia(bundled, input.mediaSurface ?? 'game', input.rotation);
  return {
    requestedKey: input.assetKey,
    visualKey: bundled.key,
    source: requested === undefined ? 'missing_placeholder' : 'bundled_default',
    reason: requested === undefined ? 'stable_key_unknown' : reason,
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    cacheIdentity: media.cacheIdentity,
    versionId,
    bundled,
    render: bundledRender(bundled),
    diagnostics: {
      requestedKey: input.assetKey,
      context: input.context,
      exactPinPresent: input.exactPinned !== undefined && input.exactPinned !== null,
      activeOverrideConsidered: input.allowActiveOverride === true,
      safeFallbackUsed: safeFallbackUsed || requested === undefined,
    },
  };
}

function resolveMismatchedBundledPin(
  input: ResolveAssetInput,
  pin: ManagedAssetCandidate,
): ResolvedAsset {
  const missing = getBundledAsset('system.missing-asset', defaultBundledManifestVersion(input));
  if (missing === undefined) {
    throw new Error('Starville bundled missing-asset material is unavailable.');
  }
  const media = bundledMedia(missing, input.mediaSurface ?? 'game', undefined);
  return {
    requestedKey: input.assetKey,
    visualKey: missing.key,
    source: 'missing_placeholder',
    reason: 'exact_pinned_bundled_identity_mismatch',
    url: media.url,
    thumbnailUrl: media.thumbnailUrl,
    cacheIdentity: media.cacheIdentity,
    versionId: pin.versionId,
    bundled: missing,
    render: bundledRender(missing),
    diagnostics: {
      requestedKey: input.assetKey,
      context: input.context,
      exactPinPresent: true,
      activeOverrideConsidered: false,
      safeFallbackUsed: true,
    },
  };
}

function resolveUploaded(
  input: ResolveAssetInput,
  candidate: ManagedAssetCandidate & {
    readonly url: string;
    readonly render: ResolvableAssetRender;
  },
  source: Extract<AssetResolutionSource, 'pinned_uploaded' | 'active_uploaded'>,
  reason: Extract<AssetResolutionReason, 'exact_pinned_upload' | 'eligible_active_override'>,
): ResolvedAsset {
  const manifestVersion = defaultBundledManifestVersion(input);
  const bundled =
    getBundledAsset(input.assetKey, manifestVersion) ??
    getBundledAsset('system.missing-asset', manifestVersion);
  if (bundled === undefined) {
    throw new Error('Starville bundled missing-asset material is unavailable.');
  }
  return {
    requestedKey: input.assetKey,
    visualKey: input.assetKey,
    source,
    reason,
    url: candidate.url,
    thumbnailUrl: candidate.thumbnailUrl ?? candidate.url,
    cacheIdentity: `starville-upload:${input.assetKey}:${candidate.versionId ?? candidate.identity}:${candidate.checksum ?? 'unhashed'}`,
    versionId: candidate.versionId,
    bundled,
    render: candidate.render,
    diagnostics: {
      requestedKey: input.assetKey,
      context: input.context,
      exactPinPresent: input.exactPinned !== undefined && input.exactPinned !== null,
      activeOverrideConsidered: source === 'active_uploaded',
      safeFallbackUsed: false,
    },
  };
}

/**
 * Canonical source resolver. An exact immutable pin is never replaced by a newer active upload.
 * Uploaded-media failure falls back to the bundled visual only; logical collision and interaction
 * remain owned by the world/gameplay state rather than by this presentation result.
 */
export function resolveAssetSource(input: ResolveAssetInput): ResolvedAsset {
  const pin = input.exactPinned;
  if (pin !== undefined && pin !== null) {
    if (pin.sourceKind === 'bundled') {
      const parsedManifestVersion = bundledManifestVersionSchema.safeParse(
        pin.bundledManifestVersion,
      );
      const requested = parsedManifestVersion.success
        ? getBundledAsset(input.assetKey, parsedManifestVersion.data)
        : undefined;
      if (
        pin.eligible &&
        pin.versionId !== null &&
        parsedManifestVersion.success &&
        requested?.bundledVersion === pin.bundledManifestVersion
      ) {
        return resolveBundled(
          input,
          'exact_pinned_bundled_version',
          false,
          pin.versionId,
          parsedManifestVersion.data,
        );
      }
      return resolveMismatchedBundledPin(input, pin);
    }
    if (candidateAvailable(pin, input.failedIdentities)) {
      return resolveUploaded(input, pin, 'pinned_uploaded', 'exact_pinned_upload');
    }
    return resolveBundled(input, 'uploaded_pin_unavailable_bundled_fallback', true);
  }

  if (
    input.allowActiveOverride === true &&
    candidateAvailable(input.activeOverride, input.failedIdentities) &&
    input.activeOverride.sourceKind === 'uploaded'
  ) {
    return resolveUploaded(
      input,
      input.activeOverride,
      'active_uploaded',
      'eligible_active_override',
    );
  }

  const activeUnavailable = input.allowActiveOverride === true && input.activeOverride != null;
  return resolveBundled(
    input,
    activeUnavailable ? 'active_override_unavailable_bundled_fallback' : 'bundled_default',
    activeUnavailable,
  );
}

export function worldAssetDeliveryCandidate(delivery: WorldAssetDelivery): ManagedAssetCandidate {
  if (delivery.developmentMarker) {
    return {
      sourceKind: 'bundled',
      identity: `repository:${delivery.assetKey}:${delivery.versionId}:${delivery.bundledManifestVersion}`,
      versionId: delivery.versionId,
      bundledManifestVersion: delivery.bundledManifestVersion,
      eligible: true,
      url: null,
      thumbnailUrl: null,
      checksum: delivery.checksum,
      render: null,
    };
  }
  const complete =
    delivery.url !== null &&
    delivery.mediaType === 'image/webp' &&
    delivery.width !== null &&
    delivery.height !== null &&
    delivery.renderWidth !== null &&
    delivery.renderHeight !== null;
  return {
    sourceKind: 'uploaded',
    identity: `upload:${delivery.assetKey}:${delivery.versionId}`,
    versionId: delivery.versionId,
    bundledManifestVersion: null,
    eligible: complete,
    url: delivery.url,
    thumbnailUrl: delivery.url,
    checksum: delivery.checksum,
    render: complete
      ? {
          width: delivery.width!,
          height: delivery.height!,
          renderWidth: delivery.renderWidth!,
          renderHeight: delivery.renderHeight!,
          scale: delivery.scale,
          anchor: { x: delivery.anchorX, y: delivery.anchorY },
          footAnchor: { x: delivery.footAnchorX, y: delivery.footAnchorY },
          depthAnchor: { x: delivery.depthAnchorX, y: delivery.depthAnchorY },
          collision: delivery.collision,
          supportedRotations: delivery.supportedRotations,
          defaultRotation: delivery.defaultRotation,
        }
      : null,
  };
}

export function resolveWorldAssetDelivery(
  input: Readonly<{
    assetKey: string;
    context: AssetResolutionContext;
    delivery?: WorldAssetDelivery;
    failedIdentities?: ReadonlySet<string>;
    rotation?: AssetRotation;
    mediaSurface?: 'game' | 'admin';
  }>,
): ResolvedAsset {
  return resolveAssetSource({
    assetKey: input.assetKey,
    context: input.context,
    exactPinned: input.delivery === undefined ? null : worldAssetDeliveryCandidate(input.delivery),
    allowActiveOverride: false,
    ...(input.failedIdentities === undefined ? {} : { failedIdentities: input.failedIdentities }),
    ...(input.rotation === undefined ? {} : { rotation: input.rotation }),
    ...(input.mediaSurface === undefined ? {} : { mediaSurface: input.mediaSurface }),
  });
}
