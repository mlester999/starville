import type Phaser from 'phaser';

import { avatarAnimationStateFromRealtime } from '@starville/avatar';
import {
  STARVILLE_VISUAL_TOKENS,
  depthForFootPosition,
  projectWorld,
  resolveWorldLabelDistanceThresholds,
  resolveWorldVisualSettings,
  type IsometricProjection,
  type Point,
  type WorldVisualSettings,
} from '@starville/game-core';
import { PresenceInterpolationBuffer, type PublicPresence } from '@starville/realtime';

import { fallbackResolvedAvatar, type ResolvedAvatarProfile } from '../../app/avatar-client';
import type { AvatarRendererMode } from '../contracts';
import { createAvatarPlayerRenderer, type AvatarPlayerRenderer } from './avatar-player-renderer';
import { stablePresenceDepthTie } from './avatar-style';
import {
  WorldChatBubbleRenderer,
  distanceAwareWorldLabelAlpha,
  type VisibleWorldChatBubble,
} from './chat-bubbles';

export class RemotePlayerRenderer {
  private readonly player: AvatarPlayerRenderer;
  private readonly nameplate: Phaser.GameObjects.Text;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly chatBubble: WorldChatBubbleRenderer;
  private readonly samples = new PresenceInterpolationBuffer();
  private selected = false;
  private nameplateRequested = true;
  private visualSettings: WorldVisualSettings;
  private readonly depthTie: number;

  public constructor(
    scene: Phaser.Scene,
    private presence: PublicPresence,
    private projection: IsometricProjection,
    private reducedMotion: boolean,
    onSelect: (presenceId: string) => void,
    visualSettings: WorldVisualSettings = resolveWorldVisualSettings(),
    avatarRendererMode: AvatarRendererMode = 'published_v1',
  ) {
    this.visualSettings = visualSettings;
    this.depthTie = stablePresenceDepthTie(presence.presenceId);
    this.selection = scene.add.graphics();
    this.player = createAvatarPlayerRenderer(
      avatarRendererMode,
      scene,
      fallbackResolvedAvatar(presence.appearancePreset),
      projection,
      reducedMotion,
      this.depthTie,
    );
    this.player.setShadowsEnabled(visualSettings.shadows);
    this.player.container
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => onSelect(this.presence.presenceId));
    this.nameplate = scene.add
      .text(0, 0, `${presence.displayName} · Lv ${String(presence.level)}`, {
        color: '#fff8df',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: '600',
        stroke: '#14271f',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    this.chatBubble = new WorldChatBubbleRenderer(scene, projection, this.depthTie);
    this.chatBubble.setEnabled(visualSettings.chatBubbles);
    this.samples.push(presence, performance.now());
  }

  public push(presence: PublicPresence, receivedAt: number): void {
    if (
      presence.worldId !== this.presence.worldId ||
      presence.channelId !== this.presence.channelId
    ) {
      this.samples.clear();
    }
    this.presence = presence;
    this.samples.push(presence, receivedAt);
  }

  public setProjection(projection: IsometricProjection): void {
    this.projection = projection;
    this.player.setProjection(projection);
    this.chatBubble.setProjection(projection);
  }

  public setAppearance(profile: ResolvedAvatarProfile): void {
    this.player.setAppearance(profile);
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.player.setReducedMotion(reducedMotion);
  }

  public getPresence(): PublicPresence {
    return this.presence;
  }

  public setSelected(selected: boolean): void {
    this.selected = selected;
    this.selection.setVisible(selected);
  }

  public setNameplateVisible(visible: boolean): void {
    this.nameplateRequested = visible;
    if (!visible) this.nameplate.setVisible(false);
  }

  public setVisualSettings(settings: WorldVisualSettings): void {
    this.visualSettings = settings;
    this.player.setShadowsEnabled(settings.shadows);
    this.chatBubble.setEnabled(settings.chatBubbles);
    if (!settings.remoteLabels) this.nameplate.setVisible(false);
  }

  public setChatBubble(message: VisibleWorldChatBubble | undefined): void {
    this.chatBubble.setMessage(message);
  }

  public update(now: number, observer: Point = this.presence, wallNow = Date.now()): void {
    const sample = this.samples.sample(now, this.reducedMotion);
    if (sample === undefined) return;
    this.player.update(
      sample,
      sample.facingDirection,
      avatarAnimationStateFromRealtime(sample.movementState),
      now,
    );
    const screen = projectWorld(sample, this.projection);
    this.selection.clear();
    if (this.selected) {
      this.selection
        .lineStyle(3, 0xf2ce72, 0.95)
        .fillStyle(0xf2ce72, 0.12)
        .fillEllipse(screen.x, screen.y + 1, 64, 23)
        .strokeEllipse(screen.x, screen.y + 1, 64, 23);
      this.selection.setDepth(
        depthForFootPosition(sample.x, sample.y, 'player') + this.depthTie - 0.25,
      );
    }
    const labelDistances = resolveWorldLabelDistanceThresholds(this.visualSettings.quality);
    const labelAlpha = distanceAwareWorldLabelAlpha(
      Math.hypot(sample.x - observer.x, sample.y - observer.y),
      labelDistances.fullOpacityDistance,
      labelDistances.hiddenDistance,
    );
    this.nameplate
      .setPosition(screen.x, screen.y - STARVILLE_VISUAL_TOKENS.labels.playerOffsetY)
      .setAlpha(labelAlpha)
      .setDepth(STARVILLE_VISUAL_TOKENS.depth.worldLabel + this.depthTie)
      .setVisible(this.nameplateRequested && this.visualSettings.remoteLabels && labelAlpha > 0);
    this.chatBubble.update(sample, observer, wallNow);
  }

  public destroy(): void {
    this.player.destroy();
    this.selection.destroy();
    this.nameplate.destroy();
    this.chatBubble.destroy();
    this.samples.clear();
  }
}
