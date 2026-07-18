export function assetVersionUploadErrorMessage(status: number, code?: string): string {
  if (code === 'ASSET_REMOTE_WRITES_DISABLED') {
    return 'Remote asset uploads are currently disabled because hosted writes have not been approved for this session.';
  }
  if (code === 'ASSET_VERSION_UPLOAD_UNAVAILABLE') {
    return 'The trusted asset API is unavailable. Start or restart the API service and try again.';
  }
  if (code === 'ASSET_STORAGE_UNAVAILABLE') {
    return 'The protected asset storage service is unavailable. Verify the asset-intake bucket and API storage access.';
  }
  if (code === 'ASSET_MANAGEMENT_UNAVAILABLE') {
    return 'The asset database operation is unavailable. No draft version was completed.';
  }
  if (status === 409) {
    return 'The asset changed or already has an open candidate. Reload before trying again.';
  }
  if (status === 413) return 'This file exceeds the source-size limit.';
  if (status === 415 || status === 422) return 'This is not a supported PNG or WebP image.';
  if (status === 429) return 'Too many uploads were attempted. Wait briefly and try again.';
  return 'The new version could not be uploaded. Please try again.';
}
