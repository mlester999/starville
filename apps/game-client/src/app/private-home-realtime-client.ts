import {
  privateHomeRealtimeServerMessageSchema,
  privateHomeRealtimeTicketSchema,
  type PlayableVerticalSlice,
  type PrivateHomeRealtimeEvent,
} from '@starville/cozy-gameplay';
import { z } from 'zod';

import { reconnectDelay } from './realtime-client';

const ticketEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: privateHomeRealtimeTicketSchema,
    requestId: z.string().min(1),
  })
  .strict();

export type PrivateHomeRealtimeStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'blocked' | 'unavailable';

export interface PrivateHomeRealtimeState {
  readonly status: PrivateHomeRealtimeStatus;
  readonly lastEventNumber: string;
  readonly errorCode?: string;
}

export const INITIAL_PRIVATE_HOME_REALTIME_STATE: PrivateHomeRealtimeState = {
  status: 'connecting',
  lastEventNumber: '0',
};

async function issuePrivateHomeTicket(apiUrl: string, homeId: string, signal: AbortSignal) {
  const response = await fetch(
    `${apiUrl}/api/v1/token-access/player/private-home-realtime-ticket`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ homeId }),
      signal,
    },
  );
  if (!response.ok) throw new Error('PRIVATE_HOME_REALTIME_TICKET_UNAVAILABLE');
  return ticketEnvelopeSchema.parse(await response.json()).data;
}

export interface PrivateHomeRealtimeConnectionOptions {
  readonly apiUrl: string;
  readonly realtimeUrl: string;
  readonly homeId: string;
  readonly onState: (state: PrivateHomeRealtimeState) => void;
  readonly onSnapshot: (
    view: PlayableVerticalSlice,
    events: readonly PrivateHomeRealtimeEvent[],
  ) => void;
  readonly onAccessInvalid: () => void;
  readonly createSocket?: (url: string) => WebSocket;
}

export class PrivateHomeRealtimeConnection {
  private socket: WebSocket | undefined;
  private controller: AbortController | undefined;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private disposed = false;
  private attempt = 0;
  private state = INITIAL_PRIVATE_HOME_REALTIME_STATE;

  public constructor(private readonly options: PrivateHomeRealtimeConnectionOptions) {}

  public start(): void {
    this.disposed = false;
    void this.connect(false);
  }

  public dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
    this.socket?.close(1000, 'Client left private home');
    this.socket = undefined;
    this.publish({ ...this.state, status: 'disconnected' });
  }

  public refresh(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        version: 1,
        type: 'snapshot.request',
        afterEventNumber: this.state.lastEventNumber,
      }),
    );
  }

  private publish(state: PrivateHomeRealtimeState): void {
    this.state = state;
    this.options.onState(state);
  }

  private async connect(reconnecting: boolean): Promise<void> {
    if (this.disposed || this.controller !== undefined) return;
    this.publish({
      status: reconnecting ? 'reconnecting' : 'connecting',
      lastEventNumber: this.state.lastEventNumber,
    });
    const controller = new AbortController();
    this.controller = controller;
    try {
      const issued = await issuePrivateHomeTicket(
        this.options.apiUrl,
        this.options.homeId,
        controller.signal,
      );
      if (this.disposed || issued.homeId !== this.options.homeId) return;
      const socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(
        `${this.options.realtimeUrl.replace(/\/$/u, '')}/private-home`,
      );
      this.socket = socket;
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ version: 1, type: 'authenticate', ticket: issued.ticket }));
      });
      socket.addEventListener('message', (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(event.data)) as unknown;
        } catch {
          return;
        }
        const parsed = privateHomeRealtimeServerMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === 'admitted') {
          if (message.homeId !== this.options.homeId) {
            socket.close(1008, 'Private-home identity changed');
            return;
          }
          this.attempt = 0;
          this.publish({ status: 'connected', lastEventNumber: message.lastEventNumber });
          this.options.onSnapshot(message.view, []);
          if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
          this.pingTimer = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ version: 1, type: 'ping', nonce: crypto.randomUUID() }));
            }
          }, 10_000);
          return;
        }
        if (message.type === 'events') {
          this.publish({ status: 'connected', lastEventNumber: message.lastEventNumber });
          this.options.onSnapshot(message.view, message.events);
          return;
        }
        if (message.type === 'error') {
          const invalidAccess = ['ACCESS_REVOKED', 'PLAYER_SUSPENDED'].includes(message.code);
          if (invalidAccess) this.options.onAccessInvalid();
          this.publish({
            status: message.retryable ? 'unavailable' : 'blocked',
            lastEventNumber: this.state.lastEventNumber,
            errorCode: message.code,
          });
        }
      });
      socket.addEventListener('close', () => {
        if (this.pingTimer !== undefined) window.clearInterval(this.pingTimer);
        this.pingTimer = undefined;
        if (this.socket === socket) this.socket = undefined;
        if (this.disposed || this.state.errorCode === 'PLOT_WORLD_MISMATCH') return;
        this.scheduleReconnect();
      });
      socket.addEventListener('error', () => socket.close());
    } catch {
      if (!this.disposed) this.scheduleReconnect();
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== undefined) return;
    this.publish({ ...this.state, status: 'reconnecting' });
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(true);
    }, delay);
  }
}
