import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicAnnouncement, PublicLiveOperations } from '@starville/live-operations';

import { loadLiveOperations } from '../app/live-operations-client';
import { GameActionLink } from './GameActionLink';

const POLL_INTERVAL_MS = 30_000;
/** Avoid flashing the soft status pill for checks that finish almost immediately. */
const BACKGROUND_INDICATOR_DELAY_MS = 400;

function dismissed(item: PublicAnnouncement): boolean {
  try {
    return (
      localStorage.getItem(`starville:announcement:${item.id}:${item.revision}`) === 'dismissed'
    );
  } catch {
    return false;
  }
}

function AnnouncementTicker({
  announcement,
  onDismiss,
}: {
  readonly announcement: PublicAnnouncement;
  readonly onDismiss: () => void;
}) {
  return (
    <aside
      className={`announcement-ticker announcement-ticker--${announcement.severity} announcement-ticker--${announcement.presentation}`}
      aria-live={announcement.severity === 'critical' ? 'assertive' : 'polite'}
    >
      <div className="announcement-ticker__track">
        <span>{announcement.message}</span>
        <span aria-hidden="true">✦</span>
        <span aria-hidden="true">{announcement.message}</span>
      </div>
      {announcement.ctaUrl !== null ? (
        <GameActionLink className="announcement-ticker__cta" href={announcement.ctaUrl}>
          {announcement.ctaLabel}
        </GameActionLink>
      ) : null}
      {announcement.dismissible ? (
        <button type="button" aria-label="Dismiss announcement" onClick={onDismiss}>
          ×
        </button>
      ) : null}
    </aside>
  );
}

function MaintenanceActions({
  landingUrl,
  ctaUrl,
  ctaLabel,
  showReturnToLanding,
  checking,
  statusMessage,
  onCheckAgain,
}: {
  readonly landingUrl: string;
  readonly ctaUrl: string | null;
  readonly ctaLabel: string | null;
  readonly showReturnToLanding: boolean;
  readonly checking: boolean;
  readonly statusMessage: string | null;
  readonly onCheckAgain: () => void;
}) {
  return (
    <div className="gate-actions maintenance-actions">
      <button
        aria-busy={checking}
        className="gate-primary maintenance-actions__primary"
        disabled={checking}
        onClick={onCheckAgain}
        type="button"
      >
        {checking ? 'Checking…' : 'Check Again'}
      </button>
      {ctaUrl !== null && ctaLabel !== null ? (
        <GameActionLink href={ctaUrl} variant="secondary">
          {ctaLabel}
        </GameActionLink>
      ) : null}
      {showReturnToLanding ? (
        <GameActionLink
          ariaLabel="Return to Starville landing page"
          href={landingUrl}
          variant="secondary"
        >
          Return to Starville
        </GameActionLink>
      ) : null}
      {statusMessage === null ? null : (
        <p aria-live="polite" className="maintenance-status" role="status">
          {statusMessage}
        </p>
      )}
    </div>
  );
}

