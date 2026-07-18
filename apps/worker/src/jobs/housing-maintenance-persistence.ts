import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { HousingMaintenanceGateway } from './housing-maintenance-job.js';

const resultSchema = z
  .object({
    status: z.literal('processed'),
    expiredSessions: z.number().int().nonnegative(),
    reconciliationResolved: z.number().int().nonnegative(),
    manualReview: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    capacityRepaired: z.number().int().nonnegative(),
    automaticItemCorrections: z.literal(0),
    automaticDustCorrections: z.literal(0),
    requestId: z.string().min(1).max(256),
  })
  .strict();
export function createHousingMaintenanceGateway(client: SupabaseClient): HousingMaintenanceGateway {
  return {
    async execute(limit) {
      const { data, error } = await client.rpc('run_housing_maintenance', {
        p_limit: limit,
        p_request_id: `worker-housing:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Housing maintenance persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
