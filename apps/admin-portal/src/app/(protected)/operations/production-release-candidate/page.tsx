import {
  PRODUCTION_EVIDENCE_STATUSES,
  STARVILLE_PRODUCTION_RELEASE_EVIDENCE,
  summarizeProductionRelease,
} from '@starville/live-operations';
import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const label = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ');

const stageFacts = [
  ['Environment', 'starville-prod · target evidence missing'],
  ['Git commit', 'Unapproved · release inputs uncommitted'],
  ['Migrations', '85 locally verified · production not applied'],
  ['Reference data', 'Manifest v1 · production not installed'],
  ['World revision', 'Missing owner-approved revision'],
  ['Asset manifest', 'V1 fallback · selection pending'],
  ['Audio manifest', 'v1 provenance valid · owner listening pending'],
  ['Public access', 'Closed · exact lock verification pending'],
] as const;

const readinessFacts = [
  ['API health', 'Production evidence missing'],
  ['Realtime health', 'Production evidence missing'],
  ['Worker health', 'Production evidence missing'],
  ['Database lint', 'Production evidence missing'],
  ['pgTAP', 'Production evidence missing'],
  ['RLS and grants', 'Production evidence missing'],
  ['Token access', 'Production evidence missing'],
  ['Reconciliation', 'Production evidence missing'],
  ['QA cleanup', 'Not started'],
  ['Release freeze', 'Not started'],
  ['Backup and restore', 'Provider evidence missing'],
  ['Rollback', 'Rehearsal not started'],
] as const;

export default async function ProductionReleaseCandidatePage() {
  await requireAuthorizedAdmin('operations.read');
  const summary = summarizeProductionRelease(STARVILLE_PRODUCTION_RELEASE_EVIDENCE);

  return (
    <main className={`operations-page ${styles['page']}`} aria-labelledby="production-rc-title">
      <header className={`operations-intro ${styles['header']}`}>
        <div>
          <p className="eyebrow">Phase 13D · read-only repository evidence</p>
          <h1 id="production-rc-title">Production Release Candidate</h1>
          <p>
            Stage A commissioning evidence and explicit blockers. This page never verifies a live
            target, changes an owner gate, runs a production command, accepts evidence, or opens
            public access.
          </p>
        </div>
        <div className={styles['decision']} data-status="no-go">
          <small>Phase 14 recommendation</small>
          <strong>{summary.phase14Recommendation}</strong>
          <span>Stage A {label(summary.stageA)}</span>
        </div>
      </header>

      <section className={styles['warning']} aria-labelledby="commissioning-blocker-title">
        <div>
          <p className="eyebrow">Commissioning stop</p>
          <h2 id="commissioning-blocker-title">
            Production commissioning blocked by uncommitted release inputs
          </h2>
          <p>
            An exact reviewed source commit, owner-approved world, production target, domains,
            backup/restore evidence, and predecessor owner gates are required before Stage B.
          </p>
        </div>
        <Link className="button button--secondary" href="/operations/release-live-ops">
          Review capability matrix
        </Link>
      </section>

      <section aria-labelledby="release-identity-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Frozen inputs and missing selections</p>
            <h2 id="release-identity-title">Release identity</h2>
          </div>
          <span>Secrets are never displayed</span>
        </div>
        <dl className={styles['factGrid']}>
          {stageFacts.map(([term, description]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="production-readiness-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Production evidence · not local inference</p>
            <h2 id="production-readiness-title">Commissioning and validation</h2>
          </div>
        </div>
        <dl className={styles['factGrid']}>
          {readinessFacts.map(([term, description]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="evidence-matrix-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Evidence classes stay separate</p>
            <h2 id="evidence-matrix-title">Release evidence matrix</h2>
          </div>
          <span>{summary.total} gates recorded</span>
        </div>
        <div className={styles['legend']} aria-label="Production evidence statuses">
          {PRODUCTION_EVIDENCE_STATUSES.map((status) => (
            <span className={styles['chip']} data-status={status} key={status}>
              {label(status)}
            </span>
          ))}
        </div>
        <div className={styles['summary']}>
          <span>{summary.passedLocal} local passes</span>
          <span>{summary.passedProduction} production passes</span>
          <span>{summary.acceptedOwner} owner acceptances</span>
          <span>{summary.pending} pending</span>
          <span>{summary.missing} missing</span>
          <span>{summary.blocked} blocked</span>
        </div>
        <div className={styles['evidenceGrid']}>
          {STARVILLE_PRODUCTION_RELEASE_EVIDENCE.map((item) => (
            <article className={styles['evidence']} data-status={item.status} key={item.id}>
              <header>
                <h3>{item.label}</h3>
                <span className={styles['chip']} data-status={item.status}>
                  {label(item.status)}
                </span>
              </header>
              <p>{item.detail}</p>
              <footer>
                <span>{label(item.evidenceClass)}</span>
                <span>{item.owner}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <nav className={styles['links']} aria-label="Production release-candidate destinations">
        <Link className="button button--secondary" href="/operations">
          Back to Operations
        </Link>
        <Link className="button button--secondary" href="/operations/live">
          Maintenance and announcements
        </Link>
        <Link className="button button--secondary" href="/worlds">
          World review
        </Link>
        <Link className="button button--secondary" href="/world-assets/review">
          Asset review
        </Link>
      </nav>
    </main>
  );
}
