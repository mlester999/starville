import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  SocialGraphCleanupGateway,
  SocialGraphCleanupResult,
} from './social-graph-cleanup-job.js';

const resultSchema = z
  .object({
    expiredFriendRequests: z.number().int().nonnegative(),
    expiredInvitations: z.number().int().nonnegative(),
    expiredReadyChecks: z.number().int().nonnegative(),
    leadersTransferred: z.number().int().nonnegative(),
    partiesExpired: z.number().int().nonnegative(),
    notificationsRemoved: z.number().int().nonnegative(),
    idempotencyRemoved: z.number().int().nonnegative(),
    auditRemoved: z.number().int().nonnegative(),
  })
  .strict();

export function createSocialGraphCleanupGateway(client: SupabaseClient): SocialGraphCleanupGateway {
  return {
    async cleanup(batchSize): Promise<SocialGraphCleanupResult> {
      const { data, error } = await client.rpc('cleanup_social_graph', {
        p_batch_size: batchSize,
        p_request_id: `worker-social-graph-cleanup:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Social graph cleanup persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
