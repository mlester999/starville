import { parseAdminPublicConfig } from '../lib/public-config';

export default function AdminFoundationPage() {
  const config = parseAdminPublicConfig(process.env);
  const showReadiness = process.env.NODE_ENV === 'development';

  return (
    <main className="admin-shell">
      <section className="admin-card" aria-labelledby="admin-title">
        <p className="admin-kicker">Internal application · Phase 1</p>
        <h1 id="admin-title">STARVILLE ADMIN</h1>
        <p className="admin-message">Administration foundation is ready.</p>
        <p className="admin-scope">
          Authentication and administrator authorization are intentionally not enabled in this
          phase.
        </p>

        {showReadiness ? (
          <p className="readiness" role="status">
            <span className="readiness-dot" aria-hidden="true" />
            Admin shell ready · {config.environment}
          </p>
        ) : null}
      </section>
    </main>
  );
}
