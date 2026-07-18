import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { ChatMessage, ChatReportCategory, ChatScope } from '@starville/realtime';

import type { RealtimeChatView, RealtimeConnectionStatus } from '../app/realtime-client';
import { isTextEntryElement } from '../game/input/focus';

const SCOPES: readonly ChatScope[] = ['nearby', 'channel', 'party', 'system'];
const REPORT_CATEGORIES: readonly { readonly value: ChatReportCategory; readonly label: string }[] =
  [
    { value: 'harassment', label: 'Harassment' },
    { value: 'hate_or_abuse', label: 'Hate or abusive language' },
    { value: 'spam', label: 'Spam' },
    { value: 'scam_or_suspicious_link', label: 'Scam or suspicious link' },
    { value: 'impersonation', label: 'Impersonation' },
    { value: 'sexual_content', label: 'Sexual content' },
    { value: 'other', label: 'Other' },
  ];

interface ChatPanelProps {
  readonly chat: RealtimeChatView;
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly selfPresenceId?: string | undefined;
  readonly disabled: boolean;
  readonly partyEnabled: boolean;
  readonly showTimestamps?: boolean;
  readonly onInputActiveChange: (active: boolean) => void;
  readonly onSend: (scope: 'nearby' | 'channel' | 'party', text: string) => void;
  readonly onMarkRead: (scope: ChatScope, sequence: number) => void;
  readonly onPreference: (
    targetPresenceId: string,
    action: 'mute_player' | 'unmute_player' | 'block_player' | 'unblock_player',
  ) => void;
  readonly onReport: (messageId: string, category: ChatReportCategory, reason: string) => void;
}

function scopeLabel(scope: ChatScope): string {
  return scope[0]?.toUpperCase() + scope.slice(1);
}

function statusLabel(status: RealtimeConnectionStatus): string {
  if (status === 'connected') return 'Connected';
  if (status === 'reconnecting' || status === 'connecting') return 'Chat is reconnecting';
  if (status === 'blocked') return 'Chat unavailable';
  return 'Offline';
}

