import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  playerProfileObjectSchema,
  refineMatchingPlayerStateVersions,
  type PlayerProfile,
} from '@starville/game-core';
import { playerEntryProfileSchema, type PlayerEntryProfile } from '@starville/player-operations';

import type { PlayerGateway, PlayerPersistenceStatus } from './contracts.js';

const persistedProfileSchema = refineMatchingPlayerStateVersions(
  playerProfileObjectSchema.extend({ status: z.literal('loaded') }),
);
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

export type PlayerPersistenceFailureStage = 'rpc' | 'parse' | 'unexpected_status';

export class PlayerPersistenceError extends Error {
  public constructor(
    public readonly stage: PlayerPersistenceFailureStage,
    public readonly operation: string,
    public readonly details: {
      readonly rpcName?: string;
      readonly postgresCode?: string | null;
      readonly parseIssues?: readonly string[];
      readonly status?: string;
    } = {},
  ) {
    super('Player persistence operation failed.');
    this.name = 'PlayerPersistenceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safePostgresCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const code = error['code'];
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/u.test(code) ? code : null;
}

function zodIssuePaths(error: z.ZodError): readonly string[] {
  return error.issues
    .slice(0, 12)
    .map((issue) => (issue.path.length === 0 ? issue.code : issue.path.join('.')));
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);

  if (error !== null) {
    throw new PlayerPersistenceError('rpc', operation, {
      rpcName: operation,
      postgresCode: safePostgresCode(error),
    });
  }

  return data;
}

function parseResult(value: unknown, operation: string): PlayerProfile | PlayerPersistenceStatus {
  const profile = persistedProfileSchema.safeParse(value);
  if (profile.success) {
    const { status, ...result } = profile.data;
    void status;
    return result;
  }

  const status = statusSchema.safeParse(value);
  if (status.success) {
    return status.data.status;
  }

  throw new PlayerPersistenceError('parse', operation, {
    rpcName: operation,
    parseIssues: [
      ...zodIssuePaths(profile.error),
      ...(status.success ? [] : zodIssuePaths(status.error)),
    ],
  });
}

function parseEntryResult(
  value: unknown,
  operation: string,
): PlayerEntryProfile | PlayerPersistenceStatus {
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

  const status = statusSchema.safeParse(value);
  if (status.success) {
    return status.data.status;
  }

  throw new PlayerPersistenceError('parse', operation, {
    rpcName: operation,
    parseIssues: [
      ...zodIssuePaths(entry.error),
      ...(profile.success ? [] : zodIssuePaths(profile.error)),
      ...(status.success ? [] : zodIssuePaths(status.error)),
    ],
  });
}

export function createSupabasePlayerGateway(client: SupabaseClient): PlayerGateway {
  return {
    async loadEntry(walletAddress, requestId, touchEntry) {
      const operation = 'load_player_entry_state';
      const result = parseEntryResult(
        await executeRpc(client, operation, {
          p_wallet_address: walletAddress,
          p_request_id: requestId,
          p_touch_entry: touchEntry,
        }),
        operation,
      );
      if (result === 'not_found') return result;
      if (typeof result === 'string') {
        throw new PlayerPersistenceError('unexpected_status', operation, {
          rpcName: operation,
          status: result,
        });
      }
      return result;
    },

    async createProfile(walletAddress, input, requestId, rateLimit) {
      const operation = 'create_player_profile';
      const result = parseResult(
        await executeRpc(client, operation, {
          p_wallet_address: walletAddress,
          p_display_name: input.displayName,
          p_appearance_preset: input.appearancePreset,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
        operation,
      );
      if (result === 'rate_limited') return result;
      if (typeof result === 'string') {
        throw new PlayerPersistenceError('unexpected_status', operation, {
          rpcName: operation,
          status: result,
        });
      }
      return result;
    },

    async updateProfile(walletAddress, input, requestId, rateLimit) {
      const operation = 'update_player_profile';
      return parseEntryResult(
        await executeRpc(client, operation, {
          p_wallet_address: walletAddress,
          p_display_name: input.displayName ?? null,
          p_appearance_preset: input.appearancePreset ?? null,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
        operation,
      );
    },

    async completeRename(walletAddress, displayName, requestId, rateLimit) {
      const operation = 'complete_required_player_rename';
      return parseEntryResult(
        await executeRpc(client, operation, {
          p_wallet_address: walletAddress,
          p_display_name: displayName,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
        operation,
      );
    },

    async saveState(walletAddress, input, requestId, rateLimit) {
      const operation = 'save_player_game_state';
      return parseEntryResult(
        await executeRpc(client, operation, {
          p_wallet_address: walletAddress,
          p_map_id: input.mapId,
          p_position_x: input.x,
          p_position_y: input.y,
          p_facing_direction: input.facingDirection,
          p_expected_game_state_version: input.expectedGameStateVersion,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
        operation,
      );
    },
  };
}
