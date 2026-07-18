import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  EconomyNotice,
  EconomyPageHeader,
  MetricCard,
  StatusChip,
  formatCount,
  formatDate,
  formatDust,
  planningLabel,
} from '../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadEconomyOverview } from '../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EconomyPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('economy.read');
  const query = await searchParams;
  const overview = await loadEconomyOverview();
  const planningRatio = overview.latestSimulation?.sourceToSinkRatio ?? 1.42;

  return (
    <main className="economy-page" id="economy-main" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Review DUST supply, versioned sources and sinks, operator queues, and isolated planning results. Every balance change remains server-authoritative and receipt-backed."
        eyebrow="Off-chain economy operations"
        title="Economy overview"
      />
      <EconomyNotice notice={query.notice} />

      <section aria-labelledby="supply-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">DUST health</p>
            <h2 id="supply-heading">Supply and movement</h2>
          </div>
          <time dateTime={overview.generatedAt}>Updated {formatDate(overview.generatedAt)}</time>
        </div>
        <div className="economy-metrics-grid">
          <MetricCard label="Total supply" value={formatDust(overview.dust.totalSupply)} />
          <MetricCard
            label="Funded player accounts"
            value={formatCount(overview.dust.fundedPlayerCount)}
          />
          <MetricCard label="Average balance" value={formatDust(overview.dust.averageBalance)} />
          <MetricCard label="Median balance" value={formatDust(overview.dust.medianBalance)} />
          <MetricCard label="Maximum balance" value={formatDust(overview.dust.maximumBalance)} />
          <MetricCard label="Created today" value={formatDust(overview.dust.createdToday)} />
          <MetricCard label="Destroyed today" value={formatDust(overview.dust.destroyedToday)} />
          <MetricCard label="Created · 7 days" value={formatDust(overview.dust.created7d)} />
          <MetricCard label="Destroyed · 7 days" value={formatDust(overview.dust.destroyed7d)} />
          <MetricCard label="Created · 30 days" value={formatDust(overview.dust.created30d)} />
          <MetricCard label="Destroyed · 30 days" value={formatDust(overview.dust.destroyed30d)} />
          <MetricCard
            detail={planningLabel(overview.dust.sourceToSinkRatio)}
            label="Observed source : sink"
            value={overview.dust.sourceToSinkRatio?.toFixed(2) ?? 'Not enough data yet'}
          />
        </div>
      </section>

      <section className="economy-health-card" aria-labelledby="planning-health-heading">
        <div>
          <p className="eyebrow">Simulation mode</p>
          <h2 id="planning-health-heading">Current simulated source-to-sink ratio</h2>
          <strong>{planningRatio.toFixed(2)} : 1</strong>
          <StatusChip value={planningLabel(planningRatio).toLowerCase().replaceAll(' ', '_')} />
        </div>
        <div>
          <p>
            More DUST is currently being created than spent under these assumptions. This is a
            planning result, not a production forecast, and it does not change active policy.
          </p>
          <small>
            {overview.latestSimulation === null
              ? 'Phase 9A reviewed baseline · no newer simulation recorded'
              : `Latest run ${formatDate(overview.latestSimulation.createdAt)}`}
          </small>
          {hasAdminPermission(context, 'economy.simulation.run') ? (
            <Link href="/economy/simulations">Compare tuning candidates</Link>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="queues-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Operator attention</p>
            <h2 id="queues-heading">Review queues</h2>
          </div>
        </div>
        <div className="economy-queue-grid">
          {hasAdminPermission(context, 'economy.audit.read') ? (
            <Link href="/economy/reconciliation">
              <span>Reconciliation mismatches</span>
              <strong>{overview.reconciliationMismatches}</strong>
              <small>Evidence only; reconciliation never rewrites balances.</small>
            </Link>
          ) : null}
          {hasAdminPermission(context, 'economy.risk.read') ? (
            <Link href="/economy/risk">
              <span>Open risk signals</span>
              <strong>{overview.openRiskSignals}</strong>
              <small>Signals require a human decision and never suspend automatically.</small>
            </Link>
          ) : null}
          {hasAdminPermission(context, 'economy.correction.review') ||
          hasAdminPermission(context, 'economy.correction.create') ? (
            <Link href="/economy/corrections">
              <span>Pending corrections</span>
              <strong>{overview.openCorrections}</strong>
              <small>Reviewed deltas only. There is no set-balance operation.</small>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="economy-overview-columns" aria-label="Active configuration">
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Configuration</p>
              <h2>Active policy</h2>
            </div>
            {hasAdminPermission(context, 'economy.settings.read') ? (
              <Link href="/economy/policies">View policies</Link>
            ) : null}
          </div>
          {overview.activePolicy === null ? (
            <p className="economy-unavailable">Unavailable</p>
          ) : (
            <dl className="economy-detail-list">
              <div>
                <dt>Version</dt>
                <dd>v{overview.activePolicy.versionNumber}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusChip value={overview.activePolicy.status} />
                </dd>
              </div>
              <div>
                <dt>Effective</dt>
                <dd>{formatDate(overview.activePolicy.effectiveAt)}</dd>
              </div>
            </dl>
          )}
        </article>
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Player commerce</p>
              <h2>Shop versions</h2>
            </div>
            {hasAdminPermission(context, 'economy.shop.read') ? (
              <Link href="/economy/shops">Open shops</Link>
            ) : null}
          </div>
          {overview.shops === null ? (
            <p className="economy-unavailable">Unavailable</p>
          ) : (
            <dl className="economy-detail-list">
              <div>
                <dt>Active</dt>
                <dd>{overview.shops.active}</dd>
              </div>
              <div>
                <dt>Disabled</dt>
                <dd>{overview.shops.disabled}</dd>
              </div>
              <div>
                <dt>Scheduled</dt>
                <dd>{overview.shops.scheduled}</dd>
              </div>
            </dl>
          )}
        </article>
      </section>

      <section className="economy-overview-columns" aria-label="Published registries">
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Closed registry</p>
              <h2>Published sources</h2>
            </div>
            {hasAdminPermission(context, 'economy.settings.read') ? (
              <Link href="/economy/sources">Inspect</Link>
            ) : null}
          </div>
          <ul className="economy-compact-list">
            {overview.sources.map((source) => (
              <li key={source.key}>
                <div>
                  <strong>{source.key}</strong>
                  <small>
                    v{source.version} · {source.status}
                  </small>
                </div>
                <span>+{source.amount30d.toLocaleString()} / 30d</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="economy-panel">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Closed registry</p>
              <h2>Published sinks</h2>
            </div>
            {hasAdminPermission(context, 'economy.settings.read') ? (
              <Link href="/economy/sinks">Inspect</Link>
            ) : null}
          </div>
          <ul className="economy-compact-list">
            {overview.sinks.map((sink) => (
              <li key={sink.key}>
                <div>
                  <strong>{sink.key}</strong>
                  <small>
                    v{sink.version} · {sink.status}
                  </small>
                </div>
                <span>−{sink.amount30d.toLocaleString()} / 30d</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
