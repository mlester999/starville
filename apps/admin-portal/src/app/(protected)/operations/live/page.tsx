import { hasAdminPermission } from '@starville/admin-auth';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';

import { AnnouncementEditor } from '../../../../components/announcement-editor';
import { AnnouncementFilters } from '../../../../components/announcement-filters';
import { AnnouncementStatusControl } from '../../../../components/announcement-status-control';
import { MaintenanceControl } from '../../../../components/maintenance-control';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadLiveOperations } from '../../../../lib/live-operations/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function allowed(
  value: string | string[] | undefined,
  options: readonly string[],
  fallback: string,
) {
  return typeof value === 'string' && options.includes(value) ? value : fallback;
}

function availabilityPresentation(
  maintenance: Awaited<ReturnType<typeof loadLiveOperations>>['maintenance'],
) {
  if (maintenance.state === 'configuration_error') {
    return { label: 'Unavailable', tone: 'error' as const };
  }
  if (maintenance.state === 'scheduled') {
    return { label: 'Scheduled', tone: 'scheduled' as const };
  }
  if (maintenance.active && maintenance.expectedEndAt !== null) {
    const remaining = new Date(maintenance.expectedEndAt).valueOf() - Date.now();
    if (remaining > 0 && remaining <= 30 * 60_000) {
      return { label: 'Ending soon', tone: 'active' as const };
    }
  }
  if (maintenance.active) {
    return { label: 'ACTIVE', tone: 'active' as const };
  }
  return { label: 'LIVE', tone: 'live' as const };
}

function noticeMessage(notice: string | undefined): {
  readonly tone: 'success' | 'warning';
  readonly title: string;
  readonly text: string;
  readonly steps?: readonly string[];
} | null {
  switch (notice) {
    case 'maintenance-enabled':
    case 'maintenance-scheduled':
    case 'maintenance-disabled':
    case 'maintenance-updated':
      return null;
    case 'invalid-maintenance':
      return {
        tone: 'warning',
        title: 'Maintenance was not saved',
        text: 'Nothing was changed on the server. Use the checklist below, then try again from the form.',
        steps: [
          'Turn Enable maintenance on if you want it active.',
          'Choose Start immediately or Schedule for later.',
          'Fill Title and Player message.',
          'Click Review maintenance change.',
          'Enter a reason of at least 12 characters.',
          'For immediate enable, type MAINTENANCE in all caps, then confirm.',
        ],
      };
    case 'announcement-saved':
      return {
        tone: 'success',
        title: 'Announcement saved',
        text: 'The announcement draft was saved.',
      };
    case 'announcement-updated':
      return {
        tone: 'success',
        title: 'Announcement updated',
        text: 'The announcement lifecycle change was applied.',
      };
    case 'invalid-announcement':
    case 'invalid-status':
      return {
        tone: 'warning',
        title: 'Announcement was not saved',
        text: 'Check the announcement form, enter a reason of at least 12 characters, and try again.',
      };
    default:
      return null;
  }
}

