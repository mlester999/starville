import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { AppearancePreset, FacingDirection } from '@starville/game-core';

import {
  AvatarRequestError,
  avatarSelectionAvailableInCatalog,
  avatarSelectionsEqual,
  createAvatar,
  defaultAvatarSelection,
  loadAvatarCatalog,
  previewAvatar,
  updateAvatar,
  type AvatarCatalogOption,
  type AvatarSelection,
  type AvatarSelectionLayer,
  type AvatarStarterCatalog,
  type ResolvedAvatarProfile,
} from '../app/avatar-client';
import {
  applyAvatarOption,
  avatarSelectionSummary,
  initialAvatarSelection,
  randomizeAvatarSelection,
  selectedAvatarOption,
  type AvatarRandomizeScope,
} from '../app/avatar-selection';
import {
  AVATAR_ANIMATION_STATES,
  AVATAR_PREVIEW_DIRECTIONS,
  AvatarPreview,
  type AvatarAnimationState,
} from './AvatarPreview';
import { GameModalShell } from './game-ui';

type CustomizationMode = 'create' | 'edit';

interface CustomizationStep {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly layers: readonly AvatarSelectionLayer[];
}

const CUSTOMIZATION_STEPS: readonly CustomizationStep[] = [
  {
    id: 'base',
    label: 'Base',
    title: 'Choose a comfortable base',
    description: 'Body frames and skin tones are visual choices only. They never change gameplay.',
    layers: ['body', 'skinTone'],
  },
  {
    id: 'face',
    label: 'Face',
    title: 'Shape a friendly expression',
    description: 'Choose a face, eyes, and eyebrows with clear descriptive names.',
    layers: ['face', 'eyes', 'eyebrows'],
  },
  {
    id: 'hair',
    label: 'Hair',
    title: 'Find your village hairstyle',
    description: 'Pair an approved development hairstyle with a bounded color palette.',
    layers: ['hair', 'hairColor'],
  },
  {
    id: 'outfit',
    label: 'Outfit',
    title: 'Put together a starter outfit',
    description: 'All Phase 10A starter clothing is free and cosmetic-only.',
    layers: ['top', 'bottom', 'footwear'],
  },
  {
    id: 'accessories',
    label: 'Extras',
    title: 'Add one cozy detail',
    description: 'Choose one currently available accessory, or keep the look simple.',
    layers: ['accessories'],
  },
  {
    id: 'review',
    label: 'Review',
    title: 'Ready for Lantern Square?',
    description: 'Check every direction and animation before saving your authoritative appearance.',
    layers: [],
  },
] as const;

const LAYER_LABELS: Readonly<Record<AvatarSelectionLayer, string>> = {
  body: 'Body frame',
  skinTone: 'Skin tone',
  face: 'Face',
  eyes: 'Eyes',
  eyebrows: 'Eyebrows',
  hair: 'Hairstyle',
  hairColor: 'Hair color',
  top: 'Top',
  bottom: 'Bottom',
  footwear: 'Footwear',
  accessories: 'Accessory',
};

const DIRECTION_LABELS: Readonly<Record<FacingDirection, string>> = {
  north: 'North',
  northeast: 'North east',
  east: 'East',
  southeast: 'South east',
  south: 'South',
  southwest: 'South west',
  west: 'West',
  northwest: 'North west',
};

function avatarErrorMessage(error: unknown): string {
  if (!(error instanceof AvatarRequestError)) {
    return 'Character customization is temporarily unavailable. Your saved appearance is safe.';
  }
  if (error.code.includes('REVISION') || error.status === 409) {
    return 'Your character changed elsewhere. Close this editor and reload the latest appearance.';
  }
  if (error.code.includes('OPTION') || error.code.includes('CONTENT')) {
    return 'That appearance option is no longer available. Choose another approved starter option.';
  }
  if (error.code.includes('MAINTENANCE')) {
    return 'Character customization is paused during village maintenance. Try again later.';
  }
  if (error.code.includes('SUSPENDED')) {
    return 'This character cannot be changed while the player account is suspended.';
  }
  return 'Character customization is temporarily unavailable. Your saved appearance is safe.';
}

