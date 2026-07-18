import Link from 'next/link';

import { CosmeticsPageHeader } from '../../../../../components/cosmetics-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCosmeticsAudit } from '../../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function CosmeticsAuditPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuthorizedAdmin('cosmetics.audit.read');
  const query = await searchParams;
  const requested = Number(first(query['page']));
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const result = await loadCosmeticsAudit(page);
  const totalPages = Math.ceil(result.total / result.pageSize);

  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Read immutable, bounded ownership grant, revocation, and exact-once collection reward receipts. Player reasons and administrator identifiers remain inside this authorized audit surface."
        eyebrow="Append-only operational evidence"
        title="Cosmetic audit"
      />
      <div className="cozy-admin-table-wrap">
        <table className="cozy-admin-table">
          <thead>
            <tr>
              <th>Operation</th>
              <th>Cosmetic</th>
              <th>Source</th>
              <th>Reason</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.receiptId}>
                <td>{friendlyKey(item.operation)}</td>
                <td>
                  <strong>{item.cosmeticKey}</strong>
                  <small>{item.definitionId}</small>
                </td>
                <td>{friendlyKey(item.source)}</td>
                <td>
                  <strong>{friendlyKey(item.reasonCategory)}</strong>
                  <small>{item.reason}</small>
                </td>
                <td>{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Cosmetic audit pagination" className="economy-pagination">
        {page > 1 ? (
          <Link href={`?page=${String(page - 1)}`}>Previous</Link>
        ) : (
          <span>Previous</span>
        )}
        <span>
          Page {page} of {Math.max(1, totalPages)} · {result.total.toLocaleString()} receipts
        </span>
        {page < totalPages ? (
          <Link href={`?page=${String(page + 1)}`}>Next</Link>
        ) : (
          <span>Next</span>
        )}
      </nav>
    </main>
  );
}
