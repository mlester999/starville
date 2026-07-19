import type Phaser from 'phaser';

import type { AvatarAnimationState } from '@starville/avatar';
import {
  depthForFootPosition,
  projectWorld,
  type FacingDirection,
  type IsometricProjection,
  type Point,
} from '@starville/game-core';

import { avatarSelectionsEqual, type ResolvedAvatarProfile } from '../../app/avatar-client';
import { WORLD_COLORS } from './palette';
import { resolveAvatarFallbackStyle, type AvatarFallbackStyle } from './avatar-style';

const FACING_VECTOR: Readonly<Record<FacingDirection, Point>> = {
  north: { x: 0, y: -1 },
  northeast: { x: 0.72, y: -0.72 },
  east: { x: 1, y: 0 },
  southeast: { x: 0.72, y: 0.72 },
  south: { x: 0, y: 1 },
  southwest: { x: -0.72, y: 0.72 },
  west: { x: -1, y: 0 },
  northwest: { x: -0.72, y: -0.72 },
};

interface AvatarMotionFrame {
  readonly bob: number;
  readonly stride: number;
  readonly armSwing: number;
}

function motionFrame(
  time: number,
  moving: boolean,
  jogging: boolean,
  reducedMotion: boolean,
): AvatarMotionFrame {
  if (reducedMotion) return { bob: 0, stride: 0, armSwing: 0 };
  if (!moving) {
    const breath = Math.sin(time * 0.003);
    return { bob: breath * 0.7, stride: 0, armSwing: 0 };
  }
  const phase = Math.sin(time * (jogging ? 0.019 : 0.012));
  return {
    bob: Math.abs(phase) * (jogging ? 3.5 : 2.3),
    stride: phase * (jogging ? 8 : 5),
    armSwing: phase * (jogging ? 7 : 4.5),
  };
}

/**
 * Published V1 renderer. Keep this implementation as the normal runtime
 * default until an owner explicitly activates the Phase 12D candidate.
 */
export class PlayerRenderer {
  public readonly container: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly backLayer: Phaser.GameObjects.Graphics;
  private readonly legsLayer: Phaser.GameObjects.Graphics;
  private readonly bodyLayer: Phaser.GameObjects.Graphics;
  private readonly headLayer: Phaser.GameObjects.Graphics;
  private readonly faceLayer: Phaser.GameObjects.Graphics;
  private readonly frontLayer: Phaser.GameObjects.Graphics;
  private reducedMotion: boolean;
  private shadowsEnabled = true;
  private style: AvatarFallbackStyle;
  private profile: ResolvedAvatarProfile;

  public constructor(
    scene: Phaser.Scene,
    profile: ResolvedAvatarProfile,
    private projection: IsometricProjection,
    reducedMotion: boolean,
    private readonly depthTie = 0,
  ) {
    this.profile = profile;
    this.style = resolveAvatarFallbackStyle(profile.selection);
    this.reducedMotion = reducedMotion;
    this.shadow = scene.add.graphics();
    this.backLayer = scene.add.graphics();
    this.legsLayer = scene.add.graphics();
    this.bodyLayer = scene.add.graphics();
    this.headLayer = scene.add.graphics();
    this.faceLayer = scene.add.graphics();
    this.frontLayer = scene.add.graphics();
    this.container = scene.add.container(0, 0, [
      this.shadow,
      this.backLayer,
      this.legsLayer,
      this.bodyLayer,
      this.headLayer,
      this.faceLayer,
      this.frontLayer,
    ]);
    this.container.setSize(58, 98);
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
    if (
      profile.appearanceId === this.profile.appearanceId &&
      profile.revision === this.profile.revision &&
      avatarSelectionsEqual(profile.selection, this.profile.selection)
    ) {
      return;
    }
    this.profile = profile;
    this.style = resolveAvatarFallbackStyle(profile.selection);
  }

  public getAppearanceReference(): { readonly appearanceId: string; readonly revision: number } {
    return { appearanceId: this.profile.appearanceId, revision: this.profile.revision };
  }

