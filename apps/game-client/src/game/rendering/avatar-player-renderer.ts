import type Phaser from 'phaser';
import type { AvatarAnimationState, ProductionSliceAnimationSnapshot } from '@starville/avatar';
import type { FacingDirection, IsometricProjection, Point } from '@starville/game-core';

import type { ResolvedAvatarProfile } from '../../app/avatar-client';
import type { AvatarRendererMode } from '../contracts';
import { Phase12DPlayerRenderer } from './phase12d-player';
import { PlayerRenderer } from './player';
import { ProductionSlicePlayerRenderer } from './production-slice-player';

export interface AvatarPlayerRenderer {
  readonly container: Phaser.GameObjects.Container;
  setProjection(projection: IsometricProjection): void;
  setReducedMotion(reducedMotion: boolean): void;
  setShadowsEnabled(enabled: boolean): void;
  setAppearance(profile: ResolvedAvatarProfile): void;
  destroy(): void;
  getAnimationSnapshot?(): ProductionSliceAnimationSnapshot;
  update(
    position: Point,
    facing: FacingDirection,
    animationState: AvatarAnimationState,
    time: number,
  ): void;
}

export function createAvatarPlayerRenderer(
  mode: AvatarRendererMode,
  scene: Phaser.Scene,
  profile: ResolvedAvatarProfile,
  projection: IsometricProjection,
  reducedMotion: boolean,
  depthTie = 0,
): AvatarPlayerRenderer {
  if (mode === 'phase12d_candidate') {
    return new Phase12DPlayerRenderer(scene, profile, projection, reducedMotion, depthTie);
  }
  if (mode === 'production_slice_v3') {
    return new ProductionSlicePlayerRenderer(scene, profile, projection, reducedMotion, depthTie);
  }
  return new PlayerRenderer(scene, profile, projection, reducedMotion, depthTie);
}
