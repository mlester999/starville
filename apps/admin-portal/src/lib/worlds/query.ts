export const WORLD_DIRECTORY_STATUSES = ['all', 'active', 'archived'] as const;
export const WORLD_DIRECTORY_SORTS = ['updated_at', 'display_name', 'slug', 'status'] as const;
export const WORLD_SORT_DIRECTIONS = ['asc', 'desc'] as const;

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export interface WorldDirectoryQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly status: (typeof WORLD_DIRECTORY_STATUSES)[number];
  readonly sort: (typeof WORLD_DIRECTORY_SORTS)[number];
  readonly direction: (typeof WORLD_SORT_DIRECTIONS)[number];
}

export interface WorldCatalogQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function boundedInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
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

function searchValue(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().slice(0, 100);
}

export function parseWorldDirectoryQuery(parameters: SearchParameters): WorldDirectoryQuery {
  return {
    page: boundedInteger(single(parameters['page']), 1, 10_000, 1),
    pageSize: boundedInteger(single(parameters['pageSize']), 1, 100, 25),
    search: searchValue(single(parameters['search'])),
    status: allowlisted(single(parameters['status']), WORLD_DIRECTORY_STATUSES, 'all'),
    sort: allowlisted(single(parameters['sort']), WORLD_DIRECTORY_SORTS, 'updated_at'),
    direction: allowlisted(single(parameters['direction']), WORLD_SORT_DIRECTIONS, 'desc'),
  };
}

export function parseWorldCatalogQuery(parameters: SearchParameters): WorldCatalogQuery {
  return {
    page: boundedInteger(single(parameters['page']), 1, 10_000, 1),
    pageSize: boundedInteger(single(parameters['pageSize']), 1, 100, 25),
    search: searchValue(single(parameters['search'])),
  };
}

export function worldDirectoryHref(
  query: WorldDirectoryQuery,
  overrides: Partial<WorldDirectoryQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    search: next.search,
    status: next.status,
    sort: next.sort,
    direction: next.direction,
  });
  return `/worlds?${parameters.toString()}`;
}

export function worldCatalogHref(
  pathname: '/world-assets' | '/world-audit',
  query: WorldCatalogQuery,
  overrides: Partial<WorldCatalogQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    search: next.search,
  });
  return `${pathname}?${parameters.toString()}`;
}
