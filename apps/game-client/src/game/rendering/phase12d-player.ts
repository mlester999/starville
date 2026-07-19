import type Phaser from 'phaser';

import {
  resolveAvatarVectorRigFrame,
  type AvatarAnimationState,
  type AvatarVectorRigFrame,
  type AvatarVectorRigSide,
} from '@starville/avatar';
import {
  STARVILLE_VISUAL_TOKENS,
  depthForFootPosition,
  projectWorld,
  resolveWorldContactShadowLayers,
  resolveWorldPlayerContactShadow,
  type FacingDirection,
  type IsometricProjection,
  type Point,
} from '@starville/game-core';

import { avatarSelectionsEqual, type ResolvedAvatarProfile } from '../../app/avatar-client';
import { resolveAvatarFallbackStyle, type AvatarFallbackStyle } from './avatar-style';

/**
 * Foot-anchored production-candidate vector renderer. The shared rig resolver
 * owns directional and animation metadata while each visual layer retains its
 * Graphics object, so appearance updates never replace the Phaser entity.
 */
export class Phase12DPlayerRenderer {
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
    const screen = projectWorld(position, this.projection);
    const frame = resolveAvatarVectorRigFrame({
      direction: facing,
      state: animationState,
      elapsedMs: time,
      reducedMotion: this.reducedMotion,
    });
    const scale = STARVILLE_VISUAL_TOKENS.scale.player * this.style.bodyScale;

    this.container.setPosition(screen.x, screen.y);
    this.container.setDepth(depthForFootPosition(position.x, position.y, 'player') + this.depthTie);
    this.container.setScale(scale);

