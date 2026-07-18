import { describe, expect, it, vi } from 'vitest';

import {
  WorldAssetReconciliationJob,
  type WorldAssetReconciliationIssueCode,
} from './world-asset-reconciliation-job.js';
import { createWorldAssetReconciliationGateway } from './world-asset-reconciliation-persistence.js';

describe('WorldAssetReconciliationJob', () => {
  it('runs a bounded recommendations-only pass without changing published pins', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'reconciled',
      requestId: 'worker-world-assets:test',
      scannedAssetCount: 106,
      issueCount: 1,
      issues: [
        {
          code: 'ACTIVE_OVERRIDE_INVALID',
          assetKey: 'lamp-star',
          assetId: '11111111-1111-4111-8111-111111111111',
          activeVersionId: '22222222-2222-4222-8222-222222222222',
          bundledDefaultVersionId: '33333333-3333-4333-8333-333333333333',
          severity: 'warning',
          recommendation: 'review_or_restore_uploaded_override',
          automaticActionTaken: false,
          publishedPinsChanged: false,
        },
      ],
      hasMore: false,
      nextCursor: null,
      automaticActionCount: 0,
      publishedPinMutationCount: 0,
      recommendationsOnly: true,
    });

    const result = await new WorldAssetReconciliationJob({ execute }, 150).execute();

    expect(execute).toHaveBeenCalledWith(150, null);
    expect(result.recommendationsOnly).toBe(true);
    expect(result.automaticActionCount).toBe(0);
    expect(result.publishedPinMutationCount).toBe(0);
    expect(result.issues[0]?.publishedPinsChanged).toBe(false);
  });

  it('accepts every classified Phase 12B issue from the bounded persistence result', async () => {
    const codes = [
      'BUNDLED_CATALOG_MEDIA_METADATA_INVALID',
      'ACTIVE_OVERRIDE_VALIDATION_INVALID',
      'ACTIVE_OVERRIDE_THUMBNAIL_MISSING',
      'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE',
      'APPROVED_OVERRIDE_VALIDATION_INVALID',
      'DEPRECATED_OVERRIDE_ROLLBACK_INVALID',
    ] as const satisfies readonly WorldAssetReconciliationIssueCode[];
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'reconciled',
        requestId: 'worker-world-assets:classified-issues',
        scannedAssetCount: 6,
        issueCount: codes.length,
        issues: codes.map((code, index) => ({
          code,
          assetKey: `phase12b-issue-${String(index + 1)}`,
          assetId: '11111111-1111-4111-8111-111111111111',
          activeVersionId: '22222222-2222-4222-8222-222222222222',
          bundledDefaultVersionId: '33333333-3333-4333-8333-333333333333',
          severity: code.includes('THUMBNAIL') ? 'warning' : 'error',
          recommendation: 'review_classified_asset_state',
          automaticActionTaken: false,
          publishedPinsChanged: false,
        })),
        hasMore: false,
        nextCursor: null,
        automaticActionCount: 0,
        publishedPinMutationCount: 0,
        recommendationsOnly: true,
      },
      error: null,
    });
    const gateway = createWorldAssetReconciliationGateway({ rpc } as never);

    await expect(gateway.execute(25, null)).resolves.toMatchObject({
      issueCount: codes.length,
      issues: codes.map((code) => ({ code })),
    });
  });

  it('rejects unbounded batches', () => {
    expect(() => new WorldAssetReconciliationJob({ execute: vi.fn() }, 501)).toThrow(RangeError);
    expect(() => new WorldAssetReconciliationJob({ execute: vi.fn() }, 100, 21)).toThrow(
      RangeError,
    );
  });

  it('follows bounded cursors and aggregates every page without automatic repair', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'reconciled',
        requestId: 'worker-world-assets:first',
        scannedAssetCount: 100,
        issueCount: 0,
        issues: [],
        hasMore: true,
        nextCursor: 'tree-pine',
        automaticActionCount: 0,
        publishedPinMutationCount: 0,
        recommendationsOnly: true,
      })
      .mockResolvedValueOnce({
        status: 'reconciled',
        requestId: 'worker-world-assets:second',
        scannedAssetCount: 6,
        issueCount: 0,
        issues: [],
        hasMore: false,
        nextCursor: null,
        automaticActionCount: 0,
        publishedPinMutationCount: 0,
        recommendationsOnly: true,
      });

    const result = await new WorldAssetReconciliationJob({ execute }, 100, 2).execute();

    expect(execute).toHaveBeenNthCalledWith(1, 100, null);
    expect(execute).toHaveBeenNthCalledWith(2, 100, 'tree-pine');
    expect(result.scannedAssetCount).toBe(106);
    expect(result.requestId).toBe('worker-world-assets:first');
    expect(result.hasMore).toBe(false);
  });
});