const NO_ACCESSORY_OPTION: AvatarCatalogOption = {
  key: 'no-accessory',
  label: 'None',
  description: 'Keep your character free of accessories.',
  developmentFallback: false,
  enabled: true,
  available: true,
};

function visibleOptions(
  catalog: AvatarStarterCatalog,
  layer: AvatarSelectionLayer,
): readonly AvatarCatalogOption[] {
  if (layer !== 'accessories') return catalog.options[layer];
  return [
    NO_ACCESSORY_OPTION,
    ...catalog.options.accessories.filter((option) => option.key !== NO_ACCESSORY_OPTION.key),
  ];
}

function OptionCard({
  layer,
  option,
  selected,
  onSelect,
  onArrow,
}: {
  readonly layer: AvatarSelectionLayer;
  readonly option: AvatarCatalogOption;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onArrow: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-checked={selected}
      aria-label={`${option.label}. ${option.description}`}
      className="avatar-option"
      data-avatar-layer={layer}
      data-selected={selected}
      role="radio"
      tabIndex={selected ? 0 : -1}
      type="button"
      onClick={onSelect}
      onKeyDown={onArrow}
    >
      {option.swatch === undefined ? (
        <span className="avatar-option__glyph" aria-hidden="true">
          ✦
        </span>
      ) : (
        <span
          className="avatar-option__swatch"
          style={{ backgroundColor: option.swatch }}
          aria-hidden="true"
        />
      )}
      <span>
        <strong>{option.label}</strong>
        <small>{option.description}</small>
      </span>
    </button>
  );
}

interface CharacterCustomizationProps {
  readonly mode: CustomizationMode;
  readonly catalog: AvatarStarterCatalog;
  readonly savedSelection: AvatarSelection;
  readonly busy: boolean;
  readonly error?: string;
  readonly onSave: (selection: AvatarSelection) => Promise<void>;
  readonly onClose?: () => void;
  readonly previewOnly?: boolean;
}

