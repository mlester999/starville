import type Phaser from 'phaser';

import {
  PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
  PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
  PRODUCTION_SLICE_AVATAR_TEXTURE_KEY,
  PRODUCTION_SLICE_PLAYER_DISPLAY_SCALE,
  ProductionSliceAnimationClock,
  type ProductionSliceAnimationSnapshot,
  type AvatarAnimationState,
} from '@starville/avatar';
import {
  depthForFootPosition,
  projectWorld,
  resolveWorldContactShadowLayers,
  resolveWorldPlayerContactShadow,
  type FacingDirection,
  type IsometricProjection,
  type Point,
} from '@starville/game-core';

import type { ResolvedAvatarProfile } from '../../app/avatar-client';

/** Raster sprite renderer used only by the explicit local Phase 12F-A review route. */
export class ProductionSlicePlayerRenderer {
  public readonly container: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private reducedMotion: boolean;
  private shadowsEnabled = true;
  private profile: ResolvedAvatarProfile;
  private readonly animationClock = new ProductionSliceAnimationClock();
  private previousPosition: Point | undefined;

  public constructor(
    scene: Phaser.Scene,
    profile: ResolvedAvatarProfile,
    private projection: IsometricProjection,
    reducedMotion: boolean,
    private readonly depthTie = 0,
  ) {
    this.profile = profile;
    this.reducedMotion = reducedMotion;
    this.shadow = scene.add.graphics();
    this.sprite = scene.add.sprite(0, 0, PRODUCTION_SLICE_AVATAR_TEXTURE_KEY, 0);
    this.sprite.setOrigin(0.5, 0.97);
    this.container = scene.add.container(0, 0, [this.shadow, this.sprite]);
    this.container.setSize(
      PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
      PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
    );
  }

  public setProjection(projection: IsometricProjection): void {
    this.projection = projection;
  }

  public setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  public setShadowsEnabled(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    if (!enabled) this.shadow.clear();
  }

  public setAppearance(profile: ResolvedAvatarProfile): void {
    this.profile = profile;
  }

  public getAppearanceReference(): { readonly appearanceId: string; readonly revision: number } {
    return { appearanceId: this.profile.appearanceId, revision: this.profile.revision };
  }

  public destroy(): void {
    this.container.destroy(true);
  }

  public getAnimationSnapshot(): ProductionSliceAnimationSnapshot {
    return this.animationClock.current();
  }

  public update(
    position: Point,
    facing: FacingDirection,
    animationState: AvatarAnimationState,
    time: number,
  ): void {
    const screen = projectWorld(position, this.projection);
    this.container.setPosition(screen.x, screen.y);
    this.container.setDepth(depthForFootPosition(position.x, position.y, 'player') + this.depthTie);
    this.container.setScale(PRODUCTION_SLICE_PLAYER_DISPLAY_SCALE);
    const rawTravelDistance =
      this.previousPosition === undefined
        ? 0
        : Math.hypot(position.x - this.previousPosition.x, position.y - this.previousPosition.y);
    this.previousPosition = { ...position };
    const animation = this.animationClock.advance({
      state: animationState,
      direction: facing,
      now: time,
      reducedMotion: this.reducedMotion,
      ...(animationState === 'idle'
        ? {}
        : { travelDistanceTiles: rawTravelDistance > 0.75 ? 0 : rawTravelDistance }),
    });
    this.sprite.setFrame(animation.frame);
    this.drawShadow(animationState !== 'idle');
  }

  private drawShadow(moving: boolean): void {
    this.shadow.clear();
    if (!this.shadowsEnabled) return;
    for (const layer of resolveWorldContactShadowLayers(resolveWorldPlayerContactShadow(moving))) {
      this.shadow.fillStyle(0x10221b, layer.alpha);
      this.shadow.fillEllipse(0, layer.offsetY, layer.width, layer.height);
    }
  }
}
