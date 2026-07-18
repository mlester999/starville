import type Phaser from 'phaser';

import { depthForFootPosition, projectWorld, type IsometricProjection } from '@starville/game-core';
import { PresenceInterpolationBuffer, type PublicPresence } from '@starville/realtime';

import { fallbackResolvedAvatar, type ResolvedAvatarProfile } from '../../app/avatar-client';
import { PlayerRenderer } from './player';
import { stablePresenceDepthTie } from './avatar-style';

export class RemotePlayerRenderer {
  private readonly player: PlayerRenderer;
  private readonly nameplate: Phaser.GameObjects.Text;
  private readonly selection: Phaser.GameObjects.Graphics;
  private readonly samples = new PresenceInterpolationBuffer();
  private selected = false;
  private readonly depthTie: number;

  public constructor(
    scene: Phaser.Scene,
    private presence: PublicPresence,
    private projection: IsometricProjection,
    private readonly reducedMotion: boolean,
    onSelect: (presenceId: string) => void,
  ) {
    this.depthTie = stablePresenceDepthTie(presence.presenceId);
    this.selection = scene.add.graphics();
    this.player = new PlayerRenderer(
      scene,
      fallbackResolvedAvatar(presence.appearancePreset),
      projection,
      reducedMotion,
      this.depthTie,
    );
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
  }

  public setAppearance(profile: ResolvedAvatarProfile): void {
    this.player.setAppearance(profile);
  }

  public getPresence(): PublicPresence {
    return this.presence;
  }

  public setSelected(selected: boolean): void {
    this.selected = selected;
    this.selection.setVisible(selected);
  }

  public setNameplateVisible(visible: boolean): void {
    this.nameplate.setVisible(visible);
  }

  public update(now: number): void {
    const sample = this.samples.sample(now, this.reducedMotion);
    if (sample === undefined) return;
    const moving = sample.movementState !== 'idle';
    this.player.update(
      sample,
      sample.facingDirection,
      moving,
      now,
      sample.movementState === 'jogging',
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
    this.nameplate.setPosition(screen.x, screen.y - 98);
    this.nameplate.setDepth(
      depthForFootPosition(sample.x, sample.y, 'player') + this.depthTie + 0.5,
    );
  }

  public destroy(): void {
    this.player.destroy();
    this.selection.destroy();
    this.nameplate.destroy();
    this.samples.clear();
  }
}
