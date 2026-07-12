import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminDatabaseIdentity } from '../contracts.js';
import type { AdminWorldGateway } from './admin-contracts.js';

export class AdminWorldPersistenceError extends Error {
  public constructor() {
    super('Administrator world persistence failed.');
    this.name = 'AdminWorldPersistenceError';
  }
}

async function execute(
  client: SupabaseClient,
  operation: string,
  identity: AdminDatabaseIdentity,
  input: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
    ...input,
  });
  if (error !== null) throw new AdminWorldPersistenceError();
  return data;
}

export function createSupabaseAdminWorldGateway(client: SupabaseClient): AdminWorldGateway {
  return {
    listWorlds: (identity, input) => execute(client, 'list_admin_world_maps', identity, input),
    getWorld: (identity, input) => execute(client, 'get_admin_world_map', identity, input),
    getDraft: (identity, input) => execute(client, 'get_admin_world_draft', identity, input),
    createDraft: (identity, input) => execute(client, 'create_admin_world_draft', identity, input),
    saveDraft: (identity, input) => execute(client, 'save_admin_world_draft', identity, input),
    validateDraft: (identity, input) =>
      execute(client, 'validate_admin_world_draft', identity, input),
    publishVersion: (identity, input) =>
      execute(client, 'publish_admin_world_version', identity, input),
    deriveVersion: (identity, input) =>
      execute(client, 'derive_admin_world_version', identity, input),
    previewVersion: (identity, input) =>
      execute(client, 'preview_admin_world_version', identity, input),
    listAudit: (identity, input) => execute(client, 'list_admin_world_audit', identity, input),
    listAssets: (identity, input) => execute(client, 'list_admin_world_assets', identity, input),
  };
}
