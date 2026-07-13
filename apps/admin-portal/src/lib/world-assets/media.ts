export type AdminAssetMediaVariant = 'original' | 'source' | 'preview' | 'thumbnail';

/** Browser-safe, same-origin route; the Next handler re-authorizes every byte request. */
export function adminAssetMediaPath(
  assetId: string,
  versionId: string,
  variant: AdminAssetMediaVariant,
): string {
  return `/api/world-assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}/${variant}`;
}

/** Avoids a guaranteed proxy 404 for procedural markers or versions without that derivative. */
export function availableAdminAssetMediaPath(
  assetId: string,
  versionId: string,
  variant: AdminAssetMediaVariant,
  declaredUrl: string | null,
): string | null {
  return declaredUrl === null ? null : adminAssetMediaPath(assetId, versionId, variant);
}