function SoftSyncPill({
  message,
  tone = 'sync',
}: {
  readonly message: string;
  readonly tone?: 'sync' | 'warning';
}) {
  return (
    <div
      className={`game-soft-status game-soft-status--${tone}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="game-soft-status__dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function LiveOperationsBoundary({
  apiUrl,
  landingUrl,
  children,
  beforeMaintenance,
  sessionSyncing = false,
  connectionWarning = false,
}: {
  readonly apiUrl: string;
  readonly landingUrl: string;
  readonly children: ReactNode;
  readonly beforeMaintenance?: () => Promise<void>;
  /** Non-blocking session recheck from the token gate (already playable). */
  readonly sessionSyncing?: boolean;
  /** Temporary network issue while a prior trusted session remains usable. */
  readonly connectionWarning?: boolean;
}) {
  const [status, setStatus] = useState<PublicLiveOperations>();
  const statusRef = useRef<PublicLiveOperations | undefined>(undefined);
  const [, setDismissVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [backgroundSyncVisible, setBackgroundSyncVisible] = useState(false);
  const [sessionSyncVisible, setSessionSyncVisible] = useState(false);
  const [liveOpsConnectionWarning, setLiveOpsConnectionWarning] = useState(false);
  const refreshInFlight = useRef<AbortSignal | true | undefined>(undefined);
  const indicatorTimer = useRef<number | undefined>(undefined);
  const sessionIndicatorTimer = useRef<number | undefined>(undefined);

  const clearIndicatorTimer = useCallback(() => {
    if (indicatorTimer.current !== undefined) {
      window.clearTimeout(indicatorTimer.current);
      indicatorTimer.current = undefined;
    }
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal, options?: { readonly manual?: boolean }) => {
      const activeRequest = refreshInFlight.current;
      if (activeRequest === true || (activeRequest !== undefined && !activeRequest.aborted)) return;
      const requestMarker = signal ?? true;
      refreshInFlight.current = requestMarker;
      const hasTrustedSnapshot = statusRef.current !== undefined;
      const isBackground = options?.manual !== true && hasTrustedSnapshot;

      if (options?.manual === true) {
        setChecking(true);
        setStatusMessage('Checking village availability…');
      }

      if (isBackground) {
        clearIndicatorTimer();
        indicatorTimer.current = window.setTimeout(() => {
          setBackgroundSyncVisible(true);
        }, BACKGROUND_INDICATOR_DELAY_MS);
      }

      try {
        const next = await loadLiveOperations(apiUrl, signal);
        if (signal?.aborted === true) return;

        if (
          next.maintenance.active &&
          statusRef.current?.maintenance.active === false &&
          beforeMaintenance !== undefined
        ) {
          await Promise.race([
            beforeMaintenance(),
            new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
          ]);
        }
        statusRef.current = next;
        setStatus(next);
        setLiveOpsConnectionWarning(false);
        if (options?.manual === true) {
          setStatusMessage(
            next.maintenance.active
              ? 'Village maintenance is still active.'
              : 'Village access restored.',
          );
        }
      } catch {
        /* Retain the last trusted snapshot for temporary failures. */
        if (options?.manual === true) {
          setStatusMessage('Could not recheck availability. Please try again shortly.');
        } else if (hasTrustedSnapshot) {
          setLiveOpsConnectionWarning(true);
        }
      } finally {
        if (refreshInFlight.current === requestMarker) refreshInFlight.current = undefined;
        clearIndicatorTimer();
        setBackgroundSyncVisible(false);
        if (options?.manual === true) setChecking(false);
      }
    },
    [apiUrl, beforeMaintenance, clearIndicatorTimer],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
      clearIndicatorTimer();
    };
  }, [clearIndicatorTimer, refresh]);

  useEffect(() => {
    if (!sessionSyncing) {
      if (sessionIndicatorTimer.current !== undefined) {
        window.clearTimeout(sessionIndicatorTimer.current);
        sessionIndicatorTimer.current = undefined;
      }
      setSessionSyncVisible(false);
      return;
    }
    sessionIndicatorTimer.current = window.setTimeout(() => {
      setSessionSyncVisible(true);
    }, BACKGROUND_INDICATOR_DELAY_MS);
    return () => {
      if (sessionIndicatorTimer.current !== undefined) {
        window.clearTimeout(sessionIndicatorTimer.current);
        sessionIndicatorTimer.current = undefined;
      }
    };
  }, [sessionSyncing]);

  // Initial blocking load only: no trusted availability snapshot yet.
  if (status === undefined) {
    return (
      <main className="maintenance-shell">
        <section className="maintenance-card" aria-live="polite">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Checking village availability</p>
          <h1>Preparing Starville…</h1>
          <p className="maintenance-message">
            No playable world starts until the server-authoritative availability check completes.
          </p>
          <span className="game-loader" aria-label="Checking game availability" />
        </section>
      </main>
    );
  }

  // Confirmed maintenance always replaces gameplay.
  if (status.maintenance.active === true) {
    const maintenance = status.maintenance;
    return (
      <main className="maintenance-shell">
        <section className="maintenance-card" aria-labelledby="maintenance-title">
          <div className="gate-mark" aria-hidden="true">
            ✦
          </div>
          <p className="game-kicker">Village maintenance</p>
          <h1 id="maintenance-title">{maintenance.title}</h1>
          <div className="maintenance-message">
            {maintenance.message.split('\n').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {maintenance.updateDetails.length > 0 ? (
            <div className="maintenance-details">
              <p className="maintenance-details__label">Update details</p>
              <ul>
                {maintenance.updateDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {maintenance.expectedEndAt !== null ? (
            <p className="maintenance-expected">
              <span className="maintenance-expected__label">Expected return</span>
              <span>{new Date(maintenance.expectedEndAt).toLocaleString()}</span>
            </p>
          ) : null}
          {maintenance.expectedReturnMessage !== null ? (
            <p className="maintenance-expected-message">{maintenance.expectedReturnMessage}</p>
          ) : null}
          <MaintenanceActions
            checking={checking}
            ctaLabel={maintenance.ctaLabel}
            ctaUrl={maintenance.ctaUrl}
            landingUrl={landingUrl}
            onCheckAgain={() => {
              if (!checking) void refresh(undefined, { manual: true });
            }}
            showReturnToLanding={maintenance.showReturnToLanding}
            statusMessage={statusMessage}
          />
        </section>
      </main>
    );
  }

  const announcement = status.announcements.find((item) => !dismissed(item));
  const showConnectionWarning = connectionWarning || liveOpsConnectionWarning;
  const showSyncPill = !showConnectionWarning && (backgroundSyncVisible || sessionSyncVisible);

  return (
    <div className="game-live-shell">
      {announcement === undefined ? null : (
        <AnnouncementTicker
          announcement={announcement}
          onDismiss={() => {
            try {
              localStorage.setItem(
                `starville:announcement:${announcement.id}:${announcement.revision}`,
                'dismissed',
              );
            } catch {
              /* Device storage is optional. */
            }
            setDismissVersion((value) => value + 1);
          }}
        />
      )}
      {showConnectionWarning ? (
        <SoftSyncPill
          tone="warning"
          message="Connection interrupted. Your current village view is still available while Starville reconnects."
        />
      ) : null}
      {showSyncPill ? <SoftSyncPill message="Syncing village status…" /> : null}
      {children}
    </div>
  );
}
