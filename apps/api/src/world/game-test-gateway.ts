import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminDatabaseIdentity } from '../contracts.js';
import type { WorldGameTestGateway } from './game-test-contracts.js';

export class WorldGameTestPersistenceError extends Error {
  public constructor() {
    super('World Game Test persistence failed.');
    this.name = 'WorldGameTestPersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  input: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, input);
  if (error !== null) throw new WorldGameTestPersistenceError();
  return data;
}

function adminInput(
  identity: AdminDatabaseIdentity,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
    ...input,
  };
}

export function createSupabaseWorldGameTestGateway(client: SupabaseClient): WorldGameTestGateway {
  return {
    create: (identity, input) =>
      rpc(client, 'create_admin_world_game_test', adminInput(identity, input)),
    exchange: (input) => rpc(client, 'exchange_world_game_test_grant', input),
    load: (input) => rpc(client, 'get_world_game_test_session', input),
    statusAdmin: (identity, input) =>
      rpc(client, 'get_admin_world_game_test_status', adminInput(identity, input)),
    exit: (input) => rpc(client, 'exit_world_game_test_session', input),
    revoke: (identity, input) =>
      rpc(client, 'revoke_admin_world_game_test_session', adminInput(identity, input)),
    recordEvidence: (identity, input) =>
      rpc(client, 'record_admin_world_game_test_evidence', adminInput(identity, input)),
  };
}
