import { MAP_IDS } from '@starville/game-core';

import type { AdminPlayerDirectoryQuery } from './api';

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function integer(value: string | undefined, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function oneOf<Value extends string>(
  value: string | undefined,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as Value)
    : fallback;
}

export function parsePlayerDirectoryQuery(parameters: SearchParameters): AdminPlayerDirectoryQuery {
  const recentRaw = single(parameters['recentDays']);
  const recent = recentRaw === undefined ? undefined : integer(recentRaw, 1, 365, 0);
  const base = {
    page: integer(single(parameters['page']), 1, 10_000, 1),
    pageSize: integer(single(parameters['pageSize']), 1, 100, 25),
    search: (single(parameters['search']) ?? '').normalize('NFKC').trim().slice(0, 128),
    status: oneOf(single(parameters['status']), ['all', 'active', 'suspended'] as const, 'all'),
    rename: oneOf(single(parameters['rename']), ['all', 'required', 'clear'] as const, 'all'),
    mapId: oneOf(single(parameters['mapId']), ['all', ...MAP_IDS] as const, 'all'),
    sort: oneOf(
      single(parameters['sort']),
      ['last_entered_at', 'display_name', 'created_at', 'moderation_status'] as const,
      'last_entered_at',
    ),
    direction: oneOf(single(parameters['direction']), ['asc', 'desc'] as const, 'desc'),
  } satisfies Omit<AdminPlayerDirectoryQuery, 'recentDays'>;
  return recent === undefined || recent === 0 ? base : { ...base, recentDays: recent };
}

export function playerDirectoryHref(
  query: AdminPlayerDirectoryQuery,
  overrides: Partial<AdminPlayerDirectoryQuery>,
): string {
  const next = { ...query, ...overrides };
  const parameters = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    search: next.search,
    status: next.status,
    rename: next.rename,
    mapId: next.mapId,
    sort: next.sort,
    direction: next.direction,
  });
  if (next.recentDays !== undefined) parameters.set('recentDays', String(next.recentDays));
  return `/players?${parameters.toString()}`;
}
