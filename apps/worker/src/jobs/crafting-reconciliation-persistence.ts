import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  CraftingReconciliationGateway,
  CraftingReconciliationResult,
} from './crafting-reconciliation-job.js';

const resultSchema = z
  .object({
    status: z.literal('completed'),
    processed: z.number().int().nonnegative(),
    readied: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    manualReview: z.number().int().nonnegative(),
    perJobTimersScheduled: z.literal(false),
  })
  .strict();

export function createCraftingReconciliationGateway(
  client: SupabaseClient,
): CraftingReconciliationGateway {
  return {
    async reconcile(batchSize): Promise<CraftingReconciliationResult> {
      const { data, error } = await client.rpc('reconcile_phase11b_crafting', {
        p_limit: batchSize,
        p_request_id: `worker-crafting-reconciliation:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Crafting reconciliation persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