function messageTime(value: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function ChatPanel({
  chat,
  connectionStatus,
  selfPresenceId,
  disabled,
  partyEnabled,
  showTimestamps = true,
  onInputActiveChange,
  onSend,
  onMarkRead,
  onPreference,
  onReport,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<ChatScope>('nearby');
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState<Record<ChatScope, number>>({
    nearby: 0,
    channel: 0,
    party: 0,
    system: 0,
  });
  const [atLatest, setAtLatest] = useState(true);
  const [reporting, setReporting] = useState<ChatMessage>();
  const [reportCategory, setReportCategory] = useState<ChatReportCategory>('harassment');
  const [reportReason, setReportReason] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const reportDialogRef = useRef<HTMLFormElement>(null);
  const reportReturnFocusRef = useRef<HTMLElement | null>(null);
  const chatAvailable = connectionStatus === 'connected' && !disabled;
  const lastSequence = useRef<Record<ChatScope, number>>({
    nearby: 0,
    channel: 0,
    party: 0,
    system: 0,
  });

  const messages = chat.messages[scope];
  const totalUnread = Math.min(999, unread.nearby + unread.channel + unread.party + unread.system);
  const preferences = useMemo(
    () => new Map(chat.preferences.map((preference) => [preference.targetPresenceId, preference])),
    [chat.preferences],
  );

  useEffect(() => {
    for (const candidate of SCOPES) {
      const latest = chat.messages[candidate].at(-1)?.sequence ?? 0;
      const previous = lastSequence.current[candidate];
      if (latest > previous) {
        const increment = chat.messages[candidate].filter(
          (message) => message.sequence > previous && message.senderPresenceId !== selfPresenceId,
        ).length;
        if (increment > 0 && (!expanded || candidate !== scope || !atLatest)) {
          setUnread((current) => ({
            ...current,
            [candidate]: Math.min(999, current[candidate] + increment),
          }));
        }
        lastSequence.current[candidate] = latest;
      }
    }
  }, [atLatest, chat.messages, expanded, scope, selfPresenceId]);

  useEffect(() => {
    if (!expanded || !atLatest) return;
    const latest = messages.at(-1)?.sequence ?? 0;
    setUnread((current) => (current[scope] === 0 ? current : { ...current, [scope]: 0 }));
    if (latest > 0) onMarkRead(scope, latest);
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [atLatest, expanded, messages, onMarkRead, scope]);

  useEffect(() => {
    function openFromKeyboard(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Enter' || !chatAvailable || isTextEntryElement(document.activeElement))
        return;
      event.preventDefault();
      setExpanded(true);
      queueMicrotask(() => inputRef.current?.focus());
    }
    window.addEventListener('keydown', openFromKeyboard);
    return () => window.removeEventListener('keydown', openFromKeyboard);
  }, [chatAvailable]);

  useEffect(() => {
    if (chatAvailable) return;
    setExpanded(false);
    setReporting(undefined);
    inputRef.current?.blur();
    onInputActiveChange(false);
  }, [chatAvailable, onInputActiveChange]);

  useEffect(() => {
    if (reporting === undefined) return;
    reportReturnFocusRef.current = document.activeElement as HTMLElement | null;
    onInputActiveChange(true);
    const dialog = reportDialogRef.current;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setReporting(undefined);
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>('button, select, textarea'),
      ].filter((element) => !element.hasAttribute('disabled'));
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
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      onInputActiveChange(false);
      reportReturnFocusRef.current?.focus();
    };
  }, [onInputActiveChange, reporting]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (
      scope === 'system' ||
      (scope === 'party' && !partyEnabled) ||
      text.length === 0 ||
      connectionStatus !== 'connected' ||
      chat.mutedUntil !== null
    ) {
      return;
    }
    onSend(scope, text);
    setDraft('');
    queueMicrotask(() => inputRef.current?.focus());
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.currentTarget.blur();
    setExpanded(false);
    onInputActiveChange(false);
  }

  function selectScope(nextScope: ChatScope) {
    setScope(nextScope);
    setAtLatest(true);
  }

  function submitReport(event: FormEvent) {
    event.preventDefault();
    if (reporting === undefined || reportReason.trim().length < 3) return;
    onReport(reporting.id, reportCategory, reportReason.trim());
    setReporting(undefined);
    setReportReason('');
  }

  return (
    <aside
      className={`chat-panel${expanded ? ' chat-panel--expanded' : ''}`}
      aria-label="Village chat"
    >
      <button
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse village chat' : 'Open village chat'}
        className="chat-panel__toggle"
        disabled={!chatAvailable}
        onClick={() =>
          setExpanded((value) => {
            if (value) onInputActiveChange(false);
            return !value;
          })
        }
        type="button"
      >
        <span aria-hidden="true">✦</span>
        <span>Chat</span>
        {totalUnread > 0 ? (
          <strong aria-label={`${totalUnread} unread messages`}>{totalUnread}</strong>
        ) : null}
      </button>

      {expanded ? (
        <div className="chat-panel__surface">
          <header className="chat-panel__header">
            <div>
              <strong>Village chat</strong>
              <span className={`chat-panel__status chat-panel__status--${connectionStatus}`}>
                {statusLabel(connectionStatus)}
              </span>
            </div>
            <button
              aria-label="Close chat"
              onClick={() => {
                setExpanded(false);
                onInputActiveChange(false);
              }}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="chat-panel__tabs" role="tablist" aria-label="Chat scope">
            {SCOPES.map((candidate) => (
              <button
                aria-controls={`chat-log-${candidate}`}
                aria-selected={scope === candidate}
                id={`chat-tab-${candidate}`}
                key={candidate}
                onClick={() => selectScope(candidate)}
                role="tab"
                disabled={candidate === 'party' && !partyEnabled}
                type="button"
              >
                {scopeLabel(candidate)}
                {unread[candidate] > 0 ? <span>{unread[candidate]}</span> : null}
              </button>
            ))}
          </div>

          <div
            aria-labelledby={`chat-tab-${scope}`}
            className="chat-panel__log"
            id={`chat-log-${scope}`}
            onScroll={(event) => {
              const node = event.currentTarget;
              setAtLatest(node.scrollHeight - node.scrollTop - node.clientHeight < 24);
            }}
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <p className="chat-panel__empty">
                {scope === 'system'
                  ? 'Connection and village notices will appear here.'
                  : scope === 'party' && !partyEnabled
                    ? 'Join or create a party to use party chat.'
                    : `No live ${scope} messages yet. Chat starts fresh each time you enter Starville.`}
              </p>
            ) : (
              messages.map((message) => {
                const preference =
                  message.senderPresenceId === null
                    ? undefined
                    : preferences.get(message.senderPresenceId);
                const playerMessage =
                  message.senderPresenceId !== null && message.senderPresenceId !== selfPresenceId;
                return (
                  <article
                    className={
                      message.scope === 'system'
                        ? 'chat-message chat-message--system'
                        : 'chat-message'
                    }
                    key={message.id}
                  >
                    <header>
                      <strong>{message.senderDisplayName}</strong>
                      {message.senderLevel === null ? null : <span>Lv. {message.senderLevel}</span>}
                      {showTimestamps ? (
                        <time dateTime={message.sentAt}>{messageTime(message.sentAt)}</time>
                      ) : null}
                      {playerMessage ? (
                        <details className="chat-message__menu">
                          <summary aria-label={`Safety options for ${message.senderDisplayName}`}>
                            •••
                          </summary>
                          <div>
                            <button
                              onClick={() =>
                                onPreference(
                                  message.senderPresenceId!,
                                  preference?.muted ? 'unmute_player' : 'mute_player',
                                )
                              }
                              type="button"
                            >
                              {preference?.muted ? 'Unmute player' : 'Mute player'}
                            </button>
                            <button
                              onClick={() =>
                                onPreference(
                                  message.senderPresenceId!,
                                  preference?.blocked ? 'unblock_player' : 'block_player',
                                )
                              }
                              type="button"
                            >
                              {preference?.blocked ? 'Unblock player' : 'Block player'}
                            </button>
                            <button onClick={() => setReporting(message)} type="button">
                              Report message
                            </button>
                          </div>
                        </details>
                      ) : null}
                    </header>
                    <p>{message.text}</p>
                  </article>
                );
              })
            )}
          </div>

          {!atLatest ? (
            <button
              className="chat-panel__new"
              onClick={() => {
                setAtLatest(true);
                logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
              }}
              type="button"
            >
              New messages
            </button>
          ) : null}

          {scope === 'system' ? (
            <p className="chat-panel__system-note">
              Only Starville services can post system messages.
            </p>
          ) : (
            <form className="chat-panel__composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="village-chat-input">
                Message {scope} chat
              </label>
              <input
                autoComplete="off"
                disabled={
                  disabled ||
                  connectionStatus !== 'connected' ||
                  chat.mutedUntil !== null ||
                  (scope === 'party' && !partyEnabled)
                }
                id="village-chat-input"
                maxLength={400}
                onBlur={() => onInputActiveChange(false)}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onFocus={() => onInputActiveChange(true)}
                onKeyDown={handleInputKeyDown}
                placeholder={
                  chat.mutedUntil === null ? `Message ${scope}…` : 'Chat is temporarily muted'
                }
                ref={inputRef}
                type="text"
                value={draft}
              />
              <button
                disabled={
                  draft.trim().length === 0 ||
                  connectionStatus !== 'connected' ||
                  chat.mutedUntil !== null ||
                  (scope === 'party' && !partyEnabled)
                }
                type="submit"
              >
                Send
              </button>
            </form>
          )}

          {chat.lastRejection === undefined ? null : (
            <p className="chat-panel__feedback" role="status">
              {chat.lastRejection.reason === 'rate_limited' ||
              chat.lastRejection.reason === 'duplicate_spam'
                ? 'You’re sending messages too quickly. Please wait a moment.'
                : chat.lastRejection.reason === 'chat_muted'
                  ? `You cannot send messages${chat.lastRejection.mutedUntil === undefined ? '.' : ` until ${new Date(chat.lastRejection.mutedUntil).toLocaleString()}.`}`
                  : 'That message could not be sent. Please revise it and try again.'}
            </p>
          )}
          {chat.latestReportId === undefined ? null : (
            <p className="chat-panel__feedback" role="status">
              Your report was submitted for review.
            </p>
          )}
        </div>
      ) : null}

      {reporting === undefined ? null : (
        <div className="chat-report-backdrop" role="presentation">
          <form
            aria-labelledby="chat-report-title"
            aria-modal="true"
            className="chat-report-dialog"
            onSubmit={submitReport}
            ref={reportDialogRef}
            role="dialog"
          >
            <header>
              <div>
                <p className="game-kicker">Player safety</p>
                <h2 id="chat-report-title">Report message</h2>
              </div>
              <button
                aria-label="Close report dialog"
                onClick={() => setReporting(undefined)}
                type="button"
              >
                ×
              </button>
            </header>
            <blockquote>{reporting.text}</blockquote>
            <label>
              Category
              <select
                autoFocus
                onChange={(event) =>
                  setReportCategory(event.currentTarget.value as ChatReportCategory)
                }
                value={reportCategory}
              >
                {REPORT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What happened?
              <textarea
                maxLength={500}
                minLength={3}
                onChange={(event) => setReportReason(event.currentTarget.value)}
                required
                value={reportReason}
              />
            </label>
            <p>The reported player will not be told who submitted this report.</p>
            <div>
              <button onClick={() => setReporting(undefined)} type="button">
                Cancel
              </button>
              <button type="submit">Submit report</button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
