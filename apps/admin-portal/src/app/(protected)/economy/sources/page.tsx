import {
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  formatDuration,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomySources } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function limit(value: number | null): string {
  return value === null ? 'Not configured' : value.toLocaleString();
}

export default async function EconomySourcesPage() {
  await requireAuthorizedAdmin('economy.settings.read');
  const { items } = await loadEconomySources();

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Inspect the closed, versioned catalog of operations allowed to create DUST. Stable public keys remain bounded and published definitions remain immutable."
        eyebrow="Closed source registry"
        title="DUST sources"
      />

      <aside className="economy-safety-note" aria-label="Source registry authority">
        <strong>Server-authoritative registry</strong>
        <p>
          A browser cannot invent a source key or award DUST. Disabled and retired definitions stay
          visible so historical receipts remain understandable.
        </p>
      </aside>

      {items.length === 0 ? (
        <EmptyState
          description="No source definitions are available to this environment."
          title="No sources"
        />
      ) : (
        <div className="economy-registry-grid">
          {items.map((source) => (
            <article className="economy-registry-card" key={source.id}>
              <header>
                <div>
                  <p className="eyebrow">{friendlyKey(source.category)}</p>
                  <h2>{source.label}</h2>
                  <code>{source.key}</code>
                </div>
                <div className="economy-status-stack">
                  <StatusChip value={source.status} />
                  <StatusChip value={source.enabled ? 'enabled' : 'disabled'} />
                </div>
              </header>
              <p>{source.description}</p>
              <dl className="economy-detail-list economy-detail-list--compact">
                <div>
                  <dt>Operation</dt>
                  <dd>
                    <code>{source.operationKey}</code>
                  </dd>
                </div>
                <div>
                  <dt>Owning module</dt>
                  <dd>{friendlyKey(source.ownerModule ?? source.category)}</dd>
                </div>
                <div>
                  <dt>Amount range</dt>
                  <dd>
                    {source.minimumAmount.toLocaleString()}–{source.maximumAmount.toLocaleString()}{' '}
                    DUST
                  </dd>
                </div>
                <div>
                  <dt>Daily / weekly limit</dt>
                  <dd>
                    {limit(source.dailyLimit)} / {limit(source.weeklyLimit)}
                  </dd>
                </div>
                <div>
                  <dt>Lifetime limit</dt>
                  <dd>{limit(source.lifetimeLimit)}</dd>
                </div>
                <div>
                  <dt>Wallet daily limit</dt>
                  <dd>{limit(source.walletDailyLimit)}</dd>
                </div>
                <div>
                  <dt>Cooldown</dt>
                  <dd>{formatDuration(source.cooldownSeconds)}</dd>
                </div>
                <div>
                  <dt>Repeatable</dt>
                  <dd>{source.repeatable ? 'Yes, within limits' : 'No'}</dd>
                </div>
                <div>
                  <dt>Beginner protected</dt>
                  <dd>{source.beginnerProtected ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt>Risk weight</dt>
                  <dd>{source.riskWeight.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Active version</dt>
                  <dd>
                    v{source.version}
                    {source.active ? ' · selected' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Effective</dt>
                  <dd>{formatDate(source.effectiveAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
