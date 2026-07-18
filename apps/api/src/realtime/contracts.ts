import type { PrivateHomeRealtimeTicket } from '@starville/cozy-gameplay';
import type { RealtimeTicketView } from '@starville/realtime';

export type RealtimeTicketPersistenceResult =
  | { readonly status: 'issued'; readonly expiresAt: string }
  | {
      readonly status:
        | 'access_revoked'
        | 'profile_required'
        | 'player_suspended'
        | 'rename_required'
        | 'maintenance'
        | 'world_unavailable'
        | 'channel_unavailable';
    };

export type PrivateHomeRealtimeTicketPersistenceResult =
  | { readonly status: 'issued'; readonly homeId: string; readonly expiresAt: string }
  | {
      readonly status:
        | 'access_revoked'
        | 'profile_required'
        | 'player_suspended'
        | 'rename_required'
        | 'maintenance'
        | 'world_unavailable'
        | 'world_changed'
        | 'plot_unavailable'
        | 'plot_world_mismatch';
    };

export interface RealtimeTicketGateway {
  issue(input: {
    readonly accessSessionTokenHash: string;
    readonly ticketHash: string;
    readonly requestedChannelId?: string;
    readonly requestId: string;
  }): Promise<RealtimeTicketPersistenceResult>;
  issuePrivateHome(input: {
    readonly accessSessionTokenHash: string;
    readonly ticketHash: string;
    readonly homeId: string;
    readonly requestId: string;
  }): Promise<PrivateHomeRealtimeTicketPersistenceResult>;
}

export interface RealtimeTicketService {
  issue(input: {
    readonly rawAccessToken: string | undefined;
    readonly requestedChannelId?: unknown;
    readonly requestId: string;
  }): Promise<RealtimeTicketView>;
  issuePrivateHome(input: {
    readonly rawAccessToken: string | undefined;
    readonly homeId: unknown;
    readonly requestId: string;
  }): Promise<PrivateHomeRealtimeTicket>;
}
