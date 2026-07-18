import type { WorkerJob } from './job.js';

export type WorldAssetReconciliationIssueCode =
  | 'BUNDLED_ASSET_IDENTITY_MISSING'
  | 'BUNDLED_CATALOG_MEDIA_METADATA_INVALID'
  | 'BUNDLED_POINTER_MISMATCH'
  | 'BUNDLED_VERSION_INVALID'
  | 'ACTIVE_ASSET_SOURCE_MISSING'
  | 'ACTIVE_OVERRIDE_INVALID'
  | 'ACTIVE_OVERRIDE_VALIDATION_INVALID'
  | 'ACTIVE_OVERRIDE_THUMBNAIL_MISSING'
  | 'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE'
  | 'APPROVED_OVERRIDE_VALIDATION_INVALID'
  | 'DEPRECATED_OVERRIDE_ROLLBACK_INVALID'
  | 'MUTABLE_REFERENCE_STALE';

export interface WorldAssetReconciliationIssue {
  readonly code: WorldAssetReconciliationIssueCode;
  readonly assetKey: string;
  readonly assetId: string | null;
  readonly activeVersionId: string | null;
  readonly bundledDefaultVersionId: string | null;
  readonly severity: 'error' | 'warning';
  readonly recommendation: string;
  readonly automaticActionTaken: false;
  readonly publishedPinsChanged: false;
}

export interface WorldAssetReconciliationResult {
  readonly status: 'reconciled' | 'already_running';
  readonly requestId: string;
  readonly scannedAssetCount: number;
  readonly issueCount: number;
  readonly issues: readonly WorldAssetReconciliationIssue[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly automaticActionCount: 0;
  readonly publishedPinMutationCount: 0;
  readonly recommendationsOnly: true;
}

export interface WorldAssetReconciliationGateway {
  execute(limit: number, afterAssetKey: string | null): Promise<WorldAssetReconciliationResult>;
}

/** One advisory-locked, recommendations-only pass; it never activates or restores art. */
export class WorldAssetReconciliationJob implements WorkerJob<WorldAssetReconciliationResult> {
  public readonly name = 'world-asset-bundled-reconciliation';

  public constructor(
    private readonly gateway: WorldAssetReconciliationGateway,
    private readonly limit = 250,
    private readonly maximumPages = 8,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('World asset reconciliation limit must be between 1 and 500.');
    }
    if (!Number.isInteger(maximumPages) || maximumPages < 1 || maximumPages > 20) {
      throw new RangeError('World asset reconciliation pages must be between 1 and 20.');
    }
  }

  public async execute(): Promise<WorldAssetReconciliationResult> {
    let cursor: string | null = null;
    let requestId = '';
    let scannedAssetCount = 0;
    const issues: WorldAssetReconciliationIssue[] = [];

    for (let page = 0; page < this.maximumPages; page += 1) {
      const result = await this.gateway.execute(this.limit, cursor);
      if (result.status === 'already_running') return result;
      if (requestId === '') requestId = result.requestId;
      scannedAssetCount += result.scannedAssetCount;
      issues.push(...result.issues);
      if (!result.hasMore) {
        return {
          ...result,
          requestId,
          scannedAssetCount,
          issueCount: issues.length,
          issues,
          nextCursor: null,
        };
      }
      if (result.nextCursor === null || result.nextCursor === cursor) {
        throw new Error('World asset reconciliation cursor did not advance.');
      }
      cursor = result.nextCursor;
    }

    return {
      status: 'reconciled',
      requestId,
      scannedAssetCount,
      issueCount: issues.length,
      issues,
      hasMore: true,
      nextCursor: cursor,
      automaticActionCount: 0,
      publishedPinMutationCount: 0,
      recommendationsOnly: true,
    };
  }
}
