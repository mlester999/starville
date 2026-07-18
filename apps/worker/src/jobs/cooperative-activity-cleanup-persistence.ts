import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  CooperativeActivityCleanupGateway,
  CooperativeActivityCleanupResult,
} from './cooperative-activity-cleanup-job.js';

const resultSchema = z
  .object({
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    reconnectsExpired: z.number().int().nonnegative(),
    pendingRewardsClaimed: z.number().int().nonnegative(),
  })
  .strict();

export function createCooperativeActivityCleanupGateway(
  client: SupabaseClient,
): CooperativeActivityCleanupGateway {
  return {
    async cleanup(batchSize): Promise<CooperativeActivityCleanupResult> {
      const { data, error } = await client.rpc('cleanup_cooperative_activities', {
        p_batch_size: batchSize,
        p_request_id: `worker-activity-cleanup:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Cooperative activity cleanup persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
