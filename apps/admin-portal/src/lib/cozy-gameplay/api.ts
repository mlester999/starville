import 'server-only';

import {
  adminPlayerCozyViewSchema,
  adminPlayerEconomyViewSchema,
  adminPlayerInventoryViewSchema,
  gameplayContentInspectionSchema,
  type AdminPlayerCozyView,
  type AdminPlayerEconomyView,
  type AdminPlayerInventoryView,
  type GameplayContentInspection,
} from '@starville/cozy-gameplay';

import { callTrustedAdminApi } from '../admin-api';

interface PageQuery {
  readonly page: number;
  readonly pageSize: 10 | 50 | 100;
}

function playerPath(playerId: string, resource: string, query?: PageQuery): string {
  const suffix =
    query === undefined
      ? ''
      : `?${new URLSearchParams({
          page: String(query.page),
          pageSize: String(query.pageSize),
        }).toString()}`;
  return `/api/v1/admin/players/${encodeURIComponent(playerId)}/${resource}${suffix}`;
}

export function loadAdminPlayerEconomy(
  playerId: string,
  query: PageQuery,
): Promise<AdminPlayerEconomyView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'economy', query),
    parser: (value) => adminPlayerEconomyViewSchema.parse(value),
  });
}

export function loadAdminPlayerInventory(
  playerId: string,
  query: PageQuery,
): Promise<AdminPlayerInventoryView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'inventory', query),
    parser: (value) => adminPlayerInventoryViewSchema.parse(value),
  });
}

export function loadAdminPlayerCozy(playerId: string): Promise<AdminPlayerCozyView> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: playerPath(playerId, 'cozy-gameplay'),
    parser: (value) => adminPlayerCozyViewSchema.parse(value),
  });
}

export function loadAdminGameplayContent(): Promise<GameplayContentInspection> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/game-content',
    parser: (value) => gameplayContentInspectionSchema.parse(value),
  });
}
