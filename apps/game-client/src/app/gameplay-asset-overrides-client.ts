import { z } from 'zod';

import {
  STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS,
  gameplayAssetOverridesSchema,
  type GameplayAssetOverride,
} from '@starville/asset-management';

import { PlayerRequestError, requestPlayerApi } from './player-client';

const responseSchema = z
  .object({
    status: z.literal('loaded'),
    requestedKeyCount: z.number().int().positive(),
    items: gameplayAssetOverridesSchema,
  })
  .strict();

export async function loadGameplayAssetOverrides(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<readonly GameplayAssetOverride[]> {
  const value = await requestPlayerApi(apiUrl, '/asset-overrides', {
    method: 'POST',
    body: { assetKeys: STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS },
    ...(signal === undefined ? {} : { signal }),
  });
  const parsed = responseSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.requestedKeyCount !== STARVILLE_GAMEPLAY_ASSET_OVERRIDE_KEYS.length
  ) {
    throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  }
  return parsed.data.items;
}
