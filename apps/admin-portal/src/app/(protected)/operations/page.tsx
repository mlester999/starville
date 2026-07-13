import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';

import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadOperationsSummary } from '../../../lib/player-operations/api';

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
