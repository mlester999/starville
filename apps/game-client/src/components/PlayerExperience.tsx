import { useCallback, useEffect, useState } from 'react';

import type { AppearancePreset, PlayerProfile } from '@starville/game-core';

import { PlayerRequestError, createPlayerProfile, loadPlayerEntry } from '../app/player-client';
import type { TrustedTokenAccess } from '../app/token-access-client';
import { CharacterSetup } from './CharacterSetup';
import { GameWorld } from './GameWorld';
import { RequiredRename } from './RequiredRename';

interface PlayerExperienceProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
  readonly access: TrustedTokenAccess;
  readonly rechecking: boolean;
  readonly onRecheck: () => Promise<void>;
  readonly onAccessInvalid: () => void;
  readonly onLeaveVillage: () => Promise<void>;
}

export function PlayerExperience({
  apiUrl,
  landingUrl,
  access,
  rechecking,
  onRecheck,
  onAccessInvalid,
  onLeaveVillage,
}: PlayerExperienceProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>();
  const [entryState, setEntryState] = useState<'active' | 'rename_required' | 'suspended'>(
    'active',
  );
  const [loadError, setLoadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    setProfile(undefined);

    void loadPlayerEntry(apiUrl, controller.signal)
      .then((entry) => {
        setProfile(entry.profile);
        setEntryState(entry.entryState);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof PlayerRequestError && error.code === 'PLAYER_SUSPENDED') {
          setEntryState('suspended');
          setProfile(null);
        } else if (error instanceof PlayerRequestError && error.status === 401) {
          onAccessInvalid();
        } else {
          setLoadError(true);
        }
      });

    return () => controller.abort();
  }, [access.network, access.walletAddress, apiUrl, onAccessInvalid, retryVersion]);

  const createCharacter = useCallback(
    async (input: {
      readonly displayName: string;
      readonly appearancePreset: AppearancePreset;
    }) => {
      try {
        const created = await createPlayerProfile(apiUrl, input);
        setProfile(created);
        return created;
      } catch (error) {
        if (error instanceof PlayerRequestError && error.status === 401) onAccessInvalid();
        throw error;
      }
    },
    [apiUrl, onAccessInvalid],
  );

  if (loadError) {
    return (
      <main className="gate-shell">
        <section className="gate-card" aria-labelledby="profile-load-error">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Player record unavailable</p>
          <h1 id="profile-load-error">The village ledger could not be opened.</h1>
          <p>No game world was started. Retry after the Starville API is available.</p>
          <div className="gate-actions">
            <button type="button" onClick={() => setRetryVersion((value) => value + 1)}>
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (profile === undefined) {
    return (
      <main className="gate-shell">
        <section className="gate-card" aria-live="polite">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Access verified</p>
          <h1>Loading your villager…</h1>
          <p>The protected player API is preparing your safe arrival.</p>
          <span className="game-loader" aria-label="Loading player profile" />
        </section>
      </main>
    );
  }

  if (entryState === 'suspended') {
    return (
      <main className="gate-shell">
        <section className="gate-card" aria-labelledby="player-suspended-title">
          <div className="gate-mark" aria-hidden="true">
            ◇
          </div>
          <p className="game-kicker">Village access unavailable</p>
          <h1 id="player-suspended-title">This player profile is suspended.</h1>
          <p>
            The Starville map was not started. This is an application restriction only and does not
            affect the connected wallet or any blockchain assets.
          </p>
          <div className="gate-actions">
            <a className="gate-primary" href={landingUrl}>
              Return home
              <span aria-hidden="true">→</span>
            </a>
            <button type="button" onClick={() => void onLeaveVillage()}>
              End Starville session
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (profile === null) return <CharacterSetup onCreate={createCharacter} />;

  if (entryState === 'rename_required') {
    return (
      <RequiredRename
        apiUrl={apiUrl}
        onAccessInvalid={onAccessInvalid}
        onComplete={(renamed) => {
          setProfile(renamed);
          setEntryState('active');
        }}
        profile={profile}
      />
    );
  }

  return (
    <GameWorld
      access={access}
      apiUrl={apiUrl}
      landingUrl={landingUrl}
      onAccessInvalid={onAccessInvalid}
      onLeaveVillage={onLeaveVillage}
      onRecheck={onRecheck}
      profile={profile}
      rechecking={rechecking}
    />
  );
}
