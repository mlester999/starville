import {
  ASSET_CATEGORIES,
  ASSET_PRODUCTION_STATUSES,
  WORLD_ASSET_TYPES,
  type AssetInteractionCompatibility,
  type AssetLifecycleStatus,
  type AssetProductionStatus,
  type WorldAssetType,
} from './contracts';

export const ASSET_DIRECTORY_PAGE_SIZES = [10, 50, 100] as const;
export const ASSET_DIRECTORY_LIFECYCLE_STATUSES = [
  'draft',
  'active',
  'deprecated',
  'archived',
] as const satisfies readonly AssetLifecycleStatus[];
export const ASSET_DIRECTORY_SORTS = [
  'updated_at',
  'friendly_name',
  'asset_type',
  'lifecycle_status',
  'reference_count',
] as const;
export const ASSET_SORT_DIRECTIONS = ['asc', 'desc'] as const;

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export interface AssetDirectoryQuery {
  readonly page: number;
  readonly pageSize: (typeof ASSET_DIRECTORY_PAGE_SIZES)[number];
  readonly search: string;
  readonly assetType: 'all' | WorldAssetType;
  readonly category: string;
  readonly lifecycle: 'all' | AssetLifecycleStatus;
  readonly production: 'all' | AssetProductionStatus;
  readonly sort: (typeof ASSET_DIRECTORY_SORTS)[number];
  readonly direction: (typeof ASSET_SORT_DIRECTIONS)[number];
}

export interface AssetAuditQuery {
  readonly page: number;
  readonly pageSize: (typeof ASSET_DIRECTORY_PAGE_SIZES)[number];
  readonly search: string;
  readonly outcome: 'all' | 'success' | 'denied' | 'error';
}

export interface AssetReviewQueueQuery {
  readonly page: number;
  readonly pageSize: (typeof ASSET_DIRECTORY_PAGE_SIZES)[number];
  readonly search: string;
}

export interface EditorAssetCandidateQuery {
  readonly page: number;
  readonly pageSize: (typeof ASSET_DIRECTORY_PAGE_SIZES)[number];
  readonly search: string;
  readonly assetType: 'all' | WorldAssetType;
  readonly category: string;
  readonly interaction: 'all' | AssetInteractionCompatibility;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizedSearch(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().slice(0, 100);
}

function normalizedCategory(value: string | undefined): string {
  const normalized = (value ?? '').normalize('NFKC').trim().toLowerCase().slice(0, 80);
  return (ASSET_CATEGORIES as readonly string[]).includes(normalized) ? normalized : '';
}

function positivePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000 ? parsed : 1;
}

function pageSize(value: string | undefined): AssetDirectoryQuery['pageSize'] {
  const parsed = Number(value);
  return ASSET_DIRECTORY_PAGE_SIZES.includes(parsed as (typeof ASSET_DIRECTORY_PAGE_SIZES)[number])
    ? (parsed as AssetDirectoryQuery['pageSize'])
    : 10;
}

function allowlisted<Value extends string>(
  value: string | undefined,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as Value)
    : fallback;
}

export function parseAssetDirectoryQuery(parameters: SearchParameters): AssetDirectoryQuery {
  return {
    page: positivePage(single(parameters['page'])),
    pageSize: pageSize(single(parameters['pageSize'])),
    search: normalizedSearch(single(parameters['search'])),
    assetType: allowlisted(single(parameters['assetType']), ['all', ...WORLD_ASSET_TYPES], 'all'),
    category: normalizedCategory(single(parameters['category'])),
    lifecycle: allowlisted(
      single(parameters['lifecycleStatus']),
      ['all', ...ASSET_DIRECTORY_LIFECYCLE_STATUSES],
      'all',
    ),
    production: allowlisted(
      single(parameters['productionStatus']),
      ['all', ...ASSET_PRODUCTION_STATUSES],
      'all',
    ),
    sort: allowlisted(single(parameters['sort']), ASSET_DIRECTORY_SORTS, 'updated_at'),
    direction: allowlisted(single(parameters['direction']), ASSET_SORT_DIRECTIONS, 'desc'),
  };
}

export function parseAssetAuditQuery(parameters: SearchParameters): AssetAuditQuery {
  return {
    page: positivePage(single(parameters['page'])),
    pageSize: pageSize(single(parameters['pageSize'])),
    search: normalizedSearch(single(parameters['search'])),
    outcome: allowlisted(
      single(parameters['outcome']),
      ['all', 'success', 'denied', 'error'],
      'all',
    ),
  };
}

export function assetDirectoryParameters(query: AssetDirectoryQuery): URLSearchParams {
  const parameters = new URLSearchParams({
    sort: query.sort,
    direction: query.direction,
    limit: String(query.pageSize),
    offset: String((query.page - 1) * query.pageSize),
  });
  if (query.search !== '') parameters.set('search', query.search);
  if (query.assetType !== 'all') parameters.set('assetType', query.assetType);
  if (query.category !== '') parameters.set('category', query.category);
  if (query.lifecycle !== 'all') parameters.set('lifecycleStatus', query.lifecycle);
  if (query.production !== 'all') parameters.set('productionStatus', query.production);
  return parameters;
}

export function assetAuditParameters(query: AssetAuditQuery): URLSearchParams {
  return new URLSearchParams({
    search: query.search,
    outcome: query.outcome,
    limit: String(query.pageSize),
    offset: String((query.page - 1) * query.pageSize),
  });
}

export function assetReviewQueueParameters(query: AssetReviewQueueQuery): URLSearchParams {
  const parameters = new URLSearchParams({
    limit: String(query.pageSize),
    offset: String((query.page - 1) * query.pageSize),
  });
  if (query.search !== '') parameters.set('search', query.search);
  return parameters;
}

export function editorAssetCandidateParameters(query: EditorAssetCandidateQuery): URLSearchParams {
  const parameters = new URLSearchParams({
    limit: String(query.pageSize),
    offset: String((query.page - 1) * query.pageSize),
  });
  if (query.search !== '') parameters.set('search', query.search);
  if (query.assetType !== 'all') parameters.set('assetType', query.assetType);
  if (query.category !== '') parameters.set('category', query.category);
  if (query.interaction !== 'all') parameters.set('interaction', query.interaction);
  return parameters;
}

export function assetDirectoryHref(
  pathname: '/world-assets' | '/world-assets/review',
  query: AssetDirectoryQuery,
  overrides: Partial<AssetDirectoryQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = assetDirectoryParameters(next);
  parameters.set('page', String(next.page));
  parameters.set('pageSize', String(next.pageSize));
  parameters.delete('limit');
  parameters.delete('offset');
  return `${pathname}?${parameters.toString()}`;
}

export function assetReviewQueueHref(
  query: AssetReviewQueueQuery,
  overrides: Partial<AssetReviewQueueQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = assetReviewQueueParameters(next);
  parameters.set('page', String(next.page));
  parameters.set('pageSize', String(next.pageSize));
  parameters.delete('limit');
  parameters.delete('offset');
  return `/world-assets/review?${parameters.toString()}`;
}

export function assetAuditHref(
  query: AssetAuditQuery,
  overrides: Partial<AssetAuditQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = assetAuditParameters(next);
  parameters.set('page', String(next.page));
  parameters.set('pageSize', String(next.pageSize));
  parameters.delete('limit');
  parameters.delete('offset');
  return `/world-assets/audit?${parameters.toString()}`;
}
