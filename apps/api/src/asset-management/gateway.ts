import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminDatabaseIdentity } from '../contracts.js';
import type { AdminAssetGateway } from './contracts.js';

export class AdminAssetPersistenceError extends Error {
  public constructor() {
    super('Administrator asset persistence failed.');
    this.name = 'AdminAssetPersistenceError';
  }
}

async function execute(
  client: SupabaseClient,
  operation: string,
  identity: AdminDatabaseIdentity,
  input: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const result = await client.rpc(operation, {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
    ...input,
  });
  if (result.error !== null) throw new AdminAssetPersistenceError();
  return result.data;
}

/**
 * Keeps the SQL RPC vocabulary in one adapter so migration/API reconciliation remains localized.
 */
export function createSupabaseAdminAssetGateway(client: SupabaseClient): AdminAssetGateway {
  const call = (
    operation: string,
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ) => execute(client, operation, identity, input);

  return {
    listAssets: (identity, input) => call('list_admin_game_assets', identity, input),
    getAsset: (identity, input) => call('get_admin_game_asset', identity, input),
    getVersion: (identity, input) => call('get_admin_game_asset_version', identity, input),
    createUpload: (identity, input) => call('create_admin_game_asset_upload', identity, input),
    completeProcessing: (identity, input) =>
      call('complete_admin_game_asset_processing', identity, input),
    failProcessing: (identity, input) => call('fail_admin_game_asset_processing', identity, input),
    updateDraft: (identity, input) =>
      call('update_admin_game_asset_version_draft', identity, input),
    validateVersion: (identity, input) =>
      call('validate_admin_game_asset_version', identity, input),
    submitReview: (identity, input) => call('submit_admin_game_asset_review', identity, input),
    reviewVersion: (identity, input) => call('review_admin_game_asset_version', identity, input),
    previewMaterial: (identity, input) =>
      call('get_admin_game_asset_preview_material', identity, input),
    activationMaterial: (identity, input) =>
      call('get_admin_game_asset_activation_material', identity, input),
    activateVersion: (identity, input) =>
      call('activate_admin_game_asset_version', identity, input),
    deprecateAsset: (identity, input) => call('deprecate_admin_game_asset', identity, input),
    archiveAsset: (identity, input) => call('archive_admin_game_asset', identity, input),
    createVersion: (identity, input) => call('create_admin_game_asset_version', identity, input),
    listReviewQueue: (identity, input) =>
      call('list_admin_game_asset_review_queue', identity, input),
    listAudit: (identity, input) => call('list_admin_game_asset_audit', identity, input),
    listReferences: (identity, input) => call('list_admin_game_asset_references', identity, input),
    listEditorCandidates: (identity, input) =>
      call('list_admin_world_editor_asset_candidates', identity, input),
  };
}
