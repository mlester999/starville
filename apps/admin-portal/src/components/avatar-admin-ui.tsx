import type { ReactNode } from 'react';

import { friendlyKey } from './economy-admin-ui';

export const AVATAR_DIRECTIONS = [
  'northwest',
  'north',
  'northeast',
  'west',
  'south',
  'east',
  'southwest',
  'southeast',
] as const;

export function AvatarPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="avatar-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="avatar-page-title">{title}</h1>
        <p>{description}</p>
      </div>
      {actions === undefined ? null : <div className="avatar-page-header__actions">{actions}</div>}
    </header>
  );
}

export function AvatarStatus({ value }: { readonly value: string }) {
  return <span className={`avatar-status avatar-status--${value}`}>{friendlyKey(value)}</span>;
}

export function DirectionCoverage({ directions }: { readonly directions: readonly string[] }) {
  return (
    <div aria-label="Eight-direction coverage" className="avatar-direction-grid">
      {AVATAR_DIRECTIONS.map((direction) => (
        <span
          className={directions.includes(direction) ? 'is-present' : 'is-missing'}
          key={direction}
        >
          {friendlyKey(direction)}
        </span>
      ))}
    </div>
  );
}

export function AvatarLifecycle({ state }: { readonly state: string }) {
  const steps = ['draft', 'validating', 'in_review', 'approved', 'active'];
  const index = steps.indexOf(state);
  return (
    <ol aria-label="Avatar content lifecycle" className="avatar-lifecycle">
      {steps.map((step, stepIndex) => (
        <li
          className={
            stepIndex < index ? 'is-complete' : stepIndex === index ? 'is-current' : undefined
          }
          key={step}
        >
          <span>{stepIndex + 1}</span>
          {friendlyKey(step)}
        </li>
      ))}
    </ol>
  );
}

export function SpriteSheetMapperPreview() {
  return (
    <figure className="avatar-sheet-mapper" aria-labelledby="avatar-sheet-mapper-caption">
      <div aria-hidden="true" className="avatar-sheet-mapper__grid">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      <figcaption id="avatar-sheet-mapper-caption">
        Structured frame grid preview. Mapping changes metadata only; source artwork remains
        immutable.
      </figcaption>
    </figure>
  );
}

export function AvatarEmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="avatar-empty-state">
      <span aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function AvatarValidationPreview({
  direction,
  state,
  backdrop = 'light',
  scale = 'world',
}: {
  readonly direction: (typeof AVATAR_DIRECTIONS)[number];
  readonly state: 'idle' | 'walk' | 'jog';
  readonly backdrop?: 'light' | 'dark';
  readonly scale?: 'mobile' | 'world';
}) {
  return (
    <figure
      className={`avatar-validation-preview avatar-validation-preview--${backdrop} avatar-validation-preview--${scale}`}
    >
      <div aria-hidden="true" className={`avatar-validation-figure is-${state}`}>
        <span className="avatar-validation-figure__hair" />
        <span className="avatar-validation-figure__head" />
        <span className="avatar-validation-figure__body" />
        <span className="avatar-validation-figure__legs" />
        <span className="avatar-validation-figure__shadow" />
      </div>
      <figcaption>
        {friendlyKey(direction)} · {friendlyKey(state)} · {friendlyKey(scale)} scale ·{' '}
        {friendlyKey(backdrop)} backdrop. Procedural development fallback; not final production art.
      </figcaption>
    </figure>
  );
}
