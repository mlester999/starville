import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  AvatarEmptyState,
  AvatarPageHeader,
  AvatarStatus,
  DirectionCoverage,
} from '../../../../../components/avatar-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';
import { createAvatarDraftAction } from '../../../../actions/avatar-content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function AvatarCatalogPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireAuthorizedAdmin('avatar_content.read');
  const query = await searchParams;
  const parsedPage = Number(first(query['page']));
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const result = await loadAvatarCatalog({
    page,
    pageSize: 50,
    search: first(query['search']),
    category: first(query['category']),
    layer: first(query['layer']),
    state: first(query['state']),
    compatibility: first(query['compatibility']),
    missing: first(query['missing']),
  });
  const retained = new URLSearchParams();
  for (const key of ['search', 'category', 'layer', 'state', 'compatibility', 'missing']) {
    const value = first(query[key]);
    if (value !== '') retained.set(key, value);
  }
  const pageHref = (next: number) => {
    const params = new URLSearchParams(retained);
    params.set('page', String(next));
    return `/game-content/avatars/catalog?${params.toString()}`;
  };

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Filter bounded avatar definitions by layer, lifecycle, compatibility, asset readiness, and missing animation coverage. Results are paginated and never expose private asset-intake locations."
        eyebrow="Versioned content registry"
        title="Avatar catalog"
      />

      {hasAdminPermission(context, 'avatar_content.edit') ? (
        <details className="avatar-create-draft">
          <summary>Create a bounded draft definition</summary>
          <form action={createAvatarDraftAction} className="avatar-structured-form">
            <label>
              Stable key
              <input
                autoComplete="off"
                maxLength={80}
                minLength={3}
                name="stableKey"
                pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*"
                required
              />
            </label>
            <label>
              Public name
              <input maxLength={80} minLength={3} name="publicName" required />
            </label>
            <label>
              Category
              <input
                autoComplete="off"
                defaultValue="starter"
                maxLength={80}
                minLength={3}
                name="category"
                pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*"
                required
              />
            </label>
            <label>
              Layer
              <select defaultValue="top" name="layer">
                {[
                  'base_body',
                  'skin_tone',
                  'face',
                  'eyes',
                  'eyebrows',
                  'hair_back',
                  'hair_front',
                  'top',
                  'bottom',
                  'footwear',
                  'head_accessory',
                  'face_accessory',
                  'back_accessory',
                  'handheld_visual',
                  'activity_override',
                  'shadow',
                ].map((layer) => (
                  <option key={layer} value={layer}>
                    {friendlyKey(layer)}
                  </option>
                ))}
              </select>
            </label>
            <label className="avatar-form-span">
              Description
              <textarea maxLength={500} minLength={3} name="description" required rows={3} />
            </label>
            <button type="submit">Create draft</button>
          </form>
        </details>
      ) : null}

      <form className="avatar-filter-bar" method="get" role="search">
        <label>
          Search
          <input defaultValue={first(query['search'])} maxLength={80} name="search" type="search" />
        </label>
        <label>
          Layer
          <select defaultValue={first(query['layer'])} name="layer">
            <option value="">All layers</option>
            {[
              'base_body',
              'skin_tone',
              'face',
              'eyes',
              'eyebrows',
              'hair_back',
              'hair_front',
              'top',
              'bottom',
              'footwear',
              'head_accessory',
              'face_accessory',
              'back_accessory',
            ].map((layer) => (
              <option key={layer} value={layer}>
                {friendlyKey(layer)}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select defaultValue={first(query['state'])} name="state">
            <option value="">All states</option>
            {[
              'draft',
              'invalid',
              'in_review',
              'changes_requested',
              'approved',
              'active',
              'superseded',
              'disabled',
              'rejected',
            ].map((state) => (
              <option key={state} value={state}>
                {friendlyKey(state)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Coverage
          <select defaultValue={first(query['missing'])} name="missing">
            <option value="">Any coverage</option>
            <option value="direction">Missing direction</option>
            <option value="state">Missing animation state</option>
            <option value="asset">Asset unavailable</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>

      {result.items.length === 0 ? (
        <AvatarEmptyState
          description="No bounded definitions match the selected filters."
          title="No avatar content found"
        />
      ) : (
        <div className="avatar-catalog-list">
          {result.items.map((definition) => (
            <article className="avatar-catalog-card" key={definition.definitionId}>
              <header>
                <div>
                  <p className="eyebrow">{friendlyKey(definition.layer)}</p>
                  <h2>{definition.publicName}</h2>
                  <code>{definition.stableKey}</code>
                </div>
                <div className="avatar-status-stack">
                  <AvatarStatus value={definition.publicationState} />
                  <AvatarStatus value={definition.validationState} />
                </div>
              </header>
              <p>{definition.description}</p>
              <DirectionCoverage directions={definition.directions} />
              <dl className="avatar-definition-list">
                <div>
                  <dt>Animation states</dt>
                  <dd>{definition.animationStates.map(friendlyKey).join(', ') || 'Missing'}</dd>
                </div>
                <div>
                  <dt>Asset status</dt>
                  <dd>{friendlyKey(definition.assetStatus)}</dd>
                </div>
                <div>
                  <dt>Usage</dt>
                  <dd>{definition.usageCount.toLocaleString()} profiles</dd>
                </div>
                <div>
                  <dt>Active version</dt>
                  <dd>
                    {definition.activeVersionNumber === null
                      ? 'Not active'
                      : `v${String(definition.activeVersionNumber)}`}
                  </dd>
                </div>
                <div>
                  <dt>Reviewer</dt>
                  <dd>{definition.reviewerDisplayName ?? 'Not reviewed'}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(definition.updatedAt)}</dd>
                </div>
              </dl>
              <Link href={`/game-content/avatars/catalog/${definition.definitionId}`}>
                Open structured editor
              </Link>
            </article>
          ))}
        </div>
      )}

      <nav aria-label="Avatar catalog pagination" className="economy-pagination">
        {result.page > 1 ? (
          <Link href={pageHref(result.page - 1)}>Previous</Link>
        ) : (
          <span>Previous</span>
        )}
        <span aria-live="polite">
          Page {result.page} of {Math.max(1, result.totalPages)} · {result.total.toLocaleString()}{' '}
          definitions
        </span>
        {result.page < result.totalPages ? (
          <Link href={pageHref(result.page + 1)}>Next</Link>
        ) : (
          <span>Next</span>
        )}
      </nav>
    </main>
  );
}
