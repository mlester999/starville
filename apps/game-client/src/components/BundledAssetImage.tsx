import { useEffect, useMemo, useState } from 'react';

import {
  gameplayAssetOverrideCandidate,
  resolveAssetSource,
  type AssetResolutionContext,
  type AssetRotation,
} from '@starville/asset-management';
import { useGameplayAssetOverride } from '../app/gameplay-asset-overrides-context';

export interface BundledAssetImageProps {
  readonly assetKey: string | null | undefined;
  readonly alt: string;
  readonly className?: string;
  readonly rotation?: AssetRotation;
  readonly context?: Extract<AssetResolutionContext, 'gameplay_ui' | 'game_test'>;
  readonly eager?: boolean;
}

/**
 * Small React boundary for the same stable-key resolver used by Phaser. The
 * logical key remains intact when media fails; only the visual falls back to
 * Starville's bundled missing-asset material.
 */
export function BundledAssetImage({
  assetKey,
  alt,
  className,
  rotation = 0,
  context = 'gameplay_ui',
  eager = false,
}: BundledAssetImageProps) {
  const override = useGameplayAssetOverride(assetKey);
  const candidate = useMemo(
    () => (override === undefined ? null : gameplayAssetOverrideCandidate(override)),
    [override],
  );
  const [failedIdentities, setFailedIdentities] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => setFailedIdentities(new Set()), [assetKey, candidate?.identity]);
  const resolved = useMemo(
    () =>
      resolveAssetSource({
        assetKey: assetKey ?? 'system.missing-asset',
        context,
        activeOverride:
          candidate === null || candidate.render?.defaultRotation !== rotation ? null : candidate,
        allowActiveOverride: true,
        failedIdentities,
        rotation,
      }),
    [assetKey, candidate, context, failedIdentities, rotation],
  );
  const missing = useMemo(
    () =>
      resolveAssetSource({
        assetKey: 'system.missing-asset',
        context,
        allowActiveOverride: false,
      }),
    [context],
  );
  const [source, setSource] = useState(resolved.url);

  useEffect(() => setSource(resolved.url), [resolved.url]);

  return (
    <img
      alt={alt}
      className={className}
      data-asset-key={assetKey ?? 'system.missing-asset'}
      data-asset-source={source === resolved.url ? resolved.source : 'missing_placeholder'}
      data-cache-identity={resolved.cacheIdentity}
      decoding="async"
      height={resolved.render.renderHeight}
      loading={eager ? 'eager' : 'lazy'}
      src={source}
      width={resolved.render.renderWidth}
      onError={(event) => {
        if (resolved.source === 'active_uploaded' && resolved.versionId !== null) {
          setFailedIdentities((current) => new Set([...current, candidate!.identity]));
          return;
        }
        if (source !== missing.url) {
          setSource(missing.url);
          return;
        }
        event.currentTarget.hidden = true;
      }}
    />
  );
}
