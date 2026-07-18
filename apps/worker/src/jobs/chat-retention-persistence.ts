import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  ChatRetentionCleanupGateway,
  ChatRetentionCleanupResult,
} from './chat-retention-cleanup-job.js';

const resultSchema = z
  .object({
    removedMessages: z.number().int().nonnegative(),
    expiredMutes: z.number().int().nonnegative(),
  })
  .strict();

export function createChatRetentionCleanupGateway(
  client: SupabaseClient,
): ChatRetentionCleanupGateway {
  return {
    async cleanup(limit): Promise<ChatRetentionCleanupResult> {
      const { data, error } = await client.rpc('cleanup_multiplayer_chat_retention', {
        p_limit: limit,
      });
      if (error !== null) {
        throw new Error('Chat retention cleanup persistence failed.');
      }
      return resultSchema.parse(data);
    },
  };
}
