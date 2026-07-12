import type Phaser from 'phaser';

import {
  depthForFootPosition,
  projectWorld,
  type AppearancePreset,
  type FacingDirection,
  type IsometricProjection,
  type Point,
} from '@starville/game-core';

import { CHARACTER_PALETTES, WORLD_COLORS } from './palette';

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

export class PlayerRenderer {
  public readonly container: Phaser.GameObjects.Container;
  private readonly art: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly palette;
  private readonly reducedMotion: boolean;

  public constructor(
    scene: Phaser.Scene,
    appearancePreset: AppearancePreset,
    private projection: IsometricProjection,
    reducedMotion: boolean,
  ) {
    this.palette = CHARACTER_PALETTES[appearancePreset];
    this.reducedMotion = reducedMotion;
    this.shadow = scene.add.graphics();
    this.art = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.shadow, this.art]);
    this.container.setSize(54, 94);
  }

  public setProjection(projection: IsometricProjection): void {
    this.projection = projection;
  }

  public destroy(): void {
    this.container.destroy(true);
  }

  public update(
    position: Point,
    facing: FacingDirection,
    moving: boolean,
    time: number,
    jogging = false,
  ): void {
    const screen = projectWorld(position, this.projection);
    const motion = this.reducedMotion
      ? 0
      : Math.sin(time * (moving ? (jogging ? 0.015 : 0.011) : 0.003));
    const bob = moving ? Math.abs(motion) * 2.5 : motion * 0.8;
    const stride = moving ? motion * 5 : 0;
    const facingVector = FACING_VECTOR[facing];

    this.container.setPosition(screen.x, screen.y);
    this.container.setDepth(depthForFootPosition(position.x, position.y, 'player'));
    this.shadow.clear().fillStyle(WORLD_COLORS.shadow, moving ? 0.3 : 0.25);
    this.shadow.fillEllipse(0, 0, moving ? 39 : 43, moving ? 13 : 15);

    this.art.clear();
    this.art.lineStyle(7, this.palette.coatShade, 1);
    this.art.lineBetween(-9, -10, -10 - stride, -31 + bob);
    this.art.lineBetween(9, -10, 10 + stride, -31 + bob);
    this.art.fillStyle(0x3b362f).fillEllipse(-10 - stride, -7, 16, 9);
    this.art.fillEllipse(10 + stride, -7, 16, 9);

    if (facingVector.y < -0.2) {
      this.art.fillStyle(this.palette.accent, 0.95).fillRoundedRect(-25, -67 + bob, 50, 48, 13);
    }

    this.art.fillStyle(this.palette.coat).fillRoundedRect(-22, -66 + bob, 44, 51, 14);
    this.art
      .fillStyle(this.palette.coatShade)
      .fillTriangle(-20, -29 + bob, 20, -29 + bob, 0, -9 + bob);
    this.art.fillStyle(this.palette.accent).fillRoundedRect(-22, -56 + bob, 44, 7, 3);
    this.art.fillStyle(this.palette.skin).fillCircle(0, -78 + bob, 18);
    this.art.fillStyle(this.palette.hair).fillCircle(0, -84 + bob, 19);
    this.art.fillStyle(this.palette.skin).fillEllipse(0, -75 + bob, 31, 27);
    this.art.fillStyle(this.palette.hair).fillRoundedRect(-17, -91 + bob, 34, 12, 6);
    this.art.fillCircle(-14, -82 + bob, 7);

    if (facingVector.y > -0.65) {
      const eyeY = -76 + bob + facingVector.y * 2;
      this.art.fillStyle(0x3a302a);
      if (facingVector.x <= 0.45) this.art.fillCircle(-6 + facingVector.x * 3, eyeY, 1.8);
      if (facingVector.x >= -0.45) this.art.fillCircle(6 + facingVector.x * 3, eyeY, 1.8);
    }

    this.art.fillStyle(this.palette.accent).fillCircle(-facingVector.x * 22, -51 + bob, 5);
  }
}
