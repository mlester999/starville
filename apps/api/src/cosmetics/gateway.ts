import type { SupabaseClient } from '@supabase/supabase-js';
import { avatarSelectionSchema, toPersistedAvatarSelection } from '@starville/avatar';

import type { AdminCosmeticGateway, CosmeticGateway, CosmeticPlayerContext } from './contracts.js';

export class CosmeticPersistenceError extends Error {
  public constructor(public readonly operation: string) {
    super('Cosmetic persistence operation failed.');
    this.name = 'CosmeticPersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new CosmeticPersistenceError(operation);
  return data;
}

function player(context: CosmeticPlayerContext) {
  return {
    p_wallet_address: context.walletAddress,
    p_access_session_token_hash: context.accessSessionTokenHash,
  } as const;
}

export function createSupabaseCosmeticGateway(client: SupabaseClient): CosmeticGateway {
  return {
    wardrobe: (context) =>
      rpc(client, 'get_player_cosmetic_wardrobe', {
        ...player(context),
        p_request_id: context.requestId,
      }),
    saveLoadout: (context, input) =>
      rpc(client, 'save_player_cosmetic_loadout', {
        ...player(context),
        p_slot: input.slot,
        p_display_name: input.name,
        p_selection: toPersistedAvatarSelection(avatarSelectionSchema.parse(input.selection)),
        p_expected_revision: input.expectedRevision,
        p_request_id: input.requestId,
      }),
    renameLoadout: (context, loadoutId, input) =>
      rpc(client, 'rename_player_cosmetic_loadout', {
        ...player(context),
        p_loadout_id: loadoutId,
        p_display_name: input.name,
        p_expected_revision: input.expectedRevision,
        p_request_id: input.requestId,
      }),
    deleteLoadout: (context, loadoutId, input) =>
      rpc(client, 'delete_player_cosmetic_loadout', {
        ...player(context),
        p_loadout_id: loadoutId,
        p_expected_revision: input.expectedRevision,
        p_request_id: input.requestId,
      }),
    applyLoadout: (context, loadoutId, input) =>
      rpc(client, 'apply_player_cosmetic_loadout', {
        ...player(context),
        p_loadout_id: loadoutId,
        p_expected_loadout_revision: input.expectedLoadoutRevision,
        p_expected_avatar_revision: input.expectedAvatarRevision,
        p_request_id: input.requestId,
      }),
    updateEmoteWheel: (context, input) =>
      rpc(client, 'update_player_emote_wheel', {
        ...player(context),
        p_emote_keys: input.emoteKeys,
        p_expected_revision: input.expectedRevision,
        p_request_id: input.requestId,
      }),
    activateEmote: (context, emoteKey) =>
      rpc(client, 'activate_player_emote', {
        ...player(context),
        p_emote_key: emoteKey,
        p_request_id: context.requestId,
      }),
    claimCollection: (context, collectionKey) =>
      rpc(client, 'claim_player_cosmetic_collection_reward', {
        ...player(context),
        p_collection_key: collectionKey,
        p_request_id: context.requestId,
      }),
  };
}

function admin(identity: Parameters<AdminCosmeticGateway['overview']>[0]) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  } as const;
}

export function createSupabaseAdminCosmeticGateway(client: SupabaseClient): AdminCosmeticGateway {
  return {
    overview: (identity) => rpc(client, 'get_admin_cosmetic_overview', admin(identity)),
    audit: (identity, page, pageSize) =>
      rpc(client, 'list_admin_cosmetic_audit', {
        ...admin(identity),
        p_page: page,
        p_page_size: pageSize,
      }),
    settings: (identity) => rpc(client, 'get_admin_cosmetic_settings', admin(identity)),
    shop: (identity) => rpc(client, 'get_admin_cosmetic_shop_preview', admin(identity)),
    grant: (
      identity,
      playerProfileId,
      cosmeticKey,
      reasonCategory,
      explanation,
      expectedState,
      requestId,
    ) =>
      rpc(client, 'grant_admin_player_cosmetic', {
        ...admin(identity),
        p_player_profile_id: playerProfileId,
        p_cosmetic_key: cosmeticKey,
        p_reason_category: reasonCategory,
        p_explanation: explanation,
        p_expected_state: expectedState,
        p_request_id: requestId,
      }),
    revoke: (
      identity,
      playerProfileId,
      cosmeticKey,
      reasonCategory,
      explanation,
      expectedState,
      requestId,
    ) =>
      rpc(client, 'revoke_admin_player_cosmetic', {
        ...admin(identity),
        p_player_profile_id: playerProfileId,
        p_cosmetic_key: cosmeticKey,
        p_reason_category: reasonCategory,
        p_explanation: explanation,
        p_expected_state: expectedState,
        p_request_id: requestId,
      }),
  };
}