  public destroy(): void {
    this.container.destroy(true);
  }

  public update(
    position: Point,
    facing: FacingDirection,
    animationState: AvatarAnimationState,
    time: number,
  ): void {
    const moving = animationState !== 'idle';
    const jogging = animationState === 'jog';
    const screen = projectWorld(position, this.projection);
    const motion = motionFrame(time, moving, jogging, this.reducedMotion);
    const facingVector = FACING_VECTOR[facing];
    const horizontal = facingVector.x;
    const backFacing = facingVector.y < -0.2;
    const scale = this.style.bodyScale;

    this.container.setPosition(screen.x, screen.y);
    this.container.setDepth(depthForFootPosition(position.x, position.y, 'player') + this.depthTie);
    this.container.setScale(scale, 1);

    this.drawShadow(moving);
    this.drawBackLayer(motion, backFacing);
    this.drawLegs(motion);
    this.drawBody(motion, horizontal, backFacing);
    this.drawHead(motion, horizontal);
    this.drawFace(motion, facingVector, backFacing);
    this.drawFrontAccessories(motion, horizontal, backFacing);
  }

  private drawShadow(moving: boolean): void {
    this.shadow.clear();
    if (!this.shadowsEnabled) return;
    this.shadow.fillStyle(WORLD_COLORS.shadow, moving ? 0.3 : 0.25);
    this.shadow.fillEllipse(0, 0, moving ? 39 : 43, moving ? 13 : 15);
  }

  private drawBackLayer(motion: AvatarMotionFrame, backFacing: boolean): void {
    this.backLayer.clear();
    if (this.style.hairVariant === 2 || this.style.hairVariant === 5) {
      this.backLayer.fillStyle(this.style.hair).fillRoundedRect(-18, -88 + motion.bob, 36, 49, 15);
    } else if (this.style.hairVariant === 3 || this.style.hairVariant === 4) {
      this.backLayer.fillStyle(this.style.hair).fillCircle(0, -78 + motion.bob, 24);
    }
    if (this.style.accessoryKey === 'small-satchel') {
      this.backLayer
        .lineStyle(4, this.style.accessory, 1)
        .lineBetween(-15, -62 + motion.bob, 15, -28 + motion.bob)
        .fillStyle(this.style.accessory)
        .fillRoundedRect(backFacing ? -18 : 7, -39 + motion.bob, 18, 20, 5);
    }
  }

  private drawLegs(motion: AvatarMotionFrame): void {
    this.legsLayer.clear();
    this.legsLayer.lineStyle(8, this.style.bottom, 1);
    this.legsLayer.lineBetween(-9, -13, -10 - motion.stride, -31 + motion.bob);
    this.legsLayer.lineBetween(9, -13, 10 + motion.stride, -31 + motion.bob);
    this.legsLayer.fillStyle(this.style.footwear).fillEllipse(-10 - motion.stride, -7, 17, 9);
    this.legsLayer.fillEllipse(10 + motion.stride, -7, 17, 9);
  }

  private drawBody(motion: AvatarMotionFrame, horizontal: number, backFacing: boolean): void {
    this.bodyLayer.clear();
    this.bodyLayer.lineStyle(7, this.style.topShade, 1);
    this.bodyLayer.lineBetween(
      -19,
      -56 + motion.bob,
      -24 - motion.armSwing + horizontal * 2,
      -34 + motion.bob,
    );
    this.bodyLayer.lineBetween(
      19,
      -56 + motion.bob,
      24 + motion.armSwing + horizontal * 2,
      -34 + motion.bob,
    );
    if (backFacing) {
      this.bodyLayer
        .fillStyle(this.style.accessory, 0.95)
        .fillRoundedRect(-25, -68 + motion.bob, 50, 49, 13);
    }
    this.bodyLayer.fillStyle(this.style.top).fillRoundedRect(-22, -67 + motion.bob, 44, 52, 14);
    this.bodyLayer
      .fillStyle(this.style.topShade)
      .fillTriangle(-20, -30 + motion.bob, 20, -30 + motion.bob, 0, -10 + motion.bob);
    this.bodyLayer.fillStyle(this.style.accessory).fillRoundedRect(-22, -57 + motion.bob, 44, 6, 3);
  }

