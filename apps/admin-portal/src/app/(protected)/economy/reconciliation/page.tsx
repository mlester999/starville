import Link from 'next/link';

import { economyReconciliationAction } from '../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  MetricCard,
  StatusChip,
  formatDate,
} from '../../../../components/economy-admin-ui';
import { ConfirmedSubmitButton } from '../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyReconciliation } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EconomyReconciliationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  await requireAuthorizedAdmin('economy.audit.read');
  const [query, reconciliation] = await Promise.all([searchParams, loadEconomyReconciliation()]);
  const summary = reconciliation.summary;

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Compare stored balances with immutable ledger evidence. Runs record differences for human review and never rewrite a balance automatically."
        eyebrow="Exact ledger integrity"
        title="Reconciliation"
      />
      <EconomyNotice notice={query.notice} />

      <div
        className="economy-metrics-grid economy-metrics-grid--compact"
        aria-label="Reconciliation summary"
      >
        <MetricCard label="Balanced" value={summary.balanced.toLocaleString()} />
        <MetricCard label="Pending" value={summary.pending.toLocaleString()} />
        <MetricCard label="Mismatches" value={summary.mismatch.toLocaleString()} />
        <MetricCard label="Blocked" value={summary.blocked.toLocaleString()} />
        <MetricCard label="Reviewed" value={summary.reviewed.toLocaleString()} />
        <MetricCard label="Worker" value={<StatusChip value={summary.workerStatus} />} />
        <MetricCard label="Last run" value={formatDate(summary.lastRunAt)} />
        <MetricCard
          label="Duration"
          value={
            summary.lastDurationMs === null
              ? 'Unavailable'
              : `${summary.lastDurationMs.toLocaleString()} ms`
          }
        />
      </div>

      <section className="economy-overview-columns" aria-label="Run reconciliation">
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Focused evidence</p>
              <h2>Single-player run</h2>
            </div>
          </div>
          <p>
            Use a verified public player profile identifier. The result is evidence, not a repair.
          </p>
          <form action={economyReconciliationAction} className="economy-inline-form">
            <label>
              Player profile UUID
              <input name="playerProfileId" required />
            </label>
            <button type="submit">Run player reconciliation</button>
          </form>
        </article>
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Bounded batch</p>
              <h2>Global run</h2>
            </div>
          </div>
          <p>
            Checks the server-defined bounded batch. There is deliberately no Repair All action.
          </p>
          <form action={economyReconciliationAction}>
            <input name="playerProfileId" type="hidden" value="" />
            <ConfirmedSubmitButton confirmation="Run a bounded global reconciliation? This records evidence and will not change any balance.">
              Run global reconciliation
            </ConfirmedSubmitButton>
          </form>
        </article>
      </section>

      <section aria-labelledby="reconciliation-results-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Difference evidence</p>
            <h2 id="reconciliation-results-heading">Recent results</h2>
          </div>
        </div>
        {reconciliation.results.length === 0 ? (
          <EmptyState
            description="A completed run will add immutable comparison evidence here."
            title="No reconciliation results"
          />
        ) : (
          <div className="economy-table-region">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Stored balance</th>
                  <th>Ledger balance</th>
                  <th>Difference</th>
                  <th>Status</th>
                  <th>Evidence time</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.results.map((result) => (
                  <tr key={result.id}>
                    <td data-label="Player">
                      <strong>{result.displayName}</strong>
                      <small>{result.playerProfileId}</small>
                    </td>
                    <td data-label="Stored balance">
                      {result.storedBalance.toLocaleString()} DUST
                    </td>
                    <td data-label="Ledger balance">
                      {result.ledgerBalance.toLocaleString()} DUST
                    </td>
                    <td
                      className={
                        result.difference === 0
                          ? undefined
                          : 'economy-amount economy-amount--warning'
                      }
                      data-label="Difference"
                    >
                      {result.difference > 0 ? '+' : ''}
                      {result.difference.toLocaleString()} DUST
                    </td>
                    <td data-label="Status">
                      <StatusChip value={result.status} />
                    </td>
                    <td data-label="Evidence time">{formatDate(result.createdAt)}</td>
                    <td data-label="Next step">
                      {result.status === 'mismatch' ? (
                        <Link
                          href={`/economy/corrections?playerProfileId=${result.playerProfileId}&delta=${-result.difference}&reconciliation=${result.id}`}
                        >
                          Create reviewed correction
                        </Link>
                      ) : (
                        'No correction needed'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="reconciliation-runs-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Run evidence</p>
            <h2 id="reconciliation-runs-heading">Recent runs</h2>
          </div>
        </div>
        {reconciliation.runs.length === 0 ? (
          <EmptyState
            description="No bounded reconciliation has been recorded yet."
            title="No runs"
          />
        ) : (
          <div className="economy-table-region">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Checked</th>
                  <th>Mismatches</th>
                  <th>Completed</th>
                  <th>Failure</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.runs.map((run) => (
                  <tr key={run.id}>
                    <td data-label="Started">{formatDate(run.startedAt)}</td>
                    <td data-label="Scope">
                      {run.scope === 'player'
                        ? `Player · ${run.playerProfileId}`
                        : 'Bounded global'}
                    </td>
                    <td data-label="Status">
                      <StatusChip value={run.status} />
                    </td>
                    <td data-label="Checked">{run.checkedCount.toLocaleString()}</td>
                    <td data-label="Mismatches">{run.mismatchCount.toLocaleString()}</td>
                    <td data-label="Completed">{formatDate(run.completedAt)}</td>
                    <td data-label="Failure">{run.failureCode ?? 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
