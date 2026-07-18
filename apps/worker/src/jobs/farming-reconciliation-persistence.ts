import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  FarmingReconciliationGateway,
  FarmingReconciliationResult,
} from './farming-reconciliation-job.js';

const resultSchema = z
  .object({
    status: z.literal('completed'),
    processed: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    perCropTimersScheduled: z.literal(false),
  })
  .strict();

export function createFarmingReconciliationGateway(
  client: SupabaseClient,
): FarmingReconciliationGateway {
  return {
    async reconcile(batchSize): Promise<FarmingReconciliationResult> {
      const { data, error } = await client.rpc('reconcile_phase11_farming', {
        p_limit: batchSize,
        p_request_id: `worker-farming-reconciliation:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Farming reconciliation persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
