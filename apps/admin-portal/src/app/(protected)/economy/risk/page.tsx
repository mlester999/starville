import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import { economyRiskReviewAction } from '../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { ConfirmedSubmitButton } from '../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyRisk } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RiskQuery {
  readonly category?: string;
  readonly severity?: string;
  readonly confidence?: string;
  readonly status?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly player?: string;
  readonly source?: string;
  readonly shop?: string;
  readonly activity?: string;
  readonly notice?: string;
}

export default async function EconomyRiskPage({
  searchParams,
}: {
  readonly searchParams: Promise<RiskQuery>;
}) {
  const context = await requireAuthorizedAdmin('economy.risk.read');
  const query = await searchParams;
  const { items: allItems } = await loadEconomyRisk({
    category: query.category,
    severity: query.severity,
    confidence: query.confidence,
    status: query.status,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    player: query.player,
    source: query.source,
    shop: query.shop,
    activity: query.activity,
  });
  const normalized = (value: string | undefined) => value?.trim().toLowerCase() ?? '';
  const minimumConfidence = Number(query.confidence ?? '0');
  const from =
    query.dateFrom === undefined || query.dateFrom === ''
      ? null
      : new Date(`${query.dateFrom}T00:00:00.000Z`);
  const to =
    query.dateTo === undefined || query.dateTo === ''
      ? null
      : new Date(`${query.dateTo}T23:59:59.999Z`);
  const items = allItems.filter((signal) => {
    const player = `${signal.displayName ?? ''} ${signal.playerProfileId ?? ''}`.toLowerCase();
    return (
      (normalized(query.category) === '' ||
        signal.category.toLowerCase().includes(normalized(query.category))) &&
      (normalized(query.severity) === '' || signal.severity === query.severity) &&
      (normalized(query.status) === '' || signal.status === query.status) &&
      (!Number.isFinite(minimumConfidence) || signal.confidence >= minimumConfidence) &&
      (normalized(query.player) === '' || player.includes(normalized(query.player))) &&
      (normalized(query.source) === '' ||
        normalized(signal.sourceKey ?? undefined).includes(normalized(query.source))) &&
      (normalized(query.shop) === '' ||
        normalized(signal.shopKey ?? undefined).includes(normalized(query.shop))) &&
      (normalized(query.activity) === '' ||
        normalized(signal.activityKey ?? undefined).includes(normalized(query.activity))) &&
      (from === null || new Date(signal.lastSeenAt) >= from) &&
      (to === null || new Date(signal.firstSeenAt) <= to)
    );
  });
  const canReview = hasAdminPermission(context, 'economy.risk.review');

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Review bounded economy heuristics with safe evidence summaries. Signals support investigation; no account is suspended automatically from a heuristic alone."
        eyebrow="Human decision required"
        title="Risk review"
      />
      <EconomyNotice notice={query.notice} />

      <aside className="economy-safety-note" aria-label="Risk review safety">
        <strong>Signals are not verdicts</strong>
        <p>
          Acknowledge, investigate, resolve, or dismiss based on reviewed evidence. This workspace
          has no suspension action.
        </p>
      </aside>

      <form className="economy-filter-grid" method="get">
        <label>
          Category
          <input defaultValue={query.category ?? ''} maxLength={80} name="category" />
        </label>
        <label>
          Severity
          <select defaultValue={query.severity ?? ''} name="severity">
            <option value="">All severities</option>
            <option value="information">Information</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label>
          Minimum confidence
          <input
            defaultValue={query.confidence ?? ''}
            max="100"
            min="0"
            name="confidence"
            step="1"
            type="number"
          />
        </label>
        <label>
          Review state
          <select defaultValue={query.status ?? ''} name="status">
            <option value="">All states</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="confirmed">Confirmed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
        <label>
          Player
          <input defaultValue={query.player ?? ''} maxLength={128} name="player" />
        </label>
        <label>
          Source
          <input defaultValue={query.source ?? ''} maxLength={80} name="source" />
        </label>
        <label>
          Shop
          <input defaultValue={query.shop ?? ''} maxLength={80} name="shop" />
        </label>
        <label>
          Activity
          <input defaultValue={query.activity ?? ''} maxLength={80} name="activity" />
        </label>
        <label>
          From
          <input defaultValue={query.dateFrom ?? ''} name="dateFrom" type="date" />
        </label>
        <label>
          To
          <input defaultValue={query.dateTo ?? ''} name="dateTo" type="date" />
        </label>
        <div className="economy-filter-grid__actions">
          <button type="submit">Apply filters</button>
          <Link href="/economy/risk">Clear</Link>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState
          description="No risk signals match the current filters."
          title="No signals to review"
        />
      ) : (
        <div className="economy-risk-list">
          {items.map((signal) => (
            <article className="economy-risk-card" key={signal.id}>
              <header>
                <div>
                  <p className="eyebrow">{signal.publicSignalId}</p>
                  <h2>{friendlyKey(signal.category)}</h2>
                </div>
                <div className="economy-status-stack">
                  <StatusChip value={signal.severity} />
                  <StatusChip value={signal.status} />
                </div>
              </header>
              <p className="economy-risk-card__evidence">{signal.safeSummary}</p>
              <dl className="economy-detail-list economy-detail-list--columns">
                <div>
                  <dt>Player</dt>
                  <dd>
                    {signal.displayName ?? 'No player target'}
                    {signal.playerProfileId === null ? '' : ` · ${signal.playerProfileId}`}
                  </dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{signal.confidence.toFixed(1)} / 100</dd>
                </div>
                <div>
                  <dt>First seen</dt>
                  <dd>{formatDate(signal.firstSeenAt)}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>{formatDate(signal.lastSeenAt)}</dd>
                </div>
                <div>
                  <dt>Event count</dt>
                  <dd>{signal.eventCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Context</dt>
                  <dd>
                    {signal.sourceKey ?? signal.shopKey ?? signal.activityKey ?? 'General economy'}
                  </dd>
                </div>
              </dl>
              {canReview && signal.status !== 'resolved' && signal.status !== 'dismissed' ? (
                <div
                  className="economy-card-actions"
                  aria-label={`Review ${signal.publicSignalId}`}
                >
                  {signal.status === 'open' ? (
                    <form action={economyRiskReviewAction}>
                      <input name="signalId" type="hidden" value={signal.id} />
                      <input name="status" type="hidden" value="reviewing" />
                      <button type="submit">Acknowledge</button>
                    </form>
                  ) : null}
                  <form action={economyRiskReviewAction}>
                    <input name="signalId" type="hidden" value={signal.id} />
                    <input name="status" type="hidden" value="confirmed" />
                    <ConfirmedSubmitButton confirmation="Record that this signal requires continued investigation? This does not suspend the player.">
                      Investigate
                    </ConfirmedSubmitButton>
                  </form>
                  <form action={economyRiskReviewAction}>
                    <input name="signalId" type="hidden" value={signal.id} />
                    <input name="status" type="hidden" value="resolved" />
                    <ConfirmedSubmitButton confirmation="Resolve this reviewed signal?">
                      Resolve
                    </ConfirmedSubmitButton>
                  </form>
                  <form action={economyRiskReviewAction}>
                    <input name="signalId" type="hidden" value={signal.id} />
                    <input name="status" type="hidden" value="dismissed" />
                    <ConfirmedSubmitButton confirmation="Dismiss this signal after reviewing its evidence?">
                      Dismiss
                    </ConfirmedSubmitButton>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
