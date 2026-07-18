import { z } from 'zod';
import {
  homeVisitRealtimeServerMessageSchema,
  type HomeVisitRealtimeServerMessage,
} from '@starville/housing';

const ticketSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        ticket: z.string().length(43),
        participantId: z.uuid(),
        visitSessionId: z.uuid(),
        homeId: z.uuid(),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    requestId: z.string().min(1),
  })
  .strict();

export async function issueHomeVisitRealtimeTicket(
  apiUrl: string,
  participantId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(`${apiUrl}/api/v1/token-access/player/home-visit-realtime-ticket`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ participantId }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error('HOME_VISIT_REALTIME_TICKET_UNAVAILABLE');
  return ticketSchema.parse(await response.json()).data;
}

export class HomeVisitRealtimeConnection {
  private socket: WebSocket | undefined;
  public constructor(
    private readonly options: {
      apiUrl: string;
      realtimeUrl: string;
      participantId: string;
      onMessage: (message: HomeVisitRealtimeServerMessage) => void;
      onClose: () => void;
      createSocket?: (url: string) => WebSocket;
    },
  ) {}
  public async connect(signal?: AbortSignal) {
    const issued = await issueHomeVisitRealtimeTicket(
      this.options.apiUrl,
      this.options.participantId,
      signal,
    );
    if (issued.participantId !== this.options.participantId)
      throw new Error('HOME_VISIT_IDENTITY_CHANGED');
    const socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(
      `${this.options.realtimeUrl.replace(/\/$/u, '')}/home-visit`,
    );
    this.socket = socket;
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({ type: 'authenticate', ticket: issued.ticket })),
    );
    socket.addEventListener('message', (event) => {
      try {
        const parsed = homeVisitRealtimeServerMessageSchema.safeParse(
          JSON.parse(String(event.data)),
        );
        if (parsed.success) this.options.onMessage(parsed.data);
      } catch {
        /* malformed server messages are ignored */
      }
    });
    socket.addEventListener('close', this.options.onClose);
    socket.addEventListener('error', () => socket.close());
  }
  public move(x: number, y: number, facingDirection: string, sequence: number) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'movement', x, y, facingDirection, sequence }));
    }
  }
  public sync(afterEventNumber: string, forceSnapshot = false) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'sync', afterEventNumber, forceSnapshot }));
    }
  }
  public close() {
    this.socket?.close(1000, 'Visitor left home');
  }
}