    this.drawShadow(animationState !== 'idle');
    this.drawBackLayer(frame);
    this.drawLegs(frame);
    this.drawBody(frame);
    this.drawHead(frame);
    this.drawFace(frame);
    this.drawFrontAccessories(frame);
  }

  private drawShadow(moving: boolean): void {
    this.shadow.clear();
    if (!this.shadowsEnabled) return;
    const layers = resolveWorldContactShadowLayers(resolveWorldPlayerContactShadow(moving));
    for (const layer of layers) {
      this.shadow.fillStyle(STARVILLE_VISUAL_TOKENS.shadows.color, layer.alpha);
      this.shadow.fillEllipse(0, layer.offsetY, layer.width, layer.height);
    }
  }

  private drawBackLayer(frame: AvatarVectorRigFrame): void {
    this.backLayer.clear();
    const { motion, pose } = frame;
    const hairX = pose.headOffsetX * 0.7;
    const hairWidth = 36 * pose.headWidthScale;
    if (this.style.hairVariant === 2 || this.style.hairVariant === 5) {
      this.backLayer
        .fillStyle(this.style.hair)
        .fillRoundedRect(
          hairX - hairWidth / 2,
          -88 + motion.bob,
          hairWidth,
          pose.backFacing ? 53 : 49,
          15,
        );
    } else if (this.style.hairVariant === 3 || this.style.hairVariant === 4) {
      this.backLayer
        .fillStyle(this.style.hair)
        .fillEllipse(hairX, -78 + motion.bob, 48 * pose.headWidthScale, 48);
    }
    if (this.style.accessoryKey === 'small-satchel') {
      const satchelX = pose.nearSide === 'left' ? -20 : 7;
      this.backLayer
        .lineStyle(4, this.style.accessory, 1)
        .lineBetween(
          -15 * pose.torsoWidthScale,
          -62 + motion.bob,
          15 * pose.torsoWidthScale,
          -28 + motion.bob,
        )
        .fillStyle(this.style.accessory)
        .fillRoundedRect(
          pose.backFacing ? -9 - pose.torsoYaw * 9 : satchelX,
          -39 + motion.bob,
          18,
          20,
          5,
        );
    }
  }

  private drawLegs(frame: AvatarVectorRigFrame): void {
    this.legsLayer.clear();
    const { motion, pose } = frame;
    const farSide: AvatarVectorRigSide = pose.nearSide === 'left' ? 'right' : 'left';
    for (const side of [farSide, pose.nearSide]) {
      const near = side === pose.nearSide;
      const sideSign = side === 'left' ? -1 : 1;
      const stride = near ? motion.nearLegStride : motion.farLegStride;
      const spread = 10 * pose.torsoWidthScale;
      const depth = (near ? 1 : -1) * pose.limbDepthOffset;
      const footX = sideSign * spread + pose.gaitAxis.x * stride;
      const footY = Math.min(-5, -7 + pose.gaitAxis.y * stride * 0.36 + depth * 0.45);
      const hipX = sideSign * spread * 0.82 + pose.torsoYaw * 1.8;
      const hipY = -31 + motion.bob + depth * 0.3;
      this.legsLayer
        .lineStyle(near ? 8 : 6, this.style.bottom, near ? 1 : 0.82)
        .lineBetween(footX, footY - 5, hipX, hipY)
        .fillStyle(this.style.footwear, near ? 1 : 0.88)
        .fillEllipse(footX, footY, near ? 17 : 14, near ? 9 : 7.5);
    }
  }

  private drawBody(frame: AvatarVectorRigFrame): void {
    this.bodyLayer.clear();
    const { motion, pose } = frame;
    const width = 44 * pose.torsoWidthScale;
    const centerX = pose.torsoYaw * 2 + pose.facingVector.x * motion.torsoLean;
    const topY = -67 + motion.bob;
    const farSide: AvatarVectorRigSide = pose.nearSide === 'left' ? 'right' : 'left';
    this.drawArm(frame, farSide, centerX, width, false);
    if (pose.backFacing) {
      this.bodyLayer
        .fillStyle(this.style.accessory, 0.95)
        .fillRoundedRect(centerX - width * 0.55, topY - 1, width * 1.1, 49, 13);
    }
    this.bodyLayer
      .fillStyle(this.style.top)
      .fillRoundedRect(centerX - width / 2, topY, width, 52, Math.max(9, width * 0.3))
      .fillStyle(this.style.topShade)
      .fillTriangle(
        centerX - width * 0.46,
        -30 + motion.bob,
        centerX + width * 0.46,
        -30 + motion.bob,
        centerX + pose.torsoYaw * 3,
        -10 + motion.bob,
      )
      .fillStyle(this.style.accessory)
      .fillRoundedRect(centerX - width / 2, -57 + motion.bob, width, 6, 3);
    this.bodyLayer
      .lineStyle(2, this.style.topShade, 0.55)
      .lineBetween(
        centerX + pose.torsoYaw * width * 0.18,
        topY + 7 + pose.shoulderSlope,
        centerX + pose.torsoYaw * width * 0.12,
        -31 + motion.bob,
      );
    this.drawArm(frame, pose.nearSide, centerX, width, true);
  }

  private drawArm(
    frame: AvatarVectorRigFrame,
    side: AvatarVectorRigSide,
    centerX: number,
    torsoWidth: number,
    near: boolean,
  ): void {
    const { motion, pose } = frame;
    const sideSign = side === 'left' ? -1 : 1;
    const swing = near ? motion.nearArmSwing : motion.farArmSwing;
    const shoulderX = centerX + sideSign * torsoWidth * 0.43;
    const shoulderY = -56 + motion.bob + sideSign * pose.shoulderSlope;
    const handX =
      shoulderX + sideSign * (near ? 6 : 4) + pose.gaitAxis.x * swing * 0.6 + pose.torsoYaw * 1.5;
    const handY = -34 + motion.bob + pose.gaitAxis.y * swing * 0.35;
    this.bodyLayer
      .lineStyle(near ? 8 : 6, near ? this.style.topShade : this.style.top, near ? 1 : 0.78)
      .lineBetween(shoulderX, shoulderY, handX, handY)
      .fillStyle(this.style.skin, near ? 1 : 0.82)
      .fillCircle(handX, handY, near ? 4 : 3.2);
  }

  private drawHead(frame: AvatarVectorRigFrame): void {
    this.headLayer.clear();
    const { motion, pose } = frame;
    const headX = pose.headOffsetX;
    const headWidth = 32 * pose.headWidthScale;
    this.headLayer
      .fillStyle(this.style.hair)
      .fillEllipse(headX, -84 + motion.bob, 40 * pose.headWidthScale, 40);
    this.headLayer.fillStyle(this.style.skin).fillEllipse(headX, -76 + motion.bob, headWidth, 28);
    if (this.style.hairVariant === 1) {
      this.headLayer
        .fillStyle(this.style.hair)
        .fillRoundedRect(
          headX - 18 * pose.headWidthScale,
          -93 + motion.bob,
          36 * pose.headWidthScale,
          16,
          8,
        );
    } else if (this.style.hairVariant === 6) {
      this.headLayer
        .fillStyle(this.style.hair)
        .fillCircle(headX - 15 * pose.headWidthScale, -79 + motion.bob, 8);
      this.headLayer.fillCircle(headX + 15 * pose.headWidthScale, -79 + motion.bob, 8);
    } else {
      this.headLayer
        .fillStyle(this.style.hair)
        .fillRoundedRect(
          headX - 17 * pose.headWidthScale,
          -92 + motion.bob,
          34 * pose.headWidthScale,
          12,
          6,
        );
      this.headLayer.fillCircle(headX - 14 * pose.headWidthScale, -83 + motion.bob, 7);
    }
  }

  private drawFace(frame: AvatarVectorRigFrame): void {
    this.faceLayer.clear();
    const { motion, pose } = frame;
    if (pose.backFacing) return;
    const eyeY = -77 + motion.bob + pose.facingVector.y * 2;
    const lookDirection = pose.faceMode.includes('right')
      ? 1
      : pose.faceMode.includes('left')
        ? -1
        : 0;
    const headX = pose.headOffsetX;
    this.faceLayer.fillStyle(0x3a302a);
    if (pose.faceMode === 'front') {
      this.faceLayer.fillCircle(headX - 6, eyeY, 1.8);
      this.faceLayer.fillCircle(headX + 6, eyeY, 1.8);
    } else if (pose.faceMode.startsWith('three-quarter')) {
      this.faceLayer.fillCircle(headX + lookDirection * 6, eyeY, 1.9);
      this.faceLayer.fillCircle(headX - lookDirection * 3, eyeY, 1.25);
    } else {
      this.faceLayer.fillCircle(headX + lookDirection * 5, eyeY, 1.9);
    }
    if (this.style.faceVariant === 0 || this.style.faceVariant === 2) {
      this.faceLayer.lineStyle(1.5, this.style.skinShade, 1);
      this.faceLayer.beginPath();
      this.faceLayer.arc(
        headX + lookDirection * 2,
        -69 + motion.bob,
        pose.faceMode === 'front' ? 4 : 3,
        0.15,
        Math.PI - 0.15,
      );
      this.faceLayer.strokePath();
    } else {
      this.faceLayer
        .fillStyle(this.style.skinShade)
        .fillEllipse(headX + lookDirection * 2, -68 + motion.bob, 5, 2);
    }
  }

  private drawFrontAccessories(frame: AvatarVectorRigFrame): void {
    this.frontLayer.clear();
    const { motion, pose } = frame;
    const headX = pose.headOffsetX;
    const key = this.style.accessoryKey;
    if (key === 'star-hairpin' || key === 'leaf-clip' || key === 'flower-crown') {
      this.frontLayer.fillStyle(this.style.accessory);
      if (key === 'flower-crown') {
        for (const x of [-12, -6, 0, 6, 12]) {
          this.frontLayer.fillCircle(headX + x * pose.headWidthScale, -94 + motion.bob, 3.2);
        }
      } else {
        this.frontLayer.fillCircle(
          headX + (pose.nearSide === 'left' ? -12 : 12) * pose.headWidthScale,
          -90 + motion.bob,
          key === 'star-hairpin' ? 4 : 3.5,
        );
      }
    }
    if (key === 'round-glasses' && !pose.backFacing) {
      const profile = pose.faceMode.startsWith('profile');
      const lookDirection = pose.faceMode.includes('right') ? 1 : -1;
      this.frontLayer.lineStyle(2, this.style.accessory, 1);
      if (profile) {
        this.frontLayer.strokeCircle(headX + lookDirection * 5, -77 + motion.bob, 5);
      } else {
        this.frontLayer.strokeCircle(headX - 7, -77 + motion.bob, 5);
        this.frontLayer.strokeCircle(headX + 7, -77 + motion.bob, 5);
        this.frontLayer.lineBetween(headX - 2, -77 + motion.bob, headX + 2, -77 + motion.bob);
      }
    }
    if (key === 'cozy-scarf') {
      const width = 36 * pose.torsoWidthScale;
      this.frontLayer
        .fillStyle(this.style.accessory)
        .fillRoundedRect(pose.torsoYaw * 2 - width / 2, -65 + motion.bob, width, 8, 4)
        .fillRoundedRect(
          pose.torsoYaw * 2 + (pose.nearSide === 'left' ? -17 : 9),
          -61 + motion.bob,
          8,
          23,
          4,
        );
    }
  }
}
