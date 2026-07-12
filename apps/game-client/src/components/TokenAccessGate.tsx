import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GameAccessRequestError,
  loadTrustedTokenAccess,
  recheckTrustedTokenAccess,
  revokeTrustedTokenAccess,
  screenForAccess,
  type GateScreen,
  type TrustedTokenAccess,
} from '../app/token-access-client';
import { PlayerExperience } from './PlayerExperience';

interface TokenAccessGateProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
}

const SESSION_RECONCILE_INTERVAL_MS = 30_000;

export function TokenAccessGate({ apiUrl, landingUrl }: TokenAccessGateProps) {
  const [screen, setScreen] = useState<GateScreen>('checking');
  const [access, setAccess] = useState<TrustedTokenAccess>();
  const [rechecking, setRechecking] = useState(false);
  const activeRequest = useRef<AbortController | undefined>(undefined);

  const applyAccess = useCallback((nextAccess: TrustedTokenAccess) => {
    setAccess(nextAccess);
    setScreen(screenForAccess(nextAccess));
  }, []);

  const checkSession = useCallback(
    async (background = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      if (!background) setScreen('checking');
      setRechecking(background);

      try {
        applyAccess(await loadTrustedTokenAccess(apiUrl, controller.signal));
      } catch (error) {
        if (!controller.signal.aborted) {
          setAccess(undefined);
          setScreen(
            error instanceof GameAccessRequestError && error.status === 401
              ? 'required'
              : 'unavailable',
          );
        }
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = undefined;
          setRechecking(false);
        }
      }
    },
    [apiUrl, applyAccess],
  );

  const recheckSession = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setRechecking(true);

    try {
      applyAccess(await recheckTrustedTokenAccess(apiUrl, controller.signal));
    } catch {
      if (!controller.signal.aborted) {
        setAccess(undefined);
        setScreen('unavailable');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
        setRechecking(false);
      }
    }
  }, [apiUrl, applyAccess]);

  useEffect(() => {
    void checkSession(false);
    return () => activeRequest.current?.abort();
  }, [checkSession]);

  useEffect(() => {
    if (access?.access !== 'granted' || access.recheckAfter === undefined) {
      return;
    }

    const recheckAt = new Date(access.recheckAfter).valueOf();
    const delay = Math.min(Math.max(recheckAt - Date.now(), 0), 2_147_483_647);
    const timeout = window.setTimeout(() => void recheckSession(), delay);
    return () => window.clearTimeout(timeout);
  }, [access, recheckSession]);

  useEffect(() => {
    if (access?.access !== 'granted') return;
    const interval = window.setInterval(
      () => void checkSession(true),
      SESSION_RECONCILE_INTERVAL_MS,
    );
    return () => window.clearInterval(interval);
  }, [access?.access, checkSession]);

  useEffect(() => {
    function reconcileSession() {
      if (document.visibilityState === 'visible') {
        void checkSession(true);
      }
    }

    window.addEventListener('focus', reconcileSession);
    document.addEventListener('visibilitychange', reconcileSession);

    return () => {
      window.removeEventListener('focus', reconcileSession);
      document.removeEventListener('visibilitychange', reconcileSession);
    };
  }, [checkSession]);

  const leaveVillage = useCallback(async () => {
    activeRequest.current?.abort();
    setAccess(undefined);
    setScreen('checking');
    try {
      await revokeTrustedTokenAccess(apiUrl);
      setScreen('required');
    } catch (error) {
      setScreen('unavailable');
      throw error;
    }
  }, [apiUrl]);

  const handleAccessInvalid = useCallback(() => {
    void checkSession(false);
  }, [checkSession]);

  if (screen === 'granted' && access?.access === 'granted') {
    return (
      <PlayerExperience
        access={access}
        apiUrl={apiUrl}
        key={`${access.walletAddress}:${access.network}`}
        landingUrl={landingUrl}
        onAccessInvalid={handleAccessInvalid}
        onLeaveVillage={leaveVillage}
        onRecheck={recheckSession}
        rechecking={rechecking}
      />
    );
  }

  const stateCopy = {
    checking: {
      kicker: 'Checking the village gate',
      title: 'Verifying your Starville access…',
      description: 'The game is asking the Starville server for the current trusted session.',
    },
    required: {
      kicker: 'Wallet access required',
      title: 'Begin your journey at the village gate.',
      description:
        'Connect and verify your Solana wallet on the Starville landing page before entering the game.',
    },
    expired: {
      kicker: 'Session expired',
      title: 'The gate needs a fresh signature.',
      description: 'Return to Starville and verify the current wallet again to continue.',
    },
    revoked: {
      kicker: 'Access changed',
      title: 'This session is no longer active.',
      description:
        'The token configuration or your access status changed. A new server verification is required.',
    },
    unavailable: {
      kicker: 'Verification unavailable',
      title: 'The village gate could not be checked.',
      description:
        'Starville has not granted access. The verification service may be temporarily unavailable.',
    },
    granted: {
      kicker: 'Access verified',
      title: 'Welcome to Starville.',
      description: '',
    },
  }[screen];

  return (
    <main className="gate-shell">
      <div className="gate-constellation" aria-hidden="true" />
      <section className="gate-card" aria-labelledby="gate-title" aria-live="polite">
        <div className="gate-mark" aria-hidden="true">
          ✦
        </div>
        <p className="game-kicker">{stateCopy.kicker}</p>
        <h1 id="gate-title">{stateCopy.title}</h1>
        <p>{stateCopy.description}</p>

        {screen === 'checking' ? (
          <span className="game-loader" aria-label="Checking access" />
        ) : (
          <div className="gate-actions">
            <a className="gate-primary" href={landingUrl}>
              Go to Starville
              <span aria-hidden="true">→</span>
            </a>
            {screen === 'unavailable' ? (
              <button type="button" onClick={() => void checkSession()}>
                Try again
              </button>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
