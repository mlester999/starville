import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

import type { RealtimeConnectionStatus } from '../app/realtime-client';
import {
  coordinateConnectionHealth,
  type CoordinatedConnectionHealth,
} from '../app/connection-health';
import type { SaveStatus } from '../app/use-player-persistence';
import { GameButton, GameModalShell, StatusIndicator } from './game-ui';

interface ChannelSummary {
  readonly id: string;
  readonly number: number;
  readonly population: number;
  readonly capacity: number;
  readonly available: boolean;
}

export type HudValueState<Value> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Value }
  | { readonly status: 'unavailable' };

interface PlayerStatusDockProps {
  readonly dust: HudValueState<number>;
  readonly level: HudValueState<number>;
  readonly channels: readonly ChannelSummary[];
  readonly currentChannelId: string | undefined;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly persistenceStatus?: SaveStatus;
  readonly profileConnectionWarning?: boolean;
  readonly accessRechecking?: boolean;
  readonly nearbyCount: number;
  readonly socialNoticeCount: number;
  readonly disabled: boolean;
  readonly activityActive: boolean;
  readonly onInventory: () => void;
  readonly onDustHistory?: () => void;
  readonly onDustRetry?: () => void;
  readonly onLevelRetry?: () => void;
  readonly onConnectionRetry?: () => void;
  readonly onNearby: () => void;
  readonly onFriends: () => void;
  readonly onActivities: () => void;
  readonly onProgression?: () => void;
  readonly onChannelSwitch: (channelId: string) => void;
  readonly onPopoverOpenChange: (open: boolean) => void;
}

function valueText(state: HudValueState<number>): string {
  if (state.status === 'loading') return 'Loading';
  if (state.status === 'unavailable') return 'Unavailable';
  return state.value.toLocaleString();
}

function StatusValue({
  label,
  state,
}: {
  readonly label: string;
  readonly state: HudValueState<number>;
}) {
  return (
    <div className="player-status-dock__value">
      <span>{label}</span>
      <strong aria-live="polite" data-status={state.status}>
        {valueText(state)}
      </strong>
    </div>
  );
}

