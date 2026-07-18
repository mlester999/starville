import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { HomeVisitMaintenanceGateway } from './home-visit-maintenance-job.js';

const resultSchema = z
  .object({
    status: z.literal('completed'),
    expiredInvitations: z.number().int().nonnegative(),
    closedSessions: z.number().int().nonnegative(),
    releasedParticipants: z.number().int().nonnegative(),
    reconciledCounts: z.number().int().nonnegative(),
  })
  .strict();

export function createHomeVisitMaintenanceGateway(
  client: SupabaseClient,
): HomeVisitMaintenanceGateway {
  return {
    async execute(limit) {
      const { data, error } = await client.rpc('run_home_visit_maintenance', {
        p_limit: limit,
        p_request_id: `worker-home-visits:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Home visit maintenance persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
