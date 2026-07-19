import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerStatusDock, type HudValueState } from './PlayerStatusDock';

let container: HTMLDivElement;
let root: Root;

const channels = [
  { id: 'channel-1', number: 1, population: 4, capacity: 40, available: true },
  { id: 'channel-2', number: 2, population: 0, capacity: 40, available: true },
  { id: 'channel-3', number: 3, population: 40, capacity: 40, available: false },
];

const noop = () => undefined;

interface RenderOptions {
  readonly activityActive?: boolean;
  readonly connectionStatus?: 'connected' | 'disconnected' | 'unavailable';
  readonly disabled?: boolean;
  readonly dust?: HudValueState<number>;
  readonly level?: HudValueState<number>;
  readonly onChannelSwitch?: (channelId: string) => void;
  readonly onConnectionRetry?: () => void;
  readonly onDustRetry?: () => void;
  readonly onInventory?: () => void;
  readonly onLevelRetry?: () => void;
  readonly onPopoverOpenChange?: (open: boolean) => void;
}

async function renderDock(options: RenderOptions = {}) {
  await act(async () => {
    root.render(
      <PlayerStatusDock
        activityActive={options.activityActive ?? false}
        channels={channels}
        connectionStatus={options.connectionStatus ?? 'connected'}
        currentChannelId="channel-1"
        disabled={options.disabled ?? false}
        dust={options.dust ?? { status: 'ready', value: 250 }}
        level={options.level ?? { status: 'ready', value: 7 }}
        nearbyCount={2}
        socialNoticeCount={3}
        onActivities={noop}
        onChannelSwitch={options.onChannelSwitch ?? noop}
        onFriends={noop}
        onInventory={options.onInventory ?? noop}
        onNearby={noop}
        onPopoverOpenChange={options.onPopoverOpenChange ?? noop}
        {...(options.onConnectionRetry === undefined
          ? {}
          : { onConnectionRetry: options.onConnectionRetry })}
        {...(options.onDustRetry === undefined ? {} : { onDustRetry: options.onDustRetry })}
        {...(options.onLevelRetry === undefined ? {} : { onLevelRetry: options.onLevelRetry })}
      />,
    );
  });
}

async function openDetails() {
  const toggle = container.querySelector<HTMLButtonElement>('.player-status-dock__details-toggle');
  await act(async () => toggle?.click());
  return toggle;
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('PlayerStatusDock', () => {
  it('starts collapsed with real status values and reveals every action on demand', async () => {
    await renderDock();

    const details = container.querySelector<HTMLElement>('.player-status-dock__details');
    const toggle = container.querySelector<HTMLButtonElement>(
      '.player-status-dock__details-toggle',
    );
    expect(details?.hidden).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-status="ready"]')?.textContent).toBe('7');
    expect(container.textContent).toContain('250');
    expect(container.textContent).toContain('Connected');

    await openDetails();
    expect(details?.hidden).toBe(false);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(details?.textContent).toContain('Inventory');
    expect(details?.textContent).toContain('Nearby');
    expect(details?.textContent).toContain('Friends');
    expect(details?.textContent).toContain('Activities');
    expect(details?.textContent).toContain('Channel 1');
    expect(details?.querySelector('select')).toBeNull();
    expect(details?.querySelector('[aria-label="2 nearby players"]')).not.toBeNull();
    expect(details?.querySelector('[aria-label="3 social notifications"]')).not.toBeNull();
  });

  it('distinguishes loading, real zero, and unavailable values with one retry action', async () => {
    const onDustRetry = vi.fn();
    const onLevelRetry = vi.fn();
    const onConnectionRetry = vi.fn();
    await renderDock({
      connectionStatus: 'unavailable',
      dust: { status: 'ready', value: 0 },
      level: { status: 'loading' },
      onConnectionRetry,
      onDustRetry,
      onLevelRetry,
    });
    const values = [...container.querySelectorAll<HTMLElement>('.player-status-dock__value')];
    expect(values[0]?.textContent).toContain('Loading');
    expect(values[1]?.querySelector('strong')?.textContent).toBe('0');
    expect(container.textContent).toContain('Realtime Unavailable');

    await renderDock({
      connectionStatus: 'unavailable',
      dust: { status: 'unavailable' },
      level: { status: 'unavailable' },
      onConnectionRetry,
      onDustRetry,
      onLevelRetry,
    });
    expect(container.textContent).toContain('Unavailable');
    const click = async (label: string) => {
      await act(async () =>
        [...container.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.textContent?.trim() === label)
          ?.click(),
      );
    };
    await click('Retry connection');
    expect(onLevelRetry).not.toHaveBeenCalled();
    expect(onDustRetry).not.toHaveBeenCalled();
    expect(onConnectionRetry).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Retry Level');
    expect(container.textContent).not.toContain('Retry DUST');
  });

  it('marks the current channel, switches only to an available channel, and restores focus on Escape', async () => {
    const onChannelSwitch = vi.fn();
    const onPopoverOpenChange = vi.fn();
    await renderDock({ onChannelSwitch, onPopoverOpenChange });
    await openDetails();
    const selector = container.querySelector<HTMLButtonElement>('.channel-selector__button');
    await act(async () => selector?.click());
    expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
      'Current',
    );
    const second = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('Channel 2'),
    );
    await act(async () => second?.click());
    expect(onChannelSwitch).toHaveBeenCalledWith('channel-2');

    await act(async () => selector?.click());
    const popover = container.querySelector('.channel-popover');
    await act(async () =>
      popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.querySelector('.channel-popover')).toBeNull();
    expect(document.activeElement).toBe(selector);
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('restores focus to the dock action after its external panel closes', async () => {
    const onInventory = vi.fn();
    await renderDock({ onInventory });
    await openDetails();
    const inventory = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Inventory'),
    );
    await act(async () => inventory?.click());
    expect(onInventory).toHaveBeenCalledTimes(1);
    await renderDock({ disabled: true, onInventory });
    await renderDock({ disabled: false, onInventory });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(inventory);
  });

  it('removes dead world actions while a private cooperative activity is active', async () => {
    await renderDock({ activityActive: true });
    await openDetails();
    expect(container.querySelector('.hud-action--activities')).toBeNull();
    expect(container.textContent).toContain('Private Activity');
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Nearby'),
      )?.disabled,
    ).toBe(true);
  });

  it('opens sanitized connection diagnostics in the shared portalled modal layer', async () => {
    const onPopoverOpenChange = vi.fn();
    await renderDock({
      connectionStatus: 'unavailable',
      onConnectionRetry: vi.fn(),
      onPopoverOpenChange,
    });
    await openDetails();
    const technicalDetails = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Technical details'),
    );
    await act(async () => technicalDetails?.click());

    const dialog = document.querySelector<HTMLElement>('#starville-modal-root [role="dialog"]');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.textContent).toContain('Realtime Unavailable');
    expect(dialog?.textContent).toContain('Automatic retries are bounded');
    expect(dialog?.textContent).not.toMatch(/postgres|supabase|storage path|token=/iu);
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(true);

    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(document.querySelector('#starville-modal-root [role="dialog"]')).toBeNull();
    expect(onPopoverOpenChange).toHaveBeenLastCalledWith(false);
  });
});
