import { randomUUID } from 'node:crypto';

import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldDraftPreview } from '../../../../../../components/world-draft-preview';
import { WorldGameTestLauncher } from '../../../../../../components/world-game-test-launcher';
import { AdminApiError } from '../../../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../../../lib/auth/authorization';
import { parseAdminPublicConfig } from '../../../../../../lib/public-config';
import { compareWorldRevisions, loadWorldRevision } from '../../../../../../lib/worlds/api';
import { loadWorldGameTestStatus } from '../../../../../../lib/worlds/game-test-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function summaryLabel(key: string): string {
  return key.replace(/([A-Z])/gu, ' $1').replace(/^./u, (value) => value.toUpperCase());
}

export default async function WorldRevisionPage(props: {
  readonly params: Promise<{ readonly mapId: string; readonly versionId: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAuthorizedAdmin('maps.read');
  const parameters = await props.params;
  const searchParameters = await props.searchParams;
  const parsed = z.object({ mapId: z.uuid(), versionId: z.uuid() }).safeParse(parameters);
  const returnedGameTestSession = z
    .uuid()
    .safeParse(
      typeof searchParameters['gameTestSessionId'] === 'string'
        ? searchParameters['gameTestSessionId']
        : undefined,
    );
  if (!parsed.success) notFound();
  const config = parseAdminPublicConfig(process.env);

  try {
    const revision = await loadWorldRevision(parsed.data.mapId, parsed.data.versionId);
    const canPreview = hasAdminPermission(context, 'maps.preview');
    const [comparison, gameTestStatus] = await Promise.all([
      revision.map.activePublishedVersionId !== null &&
      revision.map.activePublishedVersionId !== revision.version.id
        ? compareWorldRevisions(
            revision.map.id,
            revision.map.activePublishedVersionId,
            revision.version.id,
          ).catch(() => null)
        : Promise.resolve(null),
      canPreview && context.assuranceLevel === 'aal2'
        ? loadWorldGameTestStatus(revision.map.id, revision.version.id, randomUUID()).catch(
            () => null,
          )
        : Promise.resolve(null),
    ]);
    const previewable =
      ['validated', 'published', 'superseded'].includes(revision.version.lifecycleStatus) &&
      revision.version.validationStatus === 'valid';

    return (
      <main className="world-preview-page" aria-labelledby="revision-title">
        <header className="operations-intro">
          <div>
            <Link className="back-link" href={`/worlds/${revision.map.id}`}>
              ← {revision.map.displayName} history
            </Link>
            <p className="eyebrow">Immutable world revision</p>
            <h1 id="revision-title">Revision {revision.version.versionNumber}</h1>
            <p>
              <code>{revision.version.id}</code> · {revision.version.lifecycleStatus} · checksum{' '}
              <code>{revision.version.checksum?.slice(0, 16) ?? 'unavailable'}…</code>
            </p>
          </div>
          {revision.isDraftHead && hasAdminPermission(context, 'maps.edit') ? (
            <Link
              className="button button--primary"
              href={`/worlds/${revision.map.id}/editor?version=${revision.version.id}`}
            >
              Open current draft head
            </Link>
          ) : (
            <span className="state-chip state-chip--success">Read-only history</span>
          )}
        </header>

        <section className="detail-card" aria-labelledby="revision-summary-title">
          <h2 id="revision-summary-title">Stored change summary</h2>
          <dl className="detail-list">
            <div>
              <dt>Revision kind</dt>
              <dd>{revision.revisionMetadata.revisionKind.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Parent revision</dt>
              <dd>{revision.revisionMetadata.parentRevisionId ?? 'Initial or legacy revision'}</dd>
            </div>
            {Object.entries(revision.revisionMetadata.changeSummary)
              .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{summaryLabel(key)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
        </section>

        {comparison === null ? null : (
          <section className="detail-card" aria-labelledby="revision-impact-title">
            <h2 id="revision-impact-title">Compared with current public revision</h2>
            <p>
              This is a structured data comparison, not a pixel or screenshot difference. Review
              object, collision, interaction, spawn, exit, terrain, and metadata changes before any
              publication or rollback action.
            </p>
            <dl className="detail-list">
              {Object.entries(comparison.changeSummary)
                .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{summaryLabel(key)}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}

        <section className="detail-card" aria-labelledby="revision-test-title">
          <h2 id="revision-test-title">Revision-specific Game Test</h2>
          <WorldGameTestLauncher
            activePublishedVersionId={revision.map.activePublishedVersionId}
            assuranceLevel={context.assuranceLevel}
            canPreview={canPreview}
            checksum={revision.version.checksum}
            dirty={false}
            editVersion={revision.version.editVersion}
            environment={config.environment}
            initialStatus={gameTestStatus}
            mapDisplayName={revision.map.displayName}
            mapId={revision.map.id}
            reopenUrl={new URL('/preview/world', config.gameUrl).toString()}
            returnedSessionId={
              returnedGameTestSession.success ? returnedGameTestSession.data : null
            }
            returnPath={`/worlds/${revision.map.id}/revisions/${revision.version.id}`}
            validated={previewable}
            versionId={revision.version.id}
            versionNumber={revision.version.versionNumber}
          />
        </section>

        {previewable ? (
          <WorldDraftPreview preview={{ ...revision, draftPreview: true }} />
        ) : (
          <section className="empty-state" role="status">
            <h2>Runtime inspection unavailable</h2>
            <p>This revision is retained, but it is not a validated runtime candidate.</p>
          </section>
        )}
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="revision-title">
        <h1 id="revision-title">World revision unavailable</h1>
        <section className="empty-state" role="alert">
          <p>The requested revision could not be inspected safely. No cached manifest is shown.</p>
          <Link className="button button--secondary" href={`/worlds/${parsed.data.mapId}`}>
            Return to world history
          </Link>
        </section>
      </main>
    );
  }
}
