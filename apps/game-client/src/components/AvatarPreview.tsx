import type { CSSProperties } from 'react';

import {
  AVATAR_ANIMATION_STATES as SHARED_AVATAR_ANIMATION_STATES,
  resolveAvatarVectorRigFrame,
  type AvatarAnimationState,
} from '@starville/avatar';
import type { FacingDirection } from '@starville/game-core';

import type { AvatarSelection } from '../app/avatar-client';
import { colorToCss, resolveAvatarFallbackStyle } from '../game/rendering/avatar-style';

export const AVATAR_PREVIEW_DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const satisfies readonly FacingDirection[];

export const AVATAR_ANIMATION_STATES = SHARED_AVATAR_ANIMATION_STATES;
export type { AvatarAnimationState };

interface AvatarPreviewProps {
  readonly selection: AvatarSelection;
  readonly direction: FacingDirection;
  readonly animationState: AvatarAnimationState;
  readonly paused?: boolean;
  readonly label: string;
  readonly compact?: boolean;
}

type AvatarPreviewVariables = CSSProperties &
  Readonly<{
    '--avatar-skin': string;
    '--avatar-skin-shade': string;
    '--avatar-hair': string;
    '--avatar-top': string;
    '--avatar-top-shade': string;
    '--avatar-bottom': string;
    '--avatar-footwear': string;
    '--avatar-accessory': string;
    '--avatar-body-scale': string;
    '--avatar-body-x': string;
    '--avatar-torso-width': string;
    '--avatar-torso-skew': string;
    '--avatar-head-x': string;
    '--avatar-head-scale-x': string;
    '--avatar-leg-spread': string;
    '--avatar-limb-depth': string;
    '--avatar-shoulder-slope': string;
    '--avatar-gait-angle': string;
    '--avatar-frame-duration': string;
  }>;

export function AvatarPreview({
  selection,
  direction,
  animationState,
  paused = false,
  label,
  compact = false,
}: AvatarPreviewProps) {
  const appearance = resolveAvatarFallbackStyle(selection);
  const frame = resolveAvatarVectorRigFrame({
    direction,
    state: animationState,
    elapsedMs: 0,
    reducedMotion: paused,
  });
  const { pose } = frame;
  const variables: AvatarPreviewVariables = {
    '--avatar-skin': colorToCss(appearance.skin),
    '--avatar-skin-shade': colorToCss(appearance.skinShade),
    '--avatar-hair': colorToCss(appearance.hair),
    '--avatar-top': colorToCss(appearance.top),
    '--avatar-top-shade': colorToCss(appearance.topShade),
    '--avatar-bottom': colorToCss(appearance.bottom),
    '--avatar-footwear': colorToCss(appearance.footwear),
    '--avatar-accessory': colorToCss(appearance.accessory),
    '--avatar-body-scale': String(appearance.bodyScale),
    '--avatar-body-x': `${String(pose.torsoYaw * 4)}px`,
    '--avatar-torso-width': `${String(86 * pose.torsoWidthScale)}px`,
    '--avatar-torso-skew': `${String(pose.torsoYaw * -7)}deg`,
    '--avatar-head-x': `${String(pose.headOffsetX * 2)}px`,
    '--avatar-head-scale-x': String(pose.headWidthScale),
    '--avatar-leg-spread': `${String(27 * pose.torsoWidthScale)}px`,
    '--avatar-limb-depth': `${String(pose.limbDepthOffset * 2)}px`,
    '--avatar-shoulder-slope': `${String(pose.shoulderSlope * 1.25)}deg`,
    '--avatar-gait-angle': `${String(pose.gaitAxis.x * 5 + pose.gaitAxis.y * 2)}deg`,
    '--avatar-frame-duration': `${String(frame.frameDurationMs * frame.frameCount)}ms`,
  };

  return (
    <div
      aria-label={label}
      className={`avatar-preview${compact ? ' avatar-preview--compact' : ''}`}
      data-accessory={appearance.accessoryKey ?? 'none'}
      data-animation={animationState}
      data-back-facing={pose.backFacing}
      data-direction={direction}
      data-face-variant={appearance.faceVariant}
      data-face-mode={pose.faceMode}
      data-frame-count={frame.frameCount}
      data-hair-variant={appearance.hairVariant}
      data-near-side={pose.nearSide}
      data-paused={paused}
      data-pose={pose.key}
      role="img"
      style={variables}
    >
      <span className="avatar-preview__back-accessory" aria-hidden="true" />
      <span className="avatar-preview__shadow" aria-hidden="true" />
      <span className="avatar-preview__character" aria-hidden="true">
        <span className="avatar-preview__hair-back" />
        <span className="avatar-preview__leg avatar-preview__leg--left">
          <span className="avatar-preview__shoe" />
        </span>
        <span className="avatar-preview__leg avatar-preview__leg--right">
          <span className="avatar-preview__shoe" />
        </span>
        <span className="avatar-preview__body">
          <span className="avatar-preview__top-detail" />
          <span className="avatar-preview__arm avatar-preview__arm--left" />
          <span className="avatar-preview__arm avatar-preview__arm--right" />
        </span>
        <span className="avatar-preview__head">
          <span className="avatar-preview__ear avatar-preview__ear--left" />
          <span className="avatar-preview__ear avatar-preview__ear--right" />
          <span className="avatar-preview__brows" />
          <span className="avatar-preview__eyes" />
          <span className="avatar-preview__mouth" />
          <span className="avatar-preview__hair-front" />
          <span className="avatar-preview__head-accessory" />
        </span>
        <span className="avatar-preview__face-accessory" />
        <span className="avatar-preview__scarf" />
        <span className="avatar-preview__satchel" />
      </span>
      <span className="avatar-preview__development-label" aria-hidden="true">
        Outfit preview
      </span>
    </div>
  );
}
