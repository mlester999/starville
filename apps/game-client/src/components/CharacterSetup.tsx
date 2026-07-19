import { useState, type FormEvent } from 'react';

import {
  APPEARANCE_PRESETS,
  playerProfileCreateSchema,
  type AppearancePreset,
  type PlayerProfile,
} from '@starville/game-core';

import { CharacterPortrait } from './CharacterPortrait';

const PRESET_LABELS: Readonly<Record<AppearancePreset, string>> = {
  moss: 'Moss Wanderer',
  marigold: 'Marigold Keeper',
  moonberry: 'Moonberry Dreamer',
  river: 'River Wayfarer',
};

interface CharacterSetupProps {
  readonly onCreate: (input: {
    readonly displayName: string;
    readonly appearancePreset: AppearancePreset;
  }) => Promise<PlayerProfile>;
}

export function CharacterSetup({ onCreate }: CharacterSetupProps) {
  const [displayName, setDisplayName] = useState('');
  const [appearancePreset, setAppearancePreset] = useState<AppearancePreset>('moss');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = playerProfileCreateSchema.safeParse({ displayName, appearancePreset });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose a valid Starville character.');
      return;
    }

    setError(undefined);
    setSubmitting(true);
    try {
      await onCreate(parsed.data);
    } catch {
      setError('Your character could not be created. Check the village gate and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="setup-shell">
      <section className="setup-card" aria-labelledby="character-setup-title">
        <div className="setup-preview" aria-hidden="true">
          <span className="setup-preview__star">✦</span>
          <CharacterPortrait preset={appearancePreset} />
          <p>{PRESET_LABELS[appearancePreset]}</p>
        </div>

        <form className="setup-form" onSubmit={(event) => void submit(event)}>
          <p className="game-kicker">First light in Lantern Square</p>
          <h1 id="character-setup-title">Create your villager</h1>
          <p className="setup-intro">
            Choose a name and one of four cosmetic starter palettes. You can begin exploring as soon
            as the village record is ready.
          </p>

          <label className="setup-field">
            <span>Display name</span>
            <input
              autoComplete="off"
              maxLength={20}
              minLength={3}
              name="displayName"
              placeholder="Luna Vale"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <small>3–20 letters, numbers, spaces, hyphens, or underscores.</small>
          </label>

          <fieldset className="preset-fieldset">
            <legend>Starter appearance</legend>
            <div className="preset-grid">
              {APPEARANCE_PRESETS.map((preset) => (
                <label
                  key={preset}
                  className="preset-option"
                  data-selected={preset === appearancePreset}
                >
                  <input
                    checked={preset === appearancePreset}
                    name="appearancePreset"
                    type="radio"
                    value={preset}
                    onChange={() => setAppearancePreset(preset)}
                  />
                  <CharacterPortrait preset={preset} />
                  <span>{PRESET_LABELS[preset]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error === undefined ? null : (
            <p className="setup-error" role="alert">
              {error}
            </p>
          )}

          <button className="setup-submit" disabled={submitting} type="submit">
            {submitting ? 'Preparing your arrival…' : 'Create character'}
            <span aria-hidden="true">→</span>
          </button>
          <p className="setup-note">Appearance choices are cosmetic only</p>
        </form>
      </section>
    </main>
  );
}
