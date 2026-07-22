import type Phaser from 'phaser';

import type { AvatarAnimationState } from '@starville/avatar';
import {
  STARVILLE_VISUAL_TOKENS,
  depthForFootPosition,
  movementSpeed,
  nextFacingDirectionFromVelocity,
  projectWorld,
  resolveWorldLabelDistanceThresholds,
  resolveWorldVisualSettings,
  type FacingDirection,
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

const REMOTE_VISUAL_MOVEMENT_EPSILON = 0.0005;
const REMOTE_PLAYER_CULLING_PADDING = 192;
const REMOTE_VISUAL_JOG_SPEED_THRESHOLD = (movementSpeed(false) + movementSpeed(true)) / 2;

export interface RemoteVisualSample extends Point {
  readonly at: number;
}

export interface RemoteVisualMotion {
  readonly facingDirection: FacingDirection;
  readonly animationState: AvatarAnimationState;
  readonly visualVelocity: Point;
}

export interface RemotePlayerWorldView {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Resolves remote presentation from the positions that interpolation actually
 * produced. Network intent remains useful to the protocol, but it cannot make
 * a stationary visual walk in place or face against a collision slide.
 */
export function resolveRemoteVisualMotion(
  sample: RemoteVisualSample,
  previousSample: RemoteVisualSample | undefined,
  previousFacing: FacingDirection,
): RemoteVisualMotion {
  if (previousSample === undefined) {
    return {
      facingDirection: previousFacing,
      animationState: 'idle',
      visualVelocity: { x: 0, y: 0 },
    };
  }

  const elapsedSeconds = (sample.at - previousSample.at) / 1_000;
  const visualVelocity = {
    x: sample.x - previousSample.x,
    y: sample.y - previousSample.y,
  };
  const distance = Math.hypot(visualVelocity.x, visualVelocity.y);
  if (
    !Number.isFinite(elapsedSeconds) ||
    elapsedSeconds <= 0 ||
    distance <= REMOTE_VISUAL_MOVEMENT_EPSILON
  ) {
    return { facingDirection: previousFacing, animationState: 'idle', visualVelocity };
  }

  const speed = distance / elapsedSeconds;
  return {
    facingDirection: nextFacingDirectionFromVelocity(visualVelocity, previousFacing),
    animationState: speed >= REMOTE_VISUAL_JOG_SPEED_THRESHOLD ? 'jog' : 'walk',
    visualVelocity,
  };
}

export function remotePlayerScreenIsVisible(
  screen: Point,
  worldView: RemotePlayerWorldView,
  padding = REMOTE_PLAYER_CULLING_PADDING,
): boolean {
  return (
    screen.x >= worldView.x - padding &&
    screen.x <= worldView.x + worldView.width + padding &&
    screen.y >= worldView.y - padding &&
    screen.y <= worldView.y + worldView.height + padding
  );
}

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
  private lastVisualSample: RemoteVisualSample | undefined;
  private visualFacing: FacingDirection;
  private onScreen = true;

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
    this.visualFacing = presence.facingDirection;
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
      this.lastVisualSample = undefined;
      this.visualFacing = presence.facingDirection;
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
    this.selection.setVisible(selected && this.onScreen);
  }

  public setNameplateVisible(visible: boolean): void {
    this.nameplateRequested = visible;
    if (!visible) this.nameplate.setVisible(false);
  }

  public setVisualSettings(settings: WorldVisualSettings): void {
    this.visualSettings = settings;
    this.player.setShadowsEnabled(settings.shadows);
    this.chatBubble.setEnabled(settings.chatBubbles && this.onScreen);
    if (!settings.remoteLabels) this.nameplate.setVisible(false);
  }

  public setChatBubble(message: VisibleWorldChatBubble | undefined): void {
    this.chatBubble.setMessage(message);
  }

  public update(
    now: number,
    observer: Point = this.presence,
    wallNow = Date.now(),
    worldView?: RemotePlayerWorldView,
  ): void {
    const sample = this.samples.sample(now, this.reducedMotion);
    if (sample === undefined) return;
    const visualSample = { x: sample.x, y: sample.y, at: now };
    const motion = resolveRemoteVisualMotion(
      visualSample,
      this.lastVisualSample,
      this.visualFacing,
    );
    this.lastVisualSample = visualSample;
    this.visualFacing = motion.facingDirection;
    const screen = projectWorld(sample, this.projection);
    this.onScreen = worldView === undefined || remotePlayerScreenIsVisible(screen, worldView);
    this.player.container.setVisible(this.onScreen);
    this.selection.setVisible(this.selected && this.onScreen);
    this.chatBubble.setEnabled(this.visualSettings.chatBubbles && this.onScreen);
    if (!this.onScreen) {
      this.nameplate.setVisible(false);
      return;
    }
    this.player.update(sample, motion.facingDirection, motion.animationState, now);
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
