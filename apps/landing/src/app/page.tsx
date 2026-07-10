import { parseLandingPublicConfig } from '../lib/public-config';

export default function LandingPage() {
  const config = parseLandingPublicConfig(process.env);
  const showReadiness = process.env.NODE_ENV === 'development';

  return (
    <main className="foundation-shell">
      <section className="foundation-card" aria-labelledby="foundation-title">
        <p className="foundation-kicker">Phase 1 Foundation</p>
        <h1 id="foundation-title">STARVILLE</h1>
        <p className="foundation-message">The world is being prepared.</p>

        {showReadiness ? (
          <p className="readiness" role="status">
            <span className="readiness-dot" aria-hidden="true" />
            Landing shell ready · {config.environment}
          </p>
        ) : null}
      </section>
    </main>
  );
}
