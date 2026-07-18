import Link from 'next/link';

import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyShops } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EconomyShopsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  await requireAuthorizedAdmin('economy.shop.read');
  const [query, { items }] = await Promise.all([searchParams, loadEconomyShops()]);

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Operate structured, versioned shop catalogs from draft through independent review. Published versions are immutable and every player purchase uses the active server version."
        eyebrow="Village commerce"
        title="Shops"
      />
      <EconomyNotice notice={query.notice} />

      <ol
        className="economy-lifecycle economy-lifecycle--legend"
        aria-label="Shop publication workflow"
      >
        {[
          'Draft',
          'Validate',
          'Submit for Review',
          'Approve',
          'Schedule or Publish',
          'Superseded',
        ].map((label, index) => (
          <li key={label}>
            <span aria-hidden="true">{index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      {items.length === 0 ? (
        <EmptyState description="No economy shop definitions are available." title="No shops" />
      ) : (
        <div className="economy-table-region">
          <table className="economy-table">
            <caption className="sr-only">Versioned economy shops</caption>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Lifecycle</th>
                <th>Published / draft</th>
                <th>Offers</th>
                <th>Interaction</th>
                <th>Validation / activation</th>
                <th>Player availability</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((shop) => (
                <tr key={shop.shopDefinitionId}>
                  <td data-label="Shop">
                    <strong>{shop.name}</strong>
                    <small>
                      {shop.slug} · {friendlyKey(shop.ownerModule)}
                    </small>
                  </td>
                  <td data-label="Lifecycle">
                    <StatusChip value={shop.status} />
                  </td>
                  <td data-label="Published / draft">
                    <strong>
                      {shop.activeVersionNumber === null
                        ? 'None active'
                        : `v${shop.activeVersionNumber}`}
                    </strong>
                    <small>
                      {shop.draftVersionNumber === null
                        ? 'No open draft'
                        : `Draft v${shop.draftVersionNumber}`}
                    </small>
                  </td>
                  <td data-label="Offers">{shop.offerCount}</td>
                  <td data-label="Interaction">
                    <code>{shop.interactionKey}</code>
                  </td>
                  <td data-label="Validation / activation">
                    <strong>{formatDate(shop.lastValidatedAt)}</strong>
                    <small>Effective {formatDate(shop.effectiveAt)}</small>
                  </td>
                  <td data-label="Player availability">
                    <StatusChip value={shop.playerAvailable ? 'available' : 'unavailable'} />
                  </td>
                  <td data-label="Action">
                    <Link
                      className="economy-table-action"
                      href={`/economy/shops/${shop.shopDefinitionId}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
