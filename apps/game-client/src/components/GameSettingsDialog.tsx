import { useState, type KeyboardEvent, type ReactNode } from 'react';

import type { GameSettings, GameUiScale } from '../app/game-settings';
import { GameButton, GameModalShell, KeyboardKey } from './game-ui';

interface GameSettingsDialogProps {
  readonly settings: GameSettings;
  readonly pendingAction: boolean;
  readonly onSettingsChange: (settings: GameSettings) => void;
  readonly onResume: () => void;
  readonly onReturnLanding: () => Promise<void>;
  readonly onEndSession: () => Promise<void>;
  readonly onEditAppearance?: () => void;
  readonly appearanceEditingAvailable?: boolean;
}

type SettingsSection =
  'audio' | 'gameplay' | 'appearance' | 'controls' | 'accessibility' | 'how-to-play';

const SECTIONS: readonly { readonly id: SettingsSection; readonly label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'appearance', label: 'Wardrobe' },
  { id: 'controls', label: 'Controls' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'how-to-play', label: 'How to Play' },
];

function PreferenceToggle({
  checked,
  title,
  description,
  onChange,
}: {
  readonly checked: boolean;
  readonly title: string;
  readonly description: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="preference-toggle">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        checked={checked}
        type="checkbox"
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" className="preference-toggle__control" />
    </label>
  );
}

function SettingsSectionCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="settings-section-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function HowToPlay() {
  const cards = [
    [
      'Explore Starville',
      'Walk around using WASD. Approach interesting objects and press E to interact.',
    ],
    [
      'Use Your Tools',
      'Select quickbar slots using number keys 1–8. Your selected tool appears in the highlighted slot.',
    ],
    [
      'Meet Other Villagers',
      'Walk close to another player and open Nearby to inspect them, send a friend request, offer a gift, or request a trade.',
    ],
    [
      'Make Friends',
      'Send and accept friend requests. Friends remain connected after leaving and returning to Starville.',
    ],
    ['Create a Party', 'Invite friends or nearby villagers. Parties support up to four members.'],
    [
      'Chat Together',
      'Use Nearby, Channel, System, and Party chat for the appropriate conversation.',
    ],
    [
      'Play Activities',
      'Create a party with at least two players, open Activities, and prepare a cooperative activity.',
    ],
    [
      'Stay Connected',
      'Starville will attempt to restore your social and activity state after a brief connection interruption.',
    ],
    [
      'Protect Your Items',
      'Review every trade carefully. Changing an offer clears both confirmations.',
    ],
  ] as const;
  return (
    <div className="how-to-grid">
      {cards.map(([title, description]) => (
        <article key={title}>
          <span aria-hidden="true">✦</span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function GameSettingsDialog({
  settings,
  pendingAction,
  onSettingsChange,
  onResume,
  onReturnLanding,
  onEndSession,
  onEditAppearance,
  appearanceEditingAvailable = false,
}: GameSettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>('audio');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const update = <Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) =>
    onSettingsChange({ ...settings, [key]: value });

  function navigateSections(event: KeyboardEvent<HTMLButtonElement>, current: SettingsSection) {
    const currentIndex = SECTIONS.findIndex((candidate) => candidate.id === current);
    const requestedIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? SECTIONS.length - 1
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? (currentIndex + 1) % SECTIONS.length
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? (currentIndex - 1 + SECTIONS.length) % SECTIONS.length
              : null;
    if (requestedIndex === null) return;
    event.preventDefault();
    const requested = SECTIONS[requestedIndex];
    if (requested === undefined) return;
    setSection(requested.id);
    document.getElementById(`settings-tab-${requested.id}`)?.focus();
  }

  const footer = confirmingEnd ? (
    <div className="settings-confirmation" role="alert">
      <div>
        <strong>End this Starville session?</strong>
        <p>You will need to verify wallet access again before re-entering.</p>
      </div>
      <div className="settings-footer-actions">
        <GameButton disabled={pendingAction} type="button" onClick={() => setConfirmingEnd(false)}>
          Keep Playing
        </GameButton>
        <GameButton
          disabled={pendingAction}
          tone="danger"
          type="button"
          onClick={() => void onEndSession()}
        >
          {pendingAction ? 'Ending Session…' : 'Confirm End Session'}
        </GameButton>
      </div>
    </div>
  ) : (
    <div className="settings-footer-actions">
      <GameButton disabled={pendingAction} tone="primary" type="button" onClick={onResume}>
        Resume Game
      </GameButton>
      <GameButton disabled={pendingAction} type="button" onClick={() => void onReturnLanding()}>
        {pendingAction ? 'Leaving Safely…' : 'Return to Starville Landing'}
      </GameButton>
      <GameButton
        disabled={pendingAction}
        tone="quiet"
        type="button"
        onClick={() => setConfirmingEnd(true)}
      >
        End Starville Session
      </GameButton>
    </div>
  );

  return (
    <GameModalShell
      className="settings-modal"
      closeLabel="Close Settings"
      eyebrow="Starville"
      footer={footer}
      size="wide"
      subtitle="Tune the village to feel comfortable, clear, and easy to play."
      title="Settings"
      onClose={() => (confirmingEnd ? setConfirmingEnd(false) : onResume())}
    >
      <div className="settings-layout">
        <div aria-label="Settings sections" className="game-tabs settings-tabs" role="tablist">
          {SECTIONS.map((candidate) => (
            <button
              aria-controls={`settings-panel-${candidate.id}`}
              aria-selected={section === candidate.id}
              id={`settings-tab-${candidate.id}`}
              key={candidate.id}
              role="tab"
              tabIndex={section === candidate.id ? 0 : -1}
              type="button"
              onKeyDown={(event) => navigateSections(event, candidate.id)}
              onClick={() => setSection(candidate.id)}
            >
              <span aria-hidden="true" />
              {candidate.label}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`settings-tab-${section}`}
          className="settings-content"
          id={`settings-panel-${section}`}
          role="tabpanel"
        >
          {section === 'audio' ? (
            <SettingsSectionCard title="Audio">
              <label className="settings-volume">
                <span>
                  <strong>Master Volume</strong>
                  <output>{Math.round(settings.masterVolume * 100)}%</output>
                </span>
                <input
                  aria-label="Master volume"
                  max="1"
                  min="0"
                  step="0.05"
                  type="range"
                  value={settings.masterVolume}
                  onChange={(event) => update('masterVolume', Number(event.currentTarget.value))}
                />
              </label>
              <PreferenceToggle
                checked={settings.muted}
                description="Silence all available game audio."
                title="Mute All Audio"
                onChange={(value) => update('muted', value)}
              />
            </SettingsSectionCard>
          ) : null}

          {section === 'gameplay' ? (
            <SettingsSectionCard title="Gameplay">
              <PreferenceToggle
                checked={settings.showInteractionHints}
                description="Show an E prompt when an object can be used."
                title="Show Interaction Hints"
                onChange={(value) => update('showInteractionHints', value)}
              />
              <PreferenceToggle
                checked={settings.showNearbyPlayerNames}
                description="Display names above other villagers in the world."
                title="Show Nearby Player Names"
                onChange={(value) => update('showNearbyPlayerNames', value)}
              />
              <PreferenceToggle
                checked={settings.showLocationBanner}
                description="Keep the current location card visible while exploring."
                title="Show Location Banner"
                onChange={(value) => update('showLocationBanner', value)}
              />
              <PreferenceToggle
                checked={settings.confirmBeforeLeavingActivities}
                description="Ask before leaving an activity that is still underway."
                title="Confirm Before Leaving Activities"
                onChange={(value) => update('confirmBeforeLeavingActivities', value)}
              />
              <PreferenceToggle
                checked={settings.compactHud}
                description="Use tighter spacing while keeping every important action available."
                title="Compact HUD Mode"
                onChange={(value) => update('compactHud', value)}
              />
              <PreferenceToggle
                checked={settings.chatTimestamps}
                description="Show the local time beside chat messages."
                title="Chat Timestamps"
                onChange={(value) => update('chatTimestamps', value)}
              />
              <PreferenceToggle
                checked={settings.autoOpenPartyNotifications}
                description="Open important new party invitations when it is safe to do so."
                title="Auto-open Important Party Notifications"
                onChange={(value) => update('autoOpenPartyNotifications', value)}
              />
            </SettingsSectionCard>
          ) : null}

          {section === 'controls' ? (
            <SettingsSectionCard title="Controls Guide">
              <dl className="controls-guide">
                <div>
                  <dt>Movement</dt>
                  <dd>
                    <KeyboardKey>W</KeyboardKey>
                    <KeyboardKey>A</KeyboardKey>
                    <KeyboardKey>S</KeyboardKey>
                    <KeyboardKey>D</KeyboardKey>
                  </dd>
                </div>
                <div>
                  <dt>Jog</dt>
                  <dd>
                    <KeyboardKey>Shift</KeyboardKey>
                  </dd>
                </div>
                <div>
                  <dt>Interact</dt>
                  <dd>
                    <KeyboardKey>E</KeyboardKey>
                  </dd>
                </div>
                <div>
                  <dt>Quickbar</dt>
                  <dd>
                    <KeyboardKey>1–8</KeyboardKey>
                  </dd>
                </div>
                <div>
                  <dt>Chat</dt>
                  <dd>
                    <KeyboardKey>Enter</KeyboardKey>
                  </dd>
                </div>
                <div>
                  <dt>Close Panel / Back</dt>
                  <dd>
                    <KeyboardKey>Esc</KeyboardKey>
                  </dd>
                </div>
              </dl>
              <p className="settings-note">
                These controls are a guide and are not currently rebindable.
              </p>
            </SettingsSectionCard>
          ) : null}

          {section === 'appearance' ? (
            <SettingsSectionCard title="Character appearance">
              <div className="settings-wardrobe-card">
                <span aria-hidden="true">✦</span>
                <div>
                  <strong>Your Wardrobe Mirror</strong>
                  <p>
                    Preview and save one authoritative cosmetic appearance. Phase 10A starter
                    choices are free and never change gameplay power.
                  </p>
                </div>
                <GameButton
                  disabled={!appearanceEditingAvailable || onEditAppearance === undefined}
                  tone="primary"
                  type="button"
                  onClick={onEditAppearance}
                >
                  Open Wardrobe
                </GameButton>
              </div>
              {!appearanceEditingAvailable ? (
                <p className="settings-note" role="status">
                  Starville is still loading your authoritative saved appearance. Try again in a
                  moment.
                </p>
              ) : null}
            </SettingsSectionCard>
          ) : null}

          {section === 'accessibility' ? (
            <SettingsSectionCard title="Accessibility">
              <PreferenceToggle
                checked={settings.reducedMotion}
                description="Minimize interface animation and movement effects."
                title="Reduced Motion"
                onChange={(value) => update('reducedMotion', value)}
              />
              <fieldset className="ui-scale-control">
                <legend>UI Scale</legend>
                <p>Resize interface text and controls without changing the game world.</p>
                <div>
                  {([0.9, 1, 1.1, 1.2] as const).map((scale) => (
                    <button
                      aria-pressed={settings.uiScale === scale}
                      key={scale}
                      type="button"
                      onClick={() => update('uiScale', scale as GameUiScale)}
                    >
                      {Math.round(scale * 100)}%
                    </button>
                  ))}
                </div>
              </fieldset>
              <PreferenceToggle
                checked={settings.largerChatText}
                description="Increase message and composer text in Village chat."
                title="Larger Chat Text"
                onChange={(value) => update('largerChatText', value)}
              />
              <PreferenceToggle
                checked={settings.increasedTextContrast}
                description="Brighten secondary labels and strengthen panel surfaces."
                title="Increased Text Contrast"
                onChange={(value) => update('increasedTextContrast', value)}
              />
              <PreferenceToggle
                checked={settings.simplifiedHud}
                description="Reduce decorative detail while keeping essential status and actions."
                title="Simplified HUD"
                onChange={(value) => update('simplifiedHud', value)}
              />
            </SettingsSectionCard>
          ) : null}

          {section === 'how-to-play' ? <HowToPlay /> : null}
        </div>
      </div>
    </GameModalShell>
  );
}
