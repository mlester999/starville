import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  adminSocialInteractionDetailSchema,
  adminSocialInteractionListSchema,
  socialInteractionStatusSchema,
  type AdminSocialInteractionDetail,
  type AdminSocialInteractionList,
} from '@starville/realtime';

import type { AdminDatabaseIdentity } from '../contracts.js';

export const adminSocialInteractionQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 10,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
    type: z.enum(['all', 'gift', 'trade']).default('all'),
    status: z.union([z.literal('all'), socialInteractionStatusSchema]).default('all'),
    search: z.string().trim().max(80).default(''),
  })
  .strict();
export type AdminSocialInteractionQuery = z.infer<typeof adminSocialInteractionQuerySchema>;

export interface AdminSocialGateway {
  list(
    identity: AdminDatabaseIdentity,
    query: AdminSocialInteractionQuery,
  ): Promise<AdminSocialInteractionList>;
  detail(
    identity: AdminDatabaseIdentity,
    interactionId: string,
  ): Promise<AdminSocialInteractionDetail | undefined>;
}

export class AdminSocialPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Social interaction persistence is unavailable.');
    this.name = 'AdminSocialPersistenceError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

export function createSupabaseAdminSocialGateway(client: SupabaseClient): AdminSocialGateway {
  return {
    async list(identity, query) {
      try {
        const { data, error } = await client.rpc('get_admin_social_interactions', {
          ...identityParameters(identity),
          p_type: query.type,
          p_status: query.status,
          p_search: query.search,
          p_page: query.page,
          p_page_size: query.pageSize,
        });
        if (error !== null) throw new AdminSocialPersistenceError('list');
        return adminSocialInteractionListSchema.parse(data);
      } catch (error) {
        if (error instanceof AdminSocialPersistenceError) throw error;
        throw new AdminSocialPersistenceError('list');
      }
    },
    async detail(identity, interactionId) {
      try {
        const { data, error } = await client.rpc('get_admin_social_interaction', {
          ...identityParameters(identity),
          p_interaction_id: interactionId,
        });
        if (error?.code === 'P0002') return undefined;
        if (error !== null) throw new AdminSocialPersistenceError('detail');
        return adminSocialInteractionDetailSchema.parse(data);
      } catch (error) {
        if (error instanceof AdminSocialPersistenceError) throw error;
        throw new AdminSocialPersistenceError('detail');
      }
    },
  };
}
