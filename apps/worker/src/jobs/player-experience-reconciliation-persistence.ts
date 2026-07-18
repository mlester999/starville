import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { PlayerExperienceReconciliationGateway } from './player-experience-reconciliation-job.js';

const resultSchema = z
  .object({
    status: z.literal('completed'),
    processed: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    investigationRequired: z.number().int().nonnegative(),
    reconciledStates: z.number().int().nonnegative(),
    driftRepaired: z.number().int().nonnegative(),
    lockedObjectives: z.number().int().nonnegative(),
    missingGuidanceTargets: z.number().int().nonnegative(),
    requestId: z.string().min(1).max(128),
  })
  .strict();

export function createPlayerExperienceReconciliationGateway(
  client: SupabaseClient,
): PlayerExperienceReconciliationGateway {
  return {
    async execute(limit) {
      const { data, error } = await client.rpc('reconcile_phase12a_player_experience', {
        p_limit: limit,
        p_request_id: `worker-player-experience:${randomUUID()}`,
      });
      if (error !== null) throw new Error('Player experience reconciliation persistence failed.');
      return resultSchema.parse(data);
    },
  };
}
