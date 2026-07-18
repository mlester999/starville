import { cosmeticWardrobeSchema } from '@starville/cosmetics';
import { fromPersistedAvatarSelection } from '@starville/avatar';

import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import type { CosmeticGateway, CosmeticService } from './contracts.js';
import { CosmeticPersistenceError } from './gateway.js';

const failures: Readonly<
  Record<string, readonly [PublicApiError['statusCode'], SafeApiErrorCode]>
> = {
  access_revoked: [401, 'TOKEN_ACCESS_REQUIRED'],
  suspended: [403, 'PLAYER_SUSPENDED'],
  rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
  maintenance: [503, 'COSMETICS_MAINTENANCE'],
  module_disabled: [404, 'MODULE_DISABLED'],
  not_found: [404, 'COSMETIC_NOT_FOUND'],
  not_owned: [403, 'COSMETIC_NOT_OWNED'],
  incomplete: [409, 'COLLECTION_INCOMPLETE'],
  already_claimed: [409, 'COLLECTION_REWARD_CLAIMED'],
  rate_limited: [429, 'RATE_LIMITED'],
  loadout_changed: [409, 'COSMETIC_LOADOUT_CHANGED'],
  wheel_changed: [409, 'EMOTE_WHEEL_CHANGED'],
  profile_changed: [409, 'AVATAR_PROFILE_CHANGED'],
  request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
  request_conflict: [409, 'REQUEST_ALREADY_PROCESSED'],
  state_conflict: [409, 'COSMETIC_OWNERSHIP_CHANGED'],
  player_not_found: [404, 'PLAYER_NOT_FOUND'],
  access_changed: [401, 'TOKEN_ACCESS_REQUIRED'],
  invalid_request: [400, 'INVALID_COSMETIC_REQUEST'],
  invalid_selection: [400, 'INVALID_AVATAR_SELECTION'],
  content_unavailable: [409, 'COSMETIC_CONTENT_UNAVAILABLE'],
  loadout_unavailable: [409, 'COSMETIC_LOADOUT_UNAVAILABLE'],
};

function result(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PublicApiError(503, 'COSMETICS_UNAVAILABLE');
  }
  const output = value as Record<string, unknown>;
  const status = output['status'];
  if (typeof status === 'string' && status in failures) {
    const failure = failures[status];
    if (failure !== undefined) throw new PublicApiError(failure[0], failure[1]);
  }
  return output;
}

function normalizeWardrobe(value: Record<string, unknown>): Record<string, unknown> {
  const loadouts = value['loadouts'];
  if (!Array.isArray(loadouts)) return value;
  return {
    ...value,
    loadouts: loadouts.map((loadout) => {
      if (typeof loadout !== 'object' || loadout === null || Array.isArray(loadout)) return loadout;
      const record = loadout as Record<string, unknown>;
      return { ...record, selection: fromPersistedAvatarSelection(record['selection']) };
    }),
  };
}

export function createCosmeticService(gateway: CosmeticGateway): CosmeticService {
  return {
    async wardrobe(context) {
      try {
        return cosmeticWardrobeSchema.parse(
          normalizeWardrobe(result(await gateway.wardrobe(context))),
        );
      } catch (error) {
        if (error instanceof CosmeticPersistenceError) {
          throw new PublicApiError(503, 'COSMETICS_UNAVAILABLE');
        }
        throw error;
      }
    },
    async mutate(operation) {
      try {
        return result(await operation());
      } catch (error) {
        if (error instanceof CosmeticPersistenceError) {
          throw new PublicApiError(503, 'COSMETICS_UNAVAILABLE');
        }
        throw error;
      }
    },
  };
}
