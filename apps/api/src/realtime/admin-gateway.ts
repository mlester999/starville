import type { SupabaseClient } from '@supabase/supabase-js';

import { adminRealtimeOverviewSchema, type AdminRealtimeOverview } from '@starville/realtime';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface AdminRealtimeGateway {
  getOverview(identity: AdminDatabaseIdentity): Promise<AdminRealtimeOverview>;
}

export class AdminRealtimePersistenceError extends Error {
  public constructor() {
    super('Realtime operations visibility is unavailable.');
    this.name = 'AdminRealtimePersistenceError';
  }
}

export function createSupabaseAdminRealtimeGateway(client: SupabaseClient): AdminRealtimeGateway {
  return {
    async getOverview(identity) {
      const { data, error } = await client.rpc('get_admin_realtime_overview', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_assurance_level: identity.assuranceLevel,
      });
      if (error !== null) throw new AdminRealtimePersistenceError();
      return adminRealtimeOverviewSchema.parse(data);
    },
  };
}