export default async function LiveOperationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireAuthorizedAdmin('live_operations.read');
  const raw = await searchParams;
  const notice = noticeMessage(typeof raw['notice'] === 'string' ? raw['notice'] : undefined);
  const query = {
    search: typeof raw['search'] === 'string' ? raw['search'].slice(0, 100) : '',
    status: allowed(
      raw['status'],
      ['all', 'draft', 'scheduled', 'active', 'expired', 'deactivated', 'archived'],
      'all',
    ),
    severity: allowed(
      raw['severity'],
      ['all', 'information', 'success', 'warning', 'critical'],
      'all',
    ),
    presentation: allowed(raw['presentation'], ['all', 'ticker', 'banner'], 'all'),
    sort: allowed(
      raw['sort'],
      ['updated_at', 'priority', 'starts_at', 'internal_title'],
      'updated_at',
    ),
    direction: allowed(raw['direction'], ['asc', 'desc'], 'desc'),
    page: String(Math.max(1, Number(raw['page']) || 1)),
    pageSize: '25',
    auditPage: String(Math.max(1, Number(raw['auditPage']) || 1)),
    auditPageSize: '25',
  };
  let snapshot: Awaited<ReturnType<typeof loadLiveOperations>>;
  try {
    snapshot = await loadLiveOperations(query);
  } catch {
    return (
      <main className="operations-page" aria-labelledby="live-operations-unavailable">
        <section className="empty-state" role="alert">
          <p className="eyebrow">Live operations</p>
          <h1 id="live-operations-unavailable">Configuration unavailable</h1>
          <p>
            The trusted backend could not provide a current configuration. Game health is not
            inferred and no placeholder state is shown.
          </p>
          <Link className="button button--secondary" href="/operations/live">
            Try again
          </Link>
        </section>
      </main>
    );
  }
  const canMaintain = hasAdminPermission(context, 'live_operations.manage');
  const canAnnounce = hasAdminPermission(context, 'announcements.manage');
  const maintenance = snapshot.maintenance;
  const availability = availabilityPresentation(maintenance);
  const hasAnnouncements = snapshot.announcements.length > 0;
  const hasAudit = snapshot.audit.length > 0;

  return (
    <main className="operations-page live-operations-page" aria-labelledby="live-operations-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Server-authoritative player messaging</p>
          <h1 id="live-operations-title">Live Operations</h1>
          <p>
            Schedule maintenance and publish bounded game announcements. Every mutation requires a
            reason and is audited.
          </p>
        </div>
        <span className={`live-ops-header-status live-ops-header-status--${availability.tone}`}>
          {availability.label}
        </span>
      </header>

      {notice ? (
        <div
          className={`live-ops-notice live-ops-notice--${notice.tone}`}
          role={notice.tone === 'warning' ? 'alert' : 'status'}
        >
          <strong>{notice.title}</strong>
          <p>{notice.text}</p>
          {notice.steps !== undefined && notice.steps.length > 0 ? (
            <ol className="live-ops-notice__steps">
              {notice.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {notice.tone === 'warning' ? (
            <p className="live-ops-notice__action">
              <a href="#maintenance-config-title">Go to maintenance form</a>
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="detail-card" aria-labelledby="maintenance-config-title">
        <h2 id="maintenance-config-title">Maintenance configuration</h2>
        <MaintenanceControl
          canManage={canMaintain}
          maintenance={maintenance}
          requestId={randomUUID()}
        />
      </section>

      <section className="maintenance-preview" aria-labelledby="maintenance-preview-title">
        <p className="eyebrow">Player-facing maintenance preview</p>
        <h2 id="maintenance-preview-title">{maintenance.title}</h2>
        <div className="maintenance-preview__body">
          {maintenance.message.split('\n').map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
        {maintenance.updateDetails.length > 0 ? (
          <ul className="maintenance-preview__details">
            {maintenance.updateDetails.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
        {maintenance.expectedReturnMessage ? (
          <p className="maintenance-preview__return">{maintenance.expectedReturnMessage}</p>
        ) : null}
        {maintenance.showReturnToLanding ||
        (maintenance.ctaLabel !== null && maintenance.ctaUrl !== null) ? (
          <div className="maintenance-preview__actions">
            {maintenance.showReturnToLanding ? (
              <span className="button button--secondary" aria-hidden="true">
                Return to landing
              </span>
            ) : null}
            {maintenance.ctaLabel !== null && maintenance.ctaUrl !== null ? (
              <span className="button button--primary" aria-hidden="true">
                {maintenance.ctaLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <small className="maintenance-preview__meta">
          Last updated {new Date(maintenance.updatedAt).toISOString()} UTC
        </small>
      </section>

      <section
        className="detail-card"
        id="create-announcement"
        aria-labelledby="create-announcement-title"
      >
        <h2 id="create-announcement-title">Create announcement</h2>
        {canAnnounce ? (
          <AnnouncementEditor requestId={randomUUID()} variant="panel" />
        ) : (
          <p className="read-only-notice">
            Read-only access. Announcement changes require <code>announcements.manage</code>.
          </p>
        )}
      </section>

      <section className="detail-card" aria-labelledby="announcements-title">
        <h2 id="announcements-title">Announcements</h2>
        <AnnouncementFilters query={query} />

        {!hasAnnouncements ? (
          <section className="empty-state empty-state--compact" aria-live="polite">
            <h3>No announcements yet</h3>
            <p>Create an announcement to display a message in the Starville game client.</p>
            {canAnnounce ? (
              <a className="button button--primary" href="#create-announcement">
                Create Announcement
              </a>
            ) : null}
          </section>
        ) : (
          <>
            <div
              className="data-table-region live-ops-table-region"
              role="region"
              aria-label="Announcements"
              tabIndex={0}
            >
              <table className="data-table live-ops-table">
                <thead>
                  <tr>
                    <th scope="col">Announcement</th>
                    <th scope="col">State</th>
                    <th scope="col">Window</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.announcements.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Announcement">
                        <strong>{item.internalTitle}</strong>
                        <small>{item.message}</small>
                      </td>
                      <td data-label="State">
                        {item.effectiveStatus} · r{item.revision}
                      </td>
                      <td data-label="Window">
                        {item.startsAt ?? 'On publish'} → {item.endsAt ?? 'Open'}
                      </td>
                      <td data-label="Action">
                        {canAnnounce ? (
                          <div className="live-ops-row-actions">
                            <AnnouncementStatusControl
                              id={item.id}
                              mandatory={!item.dismissible}
                              message={item.message}
                              requestId={randomUUID()}
                              revision={item.revision}
                              severity={item.severity}
                              status={item.lifecycleStatus}
                              title={item.internalTitle}
                            />
                            {item.lifecycleStatus === 'draft' ? (
                              <AnnouncementEditor announcement={item} requestId={randomUUID()} />
                            ) : null}
                            <AnnouncementEditor
                              announcement={item}
                              duplicate
                              requestId={randomUUID()}
                            />
                          </div>
                        ) : (
                          'Read only'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Announcement pages">
              {snapshot.announcementPage > 1 ? (
                <Link
                  href={{
                    pathname: '/operations/live',
                    query: { ...query, page: String(snapshot.announcementPage - 1) },
                  }}
                >
                  Previous
                </Link>
              ) : (
                <span className="is-disabled" aria-hidden="true">
                  Previous
                </span>
              )}
              <span>
                Page {snapshot.announcementPage} of {Math.max(snapshot.announcementTotalPages, 1)} ·{' '}
                {snapshot.announcementTotal} records
              </span>
              {snapshot.announcementPage < snapshot.announcementTotalPages ? (
                <Link
                  href={{
                    pathname: '/operations/live',
                    query: { ...query, page: String(snapshot.announcementPage + 1) },
                  }}
                >
                  Next
                </Link>
              ) : (
                <span className="is-disabled" aria-hidden="true">
                  Next
                </span>
              )}
            </nav>
          </>
        )}
      </section>

      <section className="detail-card audit-section" aria-labelledby="audit-history-title">
        <h2 id="audit-history-title">Audit history</h2>
        {!hasAudit ? (
          <section className="empty-state empty-state--compact" aria-live="polite">
            <h3>No Live Operations activity yet</h3>
            <p>
              Maintenance and announcement changes will appear here after an authorized
              administrator performs an action.
            </p>
          </section>
        ) : (
          <>
            <ul className="service-list">
              {snapshot.audit.map((item) => (
                <li key={item.id}>
                  <strong>{item.event}</strong>
                  <span>{item.reason}</span>
                  <small>
                    {new Date(item.createdAt).toISOString()} UTC · request {item.requestId}
                  </small>
                </li>
              ))}
            </ul>
            <nav className="pagination" aria-label="Audit pages">
              {snapshot.auditPage > 1 ? (
                <Link
                  href={{
                    pathname: '/operations/live',
                    query: { ...query, auditPage: String(snapshot.auditPage - 1) },
                  }}
                >
                  Previous audit page
                </Link>
              ) : (
                <span className="is-disabled" aria-hidden="true">
                  Previous audit page
                </span>
              )}
              <span>
                Page {snapshot.auditPage} of {Math.max(snapshot.auditTotalPages, 1)} ·{' '}
                {snapshot.auditTotal} events
              </span>
              {snapshot.auditPage < snapshot.auditTotalPages ? (
                <Link
                  href={{
                    pathname: '/operations/live',
                    query: { ...query, auditPage: String(snapshot.auditPage + 1) },
                  }}
                >
                  Next audit page
                </Link>
              ) : (
                <span className="is-disabled" aria-hidden="true">
                  Next audit page
                </span>
              )}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
