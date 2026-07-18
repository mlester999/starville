import Link from 'next/link';

import {
  EconomyPageHeader,
  EmptyState,
  Pagination,
  StatusChip,
  formatDate,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyLedger } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface LedgerQuery {
  readonly search?: string;
  readonly page?: string;
  readonly pageSize?: string;
  readonly direction?: string;
  readonly sourceKey?: string;
  readonly sinkKey?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly minimumAmount?: string;
  readonly maximumAmount?: string;
  readonly status?: string;
}

export default async function EconomyLedgerPage({
  searchParams,
}: {
  readonly searchParams: Promise<LedgerQuery>;
}) {
  await requireAuthorizedAdmin('economy.audit.read');
  const query = await searchParams;
  const ledger = await loadEconomyLedger(query);

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Search immutable DUST entries by safe player, receipt, operation, direction, registry key, amount, and date. Completed entries cannot be edited or deleted."
        eyebrow="Receipt-backed history"
        title="DUST ledger"
      />

      <form className="economy-filter-grid" method="get">
        <label className="economy-filter-grid__search">
          Player, receipt, request, or operation
          <input defaultValue={query.search ?? ''} maxLength={128} name="search" />
        </label>
        <label>
          Direction
          <select defaultValue={query.direction ?? ''} name="direction">
            <option value="">Credit and debit</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
        </label>
        <label>
          Source key
          <input
            defaultValue={query.sourceKey ?? ''}
            maxLength={80}
            minLength={3}
            name="sourceKey"
          />
        </label>
        <label>
          Sink key
          <input defaultValue={query.sinkKey ?? ''} maxLength={80} minLength={3} name="sinkKey" />
        </label>
        <label>
          From
          <input defaultValue={query.dateFrom ?? ''} name="dateFrom" type="date" />
        </label>
        <label>
          To
          <input defaultValue={query.dateTo ?? ''} name="dateTo" type="date" />
        </label>
        <label>
          Minimum DUST
          <input
            defaultValue={query.minimumAmount ?? ''}
            min="0"
            name="minimumAmount"
            type="number"
          />
        </label>
        <label>
          Maximum DUST
          <input
            defaultValue={query.maximumAmount ?? ''}
            min="0"
            name="maximumAmount"
            type="number"
          />
        </label>
        <label>
          Status
          <select defaultValue={query.status ?? ''} name="status">
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          Rows
          <select defaultValue={query.pageSize ?? '10'} name="pageSize">
            <option value="10">10</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <div className="economy-filter-grid__actions">
          <button type="submit">Apply filters</button>
          <Link href="/economy/ledger">Clear</Link>
        </div>
      </form>

      {ledger.items.length === 0 ? (
        <EmptyState
          description="No immutable ledger entries match the current bounded filters."
          title="No DUST entries found"
        />
      ) : (
        <div className="economy-table-region">
          <table className="economy-table">
            <caption className="sr-only">DUST ledger entries</caption>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operation</th>
                <th>Player</th>
                <th>Amount</th>
                <th>Balance</th>
                <th>Source or sink</th>
                <th>Receipt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((entry) => {
                const direction = entry.direction ?? (entry.delta >= 0 ? 'credit' : 'debit');
                return (
                  <tr key={entry.publicReceiptId}>
                    <td data-label="Timestamp">{formatDate(entry.createdAt)}</td>
                    <td data-label="Operation">
                      <strong>{entry.operationKey}</strong>
                    </td>
                    <td data-label="Player">
                      <strong>{entry.displayName}</strong>
                      <small>{entry.playerProfileId}</small>
                    </td>
                    <td
                      className={`economy-amount economy-amount--${direction}`}
                      data-label="Amount"
                    >
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta.toLocaleString()} DUST
                    </td>
                    <td data-label="Balance">
                      {entry.balanceBefore.toLocaleString()} → {entry.balanceAfter.toLocaleString()}
                    </td>
                    <td data-label="Source or sink">
                      {entry.sourceKey ?? entry.sinkKey ?? 'Registry unavailable'}
                    </td>
                    <td data-label="Receipt">
                      <code>{entry.publicReceiptId}</code>
                    </td>
                    <td data-label="Status">
                      <StatusChip value={entry.status ?? 'completed'} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={ledger.page}
        pathname="/economy/ledger"
        query={query}
        totalPages={ledger.totalPages}
      />
    </main>
  );
}
