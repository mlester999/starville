import { randomUUID } from 'node:crypto';

import { hasAdminPermission } from '@starville/admin-auth';
import { createLogger } from '@starville/logger';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { WorldAssetEmptyState } from '../../../../../../components/world-asset-empty-state';
import { WorldAssetVersionWorkspace } from '../../../../../../components/world-asset-version-workspace';
import {
  loadAssetDetail,
  loadAssetReferences,
  loadAssetVersionDetail,
} from '../../../../../../lib/world-assets/api';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../../../../lib/world-assets/authorization';
import {
  canonicalWorldAssetPath,
  canonicalWorldAssetVersionPath,
  resolveAssetVersionRead,
} from '../../../../../../lib/world-assets/version-recovery';
import { deriveAssetVersionEditability } from '../../../../../../lib/world-assets/workspace-model';
import {
  activeAssetVersion,
  latestAssetCandidate,
  versionUsage,
} from '../../../../../../lib/world-assets/review-model';
import { loadAssetSceneWorldDirectory } from '../../../../../../lib/world-assets/scene-preview-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const logger = createLogger({
  service: 'admin-portal',
  environment:
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development',
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});

export default async function AssetVersionPage(props: {
  readonly params: Promise<{ readonly assetId: string; readonly versionId: string }>;
}) {
  const context = await requireAssetManagerPermission('assets.read');
  const capabilities = assetManagerCapabilities(context);
  const parameters = await props.params;
  const canonicalAssetId = z.uuid().safeParse(parameters.assetId);
  if (!canonicalAssetId.success) notFound();
  const attemptedVersionId = z.uuid().safeParse(parameters.versionId);
  const requestId = randomUUID();
  const log = logger.child({
    requestId,
    canonicalAssetId: canonicalAssetId.data,
    attemptedVersionId: parameters.versionId,
  });
  const resolution = await resolveAssetVersionRead({
    ...(attemptedVersionId.success
      ? {
          loadVersion: () =>
            loadAssetVersionDetail(canonicalAssetId.data, attemptedVersionId.data, requestId),
        }
      : {}),
    loadCanonicalAsset: () => loadAssetDetail(canonicalAssetId.data, requestId),
    log: ({ requestStage, errorCategory }) =>
      log.warn('admin.asset.version_route_recovery', { requestStage, errorCategory }),
  });

  if (resolution.kind === 'recover') {
    redirect(`${canonicalWorldAssetPath(resolution.asset.asset.id)}?recovery=stale-version`);
  }
  if (resolution.kind === 'missing_asset') notFound();
  if (resolution.kind === 'retryable') {
    return (
      <main
        className="operations-page world-assets-page admin-content-shell"
        aria-labelledby="asset-version-title"
      >
        <h1 id="asset-version-title">Asset Version</h1>
        <WorldAssetEmptyState
          action={
            <>
              <Link
                className="button button--primary"
                href={canonicalWorldAssetVersionPath(canonicalAssetId.data, parameters.versionId)}
              >
                Try again
              </Link>{' '}
              <Link
                className="button button--secondary"
                href={canonicalWorldAssetPath(canonicalAssetId.data)}
              >
                Return to canonical asset
              </Link>
            </>
          }
          alert
          description="The trusted asset service did not complete this read. No private intake image, cached derivative, or synthetic version is shown."
          title="Asset version temporarily unavailable"
        />
      </main>
    );
  }

  const { detail } = resolution;
  const [canonicalDetail, references, sceneWorldDirectory] = await Promise.all([
    loadAssetDetail(detail.asset.id, randomUUID()),
    loadAssetReferences(detail.asset.id, 1, 100, randomUUID()),
    loadAssetSceneWorldDirectory({
      canReadWorlds: hasAdminPermission(context, 'maps.read'),
      canPreviewDrafts: hasAdminPermission(context, 'maps.preview'),
    }),
  ]);
  const activeVersion = activeAssetVersion(canonicalDetail);
  const latestCandidate = latestAssetCandidate(canonicalDetail);
  const selectedVersionUsage = versionUsage(detail.version.id, references);
  const editability = deriveAssetVersionEditability({
    detail,
    capabilities,
    administratorRole: context.roleKey,
    administratorRoleName: context.roleName,
  });
  return (
    <main
      className="operations-page world-assets-page admin-content-shell"
      aria-labelledby="asset-version-title"
    >
      <Link className="back-link" href={canonicalWorldAssetPath(detail.asset.id)}>
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
        activeVersion={activeVersion}
        capabilities={capabilities}
        currentAdministrator={{
          id: context.userId,
          displayName: context.displayName,
          roleName: context.roleName,
        }}
        detail={detail}
        editability={editability}
        environment={process.env.NEXT_PUBLIC_APP_ENV ?? 'development'}
        latestCandidate={latestCandidate}
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
        referenceSummary={canonicalDetail.referenceSummary}
        saveRequestId={randomUUID()}
        selectedVersionUsage={selectedVersionUsage}
        sceneWorldDirectory={sceneWorldDirectory}
      />
    </main>
  );
}
