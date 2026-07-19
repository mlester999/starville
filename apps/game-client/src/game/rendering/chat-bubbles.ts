import type Phaser from 'phaser';

import {
  STARVILLE_VISUAL_TOKENS,
  projectWorld,
  type IsometricProjection,
  type Point,
  type WorldVisualQuality,
} from '@starville/game-core';
import { CHAT_HISTORY_LIMIT, type ChatMessage } from '@starville/realtime';

import type { WorldChatBubbleMessage } from '../contracts';

export interface VisibleWorldChatBubble {
  readonly id: string;
  readonly speakerKey: 'local' | string;
  readonly text: string;
  readonly expiresAt: number;
}

export interface SelectWorldChatBubblesInput {
  readonly messages: readonly WorldChatBubbleMessage[];
  readonly worldId: string;
  readonly visiblePresenceIds: ReadonlySet<string>;
  readonly now: number;
  readonly quality: WorldVisualQuality;
}

/**
 * Projects already-authorized realtime chat into the minimal renderer
 * contract. System/moderation notices never masquerade as speech, duplicate
 * history entries collapse by immutable message ID, and local identity is
 * explicit rather than inferred from a null sender.
 */
export function projectWorldChatBubbleMessages(
  messages: readonly ChatMessage[],
  selfPresenceId: string | undefined,
): readonly WorldChatBubbleMessage[] {
  const byId = new Map<string, WorldChatBubbleMessage>();
  for (const message of messages) {
    if (
      message.scope === 'system' ||
      message.sourceCategory !== 'player' ||
      message.senderPresenceId === null
    ) {
      continue;
    }
    const local = message.senderPresenceId === selfPresenceId;
    byId.set(message.id, {
      id: message.id,
      worldId: message.worldId,
      senderPresenceId: message.senderPresenceId,
      text: message.text,
      sentAt: message.sentAt,
      ...(local ? { local: true } : {}),
    });
  }
  return [...byId.values()]
    .sort((left, right) => Date.parse(left.sentAt) - Date.parse(right.sentAt))
    .slice(-CHAT_HISTORY_LIMIT);
}

function sentAtMilliseconds(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function selectVisibleWorldChatBubbles(
  input: SelectWorldChatBubblesInput,
): readonly VisibleWorldChatBubble[] {
  const maximumVisible =
    input.quality === 'low'
      ? Math.min(3, STARVILLE_VISUAL_TOKENS.chatBubbles.maximumVisible)
      : STARVILLE_VISUAL_TOKENS.chatBubbles.maximumVisible;
  const candidates = input.messages
    .flatMap((message) => {
      if (message.worldId !== input.worldId) return [];
      const speakerKey = message.local === true ? 'local' : message.senderPresenceId;
      if (
        speakerKey === null ||
        (speakerKey !== 'local' && !input.visiblePresenceIds.has(speakerKey))
      ) {
        return [];
      }
      const sentAt = sentAtMilliseconds(message.sentAt);
      const text = message.text
        .trim()
        .slice(0, STARVILLE_VISUAL_TOKENS.chatBubbles.maximumCharacters);
      if (sentAt === undefined || text.length === 0) return [];
      const expiresAt = sentAt + STARVILLE_VISUAL_TOKENS.chatBubbles.lifetimeMs;
      if (sentAt > input.now + 5_000 || expiresAt <= input.now) return [];
      return [{ id: message.id, speakerKey, text, sentAt, expiresAt }];
    })
    .sort((left, right) => right.sentAt - left.sentAt || left.id.localeCompare(right.id));
  const speakers = new Set<string>();
  const selected: VisibleWorldChatBubble[] = [];
  for (const candidate of candidates) {
    if (speakers.has(candidate.speakerKey)) continue;
    speakers.add(candidate.speakerKey);
    selected.push({
      id: candidate.id,
      speakerKey: candidate.speakerKey,
      text: candidate.text,
      expiresAt: candidate.expiresAt,
    });
    if (selected.length >= maximumVisible) break;
  }
  return selected;
}

export function distanceAwareWorldLabelAlpha(
  distance: number,
  fullOpacityDistance: number,
  hiddenDistance: number,
): number {
  if (!Number.isFinite(distance) || distance >= hiddenDistance) return 0;
  if (distance <= fullOpacityDistance) return 1;
  return 1 - (distance - fullOpacityDistance) / (hiddenDistance - fullOpacityDistance);
}

export class WorldChatBubbleRenderer {
  private readonly label: Phaser.GameObjects.Text;
  private message: VisibleWorldChatBubble | undefined;
  private enabled = true;

  public constructor(
    scene: Phaser.Scene,
    private projection: IsometricProjection,
    private readonly depthTie = 0,
  ) {
    this.label = scene.add
      .text(0, 0, '', {
        color: '#26382f',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: '600',
        align: 'center',
        backgroundColor: '#fff8e6f2',
        padding: STARVILLE_VISUAL_TOKENS.ui.worldLabelPadding,
        wordWrap: { width: 176, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  public setProjection(projection: IsometricProjection): void {
    this.projection = projection;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.label.setVisible(false);
  }

  public setMessage(message: VisibleWorldChatBubble | undefined): void {
    if (message?.id === this.message?.id) return;
    this.message = message;
    this.label.setText(message?.text ?? '').setVisible(message !== undefined && this.enabled);
  }

  public update(position: Point, observer: Point, now: number): void {
    const message = this.message;
    if (!this.enabled || message === undefined || now >= message.expiresAt) {
      this.label.setVisible(false);
      return;
    }
    const distance = Math.hypot(position.x - observer.x, position.y - observer.y);
    const alpha = distanceAwareWorldLabelAlpha(
      distance,
      STARVILLE_VISUAL_TOKENS.chatBubbles.fullOpacityDistance,
      STARVILLE_VISUAL_TOKENS.chatBubbles.hiddenDistance,
    );
    if (alpha <= 0) {
      this.label.setVisible(false);
      return;
    }
    const screen = projectWorld(position, this.projection);
    this.label
      .setPosition(screen.x, screen.y - STARVILLE_VISUAL_TOKENS.chatBubbles.offsetY)
      .setAlpha(alpha)
      .setDepth(STARVILLE_VISUAL_TOKENS.depth.worldLabel + 10 + this.depthTie)
      .setVisible(true);
  }

  public destroy(): void {
    this.label.destroy();
  }
}
