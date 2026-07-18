import {
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomySinks } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EconomySinksPage() {
  await requireAuthorizedAdmin('economy.settings.read');
  const { items } = await loadEconomySinks();

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Inspect the closed, versioned catalog of operations allowed to spend DUST. Purchases use server prices, atomic settlement, and immutable receipts."
        eyebrow="Closed sink registry"
        title="DUST sinks"
      />

      <aside className="economy-safety-note" aria-label="Sink registry authority">
        <strong>No direct balance editing</strong>
        <p>
          A sink can only debit through an approved server operation. A debit cannot make a balance
          negative, and a browser cannot supply an arbitrary price or sink key.
        </p>
      </aside>

      {items.length === 0 ? (
        <EmptyState
          description="No sink definitions are available to this environment."
          title="No sinks"
        />
      ) : (
        <div className="economy-registry-grid">
          {items.map((sink) => (
            <article className="economy-registry-card" key={sink.id}>
              <header>
                <div>
                  <p className="eyebrow">{friendlyKey(sink.category)}</p>
                  <h2>{sink.label}</h2>
                  <code>{sink.key}</code>
                </div>
                <div className="economy-status-stack">
                  <StatusChip value={sink.status} />
                  <StatusChip value={sink.enabled ? 'enabled' : 'disabled'} />
                </div>
              </header>
              <p>{sink.description}</p>
              <dl className="economy-detail-list economy-detail-list--compact">
                <div>
                  <dt>Operation</dt>
                  <dd>
                    <code>{sink.operationKey}</code>
                  </dd>
                </div>
                <div>
                  <dt>Owning module</dt>
                  <dd>{friendlyKey(sink.ownerModule ?? sink.category)}</dd>
                </div>
                <div>
                  <dt>Amount range</dt>
                  <dd>
                    {sink.minimumAmount.toLocaleString()}–{sink.maximumAmount.toLocaleString()} DUST
                  </dd>
                </div>
                <div>
                  <dt>Refund reversible</dt>
                  <dd>{sink.reversibleByRefund ? 'Yes, by reviewed server refund' : 'No'}</dd>
                </div>
                <div>
                  <dt>Beginner protection</dt>
                  <dd>{sink.beginnerProtected ? 'Enabled' : 'Not configured'}</dd>
                </div>
                <div>
                  <dt>Active version</dt>
                  <dd>
                    v{sink.version}
                    {sink.active ? ' · selected' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Publication</dt>
                  <dd>
                    <StatusChip value={sink.status} />
                  </dd>
                </div>
                <div>
                  <dt>Effective</dt>
                  <dd>{formatDate(sink.effectiveAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
