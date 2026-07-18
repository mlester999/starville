import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RealtimeChatView, RealtimeConnectionStatus } from '../app/realtime-client';
import { ChatPanel } from './ChatPanel';

const remotePresenceId = '10000000-0000-4000-8000-000000000002';
const message = {
  id: '40000000-0000-4000-8000-000000000001',
  sequence: 1,
  scope: 'nearby' as const,
  senderPresenceId: remotePresenceId,
  senderDisplayName: 'Fern Friend',
  senderLevel: 2,
  worldId: 'lantern-square' as const,
  channelId: '30000000-0000-4000-8000-000000000001',
  sentAt: '2026-07-14T00:00:00.000Z',
  text: 'Hello neighbor',
  sourceCategory: 'player' as const,
};

function chat(messages = [message]): RealtimeChatView {
  return {
    messages: { nearby: messages, channel: [], party: [], system: [] },
    preferences: [],
    mutedUntil: null,
  };
}

const callbacks = {
  onInputActiveChange: vi.fn(),
  onSend: vi.fn(),
  onMarkRead: vi.fn(),
  onPreference: vi.fn(),
  onReport: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

function render(view = chat(), connectionStatus: RealtimeConnectionStatus = 'connected') {
  root.render(
    <ChatPanel
      chat={view}
      connectionStatus={connectionStatus}
      disabled={false}
      partyEnabled={false}
      selfPresenceId="10000000-0000-4000-8000-000000000001"
      {...callbacks}
    />,
  );
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  Object.values(callbacks).forEach((callback) => callback.mockClear());
  Element.prototype.scrollTo = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('game chat panel', () => {
  it('opens with Enter, blocks gameplay through focus, sends, and closes with Escape', async () => {
    await act(async () => render(chat([])));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    const input = container.querySelector<HTMLInputElement>('#village-chat-input');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(callbacks.onInputActiveChange).toHaveBeenCalledWith(true);
    await act(async () => {
      if (input === null) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'A cozy hello');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'A cozy hello' }));
    });
    const send = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Send',
    );
    await act(async () => send?.click());
    expect(callbacks.onSend).toHaveBeenCalledWith('nearby', 'A cozy hello');
    expect(document.activeElement).toBe(input);
    await act(async () =>
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(container.querySelector('#village-chat-input')).toBeNull();
    expect(callbacks.onInputActiveChange).toHaveBeenCalledWith(false);
  });

  it('renders message content as text and exposes keyboard-safe player safety actions', async () => {
    await act(async () => render(chat([{ ...message, text: '<script>alert(1)</script>' }])));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.chat-panel__toggle')?.click(),
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    const menu = container.querySelector<HTMLDetailsElement>('.chat-message__menu');
    if (menu !== null) menu.open = true;
    const mute = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Mute player',
    );
    await act(async () => mute?.click());
    expect(callbacks.onPreference).toHaveBeenCalledWith(remotePresenceId, 'mute_player');
    const report = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Report message',
    );
    await act(async () => report?.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain('will not be told who submitted this report');
  });

  it('keeps a bounded unread badge while collapsed', async () => {
    await act(async () => render(chat([])));
    await act(async () => render(chat([message])));
    expect(container.querySelector('[aria-label="1 unread messages"]')?.textContent).toBe('1');
  });

  it('closes and disables chat while realtime is offline', async () => {
    await act(async () => render());
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.chat-panel__toggle')?.click(),
    );
    expect(container.textContent).toContain('Hello neighbor');

    await act(async () => render(chat(), 'disconnected'));

    expect(container.querySelector('.chat-panel__surface')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('.chat-panel__toggle')?.disabled).toBe(true);
    expect(callbacks.onInputActiveChange).toHaveBeenCalledWith(false);
  });
});
