import { useCallback, useEffect, useRef, useState } from 'react';

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
  readonly onRegisterMaintenanceFlush?: (handler: (() => Promise<void>) | undefined) => void;
}

const PROFILE_RECONCILIATION_INTERVAL_MS = 60_000;

export function PlayerExperience({
  apiUrl,
  landingUrl,
  access,
  rechecking,
  onRecheck,
  onAccessInvalid,
  onLeaveVillage,
  onRegisterMaintenanceFlush,
}: PlayerExperienceProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>();
  const [entryState, setEntryState] = useState<'active' | 'rename_required' | 'suspended'>(
    'active',
  );
  const [loadError, setLoadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [backgroundWarning, setBackgroundWarning] = useState(false);
  const profileRef = useRef<PlayerProfile | null | undefined>(undefined);
  profileRef.current = profile;

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    // Only block the full-screen loader when no usable profile is loaded yet.
    if (profileRef.current === undefined || profileRef.current === null) {
      setProfile(undefined);
    }

    void loadPlayerEntry(apiUrl, controller.signal)
      .then((entry) => {
        setProfile(entry.profile);
        setEntryState(entry.entryState);
        setBackgroundWarning(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof PlayerRequestError && error.code === 'PLAYER_SUSPENDED') {
          setEntryState('suspended');
          setProfile(null);
        } else if (error instanceof PlayerRequestError && error.status === 401) {
          onAccessInvalid();
        } else if (profileRef.current !== undefined && profileRef.current !== null) {
          // Keep the last valid profile during temporary failures after first load.
          setBackgroundWarning(true);
        } else {
          setLoadError(true);
        }
      });

    return () => controller.abort();
  }, [access.network, access.walletAddress, apiUrl, onAccessInvalid, retryVersion]);

  useEffect(() => {
    if (profile === undefined || profile === null || entryState !== 'active') return;
    let active = true;
    async function reconcileProfile() {
      try {
        const entry = await loadPlayerEntry(apiUrl);
        if (!active) return;
        setProfile(entry.profile);
        setEntryState(entry.entryState);
        setBackgroundWarning(false);
      } catch (error) {
        if (!active) return;
        if (error instanceof PlayerRequestError && error.code === 'PLAYER_SUSPENDED') {
          setEntryState('suspended');
          setProfile(null);
        } else if (error instanceof PlayerRequestError && error.status === 401) {
          onAccessInvalid();
        } else if (
          error instanceof PlayerRequestError &&
          (error.code === 'PLAYER_RENAME_REQUIRED' || error.status === 409)
        ) {
          // Treat rename enforcement as blocking if the API surfaces it on load.
          try {
            const entry = await loadPlayerEntry(apiUrl);
            if (!active) return;
            setProfile(entry.profile);
            setEntryState(entry.entryState);
          } catch {
            setBackgroundWarning(true);
          }
        } else {
          setBackgroundWarning(true);
        }
      }
    }
    function reconcileWhenVisible() {
      if (document.visibilityState === 'visible') void reconcileProfile();
    }
    const interval = window.setInterval(
      () => void reconcileProfile(),
      PROFILE_RECONCILIATION_INTERVAL_MS,
    );
    window.addEventListener('focus', reconcileWhenVisible);
    document.addEventListener('visibilitychange', reconcileWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', reconcileWhenVisible);
      document.removeEventListener('visibilitychange', reconcileWhenVisible);
    };
  }, [apiUrl, entryState, onAccessInvalid, profile]);

  const createCharacter = useCallback(
    async (input: {
      readonly displayName: string;
      readonly appearancePreset: AppearancePreset;
    }) => {
      try {
        const created = await createPlayerProfile(apiUrl, input);
        setProfile(created);
        setBackgroundWarning(false);
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

  // Initial blocking load only — never after a valid profile is known.
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
          <p className="game-kicker">Village access blocked</p>
          <h1 id="player-suspended-title">Account suspended</h1>
          <p>
            Your Starville account has been temporarily suspended. Please contact support if you
            believe this was a mistake. Your connected wallet and blockchain assets are unchanged.
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
    <>
      {backgroundWarning ? (
        <div
          className="game-soft-status game-soft-status--warning"
          role="status"
          aria-live="polite"
        >
          <span className="game-soft-status__dot" aria-hidden="true" />
          <span>
            Connection interrupted. Your current village view is still available while Starville
            reconnects.
          </span>
        </div>
      ) : null}
      <GameWorld
        access={access}
        apiUrl={apiUrl}
        landingUrl={landingUrl}
        onAccessInvalid={onAccessInvalid}
        onLeaveVillage={onLeaveVillage}
        {...(onRegisterMaintenanceFlush === undefined ? {} : { onRegisterMaintenanceFlush })}
        onRecheck={onRecheck}
        profile={profile}
        rechecking={rechecking}
      />
    </>
  );
}
