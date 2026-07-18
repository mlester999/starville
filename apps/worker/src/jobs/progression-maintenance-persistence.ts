import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ProgressionMaintenanceGateway } from './progression-maintenance-job.js';

const resultSchema = z
  .object({
    status: z.literal('processed'),
    rewardsProcessed: z.number().int().nonnegative(),
    reconciliationResolved: z.number().int().nonnegative(),
    manualReview: z.number().int().nonnegative(),
    automaticXpCorrections: z.literal(0),
    requestId: z.string().min(1).max(256),
  })
  .strict();

export function createProgressionMaintenanceGateway(
  client: SupabaseClient,
): ProgressionMaintenanceGateway {
  return {
    async execute(limit) {
      const { data, error } = await client.rpc('run_progression_maintenance', {
        p_limit: limit,
        p_request_id: `worker-progression:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Progression maintenance persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
