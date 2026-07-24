import type { SupabaseRealtimeAuthorizationView } from '@starville/realtime';

export type SupabaseRealtimePlayerTokenType = 'magiclink' | 'signup';

export type SupabaseRealtimeAuthorizationPersistenceResult =
  | ({ readonly status: 'authorized' } & SupabaseRealtimeAuthorizationView)
  | {
      readonly status:
        | 'auth_identity_invalid'
        | 'environment_mismatch'
        | 'access_revoked'
        | 'profile_required'
        | 'player_suspended'
        | 'rename_required'
        | 'maintenance'
        | 'world_unavailable'
        | 'channel_unavailable'
        | 'channel_full';
    };

export type SupabaseRealtimePlayerSessionResult =
  | {
      readonly status: 'issued';
      readonly tokenHash: string;
      readonly tokenType: SupabaseRealtimePlayerTokenType;
    }
  | {
      readonly status:
        | 'access_revoked'
        | 'profile_required'
        | 'player_suspended'
        | 'rename_required'
        | 'maintenance'
        | 'world_unavailable'
        | 'auth_identity_invalid'
        | 'auth_identity_conflict';
    };

export interface SupabaseRealtimeGateway {
  issuePlayerSession(input: {
    readonly accessSessionTokenHash: string;
    readonly requestId: string;
  }): Promise<SupabaseRealtimePlayerSessionResult>;
  verifyPlayerIdentity(accessToken: string): Promise<string | undefined>;
  authorize(input: {
    readonly authUserId: string;
    readonly accessSessionTokenHash: string;
    readonly environment: 'development' | 'test' | 'production';
    readonly requestedChannelId?: string;
    readonly requestId: string;
  }): Promise<SupabaseRealtimeAuthorizationPersistenceResult>;
  close(input: {
    readonly authUserId: string;
    readonly membershipId: string;
    readonly requestId: string;
  }): Promise<boolean>;
}

export interface SupabaseRealtimeAuthorizationService {
  issuePlayerSession(input: {
    readonly rawAccessToken: string | undefined;
    readonly requestId: string;
  }): Promise<{
    readonly tokenHash: string;
    readonly tokenType: SupabaseRealtimePlayerTokenType;
  }>;
  authorize(input: {
    readonly bearerToken: string | undefined;
    readonly rawAccessToken: string | undefined;
    readonly expectedWorldId: string;
    readonly expectedWorldVersionId: string;
    readonly requestedChannelId: unknown;
    readonly requestId: string;
  }): Promise<SupabaseRealtimeAuthorizationView>;
  close(input: {
    readonly bearerToken: string | undefined;
    readonly membershipId: unknown;
    readonly requestId: string;
  }): Promise<void>;
}
