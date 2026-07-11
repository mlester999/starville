import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GameAccessRequestError,
  formatTokenAmount,
  loadTrustedTokenAccess,
  recheckTrustedTokenAccess,
  screenForAccess,
  shortenWalletAddress,
  type GateScreen,
  type TrustedTokenAccess,
} from '../app/token-access-client';
import { GameCanvas } from './GameCanvas';

interface TokenAccessGateProps {
  readonly apiUrl: string;
  readonly landingUrl: string;
}

function formatDate(value: string | undefined): string {
  if (value === undefined || Number.isNaN(new Date(value).valueOf())) {
    return 'Unavailable';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TokenAccessGate({ apiUrl, landingUrl }: TokenAccessGateProps) {
  const [screen, setScreen] = useState<GateScreen>('checking');
  const [access, setAccess] = useState<TrustedTokenAccess>();
  const activeRequest = useRef<AbortController | undefined>(undefined);

  const applyAccess = useCallback((nextAccess: TrustedTokenAccess) => {
    setAccess(nextAccess);
    setScreen(screenForAccess(nextAccess));
  }, []);

  const checkSession = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setScreen('checking');

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
      }
    }
  }, [apiUrl, applyAccess]);

  const recheckSession = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setScreen('checking');

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
      }
    }
  }, [apiUrl, applyAccess]);

  useEffect(() => {
    void checkSession();
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
    function reconcileSession() {
      if (document.visibilityState === 'visible') {
        void checkSession();
      }
    }

    window.addEventListener('focus', reconcileSession);
    document.addEventListener('visibilitychange', reconcileSession);

    return () => {
      window.removeEventListener('focus', reconcileSession);
      document.removeEventListener('visibilitychange', reconcileSession);
    };
  }, [checkSession]);

  if (screen === 'granted' && access?.access === 'granted') {
    return (
      <main className="game-shell game-shell--granted">
        <header className="game-header">
          <div>
            <p className="game-kicker">Access verified</p>
            <h1>STARVILLE</h1>
          </div>
          <span className="game-access-chip">
            <span aria-hidden="true" />
            Village access active
          </span>
        </header>

        <section className="game-welcome" aria-labelledby="game-welcome-title">
          <div className="game-welcome__copy">
            <p className="game-kicker">The gate is open</p>
            <h2 id="game-welcome-title">Welcome beneath the stars.</h2>
            <p>
              Your trusted wallet session is active. Starville gameplay begins in Phase 4; this
              foundation scene remains intentionally free of movement and game systems.
            </p>
            <dl>
              <div>
                <dt>Wallet</dt>
                <dd>
                  {access.walletAddress === undefined
                    ? 'Verified by server'
                    : shortenWalletAddress(access.walletAddress)}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>Solana Devnet</dd>
              </div>
              <div>
                <dt>Requirement</dt>
                <dd>
                  {formatTokenAmount(access.requiredAmount)} {access.symbol}
                </dd>
              </div>
              <div>
                <dt>Session expires</dt>
                <dd>{formatDate(access.expiresAt)}</dd>
              </div>
            </dl>
          </div>
          <button className="game-recheck" type="button" onClick={() => void recheckSession()}>
            Recheck access
          </button>
        </section>

        <section className="runtime-panel" aria-labelledby="runtime-title">
          <div className="runtime-copy">
            <p className="game-kicker">Phase 3 boundary</p>
            <h2 id="runtime-title">Starville is being prepared</h2>
            <p>The Phaser runtime starts only after this trusted access check succeeds.</p>
          </div>
          <GameCanvas />
        </section>
      </main>
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
