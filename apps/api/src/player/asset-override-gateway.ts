import { z } from 'zod';

import {
  persistedGameplayAssetOverrideResultSchema,
  type GameplayAssetOverrideFailure,
  type GameplayAssetOverrideGateway,
  type SupabaseGameplayAssetOverrideClient,
} from './asset-override-contracts.js';

const failureSchema = z
  .object({ status: z.enum(['not_found', 'suspended', 'rename_required', 'rate_limited']) })
  .strict();

export class GameplayAssetOverridePersistenceError extends Error {
  public constructor() {
    super('Gameplay asset override persistence failed.');
    this.name = 'GameplayAssetOverridePersistenceError';
  }
}

export function parseGameplayAssetOverrideResult(
  value: unknown,
): z.infer<typeof persistedGameplayAssetOverrideResultSchema> | GameplayAssetOverrideFailure {
  const failure = failureSchema.safeParse(value);
  if (failure.success) return failure.data.status;
  const loaded = persistedGameplayAssetOverrideResultSchema.safeParse(value);
  if (!loaded.success) throw new GameplayAssetOverridePersistenceError();
  return loaded.data;
}

export function createSupabaseGameplayAssetOverrideGateway(
  client: SupabaseGameplayAssetOverrideClient,
): GameplayAssetOverrideGateway {
  return {
    async loadActive(walletAddress, assetKeys, requestId, rateLimit) {
      const { data, error } = await client.rpc('get_player_gameplay_asset_overrides', {
        p_wallet_address: walletAddress,
        p_asset_keys: [...assetKeys],
        p_request_id: requestId,
        p_rate_limit: rateLimit,
      });
      if (error !== null) throw new GameplayAssetOverridePersistenceError();
      return parseGameplayAssetOverrideResult(data);
    },
  };
}
