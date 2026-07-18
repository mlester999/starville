import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { RealtimeConnectionStatus } from '../app/realtime-client';
import { StatusIndicator } from './game-ui';

interface ChannelSummary {
  readonly id: string;
  readonly number: number;
  readonly population: number;
  readonly capacity: number;
  readonly available: boolean;
}

interface PlayerStatusDockProps {
  readonly dustBalance: number | undefined;
  readonly channels: readonly ChannelSummary[];
  readonly currentChannelId: string | undefined;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly nearbyCount: number;
  readonly socialNoticeCount: number;
  readonly disabled: boolean;
  readonly activityActive: boolean;
  readonly playerLevel?: number;
  readonly onInventory: () => void;
  readonly onDustHistory?: () => void;
  readonly onNearby: () => void;
  readonly onFriends: () => void;
  readonly onActivities: () => void;
  readonly onProgression?: () => void;
  readonly onChannelSwitch: (channelId: string) => void;
  readonly onPopoverOpenChange: (open: boolean) => void;
}

function connectionPresentation(status: RealtimeConnectionStatus): {
  readonly label: string;
  readonly tone: 'success' | 'warning' | 'danger' | 'muted';
} {
  if (status === 'connected') return { label: 'Connected', tone: 'success' };
  if (status === 'connecting' || status === 'reconnecting') {
    return { label: 'Reconnecting', tone: 'warning' };
  }
  if (status === 'blocked') return { label: 'Access Interrupted', tone: 'danger' };
  if (status === 'full') return { label: 'Channels Full', tone: 'warning' };
  if (status === 'unavailable') return { label: 'Connection Unavailable', tone: 'danger' };
  return { label: 'Offline', tone: 'muted' };
}

export function PlayerStatusDock(props: PlayerStatusDockProps) {
  const { onPopoverOpenChange } = props;
  const [channelOpen, setChannelOpen] = useState(false);
  const selectorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const current = props.channels.find((channel) => channel.id === props.currentChannelId);
  const connection = connectionPresentation(props.connectionStatus);

  useEffect(() => onPopoverOpenChange(channelOpen), [channelOpen, onPopoverOpenChange]);

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

  return (
    <aside className="player-status-dock" aria-label="Player status and multiplayer actions">
      {props.activityActive ? null : (
        <button
          className="hud-action hud-action--activities"
          disabled={props.disabled}
          type="button"
          onClick={props.onActivities}
        >
          <span aria-hidden="true">✿</span>
          <span>
            <strong>Activities</strong>
            <small>Cozy co-op</small>
          </span>
        </button>
      )}

      <div className="player-status-dock__card">
        <button
          className="hud-action hud-action--progression"
          disabled={props.disabled}
          type="button"
          onClick={props.onProgression}
        >
          <span aria-hidden="true">✦</span>
          <span>
            <strong>Level {props.playerLevel ?? '—'}</strong>
            <small>My journey</small>
          </span>
        </button>
        <div className="player-status-dock__balance">
          <span>DUST</span>
          <strong aria-live="polite">
            {props.dustBalance === undefined ? '—' : props.dustBalance.toLocaleString()}
          </strong>
          {props.onDustHistory === undefined ? null : (
            <button disabled={props.disabled} type="button" onClick={props.onDustHistory}>
              History
            </button>
          )}
        </div>
        <button
          className="hud-action"
          disabled={props.disabled}
          type="button"
          onClick={props.onInventory}
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
                  : `Channel ${String(current?.number ?? '—')}`}
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
        <div className="player-status-dock__connection" aria-live="polite">
          <StatusIndicator tone={connection.tone}>{connection.label}</StatusIndicator>
        </div>

        <button
          className="hud-action"
          disabled={props.disabled || props.activityActive}
          type="button"
          onClick={props.onNearby}
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
          onClick={props.onFriends}
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
      </div>
    </aside>
  );
}
