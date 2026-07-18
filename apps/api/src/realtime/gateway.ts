import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { RealtimeTicketGateway, RealtimeTicketPersistenceResult } from './contracts.js';
import type { PrivateHomeRealtimeTicketPersistenceResult } from './contracts.js';

const resultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('issued'), expiresAt: z.iso.datetime({ offset: true }) }).strict(),
  z
    .object({
      status: z.enum([
        'access_revoked',
        'profile_required',
        'player_suspended',
        'rename_required',
        'maintenance',
        'world_unavailable',
        'channel_unavailable',
      ]),
    })
    .strict(),
]);

const privateHomeResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('issued'),
      homeId: z.uuid(),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      status: z.enum([
        'access_revoked',
        'profile_required',
        'player_suspended',
        'rename_required',
        'maintenance',
        'world_unavailable',
        'world_changed',
        'plot_unavailable',
        'plot_world_mismatch',
      ]),
    })
    .strict(),
]);

export class RealtimeTicketPersistenceError extends Error {
  public constructor() {
    super('Realtime admission ticket persistence failed.');
    this.name = 'RealtimeTicketPersistenceError';
  }
}

export function createSupabaseRealtimeTicketGateway(client: SupabaseClient): RealtimeTicketGateway {
  return {
    async issue(input): Promise<RealtimeTicketPersistenceResult> {
      const { data, error } = await client.rpc('issue_player_realtime_ticket', {
        p_access_session_token_hash: input.accessSessionTokenHash,
        p_ticket_hash: input.ticketHash,
        p_requested_channel_id: input.requestedChannelId ?? null,
        p_request_id: input.requestId,
      });
      if (error !== null) throw new RealtimeTicketPersistenceError();
      return resultSchema.parse(data);
    },
    async issuePrivateHome(input): Promise<PrivateHomeRealtimeTicketPersistenceResult> {
      const { data, error } = await client.rpc('issue_player_private_home_realtime_ticket', {
        p_access_session_token_hash: input.accessSessionTokenHash,
        p_ticket_hash: input.ticketHash,
        p_home_id: input.homeId,
        p_request_id: input.requestId,
      });
      if (error !== null) throw new RealtimeTicketPersistenceError();
      return privateHomeResultSchema.parse(data);
    },
  };
}
