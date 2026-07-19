import {
  AVATAR_ANIMATION_STATES,
  AVATAR_PREVIEW_DIRECTIONS,
  AvatarPreview,
  type AvatarAnimationState,
} from '../components/AvatarPreview';
import { defaultAvatarSelection } from '../app/avatar-client';

import './phase12d-character.css';

type PreviewDirection = (typeof AVATAR_PREVIEW_DIRECTIONS)[number];

const DIRECTION_LABELS = {
  north: 'North',
  northeast: 'North East',
  east: 'East',
  southeast: 'South East',
  south: 'South',
  southwest: 'South West',
  west: 'West',
  northwest: 'North West',
} as const satisfies Readonly<Record<PreviewDirection, string>>;

const ANIMATION_LABELS = {
  idle: 'Idle',
  walk: 'Walk',
  jog: 'Jog',
} as const satisfies Readonly<Record<AvatarAnimationState, string>>;

export const PHASE12D_CHARACTER_MAPPINGS = AVATAR_ANIMATION_STATES.flatMap((animationState) =>
  AVATAR_PREVIEW_DIRECTIONS.map((direction) => ({
    key: `${animationState}:${direction}` as const,
    animationState,
    direction,
  })),
);

export function Phase12DCharacterAcceptance({
  reducedMotion,
  highContrast,
}: {
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
}) {
  const selection = defaultAvatarSelection('moss');

  return (
    <main
      className={[
        'phase12d-character-acceptance',
        highContrast ? 'phase12d-character-acceptance--high-contrast' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-visual-contrast={highContrast ? 'high' : 'default'}
      data-visual-motion={reducedMotion ? 'reduced' : 'default'}
    >
      <section
        aria-labelledby="phase12d-character-title"
        className="phase12d-character-acceptance__panel"
      >
        <header className="phase12d-character-acceptance__header">
          <div>
            <p className="phase12d-character-acceptance__kicker">
              Phase 12D · development-only acceptance
            </p>
            <h1 id="phase12d-character-title">Eight-direction character motion matrix</h1>
            <p>
              One shared avatar selection rendered through every canonical idle, walk, and jog
              mapping. Each cell keeps the same fixed foot anchor for silhouette and gait review.
            </p>
          </div>
          <dl className="phase12d-character-acceptance__summary">
            <div>
              <dt>Directions</dt>
              <dd>{AVATAR_PREVIEW_DIRECTIONS.length}</dd>
            </div>
            <div>
              <dt>States</dt>
              <dd>{AVATAR_ANIMATION_STATES.length}</dd>
            </div>
            <div>
              <dt>Mappings</dt>
              <dd>{PHASE12D_CHARACTER_MAPPINGS.length}</dd>
            </div>
          </dl>
        </header>

        <div
          className="phase12d-character-acceptance__motion-note"
          data-motion-status={reducedMotion ? 'paused' : 'animated'}
          role="status"
        >
          <span aria-hidden="true" />
          {reducedMotion
            ? 'Reduced motion is active. Every mapping is paused on its deterministic first frame.'
            : 'Animation is active. Add motion=reduced to the URL to inspect deterministic first frames.'}
        </div>

        <div
          aria-label="Character direction and motion mappings"
          className="phase12d-character-acceptance__matrix-scroll"
          role="region"
          tabIndex={0}
        >
          <table className="phase12d-character-acceptance__matrix">
            <thead>
              <tr>
                <th scope="col">Motion</th>
                {AVATAR_PREVIEW_DIRECTIONS.map((direction) => (
                  <th key={direction} scope="col">
                    <span>{DIRECTION_LABELS[direction]}</span>
                    <code>{direction}</code>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AVATAR_ANIMATION_STATES.map((animationState) => (
                <tr key={animationState}>
                  <th scope="row">
                    <span>{ANIMATION_LABELS[animationState]}</span>
                    <code>{animationState}</code>
                  </th>
                  {AVATAR_PREVIEW_DIRECTIONS.map((direction) => {
                    const mappingKey = `${animationState}:${direction}` as const;
                    return (
                      <td data-mapping-key={mappingKey} key={mappingKey}>
                        <div className="phase12d-character-acceptance__stage">
                          <AvatarPreview
                            animationState={animationState}
                            compact
                            direction={direction}
                            label={`${ANIMATION_LABELS[animationState]}, ${DIRECTION_LABELS[direction]}`}
                            paused={reducedMotion}
                            selection={selection}
                          />
                        </div>
                        <code>{mappingKey}</code>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="phase12d-character-acceptance__footer">
          <span>Repository vector-rig preview</span>
          <span>Production-candidate review surface · not final art approval</span>
        </footer>
      </section>
    </main>
  );
}
