import type {
  AssetDraftUpdate,
  AssetValidationResult,
  AssetVersion,
  AssetVersionDetail,
} from '@starville/asset-management';
import type {
  assetAuditDirectorySchema,
  assetAuditEventSchema,
  assetCollisionProfileSchema,
  assetLifecycleStatusSchema,
  assetProductionStatusSchema,
  assetReferenceDirectorySchema,
  worldEditorAssetCandidateDirectorySchema,
  worldEditorAssetCandidateSchema,
} from '@starville/asset-management';
import { assetDraftUpdateSchema as sharedAssetDraftUpdateSchema } from '@starville/asset-management';
import type { z } from 'zod';

export {
  ASSET_CATEGORIES,
  ASSET_LIFECYCLE_STATUSES,
  ASSET_PRODUCTION_STATUSES,
  ASSET_ROTATIONS,
  ASSET_TYPES as WORLD_ASSET_TYPES,
  assetAuditDirectorySchema,
  assetCollisionProfileSchema,
  assetDetailSchema as worldAssetDetailSchema,
  assetDirectorySchema as worldAssetDirectorySchema,
  assetDraftUpdateSchema,
  assetLifecycleStatusSchema,
  assetMutationResponseSchema,
  assetProductionStatusSchema,
  assetReferenceDirectorySchema,
  assetReviewQueueDirectorySchema,
  assetSummarySchema as worldAssetSummarySchema,
  assetTypeContractSchema as worldAssetTypeSchema,
  assetUploadMetadataSchema,
  assetVersionDetailSchema as worldAssetVersionDetailSchema,
  assetVersionSchema as worldAssetVersionSchema,
  normalizeAssetSlug,
  worldEditorAssetCandidateDirectorySchema,
  type AssetDirectory as WorldAssetDirectory,
  type AssetDetail as WorldAssetDetail,
  type AssetMutationResponse,
  type AssetReviewQueueDirectory,
  type AssetReviewQueueItem,
  type AssetSummary as WorldAssetSummary,
  type AssetType as WorldAssetType,
  type AssetVersion as WorldAssetVersion,
  type AssetVersionDetail as WorldAssetVersionDetail,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';

export type AssetAuditDirectory = z.infer<typeof assetAuditDirectorySchema>;
export type AssetAuditEvent = z.infer<typeof assetAuditEventSchema>;
export type AssetCollisionProfile = z.infer<typeof assetCollisionProfileSchema>;
export type AssetReferenceDirectory = z.infer<typeof assetReferenceDirectorySchema>;
export type WorldEditorAssetCandidate = z.infer<typeof worldEditorAssetCandidateSchema>;
export type WorldEditorAssetCandidateDirectory = z.infer<
  typeof worldEditorAssetCandidateDirectorySchema
>;

export const assetDraftConfigurationSchema = sharedAssetDraftUpdateSchema.omit({
  expectedEditVersion: true,
  idempotencyKey: true,
});

/** Mutable fields shown by the draft workspace; concurrency metadata stays server-owned. */
export type AssetDraftConfiguration = Omit<
  AssetDraftUpdate,
  'expectedEditVersion' | 'idempotencyKey'
>;

export type AssetVersionLifecycleStatus = z.infer<typeof assetLifecycleStatusSchema>;
export type AssetLifecycleStatus = z.infer<typeof assetLifecycleStatusSchema>;
export type AssetProductionStatus = z.infer<typeof assetProductionStatusSchema>;
export type AssetValidationStatus = AssetVersion['validationStatus'];
export type AssetValidationResults = AssetValidationResult;
export type AssetVersionDetailContract = AssetVersionDetail;

export interface AssetManagerCapabilities {
  readonly canUpload: boolean;
  readonly canEdit: boolean;
  readonly canValidate: boolean;
  readonly canReview: boolean;
  readonly canApprove: boolean;
  readonly canActivate: boolean;
  readonly canDeprecate: boolean;
  readonly canReadAudit: boolean;
}
