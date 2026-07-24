import type { PlayerStateUpdate } from '@starville/game-core';
import {
  SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS,
  SUPABASE_REALTIME_PROTOCOL_VERSION,
  parseSupabaseRealtimePayload,
  supabaseMovementBroadcastSchema,
  supabasePresencePayloadSchema,
  supabaseRealtimeAuthorizationViewSchema,
  type SupabaseMovementBroadcast,
  type SupabasePresencePayload,
  type SupabaseRealtimeAuthorizationView,
} from '@starville/realtime';
import { createSupabaseBrowserClient } from '@starville/supabase/browser';
import { z } from 'zod';

import { INITIAL_REALTIME_VIEW, type RealtimeViewState } from './realtime-client';

const authorizationEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: supabaseRealtimeAuthorizationViewSchema,
    requestId: z.string().min(1),
  })
  .strict();
const playerSessionEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        tokenHash: z.string().trim().min(32).max(1024),
        tokenType: z.literal('magiclink'),
      })
      .strict(),
    requestId: z.string().min(1),
  })
  .strict();

type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;
type BrowserRealtimeChannel = ReturnType<BrowserSupabaseClient['channel']>;

export interface CoreRealtimeTransport {
  start(): void;
  dispose(): void;
  reconcileVisibility(): void;
  retryNow(): void;
  switchChannel(channelId: string): void;
  sendMovement(next: PlayerStateUpdate): void;
  stopMovement(next: PlayerStateUpdate): void;
}

export interface SupabaseRealtimeConnectionOptions {
  readonly apiUrl: string;
  readonly supabase: { readonly url: string; readonly anonKey: string };
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly onState: (state: RealtimeViewState) => void;
  readonly onAccessInvalid: () => void;
  readonly createClient?: (input: unknown) => BrowserSupabaseClient;
  readonly now?: () => number;
}

const FOUNDATION_ONLY_ERROR = 'SUPABASE_PROVIDER_PHASE_13E_A_CORE_ONLY';

export class SupabaseRealtimeConnection implements CoreRealtimeTransport {
  private readonly client: BrowserSupabaseClient;
  private readonly now: () => number;
  private channel: BrowserRealtimeChannel | undefined;
  private authorization: SupabaseRealtimeAuthorizationView | undefined;
  private disposed = false;
  private connecting = false;
  private retryTimer: number | undefined;
  private refreshTimer: number | undefined;
  private movementTimer: number | undefined;
  private preferredChannelId: string | undefined;
  private latestMovement:
    { readonly state: PlayerStateUpdate; readonly stopped: boolean } | undefined;
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private sequence = 0;
  private attempt = 0;
  private state: RealtimeViewState = {
    ...INITIAL_REALTIME_VIEW,
    errorCode: FOUNDATION_ONLY_ERROR,
  };
  private readonly presenceByMembership = new Map<string, SupabasePresencePayload>();
  private readonly sequenceByPresence = new Map<string, number>();

  public constructor(private readonly options: SupabaseRealtimeConnectionOptions) {
    this.client = (options.createClient ?? createSupabaseBrowserClient)(options.supabase);
    this.now = options.now ?? Date.now;
  }

  public start(): void {
    this.disposed = false;
    void this.connect();
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimers();
    void this.leaveChannel(true);
    this.publish({ ...this.state, status: 'disconnected', remotes: [] });
  }

  public reconcileVisibility(): void {
    if (document.visibilityState !== 'visible') {
      if (this.latestMovement !== undefined) this.stopMovement(this.latestMovement.state);
      return;
    }
    if (this.channel === undefined) this.retryNow();
  }

  public retryNow(): void {
    if (this.disposed || this.connecting) return;
    if (this.retryTimer !== undefined) window.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.attempt = 0;
    void this.connect();
  }

  public switchChannel(channelId: string): void {
    if (this.preferredChannelId === channelId) return;
    this.preferredChannelId = channelId;
    this.sequence = 0;
    void this.reconnectForAuthorization();
  }

  public sendMovement(next: PlayerStateUpdate): void {
    this.queueMovement(next, false);
  }

  public stopMovement(next: PlayerStateUpdate): void {
    this.queueMovement(next, true);
  }

  private queueMovement(state: PlayerStateUpdate, stopped: boolean): void {
    this.latestMovement = { state, stopped };
    const remaining = SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS - (this.now() - this.lastSentAt);
    if (remaining <= 0) {
      void this.flushMovement();
      return;
    }
    if (this.movementTimer === undefined) {
      this.movementTimer = window.setTimeout(() => {
        this.movementTimer = undefined;
        void this.flushMovement();
      }, remaining);
    }
  }

