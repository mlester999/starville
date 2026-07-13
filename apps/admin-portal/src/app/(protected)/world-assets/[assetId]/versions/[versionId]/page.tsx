import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldAssetEmptyState } from '../../../../../../components/world-asset-empty-state';
import { WorldAssetVersionWorkspace } from '../../../../../../components/world-asset-version-workspace';
import { AdminApiError } from '../../../../../../lib/admin-api';
import { loadAssetVersionDetail } from '../../../../../../lib/world-assets/api';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../../../../lib/world-assets/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AssetVersionPage(props: {
  readonly params: Promise<{ readonly assetId: string; readonly versionId: string }>;
}) {
  const context = await requireAssetManagerPermission('assets.read');
  const capabilities = assetManagerCapabilities(context);
  const parameters = await props.params;
  const ids = z.object({ assetId: z.uuid(), versionId: z.uuid() }).safeParse(parameters);
  if (!ids.success) notFound();
  try {
    const detail = await loadAssetVersionDetail(ids.data.assetId, ids.data.versionId);
    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-version-title">
        <Link className="back-link" href={`/world-assets/${detail.asset.id}`}>
          ← {detail.asset.friendlyName}
        </Link>
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Production candidate workspace</p>
            <h1 id="asset-version-title">
              {detail.asset.friendlyName} · Version {detail.version.versionNumber}
            </h1>
            <p>
              Configure a sanitized immutable candidate, inspect anchors and collision, then move
              through trusted validation and human review.
            </p>
          </div>
          <span className={`state-chip state-chip--${detail.version.lifecycleStatus}`}>
            {detail.version.lifecycleStatus.replaceAll('_', ' ')}
          </span>
        </header>
        <WorldAssetVersionWorkspace
          capabilities={capabilities}
          detail={detail}
          operationRequestIds={{
            validate: randomUUID(),
            'submit-review': randomUUID(),
            'request-changes': randomUUID(),
            reject: randomUUID(),
            approve: randomUUID(),
            activate: randomUUID(),
            deprecate: randomUUID(),
            archive: randomUUID(),
          }}
          saveRequestId={randomUUID()}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page world-assets-page" aria-labelledby="asset-version-title">
        <h1 id="asset-version-title">Asset Version</h1>
        <WorldAssetEmptyState
          action={
            <Link className="button button--secondary" href={`/world-assets/${ids.data.assetId}`}>
              Return to asset
            </Link>
          }
          alert
          description="No private intake image, cached derivative, or synthetic version is shown."
          title={
            error instanceof AdminApiError && error.status === 403
              ? 'Permission required'
              : 'Asset version unavailable'
          }
        />
      </main>
    );
  }
}
