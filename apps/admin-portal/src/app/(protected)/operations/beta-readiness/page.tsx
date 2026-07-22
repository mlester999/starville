import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import {
  BETA_READINESS_STATUSES,
  type BetaReadinessStatus,
} from '../../../../lib/beta-readiness/model';
import { loadLocalBetaReadiness } from '../../../../lib/beta-readiness/repository';

import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string | null): string {
  if (value === null) return 'Not recorded';
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function statusToken(status: BetaReadinessStatus): string {
  return status.toLowerCase().replaceAll(' ', '-');
}

export default async function BetaReadinessPage() {
  await requireAuthorizedAdmin('operations.read');
  const snapshot = loadLocalBetaReadiness();

  return (
    <main className={`operations-page ${styles['page']}`} aria-labelledby="beta-readiness-title">
      <header className={`operations-intro ${styles['header']}`}>
        <div>
          <p className="eyebrow">Read-only local evidence</p>
          <h1 id="beta-readiness-title">Closed-Beta Readiness</h1>
          <p>
            A computed view of repository evidence, pending hosted gates, owner review, deployment
            preparation, and non-destructive rollback preparation for the Phase 13B closed-beta
            hardening candidate.
          </p>
        </div>
        <span
          className={styles['status']}
          data-status={statusToken(snapshot.overallStatus)}
          aria-label={`Overall readiness: ${snapshot.overallStatus}`}
        >
          {snapshot.overallStatus}
        </span>
      </header>

      <section className={styles['boundary']} aria-labelledby="evidence-boundary-title">
        <div>
          <h2 id="evidence-boundary-title">Evidence boundary</h2>
          <p>
            This page reads local files and Git state at request time. It does not query hosted
            services, write readiness state, mark owner acceptance, publish a world, activate V2,
            run a migration, or deploy.
          </p>
        </div>
        <Link className="button button--secondary" href="/operations">
          Back to Operations
        </Link>
      </section>

      <section className={styles['repository']} aria-labelledby="repository-snapshot-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Environment · Local repository</p>
            <h2 id="repository-snapshot-title">Repository snapshot</h2>
          </div>
          <span>Checked {formatDate(snapshot.checkedAt)}</span>
        </div>
        <dl className={styles['facts']}>
          <div>
            <dt>Branch</dt>
            <dd>{snapshot.repository.branch ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{snapshot.repository.revision ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Working tree</dt>
            <dd>
              {snapshot.repository.gitStateAvailable
                ? `${snapshot.repository.dirtyPathCount} changed or untracked paths`
                : 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>Diff check</dt>
            <dd>
              {snapshot.repository.diffCheckPassed === null
                ? 'Unavailable'
                : snapshot.repository.diffCheckPassed
                  ? 'Passed'
                  : 'Blocked'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="status-model-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">No “final” shortcut</p>
            <h2 id="status-model-title">Readiness status model</h2>
          </div>
        </div>
        <div className={styles['legend']} aria-label="Readiness status vocabulary">
          {BETA_READINESS_STATUSES.map((status) => (
            <span className={styles['status']} data-status={statusToken(status)} key={status}>
              {status}
            </span>
          ))}
        </div>
        <div className={styles['gateGrid']}>
          {snapshot.gates.map((gate) => (
            <article
              className={styles['gate']}
              data-status={statusToken(gate.status)}
              key={gate.id}
            >
              <header>
                <h3>{gate.label}</h3>
                <span className={styles['status']} data-status={statusToken(gate.status)}>
                  {gate.status}
                </span>
              </header>
              <p>{gate.summary}</p>
              <dl className={styles['gateFacts']}>
                <div>
                  <dt>Evidence source</dt>
                  <dd>
                    <ul className={styles['sourceList']}>
                      {gate.evidence.map((source) => (
                        <li key={source.key}>
                          <strong>
                            {source.recognized
                              ? 'Recognized'
                              : source.present
                                ? 'Unrecognized'
                                : 'Missing'}
                          </strong>
                          <span>{source.label}</span>
                          <code>{source.path}</code>
                          {source.modifiedAt === null ? null : (
                            <small>Updated {formatDate(source.modifiedAt)}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{formatDate(gate.lastCheckedAt)}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{gate.environment}</dd>
                </div>
                <div>
                  <dt>Responsible gate</dt>
                  <dd>{gate.responsibleGate}</dd>
                </div>
                <div>
                  <dt>Blocking reason</dt>
                  <dd>{gate.blockingReason ?? 'None recorded'}</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>{gate.nextAction}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className={styles['split']}>
        <section className={styles['panel']} aria-labelledby="automated-evidence-title">
          <p className="eyebrow">Repository-derived</p>
          <h2 id="automated-evidence-title">Automated evidence</h2>
          <p>
            Recorded means a local evidence source exists. It does not mean hosted validation or
            owner acceptance passed.
          </p>
          <ul className={styles['checkList']}>
            {snapshot.automatedEvidence.map((item) => (
              <li key={item.id}>
                <span className={styles['checkState']} data-state={item.state.toLowerCase()}>
                  {item.state}
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <code>{item.source}</code>
                  <small>{item.note}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles['panel']} aria-labelledby="owner-acceptance-title">
          <p className="eyebrow">Human decision · never automated</p>
          <h2 id="owner-acceptance-title">Owner acceptance</h2>
          <p>Every owner check remains intentionally unmarked in this read-only area.</p>
          <ul className={styles['ownerList']}>
            {snapshot.ownerAcceptance.map((item) => (
              <li key={item.id}>
                <input
                  aria-label={`${item.label}: owner review pending`}
                  defaultChecked={item.accepted}
                  disabled
                  type="checkbox"
                />
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={styles['panel']} aria-labelledby="deployment-checklist-title">
        <p className="eyebrow">Owner-controlled · no deployment action</p>
        <h2 id="deployment-checklist-title">Deployment checklist</h2>
        <div className={styles['deploymentGrid']}>
          {snapshot.deploymentChecklist.map((item) => (
            <article key={item.id}>
              <div>
                <span>{item.kind}</span>
                <span className={styles['checkState']} data-state={item.state.toLowerCase()}>
                  {item.state}
                </span>
              </div>
              <h3>{item.label}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles['panel']} aria-labelledby="rollback-checklist-title">
        <p className="eyebrow">Prepared locally · not drilled or accepted</p>
        <h2 id="rollback-checklist-title">Rollback checklist</h2>
        <div className={styles['rollbackGrid']}>
          {snapshot.rollbackChecklist.map((item) => (
            <article key={item.id}>
              <header>
                <h3>{item.label}</h3>
                <span className={styles['checkState']} data-state="pending">
                  Owner review pending
                </span>
              </header>
              <p>{item.procedure}</p>
              <p>
                <strong>Preserves:</strong> {item.preserves.join(', ')}.
              </p>
            </article>
          ))}
        </div>
        <p className={styles['safetyNote']}>
          Rollback never uses destructive migrations and must preserve immutable versions, player
          state, and audit history.
        </p>
      </section>
    </main>
  );
}
