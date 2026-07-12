import { randomUUID } from 'node:crypto';

import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createWorldDraftAction } from '../../../actions/worlds';
import { WorldAuditList } from '../../../../components/world-audit-list';
import { WorldVersionDialog } from '../../../../components/world-version-dialog';
import { AdminApiError } from '../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadWorldDetail, loadWorldMapAudit } from '../../../../lib/worlds/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string | null): string {
  if (value === null) return 'Not recorded';
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function noticeMessage(value: string | string[] | undefined): string | undefined {
  if (value === 'version-conflict')
    return 'The world changed in another session. Reload and try again.';
  if (value === 'draft-unavailable') return 'A new draft could not be created safely.';
  return undefined;
}

export default async function WorldDetailPage(props: {
  readonly params: Promise<{ readonly mapId: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAuthorizedAdmin('maps.read');
  const { mapId } = await props.params;
  const notice = noticeMessage((await props.searchParams)['notice']);

  try {
    const [detail, audit] = await Promise.all([
      loadWorldDetail(mapId),
      hasAdminPermission(context, 'maps.audit_read')
        ? loadWorldMapAudit(mapId, { page: 1, pageSize: 10, search: '' })
        : Promise.resolve(undefined),
    ]);
    const activeVersionId = detail.map.activePublishedVersionId;
    const openDraft = detail.versions.find((version) =>
      ['draft', 'validated'].includes(version.lifecycleStatus),
    );

    return (
      <main className="operations-page world-detail" aria-labelledby="world-title">
        <header className="operations-intro">
          <div>
            <Link className="back-link" href="/worlds">
              ← World directory
            </Link>
            <p className="eyebrow">Versioned world</p>
            <h1 id="world-title">{detail.map.displayName}</h1>
            <p>{detail.map.description || 'No public map description has been recorded.'}</p>
          </div>
          <span className={`state-chip state-chip--${detail.map.status}`}>{detail.map.status}</span>
        </header>

        {notice === undefined ? null : (
          <p className="notice notice--warning" role="status">
            {notice}
          </p>
        )}

        <div className="detail-grid">
          <section className="detail-card" aria-labelledby="map-record-title">
            <h2 id="map-record-title">Map record</h2>
            <dl className="detail-list">
              <div>
                <dt>Slug</dt>
                <dd>{detail.map.slug}</dd>
              </div>
              <div>
                <dt>Record version</dt>
                <dd>{detail.map.recordVersion}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(detail.map.updatedAt)}</dd>
              </div>
              <div>
                <dt>Active publication</dt>
                <dd>{activeVersionId === null ? 'None' : `${activeVersionId.slice(0, 8)}…`}</dd>
              </div>
            </dl>
          </section>
          <section className="detail-card" aria-labelledby="world-safety-title">
            <h2 id="world-safety-title">Publication boundary</h2>
            <p className="card-note">
              Drafts and previews remain staff-only. Player services resolve only this map’s active,
              immutable published version.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Stored versions</dt>
                <dd>{detail.versions.length}</dd>
              </div>
              <div>
                <dt>Open draft</dt>
                <dd>{openDraft === undefined ? 'None' : `Version ${openDraft.versionNumber}`}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(detail.map.createdAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="player-actions" aria-labelledby="world-actions-title">
          <div>
            <p className="eyebrow">Permission-aware controls</p>
            <h2 id="world-actions-title">World actions</h2>
            <p>Create one isolated draft without modifying any published history.</p>
          </div>
          <div className="player-actions__buttons">
            {hasAdminPermission(context, 'maps.edit') && openDraft === undefined ? (
              <form action={createWorldDraftAction}>
                <input name="mapId" type="hidden" value={detail.map.id} />
                <input
                  name="expectedRecordVersion"
                  type="hidden"
                  value={detail.map.recordVersion}
                />
                <input name="requestId" type="hidden" value={randomUUID()} />
                <button className="button button--primary" type="submit">
                  Create draft
                </button>
              </form>
            ) : null}
            {openDraft !== undefined && hasAdminPermission(context, 'maps.edit') ? (
              <Link
                className="button button--primary"
                href={`/worlds/${detail.map.id}/editor?version=${openDraft.id}`}
              >
                Continue editing
              </Link>
            ) : null}
          </div>
        </section>

        <section className="audit-section" aria-labelledby="versions-title">
          <div>
            <p className="eyebrow">Immutable history</p>
            <h2 id="versions-title">Versions</h2>
          </div>
          {detail.versions.length === 0 ? (
            <p>No versions have been created for this map.</p>
          ) : (
            <div
              className="data-table-region"
              role="region"
              aria-label="World versions"
              tabIndex={0}
            >
              <table className="data-table world-version-table">
                <thead>
                  <tr>
                    <th scope="col">Version</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Validation</th>
                    <th scope="col">Checksum</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.versions.map((version) => (
                    <tr key={version.id}>
                      <td data-label="Version">
                        <strong>{version.versionNumber}</strong>
                        {version.id === activeVersionId ? <small>Active publication</small> : null}
                      </td>
                      <td data-label="Lifecycle">
                        <span className={`state-chip state-chip--${version.lifecycleStatus}`}>
                          {version.lifecycleStatus}
                        </span>
                      </td>
                      <td data-label="Validation">
                        <span className={`state-chip state-chip--${version.validationStatus}`}>
                          {version.validationStatus}
                        </span>
                      </td>
                      <td data-label="Checksum">
                        <code>
                          {version.checksum === null
                            ? 'Pending'
                            : `${version.checksum.slice(0, 12)}…`}
                        </code>
                      </td>
                      <td data-label="Updated">{formatDate(version.updatedAt)}</td>
                      <td data-label="Actions">
                        <div className="table-actions">
                          {['draft', 'validated'].includes(version.lifecycleStatus) &&
                          hasAdminPermission(context, 'maps.edit') ? (
                            <Link
                              className="table-link"
                              href={`/worlds/${detail.map.id}/editor?version=${version.id}`}
                            >
                              Edit
                            </Link>
                          ) : null}
                          {version.lifecycleStatus === 'validated' &&
                          hasAdminPermission(context, 'maps.preview') ? (
                            <Link
                              className="table-link"
                              href={`/worlds/${detail.map.id}/preview?version=${version.id}`}
                            >
                              Preview
                            </Link>
                          ) : null}
                          {version.lifecycleStatus === 'validated' &&
                          hasAdminPermission(context, 'maps.publish') ? (
                            <WorldVersionDialog
                              expectedActiveVersionId={activeVersionId}
                              expectedChecksum={version.checksum}
                              expectedEditVersion={version.editVersion}
                              expectedRecordVersion={detail.map.recordVersion}
                              mapId={detail.map.id}
                              mapName={detail.map.displayName}
                              operation="publish"
                              requestId={randomUUID()}
                              versionId={version.id}
                              versionNumber={version.versionNumber}
                            />
                          ) : null}
                          {['published', 'superseded'].includes(version.lifecycleStatus) &&
                          hasAdminPermission(context, 'maps.edit') ? (
                            <WorldVersionDialog
                              expectedActiveVersionId={activeVersionId}
                              expectedChecksum={version.checksum}
                              expectedEditVersion={version.editVersion}
                              expectedRecordVersion={detail.map.recordVersion}
                              mapId={detail.map.id}
                              mapName={detail.map.displayName}
                              operation="derive"
                              requestId={randomUUID()}
                              versionId={version.id}
                              versionNumber={version.versionNumber}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="audit-section" aria-labelledby="map-audit-title">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Append-only evidence</p>
              <h2 id="map-audit-title">Recent world audit</h2>
            </div>
            {audit === undefined ? null : (
              <Link href={`/world-audit?search=${detail.map.slug}`}>Open full audit</Link>
            )}
          </div>
          {audit === undefined ? (
            <p>Your role cannot read world audit records.</p>
          ) : (
            <WorldAuditList events={audit.items} />
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="world-title">
        <h1 id="world-title">World unavailable</h1>
        <section className="empty-state" role="alert">
          <p>The protected map record could not be loaded. No draft or placeholder is shown.</p>
          <Link className="button button--secondary" href="/worlds">
            Return to worlds
          </Link>
        </section>
      </main>
    );
  }
}