  private async flushMovement(): Promise<void> {
    const pending = this.latestMovement;
    const authorization = this.authorization;
    const channel = this.channel;
    if (pending === undefined || authorization === undefined || channel === undefined) return;
    this.latestMovement = undefined;
    const movement: SupabaseMovementBroadcast = {
      version: SUPABASE_REALTIME_PROTOCOL_VERSION,
      membershipId: authorization.membershipId,
      presenceId: authorization.self.presenceId,
      worldId: authorization.self.worldId,
      worldVersionId: authorization.self.worldVersionId,
      channelId: authorization.self.channelId,
      sequence: ++this.sequence,
      timestamp: this.now(),
      x: pending.state.x,
      y: pending.state.y,
      facingDirection: pending.state.facingDirection,
      movementState: pending.stopped ? 'idle' : 'walking',
      animationState: pending.stopped ? 'idle' : `walk-${pending.state.facingDirection}`,
    };
    const parsed = parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, movement);
    if (parsed === undefined) return;
    this.lastSentAt = this.now();
    const result = await channel.send({ type: 'broadcast', event: 'movement', payload: parsed });
    if (result !== 'ok') this.scheduleRetry();
  }

  private async connect(): Promise<void> {
    if (this.disposed || this.connecting) return;
    this.connecting = true;
    this.publish({
      ...this.state,
      status: this.attempt === 0 ? 'connecting' : 'reconnecting',
      retryAttempt: this.attempt,
    });
    try {
      const session = await this.ensurePlayerSession();
      await this.client.realtime.setAuth(session.access_token);
      const authorization = await this.authorize(session.access_token);
      if (
        authorization.self.worldId !== this.options.worldId ||
        authorization.self.worldVersionId !== this.options.worldVersionId
      ) {
        throw new Error('SUPABASE_REALTIME_WORLD_MISMATCH');
      }
      this.authorization = authorization;
      await this.subscribe(authorization);
      this.attempt = 0;
      this.scheduleAuthorizationRefresh(authorization.authorizationExpiresAt);
    } catch (error) {
      if (this.disposed) return;
      const status = (error as { readonly status?: number }).status;
      if (status === 401 || status === 403) {
        this.publish({ ...this.state, status: 'blocked', errorCode: 'REALTIME_ACCESS_REVOKED' });
        this.options.onAccessInvalid();
        return;
      }
      this.scheduleRetry();
    } finally {
      this.connecting = false;
    }
  }

  private async ensurePlayerSession() {
    const current = await this.client.auth.getSession();
    if (
      current.data.session !== null &&
      current.data.session.user.is_anonymous !== true &&
      current.data.session.user.user_metadata['starville_identity'] === 'player'
    ) {
      return current.data.session;
    }
    if (current.data.session !== null) {
      await this.client.auth.signOut({ scope: 'local' });
    }
    const response = await fetch(
      `${this.options.apiUrl.replace(/\/$/u, '')}/api/v1/token-access/player/supabase-realtime/session`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    );
    if (!response.ok) {
      const error = new Error('SUPABASE_PLAYER_SESSION_ISSUANCE_FAILED');
      Object.assign(error, { status: response.status });
      throw error;
    }
    const challenge = playerSessionEnvelopeSchema.parse(await response.json()).data;
    const verified = await this.client.auth.verifyOtp({
      token_hash: challenge.tokenHash,
      type: challenge.tokenType,
    });
    if (
      verified.error !== null ||
      verified.data.session === null ||
      verified.data.user === null ||
      verified.data.user.is_anonymous === true ||
      verified.data.user.user_metadata['starville_identity'] !== 'player'
    ) {
      throw verified.error ?? new Error('SUPABASE_PLAYER_SESSION_UNAVAILABLE');
    }
    return verified.data.session;
  }

  private async authorize(accessToken: string): Promise<SupabaseRealtimeAuthorizationView> {
    const response = await fetch(
      `${this.options.apiUrl.replace(/\/$/u, '')}/api/v1/token-access/player/supabase-realtime/authorize`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          worldId: this.options.worldId,
          worldVersionId: this.options.worldVersionId,
          ...(this.preferredChannelId === undefined ? {} : { channelId: this.preferredChannelId }),
        }),
      },
    );
    if (!response.ok) {
      const error = new Error('SUPABASE_REALTIME_AUTHORIZATION_FAILED');
      Object.assign(error, { status: response.status });
      throw error;
    }
    return authorizationEnvelopeSchema.parse(await response.json()).data;
  }

  private async subscribe(authorization: SupabaseRealtimeAuthorizationView): Promise<void> {
    await this.leaveChannel(false);
    this.authorization = authorization;
    const channel = this.client.channel(authorization.topic, {
      config: {
        private: true,
        presence: { key: authorization.membershipId },
      },
    });
    this.channel = channel;
    channel
      .on('presence', { event: 'sync' }, () => this.syncPresence())
      .on('presence', { event: 'join' }, () => this.syncPresence())
      .on('presence', { event: 'leave' }, () => this.syncPresence())
      .on('broadcast', { event: 'movement' }, ({ payload }) => this.receiveMovement(payload));

    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const presence: SupabasePresencePayload = {
            version: SUPABASE_REALTIME_PROTOCOL_VERSION,
            membershipId: authorization.membershipId,
            player: authorization.self,
            status: 'online',
          };
          const result = await channel.track(presence);
          if (result !== 'ok') {
            reject(new Error('SUPABASE_REALTIME_PRESENCE_TRACK_FAILED'));
            return;
          }
          this.publish({
            ...this.state,
            status: 'connected',
            self: authorization.self,
            channels: authorization.channels,
            retryAttempt: 0,
            errorCode: FOUNDATION_ONLY_ERROR,
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`SUPABASE_REALTIME_${status}`));
        } else if (status === 'CLOSED' && !this.disposed) {
          this.scheduleRetry();
        }
      });
    });
  }

  private syncPresence(): void {
    const channel = this.channel;
    const authorization = this.authorization;
    if (channel === undefined || authorization === undefined) return;
    const next = new Map<string, SupabasePresencePayload>();
    const rawState = channel.presenceState() as Readonly<Record<string, readonly unknown[]>>;
    for (const metas of Object.values(rawState)) {
      for (const meta of metas) {
        if (typeof meta !== 'object' || meta === null) continue;
        // Supabase adds transport-only presence_ref/phx_ref fields. Reconstruct the exact
        // application payload so those fields are neither trusted nor treated as protocol data.
        const parsed = parseSupabaseRealtimePayload(supabasePresencePayloadSchema, {
          version: Reflect.get(meta, 'version'),
          membershipId: Reflect.get(meta, 'membershipId'),
          player: Reflect.get(meta, 'player'),
          status: Reflect.get(meta, 'status'),
        });
        if (
          parsed !== undefined &&
          parsed.player.worldId === authorization.self.worldId &&
          parsed.player.worldVersionId === authorization.self.worldVersionId &&
          parsed.player.channelId === authorization.self.channelId
        ) {
          next.set(parsed.membershipId, parsed);
        }
      }
    }
    this.presenceByMembership.clear();
    for (const [membershipId, presence] of next) {
      this.presenceByMembership.set(membershipId, presence);
    }
    this.publish({
      ...this.state,
      remotes: [...next.values()]
        .filter((presence) => presence.membershipId !== authorization.membershipId)
        .map((presence) => presence.player),
    });
  }

  private receiveMovement(payload: unknown): void {
    const movement = parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, payload);
    const authorization = this.authorization;
    if (movement === undefined || authorization === undefined) return;
    const presence = this.presenceByMembership.get(movement.membershipId);
    if (
      presence === undefined ||
      presence.player.presenceId !== movement.presenceId ||
      movement.worldId !== authorization.self.worldId ||
      movement.worldVersionId !== authorization.self.worldVersionId ||
      movement.channelId !== authorization.self.channelId ||
      Math.abs(this.now() - movement.timestamp) > 30_000
    ) {
      return;
    }
    const previousSequence = this.sequenceByPresence.get(movement.presenceId) ?? -1;
    if (movement.sequence <= previousSequence) return;
    this.sequenceByPresence.set(movement.presenceId, movement.sequence);
    const remotes = this.state.remotes.map((remote) =>
      remote.presenceId === movement.presenceId
        ? {
            ...remote,
            x: movement.x,
            y: movement.y,
            facingDirection: movement.facingDirection,
            movementState: movement.movementState,
            sequence: movement.sequence,
          }
        : remote,
    );
    this.publish({ ...this.state, remotes });
  }

  private scheduleAuthorizationRefresh(expiresAt: string): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    const delay = Math.max(5_000, Date.parse(expiresAt) - this.now() - 30_000);
    this.refreshTimer = window.setTimeout(() => void this.reconnectForAuthorization(), delay);
  }

  private async reconnectForAuthorization(): Promise<void> {
    await this.leaveChannel(false);
    if (!this.disposed) void this.connect();
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer !== undefined) return;
    this.attempt += 1;
    this.publish({
      ...this.state,
      status: 'reconnecting',
      retryAttempt: this.attempt,
      remotes: [],
    });
    const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempt, 6));
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, delay);
  }

  private async leaveChannel(closeMembership: boolean): Promise<void> {
    const channel = this.channel;
    this.channel = undefined;
    if (channel !== undefined) {
      await channel.untrack().catch(() => undefined);
      await this.client.removeChannel(channel);
    }
    this.presenceByMembership.clear();
    this.sequenceByPresence.clear();
    if (closeMembership && this.authorization !== undefined) {
      const session = await this.client.auth.getSession();
      const token = session.data.session?.access_token;
      if (token !== undefined) {
        void fetch(
          `${this.options.apiUrl.replace(/\/$/u, '')}/api/v1/token-access/player/supabase-realtime/close`,
          {
            method: 'POST',
            credentials: 'include',
            keepalive: true,
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ membershipId: this.authorization.membershipId }),
          },
        );
      }
    }
    this.authorization = undefined;
  }

  private clearTimers(): void {
    if (this.retryTimer !== undefined) window.clearTimeout(this.retryTimer);
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    if (this.movementTimer !== undefined) window.clearTimeout(this.movementTimer);
    this.retryTimer = undefined;
    this.refreshTimer = undefined;
    this.movementTimer = undefined;
  }

  private publish(next: RealtimeViewState): void {
    this.state = next;
    this.options.onState(next);
  }
}
