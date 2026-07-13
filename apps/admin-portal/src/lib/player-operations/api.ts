import 'server-only';

import type { MapId } from '@starville/game-core';
import {
  operationsSummarySchema,
  playerActionResultSchema,
  playerActivitySchema,
  playerDetailSchema,
  playerDirectorySchema,
  type OperationsSummary,
  type PlayerActionResult,
  type PlayerActivity,
  type PlayerDetail,
  type PlayerDirectory,
} from '@starville/player-operations';

import { callTrustedAdminApi } from '../admin-api';

export interface AdminPlayerDirectoryQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly status: 'all' | 'active' | 'suspended';
  readonly rename: 'all' | 'required' | 'clear';
  readonly mapId: 'all' | MapId;
  readonly recentDays?: number;
  readonly sort: 'last_entered_at' | 'display_name' | 'created_at' | 'moderation_status';
  readonly direction: 'asc' | 'desc';
}

export type AdminPlayerAction =
  'suspend' | 'restore' | 'reset-position' | 'require-rename' | 'rename' | 'revoke-sessions';

function pathnameForDirectory(query: AdminPlayerDirectoryQuery): string {
  const parameters = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    search: query.search,
    status: query.status,
    rename: query.rename,
    mapId: query.mapId,
    sort: query.sort,
    direction: query.direction,
  });
  if (query.recentDays !== undefined) parameters.set('recentDays', String(query.recentDays));
  return `/api/v1/admin/players?${parameters.toString()}`;
}

export function loadAdminPlayers(query: AdminPlayerDirectoryQuery): Promise<PlayerDirectory> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: pathnameForDirectory(query),
    parser: (value) => playerDirectorySchema.parse(value),
  });
}

export function loadAdminPlayer(playerId: string): Promise<PlayerDetail> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/players/${encodeURIComponent(playerId)}`,
    parser: (value) => playerDetailSchema.parse(value),
  });
}

export function loadAdminPlayerActivity(
  playerId: string,
  query: {
    readonly limit?: number;
    readonly accessPage: number;
    readonly accessPageSize: 10 | 50 | 100;
  },
): Promise<PlayerActivity> {
  const parameters = new URLSearchParams({
    limit: String(query.limit ?? 25),
    accessPage: String(query.accessPage),
    accessPageSize: String(query.accessPageSize),
  });
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/players/${encodeURIComponent(playerId)}/activity?${parameters.toString()}`,
    parser: (value) => playerActivitySchema.parse(value),
  });
}

export function loadOperationsSummary(): Promise<OperationsSummary> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/operations/summary',
    parser: (value) => operationsSummarySchema.parse(value),
  });
}

export function performAdminPlayerAction(
  playerId: string,
  action: AdminPlayerAction,
  input: {
    readonly expectedVersion: number;
    readonly reason: string;
    readonly displayName?: string;
  },
  requestId: string,
): Promise<PlayerActionResult> {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/players/${encodeURIComponent(playerId)}/${action}`,
    body: input,
    requestId,
    parser: (value) => playerActionResultSchema.parse(value),
  });
}
