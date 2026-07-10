import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default async function OverviewPage() {
  const context = await requireAuthorizedAdmin('overview.read');

  return (
    <main className="overview" aria-labelledby="overview-title">
      <section className="overview__intro">
        <p className="eyebrow">Administration foundation</p>
        <h1 id="overview-title">Welcome, {context.displayName}</h1>
        <p>
          Your identity, administrator record, role, trusted session, permission version, and MFA
          assurance have passed server and database authorization.
        </p>
      </section>

      <section className="access-card" aria-labelledby="access-title">
        <div>
          <p className="access-card__label">Current access</p>
          <h2 id="access-title">{context.roleName}</h2>
        </div>
        <span className="status-chip">
          <span aria-hidden="true" />
          Authorized
        </span>
        <dl className="access-details">
          <div>
            <dt>Assurance</dt>
            <dd>{context.assuranceLevel.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Session expires</dt>
            <dd>{formatDateTime(context.sessionExpiresAt)} UTC</dd>
          </div>
          <div>
            <dt>Session status</dt>
            <dd>Active</dd>
          </div>
          <div>
            <dt>Last verified login</dt>
            <dd>
              {context.lastLoginAt === null
                ? 'First verified login'
                : `${formatDateTime(context.lastLoginAt)} UTC`}
            </dd>
          </div>
          <div>
            <dt>MFA policy</dt>
            <dd>{context.mfaRequired ? 'Required' : 'Not required'}</dd>
          </div>
        </dl>
      </section>

      <aside className="phase-note" aria-label="Current phase scope">
        <span aria-hidden="true">✦</span>
        <div>
          <strong>Phase 2 is intentionally focused.</strong>
          <p>
            Operational dashboards, player data, live-economy controls, and content tools are not
            implemented in this phase.
          </p>
        </div>
      </aside>
    </main>
  );
}
