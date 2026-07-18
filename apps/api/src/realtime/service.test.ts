import { describe, expect, it, vi } from 'vitest';

import { createRealtimeTicketService } from './service.js';

describe('realtime ticket service', () => {
  it('issues only an opaque one-use ticket and hashes both stored credentials', async () => {
    const issue = vi.fn().mockResolvedValue({
      status: 'issued',
      expiresAt: '2026-07-15T00:00:30.000Z',
    });
    const service = createRealtimeTicketService({
      gateway: { issue, issuePrivateHome: vi.fn() },
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
        gateway: { issue: vi.fn().mockResolvedValue({ status }), issuePrivateHome: vi.fn() },
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
      gateway: { issue: vi.fn(), issuePrivateHome },
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
});
