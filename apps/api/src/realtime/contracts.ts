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

export type HomeVisitRealtimeTicketPersistenceResult =
  | {
      readonly status: 'issued';
      readonly participantId: string;
      readonly sessionId: string;
      readonly homeId: string;
      readonly expiresAt: string;
    }
  | {
      readonly status:
        | 'access_revoked'
        | 'player_suspended'
        | 'rename_required'
        | 'maintenance'
        | 'home_visitor_not_found'
        | 'home_visit_session_closing'
        | 'home_visit_blocked';
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
  issueHomeVisit(input: {
    readonly accessSessionTokenHash: string;
    readonly ticketHash: string;
    readonly participantId: string;
    readonly requestId: string;
  }): Promise<HomeVisitRealtimeTicketPersistenceResult>;
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
  issueHomeVisit(input: {
    readonly rawAccessToken: string | undefined;
    readonly participantId: unknown;
    readonly requestId: string;
  }): Promise<{
    readonly ticket: string;
    readonly participantId: string;
    readonly visitSessionId: string;
    readonly homeId: string;
    readonly expiresAt: string;
  }>;
}
