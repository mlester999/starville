import Link from 'next/link';
import { ASSET_CATEGORIES } from '@starville/asset-management';

import { ASSET_PRODUCTION_STATUSES, WORLD_ASSET_TYPES } from '../lib/world-assets/contracts';
import {
  ASSET_DIRECTORY_LIFECYCLE_STATUSES,
  ASSET_DIRECTORY_PAGE_SIZES,
  ASSET_DIRECTORY_SORTS,
  type AssetDirectoryQuery,
} from '../lib/world-assets/query';
import { assetTypeLabel } from '../lib/world-assets/profiles';
import { PremiumSelect } from './premium-select';

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

export function WorldAssetFilters(props: {
  readonly query: AssetDirectoryQuery;
  readonly pathname: '/world-assets' | '/world-assets/review';
  readonly reviewQueue?: boolean;
}) {
  return (
    <form className="world-asset-filters" method="get" role="search">
      <div className="field world-asset-filters__search">
        <label htmlFor="asset-search">Search</label>
        <input
          defaultValue={props.query.search}
          id="asset-search"
          maxLength={100}
          name="search"
          placeholder="Name, slug, tag, or marker"
          type="search"
        />
      </div>
      {props.reviewQueue ? null : (
        <>
          <div className="field">
            <label htmlFor="asset-filter-type">Asset type</label>
            <PremiumSelect
              defaultValue={props.query.assetType}
              id="asset-filter-type"
              name="assetType"
              options={[
                { value: 'all', label: 'All asset types' },
                ...WORLD_ASSET_TYPES.map((type) => ({
                  value: type,
                  label: assetTypeLabel(type),
                })),
              ]}
              size="compact"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-category">Category</label>
            <PremiumSelect
              defaultValue={props.query.category}
              id="asset-category"
              name="category"
              options={[
                { value: '', label: 'All categories' },
                ...ASSET_CATEGORIES.map((category) => ({
                  value: category,
                  label: humanize(category),
                })),
              ]}
              size="compact"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-filter-lifecycle">Lifecycle</label>
            <PremiumSelect
              defaultValue={props.query.lifecycle}
              id="asset-filter-lifecycle"
              name="lifecycleStatus"
              options={[
                { value: 'all', label: 'All lifecycles' },
                ...ASSET_DIRECTORY_LIFECYCLE_STATUSES.map((status) => ({
                  value: status,
                  label: humanize(status),
                })),
              ]}
              size="compact"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-filter-production">Artwork state</label>
            <PremiumSelect
              defaultValue={props.query.production}
              id="asset-filter-production"
              name="productionStatus"
              options={[
                { value: 'all', label: 'Production and development' },
                ...ASSET_PRODUCTION_STATUSES.map((status) => ({
                  value: status,
                  label: humanize(status),
                })),
              ]}
              size="compact"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-filter-sort">Sort</label>
            <PremiumSelect
              defaultValue={props.query.sort}
              id="asset-filter-sort"
              name="sort"
              options={ASSET_DIRECTORY_SORTS.map((sort) => ({
                value: sort,
                label: humanize(sort),
              }))}
              size="compact"
            />
          </div>
          <div className="field">
            <label htmlFor="asset-filter-direction">Direction</label>
            <PremiumSelect
              defaultValue={props.query.direction}
              id="asset-filter-direction"
              name="direction"
              options={[
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' },
              ]}
              size="compact"
            />
          </div>
        </>
      )}
      <div className="field">
        <label htmlFor="asset-filter-page-size">Page size</label>
        <PremiumSelect
          defaultValue={String(props.query.pageSize)}
          id="asset-filter-page-size"
          name="pageSize"
          options={ASSET_DIRECTORY_PAGE_SIZES.map((size) => ({
            value: String(size),
            label: `${String(size)} per page`,
          }))}
          size="compact"
        />
      </div>
      <div className="world-asset-filters__actions">
        <button className="button button--primary" type="submit">
          Apply filters
        </button>
        <Link className="button button--quiet" href={props.pathname}>
          Clear
        </Link>
      </div>
    </form>
  );
}
