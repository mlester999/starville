import { useState, type KeyboardEvent, type ReactNode } from 'react';

import type {
  GameHudDensity,
  GameSettings,
  GameUiScale,
  GameVisualQuality,
} from '../app/game-settings';
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
  readonly portal?: boolean;
}

type SettingsSection =
  'audio' | 'graphics' | 'gameplay' | 'appearance' | 'controls' | 'accessibility' | 'how-to-play';

const SECTIONS: readonly { readonly id: SettingsSection; readonly label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'graphics', label: 'Graphics' },
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

function ChoiceControl<Value extends string>({
  description,
  label,
  options,
  value,
  onChange,
}: {
  readonly description: string;
  readonly label: string;
  readonly options: readonly { readonly label: string; readonly value: Value }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="settings-choice-control">
      <legend>{label}</legend>
      <p>{description}</p>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
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
      'Follow Your Guide',
      'Open the compact Starville Guide for one verified objective, an accessible route hint, Journey progress, and recovery.',
    ],
    [
      'Begin Your Daily Rhythm',
      'Complete three eligible server-assigned objectives before the 00:00 UTC reset. Daily v1 has no DUST or XP reward.',
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
  portal = false,
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
      portal={portal}
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
              <label className="settings-volume">
                <span>
                  <strong>Music Volume</strong>
                  <output>{Math.round(settings.musicVolume * 100)}%</output>
                </span>
                <input
                  aria-label="Music volume"
                  max="1"
                  min="0"
                  step="0.05"
                  type="range"
                  value={settings.musicVolume}
                  onChange={(event) => update('musicVolume', Number(event.currentTarget.value))}
                />
              </label>
              <label className="settings-volume">
                <span>
                  <strong>Ambience Volume</strong>
                  <output>{Math.round(settings.ambienceVolume * 100)}%</output>
                </span>
                <input
                  aria-label="Ambience volume"
                  max="1"
                  min="0"
                  step="0.05"
                  type="range"
                  value={settings.ambienceVolume}
                  onChange={(event) => update('ambienceVolume', Number(event.currentTarget.value))}
                />
              </label>
              <label className="settings-volume">
                <span>
                  <strong>Sound Effects Volume</strong>
                  <output>{Math.round(settings.sfxVolume * 100)}%</output>
                </span>
                <input
                  aria-label="Sound effects volume"
                  max="1"
                  min="0"
                  step="0.05"
                  type="range"
                  value={settings.sfxVolume}
                  onChange={(event) => update('sfxVolume', Number(event.currentTarget.value))}
                />
              </label>
              <PreferenceToggle
                checked={settings.muted}
                description="Silence all available game audio."
                title="Mute All Audio"
                onChange={(value) => update('muted', value)}
              />
              <PreferenceToggle
                checked={settings.musicMuted}
                description="Silence the optional location music foundation."
                title="Mute Music"
                onChange={(value) => update('musicMuted', value)}
              />
              <PreferenceToggle
                checked={settings.ambienceMuted}
                description="Silence environmental room tone and village ambience."
                title="Mute Ambient Audio"
                onChange={(value) => update('ambienceMuted', value)}
              />
              <PreferenceToggle
                checked={settings.sfxMuted}
                description="Silence interface, interaction, recovery, and transition cues."
                title="Mute Sound Effects"
                onChange={(value) => update('sfxMuted', value)}
              />
              <p className="settings-note" role="note">
                Current audio is an original procedural development-safe foundation. Every important
                cue also has a visible text equivalent; owner audio replacement remains pending.
              </p>
            </SettingsSectionCard>
          ) : null}

          {section === 'graphics' ? (
            <SettingsSectionCard title="Graphics">
              <ChoiceControl<GameVisualQuality>
                description="Choose the overall world detail level. Balanced is recommended for most devices."
                label="Visual quality"
                options={[
                  { label: 'Low', value: 'low' },
                  { label: 'Balanced', value: 'balanced' },
                  { label: 'High', value: 'high' },
                ]}
                value={settings.visualQuality}
                onChange={(value) => update('visualQuality', value)}
              />
              {settings.visualQuality === 'low' ? (
                <p className="settings-note" role="status">
                  Low quality turns off ambient effects, shadows, and water animation. Your saved
                  choices return if you select Balanced or High.
                </p>
              ) : null}
              <PreferenceToggle
                checked={settings.ambientEffects}
                description="Show subtle village atmosphere such as drifting pollen and fireflies."
                title="Ambient Effects"
                onChange={(value) => update('ambientEffects', value)}
              />
              <PreferenceToggle
                checked={settings.shadows}
                description="Draw soft grounding shadows beneath villagers, buildings, and props."
                title="Shadows"
                onChange={(value) => update('shadows', value)}
              />
              <PreferenceToggle
                checked={settings.waterAnimation}
                description="Animate streams and other water surfaces."
                title="Water Animation"
                onChange={(value) => update('waterAnimation', value)}
              />
              <PreferenceToggle
                checked={settings.chatBubbles}
                description="Show recent player chat above nearby villagers as well as in chat history."
                title="Chat Bubbles"
                onChange={(value) => update('chatBubbles', value)}
              />
              <PreferenceToggle
                checked={settings.worldLabels}
                description="Show useful nearby villager and world-object labels."
                title="World Labels"
                onChange={(value) => update('worldLabels', value)}
              />
              <ChoiceControl<GameHudDensity>
                description="Compact keeps the world clear; Comfortable adds breathing room without removing actions."
                label="HUD density"
                options={[
                  { label: 'Compact', value: 'compact' },
                  { label: 'Comfortable', value: 'comfortable' },
                ]}
                value={settings.hudDensity}
                onChange={(value) => update('hudDensity', value)}
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
                    Preview and save one authoritative cosmetic appearance. Starter choices are free
                    and never change gameplay power.
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
            </SettingsSectionCard>
          ) : null}

          {section === 'how-to-play' ? <HowToPlay /> : null}
        </div>
      </div>
    </GameModalShell>
  );
}
