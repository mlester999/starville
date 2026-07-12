import { useState, type FormEvent } from 'react';

import type { PlayerProfile } from '@starville/game-core';

import { PlayerRequestError, completePlayerRename } from '../app/player-client';

export function RequiredRename(props: {
  readonly apiUrl: string;
  readonly profile: PlayerProfile;
  readonly onComplete: (profile: PlayerProfile) => void;
  readonly onAccessInvalid: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);

    try {
      props.onComplete(await completePlayerRename(props.apiUrl, displayName.trim()));
    } catch (error) {
      if (error instanceof PlayerRequestError) {
        if (
          error.status === 401 ||
          error.code === 'PLAYER_SUSPENDED' ||
          error.code === 'PLAYER_RENAME_REQUIRED'
        ) {
          props.onAccessInvalid();
          return;
        }
        if (error.status >= 500) {
          setMessage('The village ledger is temporarily unavailable. Please try again shortly.');
          return;
        }
      }
      setMessage(
        error instanceof PlayerRequestError && error.code === 'PLAYER_NAME_UNCHANGED'
          ? 'Choose a name that is different from your current one.'
          : 'That name could not be saved. Use 3–20 letters, numbers, spaces, dashes, or underscores.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="gate-shell">
      <section className="gate-card rename-card" aria-labelledby="rename-title">
        <div className="gate-mark" aria-hidden="true">
          ✦
        </div>
        <p className="game-kicker">Display name update required</p>
        <h1 id="rename-title">Choose a new village name.</h1>
        <p>
          Your current name, <strong>{props.profile.displayName}</strong>, must be replaced before
          the map can start. This does not affect your wallet or token holdings.
        </p>
        <form className="rename-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="required-display-name">New display name</label>
          <input
            autoComplete="off"
            id="required-display-name"
            maxLength={20}
            minLength={3}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            value={displayName}
          />
          {message === undefined ? null : <p role="alert">{message}</p>}
          <button disabled={pending} type="submit">
            {pending ? 'Saving name…' : 'Save new name'}
          </button>
        </form>
      </section>
    </main>
  );
}
