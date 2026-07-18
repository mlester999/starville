import type { WorldAssetDetail, WorldAssetVersionDetail } from './contracts';

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = Reflect.get(error, 'status');
  return typeof status === 'number' ? status : undefined;
}

export interface AssetVersionRecoveryLog {
  readonly requestStage: 'version_detail_read' | 'canonical_asset_recovery';
  readonly errorCategory:
    | 'invalid_version_identifier'
    | 'version_not_found'
    | 'canonical_asset_not_found'
    | 'backend_unavailable';
}

export type AssetVersionReadResolution =
  | { readonly kind: 'loaded'; readonly detail: WorldAssetVersionDetail }
  | { readonly kind: 'recover'; readonly asset: WorldAssetDetail }
  | { readonly kind: 'missing_asset' }
  | { readonly kind: 'retryable' };

export function canonicalWorldAssetPath(assetId: string): string {
  return `/world-assets/${encodeURIComponent(assetId)}`;
}

export function canonicalWorldAssetVersionPath(assetId: string, versionId: string): string {
  return `${canonicalWorldAssetPath(assetId)}/versions/${encodeURIComponent(versionId)}`;
}

export async function resolveAssetVersionRead(options: {
  readonly loadVersion?: () => Promise<WorldAssetVersionDetail>;
  readonly loadCanonicalAsset: () => Promise<WorldAssetDetail>;
  readonly log: (event: AssetVersionRecoveryLog) => void;
}): Promise<AssetVersionReadResolution> {
  if (options.loadVersion !== undefined) {
    try {
      return { kind: 'loaded', detail: await options.loadVersion() };
    } catch (error) {
      if (errorStatus(error) !== 404) {
        options.log({
          requestStage: 'version_detail_read',
          errorCategory: 'backend_unavailable',
        });
        return { kind: 'retryable' };
      }
      options.log({
        requestStage: 'version_detail_read',
        errorCategory: 'version_not_found',
      });
    }
  } else {
    options.log({
      requestStage: 'version_detail_read',
      errorCategory: 'invalid_version_identifier',
    });
  }

  try {
    return { kind: 'recover', asset: await options.loadCanonicalAsset() };
  } catch (error) {
    if (errorStatus(error) === 404) {
      options.log({
        requestStage: 'canonical_asset_recovery',
        errorCategory: 'canonical_asset_not_found',
      });
      return { kind: 'missing_asset' };
    }
    options.log({
      requestStage: 'canonical_asset_recovery',
      errorCategory: 'backend_unavailable',
    });
    return { kind: 'retryable' };
  }
}
