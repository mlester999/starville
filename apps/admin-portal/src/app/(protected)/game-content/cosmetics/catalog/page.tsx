import Link from 'next/link';

import { AvatarStatus } from '../../../../../components/avatar-admin-ui';
import { CosmeticsPageHeader } from '../../../../../components/cosmetics-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function CosmeticsCatalogPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuthorizedAdmin('cosmetics.read');
  const query = await searchParams;
  const result = await loadAvatarCatalog({
    page: 1,
    pageSize: 50,
    search: first(query['search']),
    category: first(query['category']),
    layer: first(query['layer']),
    state: first(query['state']),
    missing: first(query['missing']),
  });

  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="A bounded, paginated view over the canonical Avatar Content registry. Ownership and usage counts remain aggregated; player acquisition history is not exposed here."
        eyebrow="Canonical catalog reuse"
        title="Cosmetic catalog"
      />
      <form className="avatar-filter-bar" method="get" role="search">
        <label>
          Search
          <input defaultValue={first(query['search'])} maxLength={80} name="search" type="search" />
        </label>
        <label>
          State
          <select defaultValue={first(query['state'])} name="state">
            <option value="">All states</option>
            {['draft', 'in_review', 'approved', 'active', 'superseded', 'disabled'].map((state) => (
              <option key={state} value={state}>
                {friendlyKey(state)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Missing
          <select defaultValue={first(query['missing'])} name="missing">
            <option value="">Any readiness</option>
            <option value="asset">Missing asset</option>
            <option value="direction">Missing direction</option>
            <option value="state">Missing animation</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <div className="cozy-admin-table-wrap">
        <table className="cozy-admin-table">
          <thead>
            <tr>
              <th>Cosmetic</th>
              <th>Category / layer</th>
              <th>State</th>
              <th>Usage</th>
              <th>Validation</th>
              <th>Updated</th>
              <th>Audit</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.definitionId}>
                <td>
                  <strong>{item.publicName}</strong>
                  <small>{item.stableKey}</small>
                </td>
                <td>
                  {friendlyKey(item.category)} · {friendlyKey(item.layer)}
                </td>
                <td>
                  <AvatarStatus value={item.publicationState} />
                </td>
                <td>{item.usageCount.toLocaleString()}</td>
                <td>
                  <AvatarStatus value={item.validationState} />
                </td>
                <td>{formatDate(item.updatedAt)}</td>
                <td>
                  <Link href={`/game-content/avatars/catalog/${item.definitionId}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="avatar-authority-note">
        Showing {result.items.length.toLocaleString()} of {result.total.toLocaleString()}{' '}
        definitions. Draft creation and version lifecycle stay in the canonical Avatar Content
        editor.
      </p>
    </main>
  );
}
