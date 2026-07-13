import type { SupabaseClient } from '@supabase/supabase-js';

import type { LiveOperationsGateway } from './contracts.js';

export class LiveOperationsPersistenceError extends Error {
  public constructor() {
    super('Trusted live-operations persistence failed.');
    this.name = 'LiveOperationsPersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  name: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters);
  if (error !== null) throw new LiveOperationsPersistenceError();
  return data;
}

function identity(identity: {
  readonly userId: string;
  readonly authSessionId: string;
  readonly assuranceLevel: string;
}) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

export function createSupabaseLiveOperationsGateway(client: SupabaseClient): LiveOperationsGateway {
  return {
    getPublic: () => rpc(client, 'get_public_live_operations', {}),
    getAdmin: (admin, query) =>
      rpc(client, 'get_admin_live_operations', {
        ...identity(admin),
        p_search: query.search,
        p_status: query.status,
        p_severity: query.severity,
        p_presentation: query.presentation,
        p_sort: query.sort,
        p_direction: query.direction,
        p_page: query.page,
        p_page_size: query.pageSize,
        p_audit_page: query.auditPage,
        p_audit_page_size: query.auditPageSize,
      }),
    updateMaintenance: (admin, input, requestId) =>
      rpc(client, 'update_admin_maintenance', {
        ...identity(admin),
        p_input: input,
        p_request_id: requestId,
      }),
    saveAnnouncement: (admin, input, requestId) =>
      rpc(client, 'save_admin_announcement', {
        ...identity(admin),
        p_input: input,
        p_request_id: requestId,
      }),
    setAnnouncementStatus: (admin, id, revision, action, reason, requestId) =>
      rpc(client, 'set_admin_announcement_status', {
        ...identity(admin),
        p_announcement_id: id,
        p_expected_revision: revision,
        p_action: action,
        p_reason: reason,
        p_request_id: requestId,
      }),
  };
}
