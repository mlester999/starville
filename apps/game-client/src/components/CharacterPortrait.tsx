import type { AppearancePreset } from '@starville/game-core';

interface CharacterPortraitProps {
  readonly preset: AppearancePreset;
  readonly label?: string;
}

export function CharacterPortrait({ preset, label }: CharacterPortraitProps) {
  return (
    <div
      className="character-portrait"
      data-preset={preset}
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <span className="character-portrait__glow" />
      <span className="character-portrait__shadow" />
      <span className="character-portrait__legs" />
      <span className="character-portrait__body" />
      <span className="character-portrait__scarf" />
      <span className="character-portrait__head" />
      <span className="character-portrait__hair" />
      <span className="character-portrait__face" />
    </div>
  );
}
