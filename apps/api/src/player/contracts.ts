import type {
  PlayerProfile,
  PlayerProfileCreate,
  PlayerProfileUpdate,
  PlayerStateWrite,
} from '@starville/game-core';
import type { PlayerEntryProfile } from '@starville/player-operations';

export type PlayerPersistenceStatus =
  | 'not_found'
  | 'rate_limited'
  | 'suspended'
  | 'rename_required'
  | 'rename_not_required'
  | 'name_unchanged'
  | 'game_state_version_conflict';

export interface PlayerGateway {
  loadEntry(
    walletAddress: string,
    requestId: string,
    touchEntry: boolean,
  ): Promise<PlayerEntryProfile | 'not_found'>;
  createProfile(
    walletAddress: string,
    input: PlayerProfileCreate,
    requestId: string,
    rateLimit: number,
  ): Promise<PlayerProfile | PlayerPersistenceStatus>;
  updateProfile(
    walletAddress: string,
    input: PlayerProfileUpdate,
    requestId: string,
    rateLimit: number,
  ): Promise<PlayerEntryProfile | PlayerPersistenceStatus>;
  completeRename(
    walletAddress: string,
    displayName: string,
    requestId: string,
    rateLimit: number,
  ): Promise<PlayerEntryProfile | PlayerPersistenceStatus>;
  saveState(
    walletAddress: string,
    input: PlayerStateWrite,
    requestId: string,
    rateLimit: number,
  ): Promise<PlayerEntryProfile | PlayerPersistenceStatus>;
}

export interface PlayerService {
  loadEntry(
    walletAddress: string,
    requestId: string,
    touchEntry: boolean,
  ): Promise<PlayerEntryProfile | undefined>;
  createProfile(walletAddress: string, input: unknown, requestId: string): Promise<PlayerProfile>;
  updateProfile(walletAddress: string, input: unknown, requestId: string): Promise<PlayerProfile>;
  completeRename(walletAddress: string, input: unknown, requestId: string): Promise<PlayerProfile>;
  saveState(walletAddress: string, input: unknown, requestId: string): Promise<PlayerProfile>;
}