export function CharacterCustomization({
  mode,
  catalog,
  savedSelection,
  busy,
  error,
  onSave,
  onClose,
  previewOnly = false,
}: CharacterCustomizationProps) {
  const [draft, setDraft] = useState(() => structuredClone(savedSelection));
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<FacingDirection>('south');
  const [animationState, setAnimationState] = useState<AvatarAnimationState>('idle');
  const [animationPaused, setAnimationPaused] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [randomizeCount, setRandomizeCount] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();
  const step = CUSTOMIZATION_STEPS[stepIndex]!;
  const dirty = !avatarSelectionsEqual(draft, savedSelection);
  const draftAvailable = avatarSelectionAvailableInCatalog(catalog, draft);
  const summary = useMemo(() => avatarSelectionSummary(catalog, draft), [catalog, draft]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  useEffect(() => {
    if (!confirmDiscard) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmDiscard(false);
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [confirmDiscard]);

  function selectOption(layer: AvatarSelectionLayer, optionKey: string): void {
    setDraft((current) => applyAvatarOption(current, layer, optionKey));
    setConfirmDiscard(false);
  }

  function moveOptionFocus(
    layer: AvatarSelectionLayer,
    optionKey: string,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const options = visibleOptions(catalog, layer);
    const current = options.findIndex((option) => option.key === optionKey);
    const columns = window.matchMedia('(max-width: 640px)').matches ? 2 : 3;
    const delta =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -columns
            : event.key === 'ArrowDown'
              ? columns
              : 0;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (current + delta + options.length) % options.length;
    const next = options[nextIndex];
    if (next === undefined) return;
    selectOption(layer, next.key);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-avatar-layer="${layer}"][aria-label^="${CSS.escape(next.label)}."]`,
        )
        ?.focus();
    });
  }

  function randomize(scope: AvatarRandomizeScope): void {
    const nextCount = randomizeCount + 1;
    setRandomizeCount(nextCount);
    setDraft((current) =>
      randomizeAvatarSelection(
        catalog,
        current,
        scope,
        `${mode}:${String(catalog.revision)}:${String(nextCount)}`,
      ),
    );
  }

  function requestClose(): void {
    if (onClose === undefined) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  const content = (
    <div className="avatar-customizer" data-mode={mode}>
      <aside className="avatar-customizer__preview" aria-label="Character preview controls">
        <div className="avatar-customizer__backdrop">
          <span className="avatar-customizer__lantern" aria-hidden="true">
            ✦
          </span>
          <AvatarPreview
            animationState={animationState}
            direction={direction}
            label={`Character preview facing ${DIRECTION_LABELS[direction]}, showing ${animationState}. ${summary}.`}
            paused={animationPaused}
            selection={draft}
          />
        </div>

        <fieldset className="avatar-preview-controls">
          <legend>Preview direction</legend>
          <div className="avatar-direction-ring">
            {AVATAR_PREVIEW_DIRECTIONS.map((item) => (
              <button
                aria-pressed={direction === item}
                data-direction={item}
                key={item}
                title={DIRECTION_LABELS[item]}
                type="button"
                onClick={() => setDirection(item)}
              >
                <span aria-hidden="true">↑</span>
                <span className="sr-only">Face {DIRECTION_LABELS[item]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="avatar-animation-controls">
          <legend>Preview animation</legend>
          <div>
            {AVATAR_ANIMATION_STATES.map((state) => (
              <button
                aria-pressed={animationState === state}
                key={state}
                type="button"
                onClick={() => setAnimationState(state)}
              >
                {state === 'idle' ? 'Idle' : state === 'walk' ? 'Walk' : 'Jog'}
              </button>
            ))}
            <button
              aria-pressed={animationPaused}
              type="button"
              onClick={() => setAnimationPaused((value) => !value)}
            >
              {animationPaused ? 'Resume preview' : 'Pause preview'}
            </button>
          </div>
        </fieldset>

        <p className="avatar-customizer__art-note">
          Original modular development fallback · production artwork still requires review
        </p>
      </aside>

      <section className="avatar-customizer__workspace" aria-labelledby="avatar-step-title">
        <nav aria-label="Character creator progress" className="avatar-stepper">
          <ol>
            {CUSTOMIZATION_STEPS.map((item, index) => (
              <li data-active={index === stepIndex} data-complete={index < stepIndex} key={item.id}>
                <button
                  aria-current={index === stepIndex ? 'step' : undefined}
                  disabled={busy || (mode === 'create' && index > stepIndex)}
                  type="button"
                  onClick={() => setStepIndex(index)}
                >
                  <span>{index + 1}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <header className="avatar-customizer__heading">
          <p className="game-kicker">
            {mode === 'create' ? 'Your first Starville look' : 'Wardrobe mirror'}
          </p>
          <h2 id="avatar-step-title" ref={headingRef} tabIndex={-1}>
            {step.title}
          </h2>
          <p>{step.description}</p>
        </header>

        {step.layers.length === 0 ? (
          <div className="avatar-review">
            <div>
              <h3>Your character</h3>
              <p>{summary}</p>
            </div>
            <div className="avatar-preset-list" aria-label="Curated starter presets">
              {catalog.presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setDraft(structuredClone(preset.selection))}
                >
                  <AvatarPreview
                    animationState="idle"
                    compact
                    direction="south"
                    label={`${preset.label} preset`}
                    paused
                    selection={preset.selection}
                  />
                  <span>
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="avatar-layer-list">
            {step.layers.map((layer) => (
              <fieldset className="avatar-layer" key={layer}>
                <legend>{LAYER_LABELS[layer]}</legend>
                <div
                  className="avatar-option-grid"
                  role="radiogroup"
                  aria-label={LAYER_LABELS[layer]}
                >
                  {visibleOptions(catalog, layer).map((option) => (
                    <OptionCard
                      key={option.key}
                      layer={layer}
                      option={option}
                      selected={selectedAvatarOption(draft, layer) === option.key}
                      onArrow={(event) => moveOptionFocus(layer, option.key, event)}
                      onSelect={() => selectOption(layer, option.key)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}

        <div className="avatar-randomize" aria-label="Character randomize controls">
          <button disabled={busy} type="button" onClick={() => randomize('all')}>
            Surprise me
          </button>
          <button disabled={busy} type="button" onClick={() => randomize('hair')}>
            Randomize hair
          </button>
          <button disabled={busy} type="button" onClick={() => randomize('outfit')}>
            Randomize outfit
          </button>
          <button
            disabled={busy || !dirty}
            type="button"
            onClick={() => setDraft(structuredClone(savedSelection))}
          >
            Reset to saved
          </button>
        </div>

        {error === undefined ? null : (
          <p className="avatar-customizer__error" id={errorId} role="alert">
            {error}
          </p>
        )}

        {draftAvailable ? null : (
          <p className="avatar-customizer__error" role="status">
            Choose an approved option for every unavailable saved item before saving.
          </p>
        )}

        {previewOnly ? (
          <p className="avatar-customizer__preview-notice" role="status">
            Visual acceptance fixture only. Changes stay local and cannot be saved.
          </p>
        ) : null}

        <footer className="avatar-customizer__actions">
          <button
            disabled={busy || stepIndex === 0}
            type="button"
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          >
            Previous
          </button>
          {stepIndex < CUSTOMIZATION_STEPS.length - 1 ? (
            <button
              className="avatar-primary-action"
              disabled={busy}
              type="button"
              onClick={() =>
                setStepIndex((index) => Math.min(CUSTOMIZATION_STEPS.length - 1, index + 1))
              }
            >
              Next
            </button>
          ) : (
            <button
              aria-describedby={error === undefined ? undefined : errorId}
              className="avatar-primary-action"
              disabled={busy || previewOnly || !draftAvailable || (mode === 'edit' && !dirty)}
              type="button"
              onClick={() => void onSave(draft)}
            >
              {previewOnly
                ? 'Visual preview only'
                : busy
                  ? 'Saving character…'
                  : mode === 'create'
                    ? 'Confirm and enter Starville'
                    : 'Save appearance'}
            </button>
          )}
          {mode === 'edit' ? (
            <button disabled={busy} type="button" onClick={requestClose}>
              Cancel
            </button>
          ) : null}
        </footer>
      </section>

      {confirmDiscard ? (
        <div
          className="avatar-discard"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="avatar-discard-title"
        >
          <div>
            <h3 id="avatar-discard-title">Discard unsaved changes?</h3>
            <p>Your currently saved character will remain unchanged.</p>
            <button autoFocus type="button" onClick={() => onClose?.()}>
              Discard changes
            </button>
            <button type="button" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return mode === 'edit' ? (
    <GameModalShell
      className="avatar-editor-modal"
      closeLabel="Close Wardrobe"
      size="wide"
      title="Edit character appearance"
      onClose={requestClose}
    >
      {content}
    </GameModalShell>
  ) : (
    <main className="avatar-creator-shell">
      <div className="avatar-creator-brand" aria-label="Starville">
        <span aria-hidden="true">✦</span>
        <strong>STARVILLE</strong>
      </div>
      {content}
    </main>
  );
}

export function FirstTimeCharacterCreator({
  apiUrl,
  legacyFallbackPreset,
  onComplete,
}: {
  readonly apiUrl: string;
  readonly legacyFallbackPreset: AppearancePreset;
  readonly onComplete: (profile: ResolvedAvatarProfile) => void;
}) {
  const [catalog, setCatalog] = useState<AvatarStarterCatalog | null>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const requestId = useRef(crypto.randomUUID());
  const preferredSelection = useMemo(
    () => defaultAvatarSelection(legacyFallbackPreset),
    [legacyFallbackPreset],
  );

  useEffect(() => {
    let active = true;
    void loadAvatarCatalog(apiUrl)
      .then((next) => {
        if (active) {
          setCatalog(next);
          setError(undefined);
        }
      })
      .catch(() => {
        if (active) {
          setCatalog(null);
          setError(
            'The approved character catalog could not be loaded. No local choices were saved.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [apiUrl, catalogAttempt]);

  if (catalog === undefined) {
    return (
      <main className="avatar-creator-shell avatar-creator-shell--loading" aria-live="polite">
        <span className="game-loader" aria-label="Loading character creator" />
        <h1>Preparing your wardrobe…</h1>
        <p>Starville is loading the currently approved starter choices.</p>
      </main>
    );
  }

  if (catalog === null || !catalog.settings.customizationEnabled) {
    return (
      <main className="avatar-creator-shell avatar-creator-shell--loading">
        <div className="avatar-catalog-unavailable" role="alert">
          <p className="game-kicker">Wardrobe temporarily closed</p>
          <h1>Your saved character is safe</h1>
          <p>
            {error ??
              'Character customization is not currently enabled with a complete approved catalog.'}
          </p>
          <button
            className="avatar-primary-action"
            type="button"
            onClick={() => {
              setCatalog(undefined);
              setCatalogAttempt((attempt) => attempt + 1);
            }}
          >
            Try approved catalog again
          </button>
        </div>
      </main>
    );
  }

  const selection = initialAvatarSelection(catalog, preferredSelection);

  return (
    <CharacterCustomization
      busy={busy}
      catalog={catalog}
      {...(error === undefined ? {} : { error })}
      mode="create"
      savedSelection={selection}
      onSave={async (draft) => {
        if (!avatarSelectionAvailableInCatalog(catalog, draft)) return;
        setBusy(true);
        setError(undefined);
        try {
          const validated = await previewAvatar(apiUrl, draft);
          onComplete(await createAvatar(apiUrl, validated, requestId.current));
        } catch (nextError) {
          setError(avatarErrorMessage(nextError));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function CharacterWardrobeEditor({
  apiUrl,
  current,
  onClose,
  onSaved,
}: {
  readonly apiUrl: string;
  readonly current: ResolvedAvatarProfile;
  readonly onClose: () => void;
  readonly onSaved: (profile: ResolvedAvatarProfile) => void;
}) {
  const [catalog, setCatalog] = useState<AvatarStarterCatalog | null>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    void loadAvatarCatalog(apiUrl)
      .then((next) => {
        if (active) {
          setCatalog(next);
          setError(undefined);
        }
      })
      .catch(() => {
        if (active) {
          setCatalog(null);
          setError('The approved wardrobe catalog could not be refreshed. Nothing was changed.');
        }
      });
    return () => {
      active = false;
    };
  }, [apiUrl, catalogAttempt]);

  if (catalog === undefined) {
    return (
      <GameModalShell
        className="avatar-editor-modal"
        closeLabel="Close Wardrobe"
        size="wide"
        title="Edit character appearance"
        onClose={onClose}
      >
        <div className="avatar-editor-loading" role="status">
          <span className="game-loader" />
          <p>Opening your saved wardrobe…</p>
        </div>
      </GameModalShell>
    );
  }

  if (catalog === null || !catalog.settings.customizationEnabled) {
    return (
      <GameModalShell
        className="avatar-editor-modal"
        closeLabel="Close Wardrobe"
        size="wide"
        title="Edit character appearance"
        onClose={onClose}
      >
        <div className="avatar-catalog-unavailable" role="alert">
          <p className="game-kicker">Wardrobe temporarily closed</p>
          <h3>Your saved appearance remains active</h3>
          <p>
            {error ??
              'Character customization is not currently enabled with a complete approved catalog.'}
          </p>
          <button
            className="avatar-primary-action"
            type="button"
            onClick={() => {
              setCatalog(undefined);
              setCatalogAttempt((attempt) => attempt + 1);
            }}
          >
            Try approved catalog again
          </button>
        </div>
      </GameModalShell>
    );
  }

  return (
    <CharacterCustomization
      busy={busy}
      catalog={catalog}
      {...(error === undefined ? {} : { error })}
      mode="edit"
      savedSelection={current.selection}
      onClose={onClose}
      onSave={async (draft) => {
        if (!avatarSelectionAvailableInCatalog(catalog, draft)) return;
        setBusy(true);
        setError(undefined);
        try {
          const validated = await previewAvatar(apiUrl, draft);
          const saved = await updateAvatar(apiUrl, validated, current.revision, requestId.current);
          onSaved(saved);
        } catch (nextError) {
          setError(avatarErrorMessage(nextError));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