  private drawHead(motion: AvatarMotionFrame, horizontal: number): void {
    this.headLayer.clear();
    this.headLayer.fillStyle(this.style.hair).fillCircle(horizontal * 2, -84 + motion.bob, 20);
    this.headLayer.fillStyle(this.style.skin).fillEllipse(horizontal * 2, -76 + motion.bob, 32, 28);
    if (this.style.hairVariant === 1) {
      this.headLayer
        .fillStyle(this.style.hair)
        .fillRoundedRect(-18 + horizontal * 2, -93 + motion.bob, 36, 16, 8);
    } else if (this.style.hairVariant === 6) {
      this.headLayer.fillStyle(this.style.hair).fillCircle(-15, -79 + motion.bob, 8);
      this.headLayer.fillCircle(15, -79 + motion.bob, 8);
    } else {
      this.headLayer
        .fillStyle(this.style.hair)
        .fillRoundedRect(-17 + horizontal * 2, -92 + motion.bob, 34, 12, 6);
      this.headLayer.fillCircle(-14 + horizontal * 2, -83 + motion.bob, 7);
    }
  }

  private drawFace(motion: AvatarMotionFrame, facing: Point, backFacing: boolean): void {
    this.faceLayer.clear();
    if (backFacing) return;
    const eyeY = -77 + motion.bob + facing.y * 2;
    this.faceLayer.fillStyle(0x3a302a);
    if (facing.x <= 0.45) this.faceLayer.fillCircle(-6 + facing.x * 4, eyeY, 1.8);
    if (facing.x >= -0.45) this.faceLayer.fillCircle(6 + facing.x * 4, eyeY, 1.8);
    if (this.style.faceVariant === 0 || this.style.faceVariant === 2) {
      this.faceLayer.lineStyle(1.5, this.style.skinShade, 1);
      this.faceLayer.beginPath();
      this.faceLayer.arc(facing.x * 3, -69 + motion.bob, 4, 0.15, Math.PI - 0.15);
      this.faceLayer.strokePath();
    } else {
      this.faceLayer
        .fillStyle(this.style.skinShade)
        .fillEllipse(facing.x * 3, -68 + motion.bob, 5, 2);
    }
  }

  private drawFrontAccessories(
    motion: AvatarMotionFrame,
    horizontal: number,
    backFacing: boolean,
  ): void {
    this.frontLayer.clear();
    const key = this.style.accessoryKey;
    if (key === 'star-hairpin' || key === 'leaf-clip' || key === 'flower-crown') {
      this.frontLayer.fillStyle(this.style.accessory);
      if (key === 'flower-crown') {
        for (const x of [-12, -6, 0, 6, 12]) {
          this.frontLayer.fillCircle(x + horizontal * 2, -94 + motion.bob, 3.2);
        }
      } else {
        this.frontLayer.fillCircle(
          12 + horizontal * 2,
          -90 + motion.bob,
          key === 'star-hairpin' ? 4 : 3.5,
        );
      }
    }
    if (key === 'round-glasses' && !backFacing) {
      this.frontLayer.lineStyle(2, this.style.accessory, 1);
      this.frontLayer.strokeCircle(-7 + horizontal * 3, -77 + motion.bob, 5);
      this.frontLayer.strokeCircle(7 + horizontal * 3, -77 + motion.bob, 5);
      this.frontLayer.lineBetween(
        -2 + horizontal * 3,
        -77 + motion.bob,
        2 + horizontal * 3,
        -77 + motion.bob,
      );
    }
    if (key === 'cozy-scarf') {
      this.frontLayer
        .fillStyle(this.style.accessory)
        .fillRoundedRect(-18, -65 + motion.bob, 36, 8, 4)
        .fillRoundedRect(9, -61 + motion.bob, 8, 23, 4);
    }
  }
}
