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
import { LiveOperationsBoundary } from './LiveOperationsBoundary';

interface TokenAccessGateProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
}

const SESSION_RECONCILE_INTERVAL_MS = 30_000;

function isConfirmedAccessDenial(error: unknown): boolean {
  return error instanceof GameAccessRequestError && error.status === 401;
}

export function TokenAccessGate({ apiUrl, landingUrl }: TokenAccessGateProps) {
  const [screen, setScreen] = useState<GateScreen>('checking');
  const [access, setAccess] = useState<TrustedTokenAccess>();
  const [rechecking, setRechecking] = useState(false);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const lastGrantedAccess = useRef<TrustedTokenAccess | undefined>(undefined);
  const maintenanceFlush = useRef<(() => Promise<void>) | undefined>(undefined);
  const flushBeforeMaintenance = useCallback(
    () => maintenanceFlush.current?.() ?? Promise.resolve(),
    [],
  );

  const applyAccess = useCallback((nextAccess: TrustedTokenAccess) => {
    setAccess(nextAccess);
    setScreen(screenForAccess(nextAccess));
    if (nextAccess.access === 'granted') {
      lastGrantedAccess.current = nextAccess;
      setConnectionWarning(false);
    }
  }, []);

  const checkSession = useCallback(
    async (background = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      // Never flip a playable session into the blocking gate loader for background rechecks.
      if (!background) setScreen('checking');
      setRechecking(background);

      try {
        applyAccess(await loadTrustedTokenAccess(apiUrl, controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;

        if (
          background &&
          lastGrantedAccess.current?.access === 'granted' &&
          !isConfirmedAccessDenial(error)
        ) {
          // Temporary network failure: keep last trusted grant and warn softly.
          setConnectionWarning(true);
          return;
        }

        lastGrantedAccess.current = undefined;
        setAccess(undefined);
        setConnectionWarning(false);
        setScreen(isConfirmedAccessDenial(error) ? 'required' : 'unavailable');
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
    } catch (error) {
      if (controller.signal.aborted) return;

      if (lastGrantedAccess.current?.access === 'granted' && !isConfirmedAccessDenial(error)) {
        setConnectionWarning(true);
        return;
      }

      lastGrantedAccess.current = undefined;
      setAccess(undefined);
      setConnectionWarning(false);
      setScreen('unavailable');
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
    // Initial bootstrap only — checkSession identity changes should not restart cold load.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cold-start mount
  }, [apiUrl]);

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
      if (
        document.visibilityState === 'visible' &&
        lastGrantedAccess.current?.access === 'granted'
      ) {
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
    lastGrantedAccess.current = undefined;
    setAccess(undefined);
    setConnectionWarning(false);
    setScreen('checking');
    try {
      await revokeTrustedTokenAccess(apiUrl);
      setScreen('required');
    } catch {
      setScreen('unavailable');
    }
  }, [apiUrl]);

  const handleAccessInvalid = useCallback(() => {
    lastGrantedAccess.current = undefined;
    void checkSession(false);
  }, [checkSession]);

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

  const playable = screen === 'granted' && access?.access === 'granted';

  return (
    <LiveOperationsBoundary
      apiUrl={apiUrl}
      beforeMaintenance={flushBeforeMaintenance}
      connectionWarning={connectionWarning && playable}
      landingUrl={landingUrl}
      sessionSyncing={rechecking && playable}
    >
      {playable ? (
        <PlayerExperience
          access={access}
          apiUrl={apiUrl}
          key={`${access.walletAddress}:${access.network}`}
          landingUrl={landingUrl}
          onAccessInvalid={handleAccessInvalid}
          onLeaveVillage={leaveVillage}
          onRegisterMaintenanceFlush={(handler) => {
            maintenanceFlush.current = handler;
          }}
          onRecheck={recheckSession}
          rechecking={rechecking}
        />
      ) : (
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
      )}
    </LiveOperationsBoundary>
  );
}
