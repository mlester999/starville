import {
  OPERATIONAL_CAPABILITY_STATUSES,
  STARVILLE_OPERATIONAL_CAPABILITIES,
  summarizeOperationalCapabilities,
} from '@starville/live-operations';
import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusLabel = (status: string) => status.replaceAll('_', ' ');

const ownerGates = [
  ['Production domains and deployment provider', 'Production owner'],
  ['starville-prod Supabase project and recovery policy', 'Database owner'],
  ['Reown production project and origin allowlist', 'Wallet integration owner'],
  ['World, visual, audio, and gameplay acceptance', 'Product owner'],
  ['Hosted security and clean-chain evidence', 'Security owner'],
  ['Phase 13D commissioning authorization', 'Production owner'],
] as const;

export default async function ReleaseLiveOperationsPage() {
  await requireAuthorizedAdmin('operations.read');
  const summary = summarizeOperationalCapabilities(STARVILLE_OPERATIONAL_CAPABILITIES);

  return (
    <main className={`operations-page ${styles['page']}`} aria-labelledby="release-live-ops-title">
      <header className={`operations-intro ${styles['header']}`}>
        <div>
          <p className="eyebrow">Phase 13C · local preparation evidence</p>
          <h1 id="release-live-ops-title">Release and Live Ops</h1>
          <p>
            Production-preparation contracts, operational ownership, runbook coverage, and
            unresolved commissioning gates. This read-only view never connects to production,
            accepts an owner gate, applies a seed, publishes content, or deploys.
          </p>
        </div>
        <span className={styles['overall']} data-status="commissioning-pending">
          Phase 13D commissioning pending
        </span>
      </header>

      <section className={styles['boundary']} aria-labelledby="release-boundary-title">
        <div>
          <h2 id="release-boundary-title">Release boundary</h2>
          <p>
            Manifests describe the intended production configuration; placeholders are deliberate
            blockers. Local evidence cannot prove hosted state or owner acceptance.
          </p>
        </div>
        <Link className="button button--secondary" href="/operations">
          Back to Operations
        </Link>
      </section>

      <section aria-labelledby="manifest-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Deterministic repository contracts</p>
            <h2 id="manifest-title">Release manifests</h2>
          </div>
        </div>
        <dl className={styles['facts']}>
          <div>
            <dt>Environment contract</dt>
            <dd>production-environment.v1</dd>
            <small>
              Owner values required; wildcards, localhost, debug, and safety gates rejected.
            </small>
          </div>
          <div>
            <dt>Migration chain</dt>
            <dd>85 ordered migrations</dd>
            <small>Exact filename, timestamp, dependency, and SHA-256 drift validation.</small>
          </div>
          <div>
            <dt>Reference sources</dt>
            <dd>5 allowlisted sources</dd>
            <small>
              V1 fallback accepted; V2/V3 candidates fail closed until owner acceptance.
            </small>
          </div>
          <div>
            <dt>Evidence bundle</dt>
            <dd>Not production-ready</dd>
            <small>Hosted, recovery, domain, Reown, and owner evidence remains pending.</small>
          </div>
        </dl>
      </section>

      <section aria-labelledby="capability-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Operator-to-control traceability</p>
            <h2 id="capability-title">Operational capability matrix</h2>
          </div>
          <span>{summary.total} capabilities recorded</span>
        </div>
        <div className={styles['legend']} aria-label="Operational capability statuses">
          {OPERATIONAL_CAPABILITY_STATUSES.map((status) => (
            <span className={styles['chip']} data-status={status} key={status}>
              {statusLabel(status)}
            </span>
          ))}
        </div>
        <div className={styles['summary']}>
          <span>{summary.ready} ready</span>
          <span>{summary.readyWithLimitations} ready with limitations</span>
          <span>{summary.missing} missing</span>
          <span>{summary.blocked} blocked</span>
        </div>
        <div className={styles['capabilityGrid']}>
          {STARVILLE_OPERATIONAL_CAPABILITIES.map((item) => (
            <article className={styles['capability']} data-status={item.status} key={item.id}>
              <header>
                <h3>{item.name}</h3>
                <span className={styles['chip']} data-status={item.status}>
                  {statusLabel(item.status)}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Operator and permission</dt>
                  <dd>
                    {item.operatorRole} · {item.permission}
                  </dd>
                </div>
                <div>
                  <dt>Surface</dt>
                  <dd>
                    <code>{item.portalSurface}</code>
                  </dd>
                </div>
                <div>
                  <dt>Server authority</dt>
                  <dd>
                    <code>{item.databaseFunction}</code>
                  </dd>
                </div>
                <div>
                  <dt>Concurrency</dt>
                  <dd>{item.concurrency}</dd>
                </div>
                <div>
                  <dt>Audit and rollback</dt>
                  <dd>
                    {item.auditEvidence}. {item.rollback}.
                  </dd>
                </div>
                <div>
                  <dt>Runbook</dt>
                  <dd>
                    <code>{item.runbook}</code>
                  </dd>
                </div>
              </dl>
              {item.limitation === null ? null : (
                <p className={styles['limitation']}>{item.limitation}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles['ownerPanel']} aria-labelledby="owner-gates-title">
        <p className="eyebrow">Human decisions · never inferred</p>
        <h2 id="owner-gates-title">Owner and hosted gates</h2>
        <ul>
          {ownerGates.map(([label, owner]) => (
            <li key={label}>
              <input
                aria-label={`${label}: pending`}
                checked={false}
                disabled
                readOnly
                type="checkbox"
              />
              <div>
                <strong>{label}</strong>
                <small>{owner} · pending</small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles['links']} aria-label="Live operations destinations">
        <Link className="button button--primary" href="/operations/live">
          Maintenance and announcements
        </Link>
        <Link className="button button--secondary" href="/economy/reconciliation">
          Economy reconciliation
        </Link>
        <Link className="button button--secondary" href="/worlds">
          World publication
        </Link>
        <Link className="button button--secondary" href="/world-assets/review">
          Asset review
        </Link>
        <Link className="button button--secondary" href="/operations/beta-readiness">
          Closed-beta readiness
        </Link>
      </nav>
    </main>
  );
}
