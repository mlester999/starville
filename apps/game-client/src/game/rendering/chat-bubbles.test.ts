import { describe, expect, it } from 'vitest';

import { STARVILLE_VISUAL_TOKENS } from '@starville/game-core';
import type { ChatMessage } from '@starville/realtime';

import {
  distanceAwareWorldLabelAlpha,
  projectWorldChatBubbleMessages,
  selectVisibleWorldChatBubbles,
} from './chat-bubbles';
import type { WorldChatBubbleMessage } from '../contracts';

const NOW = Date.parse('2026-07-18T12:00:07.000Z');

describe('bounded world chat-bubble projection', () => {
  it('keeps only the newest recent sanitized projection per visible speaker', () => {
    const messages: WorldChatBubbleMessage[] = [
      {
        id: 'old',
        worldId: 'lantern-square',
        senderPresenceId: 'fern',
        text: 'Older thought',
        sentAt: '2026-07-18T12:00:02.000Z',
      },
      {
        id: 'new',
        worldId: 'lantern-square',
        senderPresenceId: 'fern',
        text: '  Newer thought  ',
        sentAt: '2026-07-18T12:00:05.000Z',
      },
      {
        id: 'local',
        worldId: 'lantern-square',
        senderPresenceId: null,
        local: true,
        text: 'Hello!',
        sentAt: '2026-07-18T12:00:06.000Z',
      },
      {
        id: 'hidden',
        worldId: 'lantern-square',
        senderPresenceId: 'not-visible',
        text: 'No renderer',
        sentAt: '2026-07-18T12:00:06.000Z',
      },
    ];
    const selected = selectVisibleWorldChatBubbles({
      messages,
      worldId: 'lantern-square',
      visiblePresenceIds: new Set(['fern']),
      now: NOW,
      quality: 'balanced',
    });
    expect(selected).toEqual([
      expect.objectContaining({ id: 'local', speakerKey: 'local', text: 'Hello!' }),
      expect.objectContaining({ id: 'new', speakerKey: 'fern', text: 'Newer thought' }),
    ]);
  });

  it('expires stale messages and enforces the stricter low-quality cap', () => {
    const messages: WorldChatBubbleMessage[] = Array.from({ length: 8 }, (_, index) => ({
      id: `message-${String(index)}`,
      worldId: 'lantern-square',
      senderPresenceId: `presence-${String(index)}`,
      text: 'Fresh',
      sentAt: '2026-07-18T12:00:06.000Z',
    }));
    const visiblePresenceIds = new Set(
      messages.flatMap(({ senderPresenceId }) =>
        senderPresenceId === null ? [] : [senderPresenceId],
      ),
    );
    expect(
      selectVisibleWorldChatBubbles({
        messages,
        worldId: 'lantern-square',
        visiblePresenceIds,
        now: NOW,
        quality: 'low',
      }),
    ).toHaveLength(3);
    expect(
      selectVisibleWorldChatBubbles({
        messages: [
          {
            ...messages[0]!,
            sentAt: new Date(NOW - STARVILLE_VISUAL_TOKENS.chatBubbles.lifetimeMs).toISOString(),
          },
        ],
        worldId: 'lantern-square',
        visiblePresenceIds,
        now: NOW,
        quality: 'balanced',
      }),
    ).toEqual([]);
  });

  it('fades labels only through the bounded distance band', () => {
    expect(distanceAwareWorldLabelAlpha(4, 7.5, 11)).toBe(1);
    expect(distanceAwareWorldLabelAlpha(11, 7.5, 11)).toBe(0);
    expect(distanceAwareWorldLabelAlpha(9.25, 7.5, 11)).toBeCloseTo(0.5);
  });

  it('projects only player speech and marks the local speaker explicitly', () => {
    const base: ChatMessage = {
      id: '10000000-0000-4000-8000-000000000001',
      sequence: 1,
      scope: 'nearby',
      senderPresenceId: '20000000-0000-4000-8000-000000000001',
      senderDisplayName: 'Fern Friend',
      senderLevel: 3,
      worldId: 'lantern-square',
      channelId: '30000000-0000-4000-8000-000000000001',
      partyId: null,
      sentAt: '2026-07-18T12:00:06.000Z',
      text: 'Hello!',
      sourceCategory: 'player',
    };
    const projected = projectWorldChatBubbleMessages(
      [
        base,
        { ...base, scope: 'channel' },
        {
          ...base,
          id: '10000000-0000-4000-8000-000000000002',
          senderPresenceId: null,
          scope: 'system',
          sourceCategory: 'connection',
          text: 'Connected',
        },
      ],
      base.senderPresenceId ?? undefined,
    );

    expect(projected).toEqual([
      expect.objectContaining({ id: base.id, local: true, text: 'Hello!' }),
    ]);
  });
});
