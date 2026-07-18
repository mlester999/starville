import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlayerStatusDock } from './PlayerStatusDock';

let container: HTMLDivElement;
let root: Root;

const channels = [
  { id: 'channel-1', number: 1, population: 4, capacity: 40, available: true },
  { id: 'channel-2', number: 2, population: 0, capacity: 40, available: true },
  { id: 'channel-3', number: 3, population: 40, capacity: 40, available: false },
];

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
  it('keeps every multiplayer action in one dock with compact real badges', async () => {
    await act(async () => {
      root.render(
        <PlayerStatusDock
          activityActive={false}
          channels={channels}
          connectionStatus="connected"
          currentChannelId="channel-1"
          disabled={false}
          dustBalance={250}
          nearbyCount={2}
          socialNoticeCount={3}
          onActivities={vi.fn()}
          onChannelSwitch={vi.fn()}
          onFriends={vi.fn()}
          onInventory={vi.fn()}
          onNearby={vi.fn()}
          onPopoverOpenChange={vi.fn()}
        />,
      );
    });

    const dock = container.querySelector('.player-status-dock');
    expect(dock?.textContent).toContain('250');
    expect(dock?.textContent).toContain('Inventory');
    expect(dock?.textContent).toContain('Nearby');
    expect(dock?.textContent).toContain('Friends');
    expect(dock?.textContent).toContain('Channel 1');
    expect(dock?.textContent).toContain('Connected');
    expect(dock?.querySelector('select')).toBeNull();
    expect(dock?.querySelector('[aria-label="2 nearby players"]')).not.toBeNull();
    expect(dock?.querySelector('[aria-label="3 social notifications"]')).not.toBeNull();
  });

  it('marks the current channel, switches only to an available channel, and restores focus on Escape', async () => {
    const onChannelSwitch = vi.fn();
    const onPopoverOpenChange = vi.fn();
    await act(async () => {
      root.render(
        <PlayerStatusDock
          activityActive={false}
          channels={channels}
          connectionStatus="connected"
          currentChannelId="channel-1"
          disabled={false}
          dustBalance={250}
          nearbyCount={0}
          socialNoticeCount={0}
          onActivities={vi.fn()}
          onChannelSwitch={onChannelSwitch}
          onFriends={vi.fn()}
          onInventory={vi.fn()}
          onNearby={vi.fn()}
          onPopoverOpenChange={onPopoverOpenChange}
        />,
      );
    });
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

  it('removes dead world actions while a private cooperative activity is active', async () => {
    await act(async () => {
      root.render(
        <PlayerStatusDock
          activityActive
          channels={channels}
          connectionStatus="connected"
          currentChannelId="channel-1"
          disabled={false}
          dustBalance={250}
          nearbyCount={2}
          socialNoticeCount={0}
          onActivities={vi.fn()}
          onChannelSwitch={vi.fn()}
          onFriends={vi.fn()}
          onInventory={vi.fn()}
          onNearby={vi.fn()}
          onPopoverOpenChange={vi.fn()}
        />,
      );
    });
    expect(container.querySelector('.hud-action--activities')).toBeNull();
    expect(container.textContent).toContain('Private Activity');
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Nearby'),
      )?.disabled,
    ).toBe(true);
  });
});