export function PlayerStatusDock(props: PlayerStatusDockProps) {
  const { onPopoverOpenChange } = props;
  const [expanded, setExpanded] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const actionFocusTarget = useRef<HTMLButtonElement | null>(null);
  const wasDisabled = useRef(props.disabled);
  const current = props.channels.find((channel) => channel.id === props.currentChannelId);
  const connection: CoordinatedConnectionHealth = coordinateConnectionHealth({
    realtime: props.connectionStatus,
    persistence: props.persistenceStatus ?? 'ready',
    profileConnectionWarning: props.profileConnectionWarning ?? false,
    accessRechecking: props.accessRechecking ?? false,
  });
  const canRetryConnection = props.onConnectionRetry !== undefined && connection.retryable;

  useEffect(
    () => onPopoverOpenChange(channelOpen || connectionDetailsOpen),
    [channelOpen, connectionDetailsOpen, onPopoverOpenChange],
  );

  useEffect(() => {
    if (!props.disabled) return;
    setChannelOpen(false);
    setConnectionDetailsOpen(false);
  }, [props.disabled]);

  useEffect(() => {
    if (!channelOpen) return;
    const firstAvailable =
      popoverRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    firstAvailable?.focus({ preventScroll: true });
    function closeFromOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!popoverRef.current?.contains(target) && !selectorRef.current?.contains(target)) {
        setChannelOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeFromOutside);
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, [channelOpen]);

  useEffect(() => {
    if (!expanded || props.disabled) return;
    function collapseFromOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !dockRef.current?.contains(target)) setExpanded(false);
    }
    document.addEventListener('pointerdown', collapseFromOutside);
    return () => document.removeEventListener('pointerdown', collapseFromOutside);
  }, [expanded, props.disabled]);

  useEffect(() => {
    if (wasDisabled.current && !props.disabled && actionFocusTarget.current?.isConnected) {
      const target = actionFocusTarget.current;
      actionFocusTarget.current = null;
      window.setTimeout(() => target.focus({ preventScroll: true }), 0);
    }
    wasDisabled.current = props.disabled;
  }, [props.disabled]);

  function closeChannels(restoreFocus = true) {
    setChannelOpen(false);
    if (restoreFocus) window.setTimeout(() => selectorRef.current?.focus(), 0);
  }

  function handleChannelKeys(event: KeyboardEvent<HTMLDivElement>) {
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    ];
    const currentIndex = options.findIndex((option) => option === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeChannels();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + options.length) % options.length
            : (currentIndex - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  function launchAction(event: MouseEvent<HTMLButtonElement>, action: () => void) {
    actionFocusTarget.current = event.currentTarget;
    action();
  }

  function collapseDetails() {
    setChannelOpen(false);
    setExpanded(false);
    window.setTimeout(() => detailsToggleRef.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <>
      <aside
        ref={dockRef}
        className="player-status-dock"
        aria-label="Player status and multiplayer actions"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && expanded && !channelOpen) {
            event.preventDefault();
            collapseDetails();
          }
        }}
      >
        <div className="player-status-dock__summary">
          <StatusValue label="Level" state={props.level} />
          <StatusValue label="DUST" state={props.dust} />
          <div className="player-status-dock__connection" aria-live="polite">
            <StatusIndicator tone={connection.tone}>{connection.label}</StatusIndicator>
            {canRetryConnection ? (
              <button disabled={props.disabled} type="button" onClick={props.onConnectionRetry}>
                Retry connection
              </button>
            ) : null}
          </div>
          <button
            ref={detailsToggleRef}
            aria-controls="player-status-details"
            aria-expanded={expanded}
            className="player-status-dock__details-toggle"
            disabled={props.disabled}
            type="button"
            onClick={() => {
              if (expanded) setChannelOpen(false);
              setExpanded((value) => !value);
            }}
          >
            <span aria-hidden="true">{expanded ? '×' : '☰'}</span>
            <span>{expanded ? 'Close' : 'Details'}</span>
          </button>
        </div>

        <div className="player-status-dock__details" hidden={!expanded} id="player-status-details">
          <section
            aria-label="Connection details"
            className="player-status-dock__service-details"
            data-connection-state={connection.state}
          >
            <strong>{connection.label}</strong>
            <ul>
              {connection.services.map((service) => (
                <li data-status={service.status} key={service.label}>
                  <span>{service.label}</span>
                  <span>{service.status}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setConnectionDetailsOpen(true)}>
              Technical details
            </button>
          </section>
          <button
            className="hud-action hud-action--progression"
            disabled={props.disabled || props.onProgression === undefined}
            type="button"
            onClick={(event) => launchAction(event, () => props.onProgression?.())}
          >
            <span aria-hidden="true">✦</span>
            <span>
              <strong>My Journey</strong>
              <small>Level {valueText(props.level)}</small>
            </span>
          </button>

          <div className="player-status-dock__balance">
            <span>DUST</span>
            <strong data-status={props.dust.status}>{valueText(props.dust)}</strong>
            {props.onDustHistory === undefined ? null : (
              <button
                disabled={props.disabled}
                type="button"
                onClick={(event) => launchAction(event, props.onDustHistory!)}
              >
                History
              </button>
            )}
          </div>

          <button
            className="hud-action"
            disabled={props.disabled}
            type="button"
            onClick={(event) => launchAction(event, props.onInventory)}
          >
            <span aria-hidden="true">◇</span>
            <span>
              <strong>Inventory</strong>
              <small>Items &amp; tools</small>
            </span>
          </button>

          <div className="channel-selector">
            <button
              ref={selectorRef}
              aria-expanded={channelOpen}
              aria-haspopup="listbox"
              className="channel-selector__button"
              disabled={props.disabled || current === undefined || props.activityActive}
              type="button"
              onClick={() => setChannelOpen((value) => !value)}
            >
              <span>
                <strong>
                  {props.activityActive
                    ? 'Private Activity'
                    : `Channel ${String(current?.number ?? 'Unavailable')}`}
                </strong>
                <small>
                  {current === undefined
                    ? connection.label
                    : `${String(current.population)} / ${String(current.capacity)} players`}
                </small>
              </span>
              <span aria-hidden="true">⌃</span>
            </button>
            {channelOpen ? (
              <div
                ref={popoverRef}
                aria-label="Village channels"
                className="channel-popover"
                role="listbox"
                onKeyDown={handleChannelKeys}
              >
                <header>
                  <strong>Village Channels</strong>
                  <span>Choose where to meet other villagers.</span>
                </header>
                {props.channels.map((channel) => {
                  const selected = channel.id === props.currentChannelId;
                  return (
                    <button
                      aria-selected={selected}
                      disabled={selected || !channel.available}
                      key={channel.id}
                      role="option"
                      type="button"
                      onClick={() => {
                        props.onChannelSwitch(channel.id);
                        closeChannels();
                      }}
                    >
                      <span aria-hidden="true" className="channel-popover__dot" />
                      <span>
                        <strong>Channel {channel.number}</strong>
                        <small>
                          {channel.population} / {channel.capacity} players
                        </small>
                      </span>
                      {selected ? (
                        <em>✓ Current</em>
                      ) : channel.available ? (
                        <em>Join</em>
                      ) : (
                        <em>Full</em>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <button
            className="hud-action"
            disabled={props.disabled || props.activityActive}
            type="button"
            onClick={(event) => launchAction(event, props.onNearby)}
          >
            <span aria-hidden="true">◎</span>
            <span>
              <strong>Nearby</strong>
              <small>
                {props.nearbyCount === 0 ? 'No players' : `${props.nearbyCount} close by`}
              </small>
            </span>
            {props.nearbyCount > 0 ? (
              <em aria-label={`${props.nearbyCount} nearby players`}>{props.nearbyCount}</em>
            ) : null}
          </button>

          <button
            className="hud-action"
            disabled={props.disabled}
            type="button"
            onClick={(event) => launchAction(event, props.onFriends)}
          >
            <span aria-hidden="true">♢</span>
            <span>
              <strong>Friends</strong>
              <small>Friends &amp; party</small>
            </span>
            {props.socialNoticeCount > 0 ? (
              <em aria-label={`${props.socialNoticeCount} social notifications`}>
                {Math.min(99, props.socialNoticeCount)}
              </em>
            ) : null}
          </button>

          {props.activityActive ? null : (
            <button
              className="hud-action hud-action--activities"
              disabled={props.disabled}
              type="button"
              onClick={(event) => launchAction(event, props.onActivities)}
            >
              <span aria-hidden="true">✿</span>
              <span>
                <strong>Activities</strong>
                <small>Cozy co-op</small>
              </span>
            </button>
          )}
        </div>
      </aside>
      {connectionDetailsOpen ? (
        <GameModalShell
          className="connection-details-modal"
          closeLabel="Close connection details"
          eyebrow="Recovery status"
          footer={
            <div className="connection-details-modal__actions">
              {canRetryConnection ? (
                <GameButton
                  type="button"
                  onClick={() => {
                    props.onConnectionRetry?.();
                    setConnectionDetailsOpen(false);
                  }}
                >
                  Retry available services
                </GameButton>
              ) : null}
              <GameButton
                tone="primary"
                type="button"
                onClick={() => setConnectionDetailsOpen(false)}
              >
                Close details
              </GameButton>
            </div>
          }
          portal
          size="compact"
          subtitle="This view reports bounded client recovery state without exposing database, storage, token, or network internals."
          title={connection.label}
          onClose={() => setConnectionDetailsOpen(false)}
        >
          <ul className="connection-details-modal__services">
            {connection.services.map((service) => (
              <li data-status={service.status} key={service.label}>
                <span>{service.label}</span>
                <strong>{service.status}</strong>
              </li>
            ))}
          </ul>
          <p>
            Automatic retries are bounded. Use the recovery action when it is available; cached
            visuals never represent a successful save or restored access.
          </p>
        </GameModalShell>
      ) : null}
    </>
  );
}
