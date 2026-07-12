import { useEffect, useRef, useState } from 'react';

import type { GameSettings } from '../app/game-settings';

interface GameSettingsDialogProps {
  readonly settings: GameSettings;
  readonly pendingAction: boolean;
  readonly onSettingsChange: (settings: GameSettings) => void;
  readonly onResume: () => void;
  readonly onReturnLanding: () => Promise<void>;
  readonly onEndSession: () => Promise<void>;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

interface FocusVisibilityOptions extends FocusOptions {
  readonly focusVisible: boolean;
}

export function GameSettingsDialog({
  settings,
  pendingAction,
  onSettingsChange,
  onResume,
  onReturnLanding,
  onEndSession,
}: GameSettingsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pendingAction) {
        event.preventDefault();
        event.stopPropagation();
        if (confirmingEnd) setConfirmingEnd(false);
        else onResume();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus({
        preventScroll: true,
        focusVisible: false,
      } as FocusVisibilityOptions);
    };
  }, [confirmingEnd, onResume, pendingAction]);

  return (
    <div className="world-overlay" role="presentation">
      <section
        ref={dialogRef}
        className="settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <p className="game-kicker">Lantern Square</p>
        <h2 id="settings-title">Settings</h2>
        <p>Gameplay input is paused while this panel is open.</p>

        <fieldset className="settings-group">
          <legend>Audio</legend>
          <label className="settings-volume">
            <span>Master volume</span>
            <output>{Math.round(settings.masterVolume * 100)}%</output>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.masterVolume}
              onChange={(event) =>
                onSettingsChange({ ...settings, masterVolume: Number(event.currentTarget.value) })
              }
            />
          </label>
          <label className="settings-mute">
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(event) =>
                onSettingsChange({ ...settings, muted: event.currentTarget.checked })
              }
            />
            <span>Mute all game audio</span>
          </label>
          <small>Only the available master audio channel is shown.</small>
        </fieldset>

        <section className="settings-group" aria-labelledby="settings-controls-title">
          <h3 id="settings-controls-title">Controls</h3>
          <p>
            <kbd>WASD</kbd> Move · <kbd>Shift</kbd> Jog · <kbd>E</kbd> Interact
          </p>
        </section>

        {confirmingEnd ? (
          <div className="settings-confirmation" role="alert">
            <strong>End this Starville session?</strong>
            <p>You will need to verify wallet access again before re-entering.</p>
            <div className="settings-actions">
              <button
                disabled={pendingAction}
                type="button"
                onClick={() => setConfirmingEnd(false)}
              >
                Keep playing
              </button>
              <button disabled={pendingAction} type="button" onClick={() => void onEndSession()}>
                {pendingAction ? 'Ending session…' : 'Confirm end session'}
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-actions">
            <button disabled={pendingAction} type="button" onClick={onResume}>
              Resume game
            </button>
            <button disabled={pendingAction} type="button" onClick={() => void onReturnLanding()}>
              {pendingAction ? 'Leaving safely…' : 'Return to Starville landing'}
            </button>
            <button disabled={pendingAction} type="button" onClick={() => setConfirmingEnd(true)}>
              End Starville session
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
