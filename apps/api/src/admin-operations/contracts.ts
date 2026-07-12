import type {
  OperationsSummary,
  PlayerActionResult,
  PlayerActivity,
  PlayerDetail,
  PlayerDirectory,
} from '@starville/player-operations';
import type { MapId } from '@starville/game-core';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface PlayerDirectoryQuery {
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

export interface PlayerActivityQuery {
  readonly limit: number;
}

export interface PlayerActionInput {
  readonly expectedVersion: number;
  readonly reason: string;
}

export type PlayerActionKey =
  'suspend' | 'restore' | 'reset-position' | 'require-rename' | 'revoke-sessions';

export type PlayerActionPersistenceResult =
  | PlayerActionResult
  | 'not_found'
  | 'rate_limited'
  | 'version_conflict'
  | { readonly stateConflictCode: string };

export type OperationsDatabaseSummary = Omit<OperationsSummary, 'services'>;
export type OperationsServiceStatus = OperationsSummary['services'][number];

export interface AdminOperationsGateway {
  listPlayers(
    identity: AdminDatabaseIdentity,
    query: PlayerDirectoryQuery,
  ): Promise<PlayerDirectory>;
  getPlayer(identity: AdminDatabaseIdentity, playerId: string): Promise<PlayerDetail | 'not_found'>;
  getPlayerActivity(
    identity: AdminDatabaseIdentity,
    playerId: string,
    query: PlayerActivityQuery,
  ): Promise<PlayerActivity | 'not_found'>;
  getSummary(identity: AdminDatabaseIdentity): Promise<OperationsDatabaseSummary>;
  performPlayerAction(
    identity: AdminDatabaseIdentity,
    playerId: string,
    action: PlayerActionKey,
    input: PlayerActionInput,
    requestId: string,
    rateLimit: number,
  ): Promise<PlayerActionPersistenceResult>;
}

export interface OperationsHealthReader {
  read(requestId: string): Promise<readonly OperationsServiceStatus[]>;
}

export interface AdminOperationsService {
  listPlayers(identity: AdminDatabaseIdentity, query: unknown): Promise<PlayerDirectory>;
  getPlayer(identity: AdminDatabaseIdentity, playerId: unknown): Promise<PlayerDetail>;
  getPlayerActivity(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    query: unknown,
  ): Promise<PlayerActivity>;
  getOperationsSummary(
    identity: AdminDatabaseIdentity,
    requestId: string,
  ): Promise<OperationsSummary>;
  performPlayerAction(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    action: PlayerActionKey,
    body: unknown,
    requestId: string,
  ): Promise<PlayerActionResult>;
}
