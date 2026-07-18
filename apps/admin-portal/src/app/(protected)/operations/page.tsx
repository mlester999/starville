import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';

import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadOperationsSummary } from '../../../lib/player-operations/api';
import { loadRealtimeOverview } from '../../../lib/realtime/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

export default async function OperationsPage() {
  const context = await requireAuthorizedAdmin('operations.read');

  try {
    const summary = await loadOperationsSummary();
    const realtime = hasAdminPermission(context, 'realtime.read')
      ? await loadRealtimeOverview().catch(() => undefined)
      : undefined;
    const metrics = [
      ['Total profiles', summary.players.total, 'Stored Starville player profiles.'],
      ['Active profiles', summary.players.active, 'Profiles without an application suspension.'],
      [
        'Suspended profiles',
        summary.players.suspended,
        'Profiles currently blocked by Starville moderation.',
      ],
      [
        'Rename required',
        summary.players.renameRequired,
        'Profiles blocked from the map until a valid replacement name is saved.',
      ],
      [
        'Created in 24 hours',
        summary.players.createdLast24Hours,
        'Profiles whose immutable creation timestamp is within the last 24 hours.',
      ],
      [
        'Entered in 24 hours',
        summary.players.enteredLast24Hours,
        'Profiles whose protected entry record was updated in the last 24 hours; not online presence.',
      ],
      ['Active access sessions', summary.access.activeSessions, summary.access.definition],
    ] as const;

    return (
      <main className="operations-page" aria-labelledby="operations-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Truthful platform status</p>
            <h1 id="operations-title">Operations</h1>
            <p>
              Bounded database counts and live service readiness only. No inferred online players,
              revenue, activity trends, or placeholder analytics appear here.
            </p>
          </div>
          <span className="permission-badge">Observed {formatDate(summary.generatedAt)}</span>
        </header>
        {hasAdminPermission(context, 'live_operations.read') ? (
          <p>
            <Link className="button button--primary" href="/operations/live">
              Manage live operations
            </Link>
          </p>
        ) : null}
        {hasAdminPermission(context, 'multiplayer_chat.reports.read') ? (
          <p>
            <Link className="button button--secondary" href="/operations/chat">
              Review chat reports
            </Link>
          </p>
        ) : null}
        {hasAdminPermission(context, 'social_interactions.read') ? (
          <p>
            <Link className="button button--secondary" href="/operations/social">
              Review gifts and trades
            </Link>
          </p>
        ) : null}
        {hasAdminPermission(context, 'player_experience.inspect') ? (
          <p>
            <Link className="button button--secondary" href="/operations/player-experience">
              Review Player Experience
            </Link>
          </p>
        ) : null}

        <section aria-labelledby="metrics-title">
          <h2 id="metrics-title">Measured state</h2>
          <dl className="metric-grid">
            {metrics.map(([label, value, definition]) => (
              <div className="metric-card" key={label}>
                <dt>{label}</dt>
                <dd>{value.toLocaleString('en')}</dd>
                <dd className="metric-definition">{definition}</dd>
              </div>
            ))}
          </dl>
        </section>

        {realtime === undefined ? null : (
          <section aria-labelledby="realtime-title">
            <h2 id="realtime-title">Realtime multiplayer</h2>
            <dl className="metric-grid">
              <div className="metric-card">
                <dt>Active sessions</dt>
                <dd>{realtime.activeSessions.toLocaleString('en')}</dd>
                <dd className="metric-definition">
                  Server-admitted sessions with a heartbeat in the last 30 seconds.
                </dd>
              </div>
              <div className="metric-card">
                <dt>Stale sessions</dt>
                <dd>{realtime.staleSessions.toLocaleString('en')}</dd>
                <dd className="metric-definition">
                  Sessions awaiting cleanup after their bounded heartbeat window.
                </dd>
              </div>
              <div className="metric-card">
                <dt>Recent reconnects</dt>
                <dd>{realtime.reconnectingSessions.toLocaleString('en')}</dd>
                <dd className="metric-definition">
                  Connection-loss summaries from the last minute; not inferred activity.
                </dd>
              </div>
              <div className="metric-card">
                <dt>Maintenance impact</dt>
                <dd>{realtime.maintenanceActive ? 'Admission blocked' : 'Open'}</dd>
                <dd className="metric-definition">
                  Active maintenance prevents new admission and disconnects revalidated sessions.
                </dd>
              </div>
            </dl>
            <div className="detail-card">
              <h3>World and channel population</h3>
              {realtime.populations.length === 0 ? (
                <p className="card-note">No enabled channel definitions are available.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>World</th>
                        <th>Channel</th>
                        <th>Active</th>
                        <th>Stale</th>
                        <th>Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtime.populations.map((population) => (
                        <tr key={population.channelId}>
                          <td>{population.worldName}</td>
                          <td>Channel {population.channelNumber}</td>
                          <td>{population.active}</td>
                          <td>{population.stale}</td>
                          <td>
                            {population.active}/{population.capacity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="card-note">
                Observed {formatDate(realtime.generatedAt)}. No wallet, email, token balance,
                session credential, IP address, or moderation history is exposed here.
              </p>
            </div>
            <div className="detail-card">
              <h3>Recent safe disconnect reasons</h3>
              {realtime.recentDisconnects.length === 0 ? (
                <p className="card-note">
                  No disconnect summaries were recorded in the last 24 hours.
                </p>
              ) : (
                <ul className="service-list">
                  {realtime.recentDisconnects.map((item) => (
                    <li key={item.reason}>
                      <div>
                        <strong>{item.reason.replaceAll('_', ' ')}</strong>
                        <span>{item.count}</span>
                      </div>
                      <small>Latest {formatDate(item.latestAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <div className="operations-columns">
          <section className="detail-card" aria-labelledby="services-title">
            <h2 id="services-title">Service readiness</h2>
            <ul className="service-list">
              {summary.services.map((service) => (
                <li key={service.service}>
                  <div>
                    <strong>{service.service}</strong>
                    <span className={`state-chip state-chip--${service.status}`}>
                      {service.status}
                    </span>
                  </div>
                  <small>
                    Checked {formatDate(service.checkedAt)}
                    {service.responseTimeMs === null ? '' : ` · ${service.responseTimeMs} ms`}
                  </small>
                </li>
              ))}
            </ul>
            <p className="card-note">
              Health failures degrade independently and do not create synthetic values.
            </p>
          </section>

          <section className="detail-card" aria-labelledby="token-status-title">
            <h2 id="token-status-title">Token-access configuration</h2>
            <dl className="detail-list">
              <div>
                <dt>Gate</dt>
                <dd>{summary.tokenAccess.enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{summary.tokenAccess.network}</dd>
              </div>
              <div>
                <dt>Requirement</dt>
                <dd>
                  {summary.tokenAccess.requiredAmount} {summary.tokenAccess.symbol}
                </dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>{summary.tokenAccess.validationState}</dd>
              </div>
              <div>
                <dt>Config version</dt>
                <dd>{summary.tokenAccess.configVersion}</dd>
              </div>
            </dl>
            {hasAdminPermission(context, 'token_gate.read') ? (
              <Link className="table-link" href="/token-access">
                Review token access
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main className="operations-page" aria-labelledby="operations-title">
        <h1 id="operations-title">Operations</h1>
        <section className="empty-state" role="alert">
          <h2>{forbidden ? 'Permission required' : 'Operational summary unavailable'}</h2>
          <p>No cached or placeholder metrics are shown.</p>
          <Link className="button button--secondary" href="/operations">
            Try again
          </Link>
        </section>
      </main>
    );
  }
}
