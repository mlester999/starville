import { describe, expect, it, vi } from 'vitest';

import { createRealtimeTicketService } from './service.js';

describe('realtime ticket service', () => {
  it('issues only an opaque one-use ticket and hashes both stored credentials', async () => {
    const issue = vi.fn().mockResolvedValue({
      status: 'issued',
      expiresAt: '2026-07-15T00:00:30.000Z',
    });
    const service = createRealtimeTicketService({
      gateway: { issue, issuePrivateHome: vi.fn(), issueHomeVisit: vi.fn() },
      accessTokenSecret: 'access-secret-at-least-thirty-two-characters',
      ticketSecret: 'ticket-secret-at-least-thirty-two-characters',
      createTicket: () => 'a'.repeat(43),
    });
    await expect(
      service.issue({ rawAccessToken: 'b'.repeat(43), requestId: 'request-1' }),
    ).resolves.toEqual({
      ticket: 'a'.repeat(43),
      expiresAt: '2026-07-15T00:00:30.000Z',
    });
    expect(issue).toHaveBeenCalledWith({
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      ticketHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      requestId: 'request-1',
    });
    expect(JSON.stringify(issue.mock.calls)).not.toContain('a'.repeat(43));
    expect(JSON.stringify(issue.mock.calls)).not.toContain('b'.repeat(43));
  });

  it('maps revoked and suspended admission safely', async () => {
    const create = (status: 'access_revoked' | 'player_suspended') =>
      createRealtimeTicketService({
        gateway: {
          issue: vi.fn().mockResolvedValue({ status }),
          issuePrivateHome: vi.fn(),
          issueHomeVisit: vi.fn(),
        },
        accessTokenSecret: 'access-secret-at-least-thirty-two-characters',
        ticketSecret: 'ticket-secret-at-least-thirty-two-characters',
        createTicket: () => 'a'.repeat(43),
      });
    await expect(
      create('access_revoked').issue({ rawAccessToken: 'b'.repeat(43), requestId: 'one' }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'TOKEN_ACCESS_REVOKED' });
    await expect(
      create('player_suspended').issue({ rawAccessToken: 'b'.repeat(43), requestId: 'two' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'PLAYER_SUSPENDED' });
  });

  it('issues an owner-scoped private-home ticket without exposing either raw token', async () => {
    const issuePrivateHome = vi.fn().mockResolvedValue({
      status: 'issued',
      homeId: '10000000-0000-4000-8000-000000000001',
      expiresAt: '2026-07-17T00:00:30.000Z',
    });
    const service = createRealtimeTicketService({
      gateway: { issue: vi.fn(), issuePrivateHome, issueHomeVisit: vi.fn() },
      accessTokenSecret: 'access-secret-at-least-thirty-two-characters',
      ticketSecret: 'ticket-secret-at-least-thirty-two-characters',
      createTicket: () => 'c'.repeat(43),
    });

    await expect(
      service.issuePrivateHome({
        rawAccessToken: 'd'.repeat(43),
        homeId: '10000000-0000-4000-8000-000000000001',
        requestId: 'private-home-1',
      }),
    ).resolves.toEqual({
      ticket: 'c'.repeat(43),
      homeId: '10000000-0000-4000-8000-000000000001',
      expiresAt: '2026-07-17T00:00:30.000Z',
    });
    expect(issuePrivateHome).toHaveBeenCalledWith({
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      ticketHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      homeId: '10000000-0000-4000-8000-000000000001',
      requestId: 'private-home-1',
    });
    expect(JSON.stringify(issuePrivateHome.mock.calls)).not.toContain('c'.repeat(43));
    expect(JSON.stringify(issuePrivateHome.mock.calls)).not.toContain('d'.repeat(43));
  });

  it('issues a participant-bound one-use home-visit ticket without storing raw credentials', async () => {
    const issueHomeVisit = vi.fn().mockResolvedValue({
      status: 'issued',
      participantId: 'f1100000-0000-4000-8000-000000000011',
      sessionId: 'f1100000-0000-4000-8000-000000000012',
      homeId: 'f1100000-0000-4000-8000-000000000013',
      expiresAt: '2026-07-18T00:00:30.000Z',
    });
    const service = createRealtimeTicketService({
      gateway: { issue: vi.fn(), issuePrivateHome: vi.fn(), issueHomeVisit },
      accessTokenSecret: 'access-secret-at-least-thirty-two-characters',
      ticketSecret: 'ticket-secret-at-least-thirty-two-characters',
      createTicket: () => 'e'.repeat(43),
    });
    await expect(
      service.issueHomeVisit({
        rawAccessToken: 'f'.repeat(43),
        participantId: 'f1100000-0000-4000-8000-000000000011',
        requestId: 'home-visit-ticket-1',
      }),
    ).resolves.toMatchObject({
      ticket: 'e'.repeat(43),
      participantId: 'f1100000-0000-4000-8000-000000000011',
      visitSessionId: 'f1100000-0000-4000-8000-000000000012',
    });
    expect(issueHomeVisit).toHaveBeenCalledWith({
      accessSessionTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      ticketHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      participantId: 'f1100000-0000-4000-8000-000000000011',
      requestId: 'home-visit-ticket-1',
    });
    expect(JSON.stringify(issueHomeVisit.mock.calls)).not.toContain('e'.repeat(43));
    expect(JSON.stringify(issueHomeVisit.mock.calls)).not.toContain('f'.repeat(43));
  });
});
