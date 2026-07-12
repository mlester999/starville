import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { playerProfileSchema, type PlayerProfile } from '@starville/game-core';
import { playerEntryProfileSchema, type PlayerEntryProfile } from '@starville/player-operations';

import type { PlayerGateway, PlayerPersistenceStatus } from './contracts.js';

const persistedProfileSchema = playerProfileSchema.extend({ status: z.literal('loaded') });
const persistedEntrySchema = playerEntryProfileSchema.extend({ status: z.literal('loaded') });
const statusSchema = z
  .object({
    status: z.enum([
      'not_found',
      'rate_limited',
      'suspended',
      'rename_required',
      'rename_not_required',
      'name_unchanged',
      'game_state_version_conflict',
    ]),
  })
  .strict();

export class PlayerPersistenceError extends Error {
  public constructor() {
    super('Player persistence operation failed.');
    this.name = 'PlayerPersistenceError';
  }
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);

  if (error !== null) {
    throw new PlayerPersistenceError();
  }

  return data;
}

function parseResult(value: unknown): PlayerProfile | PlayerPersistenceStatus {
  const profile = persistedProfileSchema.safeParse(value);
  if (profile.success) {
    const { status, ...result } = profile.data;
    void status;
    return result;
  }

  return statusSchema.parse(value).status;
}

function parseEntryResult(value: unknown): PlayerEntryProfile | PlayerPersistenceStatus {
  const entry = persistedEntrySchema.safeParse(value);
  if (entry.success) {
    const { status, ...result } = entry.data;
    void status;
    return result;
  }
  const profile = persistedProfileSchema.safeParse(value);
  if (profile.success) {
    const { status, ...result } = profile.data;
    void status;
    return { entryState: 'active', profile: result };
  }
  return statusSchema.parse(value).status;
}

export function createSupabasePlayerGateway(client: SupabaseClient): PlayerGateway {
  return {
    async loadEntry(walletAddress, requestId, touchEntry) {
      const result = parseEntryResult(
        await executeRpc(client, 'load_player_entry_state', {
          p_wallet_address: walletAddress,
          p_request_id: requestId,
          p_touch_entry: touchEntry,
        }),
      );
      if (result === 'not_found') return result;
      if (typeof result === 'string') throw new PlayerPersistenceError();
      return result;
    },

    async createProfile(walletAddress, input, requestId, rateLimit) {
      const result = parseResult(
        await executeRpc(client, 'create_player_profile', {
          p_wallet_address: walletAddress,
          p_display_name: input.displayName,
          p_appearance_preset: input.appearancePreset,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
      if (result === 'rate_limited') return result;
      if (typeof result === 'string') throw new PlayerPersistenceError();
      return result;
    },

    async updateProfile(walletAddress, input, requestId, rateLimit) {
      return parseEntryResult(
        await executeRpc(client, 'update_player_profile', {
          p_wallet_address: walletAddress,
          p_display_name: input.displayName ?? null,
          p_appearance_preset: input.appearancePreset ?? null,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },

    async completeRename(walletAddress, displayName, requestId, rateLimit) {
      return parseEntryResult(
        await executeRpc(client, 'complete_required_player_rename', {
          p_wallet_address: walletAddress,
          p_display_name: displayName,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },

    async saveState(walletAddress, input, requestId, rateLimit) {
      return parseEntryResult(
        await executeRpc(client, 'save_player_game_state', {
          p_wallet_address: walletAddress,
          p_map_id: input.mapId,
          p_position_x: input.x,
          p_position_y: input.y,
          p_facing_direction: input.facingDirection,
          p_expected_game_state_version: input.expectedGameStateVersion,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },
  };
}
