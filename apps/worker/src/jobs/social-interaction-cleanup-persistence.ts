import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  SocialInteractionCleanupGateway,
  SocialInteractionCleanupResult,
} from './social-interaction-cleanup-job.js';

const resultSchema = z
  .object({
    processed: z.number().int().nonnegative(),
    reservationsReleased: z.number().int().nonnegative(),
  })
  .strict();

export function createSocialInteractionCleanupGateway(
  client: SupabaseClient,
): SocialInteractionCleanupGateway {
  return {
    async cleanup(batchSize): Promise<SocialInteractionCleanupResult> {
      const { data, error } = await client.rpc('cleanup_social_interactions', {
        p_batch_size: batchSize,
        p_request_id: `worker-social-cleanup:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Social interaction cleanup persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
