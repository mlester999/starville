import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type {
  ChatPlayerPreference,
  PublicPresence,
  SocialOfferItemInput,
} from '@starville/realtime';

import type {
  RealtimeConnectionStatus,
  RealtimeSocialGraphView,
  RealtimeSocialView as SocialView,
} from '../app/realtime-client';
import { GameButton, GameEmptyState } from './game-ui';

interface SocialInteractionPanelProps {
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly selfPresenceId: string | undefined;
  readonly remotes: readonly PublicPresence[];
  readonly selectedPresenceId: string | null;
  readonly social: SocialView;
  readonly socialGraph: RealtimeSocialGraphView;
  readonly preferences: readonly ChatPlayerPreference[];
  readonly onSelect: (presenceId: string | null) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly externalOpenRequest?: number;
  readonly showLauncher?: boolean;
  readonly onInspect: (presenceId: string) => void;
  readonly onFriendRequest: (presenceId: string) => void;
  readonly onPartyInvite: (presenceId: string, revision: number) => void;
  readonly onGift: (presenceId: string, itemSlug: string, quantity: number) => void;
  readonly onGiftResponse: (interactionId: string, action: 'accept' | 'decline' | 'cancel') => void;
  readonly onTradeRequest: (presenceId: string) => void;
  readonly onTradeResponse: (interactionId: string, action: 'accept' | 'decline') => void;
  readonly onTradeOffer: (
    interactionId: string,
    expectedRevision: number,
    items: readonly SocialOfferItemInput[],
  ) => void;
  readonly onTradeConfirm: (interactionId: string, expectedRevision: number) => void;
  readonly onTradeCancel: (interactionId: string) => void;
  readonly onTradeResume: (interactionId: string) => void;
  readonly onPreference: (
    presenceId: string,
    action: 'mute_player' | 'unmute_player' | 'block_player' | 'unblock_player',
  ) => void;
}

function participantName(
  interaction: SocialView['pendingRequests'][number],
  selfPresenceId: string | undefined,
): string {
  if (interaction.kind === 'gift') {
    return interaction.sender.presenceId === selfPresenceId
      ? interaction.target.displayName
      : interaction.sender.displayName;
  }
  return interaction.senderOffer.participant.presenceId === selfPresenceId
    ? interaction.targetOffer.participant.displayName
    : interaction.senderOffer.participant.displayName;
}

function trapFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled)',
    ),
  ];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) return;
  if (document.activeElement === event.currentTarget) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function SocialInteractionPanel(props: SocialInteractionPanelProps) {
  const { onOpenChange, onSelect, selectedPresenceId } = props;
  const [open, setOpen] = useState(false);
  const [giftItemSlug, setGiftItemSlug] = useState('');
  const [giftQuantity, setGiftQuantity] = useState(1);
  const [tradeItemSlug, setTradeItemSlug] = useState('');
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const panel = useRef<HTMLElement>(null);
  const blocked = useMemo(
    () =>
      new Set(
        props.preferences
          .filter((preference) => preference.blocked)
          .map((preference) => preference.targetPresenceId),
      ),
    [props.preferences],
  );
  const nearby = props.remotes.filter((presence) => !blocked.has(presence.presenceId));
  const selected = nearby.find((presence) => presence.presenceId === props.selectedPresenceId);
  const giftable = props.social.inventory.filter(
    (item) => item.giftable && item.availableQuantity - item.reservedQuantity > 0,
  );
  const tradable = props.social.inventory.filter(
    (item) => item.tradable && item.availableQuantity - item.reservedQuantity > 0,
  );
  const selectedPreference = props.preferences.find(
    (preference) => preference.targetPresenceId === selected?.presenceId,
  );
  const selectedIsFriend = props.socialGraph.friends.some(
    (friend) => friend.presenceId === selected?.presenceId,
  );
  const selectedHasPendingFriendRequest = [
    ...props.socialGraph.incomingRequests.map((request) => request.sender.presenceId),
    ...props.socialGraph.outgoingRequests.map((request) => request.target.presenceId),
  ].includes(selected?.presenceId ?? '');
  const selectedIsPartyMember = props.socialGraph.party?.members.some(
    (member) => member.presenceId === selected?.presenceId,
  );
  const selfIsPartyLeader = props.socialGraph.party?.members.some(
    (member) => member.presenceId === props.selfPresenceId && member.role === 'leader',
  );
  const partyRevision = props.socialGraph.party?.revision;
  const trade = props.social.activeTrade;

  useEffect(() => {
    if ((props.externalOpenRequest ?? 0) > 0) setOpen(true);
  }, [props.externalOpenRequest]);

  useEffect(() => {
    const requiresAttention =
      props.social.pendingRequests.some((interaction) => {
        if (interaction.kind === 'gift')
          return interaction.target.presenceId === props.selfPresenceId;
        return interaction.targetOffer.participant.presenceId === props.selfPresenceId;
      }) || trade !== null;
    if (props.selectedPresenceId !== null || requiresAttention) setOpen(true);
  }, [props.selectedPresenceId, props.selfPresenceId, props.social.pendingRequests, trade]);

  useEffect(() => {
    onOpenChange(open);
    if (open) window.setTimeout(() => panel.current?.focus({ preventScroll: true }), 0);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (selectedPresenceId !== null && selected === undefined) onSelect(null);
  }, [onSelect, selected, selectedPresenceId]);

  useEffect(() => {
    const fallback = giftable[0]?.itemSlug ?? '';
    if (!giftable.some((item) => item.itemSlug === giftItemSlug)) setGiftItemSlug(fallback);
  }, [giftItemSlug, giftable]);

  useEffect(() => {
    const fallback = tradable[0]?.itemSlug ?? '';
    if (!tradable.some((item) => item.itemSlug === tradeItemSlug)) setTradeItemSlug(fallback);
  }, [tradeItemSlug, tradable]);

  function close(): void {
    setOpen(false);
    onSelect(null);
  }

  if (!open) {
    if (props.showLauncher === false) return null;
    return (
      <button
        className="social-launcher"
        disabled={props.connectionStatus !== 'connected'}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span>Nearby</span>
        {nearby.length === 0 ? <small>No players</small> : <strong>{nearby.length}</strong>}
      </button>
    );
  }

  return (
    <aside
      ref={panel}
      aria-label="Nearby player interactions"
      aria-modal="true"
      className="social-panel"
      role="dialog"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
        else trapFocus(event);
      }}
    >
      <header className="social-panel__header">
        <div>
          <p className="game-kicker">Nearby villagers</p>
          <h2>Nearby Players</h2>
        </div>
        <button aria-label="Close player interactions" type="button" onClick={close}>
          ×
        </button>
      </header>

      <section aria-labelledby="nearby-players-heading">
        <h3 id="nearby-players-heading">Players close enough to interact</h3>
        {nearby.length === 0 ? (
          <GameEmptyState
            icon="◇"
            message="Walk closer to another player to view their profile, send a friend request, offer a gift, or start a trade."
            title="No Villagers Nearby"
            actions={
              <GameButton type="button" onClick={close}>
                Close
              </GameButton>
            }
          />
        ) : (
          <ul className="social-player-list">
            {nearby.map((presence) => (
              <li key={presence.presenceId}>
                <button
                  aria-pressed={presence.presenceId === selected?.presenceId}
                  type="button"
                  onClick={() => props.onSelect(presence.presenceId)}
                >
                  <strong>{presence.displayName}</strong>
                  <span>
                    Lv {presence.level} · Channel {presence.channelNumber}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected === undefined ? null : (
        <section
          className="social-player-card"
          aria-label={`Interact with ${selected.displayName}`}
        >
          <div>
            <h3>{selected.displayName}</h3>
            <p>Level {selected.level} villager</p>
          </div>
          <div className="social-actions">
            <button type="button" onClick={() => props.onInspect(selected.presenceId)}>
              Inspect
            </button>
            <button
              disabled={selectedIsFriend || selectedHasPendingFriendRequest}
              type="button"
              onClick={() => props.onFriendRequest(selected.presenceId)}
            >
              {selectedIsFriend
                ? 'Friends'
                : selectedHasPendingFriendRequest
                  ? 'Friend request pending'
                  : 'Add friend'}
            </button>
            {partyRevision !== undefined && selfIsPartyLeader ? (
              <button
                disabled={selectedIsPartyMember}
                type="button"
                onClick={() => props.onPartyInvite(selected.presenceId, partyRevision)}
              >
                {selectedIsPartyMember ? 'In party' : 'Invite to party'}
              </button>
            ) : null}
            <button type="button" onClick={() => props.onTradeRequest(selected.presenceId)}>
              Request trade
            </button>
            <button
              type="button"
              onClick={() =>
                props.onPreference(
                  selected.presenceId,
                  selectedPreference?.muted ? 'unmute_player' : 'mute_player',
                )
              }
            >
              {selectedPreference?.muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              className="social-action--danger"
              type="button"
              onClick={() => {
                props.onPreference(selected.presenceId, 'block_player');
                props.onSelect(null);
              }}
            >
              Block
            </button>
          </div>
          {props.social.inspectedProfile?.presenceId === selected.presenceId ? (
            <dl className="social-inspect">
              <div>
                <dt>World</dt>
                <dd>{props.social.inspectedProfile.worldName}</dd>
              </div>
              <div>
                <dt>Channel</dt>
                <dd>{props.social.inspectedProfile.channelNumber}</dd>
              </div>
              <div>
                <dt>Appearance</dt>
                <dd>{props.social.inspectedProfile.appearancePreset}</dd>
              </div>
            </dl>
          ) : null}
          <div className="social-gift-form">
            <label>
              <span>Gift item</span>
              <select
                value={giftItemSlug}
                onChange={(event) => setGiftItemSlug(event.currentTarget.value)}
              >
                {giftable.length === 0 ? <option value="">No giftable items</option> : null}
                {giftable.map((item) => (
                  <option key={item.itemSlug} value={item.itemSlug}>
                    {item.name} · {item.availableQuantity - item.reservedQuantity} available
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input
                min="1"
                max="999"
                type="number"
                value={giftQuantity}
                onChange={(event) =>
                  setGiftQuantity(Math.max(1, Number(event.currentTarget.value) || 1))
                }
              />
            </label>
            <button
              disabled={giftItemSlug === ''}
              type="button"
              onClick={() => props.onGift(selected.presenceId, giftItemSlug, giftQuantity)}
            >
              Send gift request
            </button>
          </div>
        </section>
      )}

      {props.social.pendingRequests.length === 0 ? null : (
        <section aria-labelledby="social-requests-heading">
          <h3 id="social-requests-heading">Requests</h3>
          <ul className="social-request-list">
            {props.social.pendingRequests.map((interaction) => {
              const incoming =
                interaction.kind === 'gift'
                  ? interaction.target.presenceId === props.selfPresenceId
                  : interaction.targetOffer.participant.presenceId === props.selfPresenceId;
              return (
                <li key={interaction.id}>
                  <strong>
                    {interaction.kind === 'gift' ? 'Gift' : 'Trade'} with{' '}
                    {participantName(interaction, props.selfPresenceId)}
                  </strong>
                  {interaction.kind === 'gift' ? (
                    <span>
                      {interaction.item.quantity} × {interaction.item.name}
                    </span>
                  ) : null}
                  <div>
                    {incoming ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            interaction.kind === 'gift'
                              ? props.onGiftResponse(interaction.id, 'accept')
                              : props.onTradeResponse(interaction.id, 'accept')
                          }
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            interaction.kind === 'gift'
                              ? props.onGiftResponse(interaction.id, 'decline')
                              : props.onTradeResponse(interaction.id, 'decline')
                          }
                        >
                          Decline
                        </button>
                      </>
                    ) : interaction.kind === 'gift' ? (
                      <button
                        type="button"
                        onClick={() => props.onGiftResponse(interaction.id, 'cancel')}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button type="button" onClick={() => props.onTradeCancel(interaction.id)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {trade === null ? null : (
        <section className="social-trade" aria-labelledby="active-trade-heading">
          <h3 id="active-trade-heading">Secure Trade</h3>
          <div className="social-trade__offers">
            {[trade.senderOffer, trade.targetOffer].map((offer) => (
              <div key={offer.participant.presenceId}>
                <strong>{offer.participant.displayName}</strong>
                {offer.items.length === 0 ? (
                  <span>Nothing offered</span>
                ) : (
                  offer.items.map((item) => (
                    <span key={item.itemSlug}>
                      {item.quantity} × {item.name}
                    </span>
                  ))
                )}
                <small>
                  {offer.confirmedRevision === trade.revision ? 'Confirmed' : 'Reviewing'}
                </small>
              </div>
            ))}
          </div>
          <div className="social-gift-form">
            <label>
              <span>Your offer</span>
              <select
                value={tradeItemSlug}
                onChange={(event) => setTradeItemSlug(event.currentTarget.value)}
              >
                {tradable.length === 0 ? <option value="">No tradable items</option> : null}
                {tradable.map((item) => (
                  <option key={item.itemSlug} value={item.itemSlug}>
                    {item.name} · {item.availableQuantity - item.reservedQuantity} available
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input
                min="1"
                max="999"
                type="number"
                value={tradeQuantity}
                onChange={(event) =>
                  setTradeQuantity(Math.max(1, Number(event.currentTarget.value) || 1))
                }
              />
            </label>
            <button
              disabled={tradeItemSlug === ''}
              type="button"
              onClick={() =>
                props.onTradeOffer(trade.id, trade.revision, [
                  { itemSlug: tradeItemSlug, quantity: tradeQuantity },
                ])
              }
            >
              Update exact offer
            </button>
            <button type="button" onClick={() => props.onTradeOffer(trade.id, trade.revision, [])}>
              Clear offer
            </button>
          </div>
          {trade.reconnectDeadline === null ? null : (
            <div role="status" className="social-trade__paused">
              Trade paused while the other player reconnects.
              <button type="button" onClick={() => props.onTradeResume(trade.id)}>
                Try resume
              </button>
            </div>
          )}
          <div className="social-actions">
            <button
              disabled={trade.reconnectDeadline !== null}
              type="button"
              onClick={() => props.onTradeConfirm(trade.id, trade.revision)}
            >
              Confirm Offer
            </button>
            <button
              className="social-action--danger"
              type="button"
              onClick={() => props.onTradeCancel(trade.id)}
            >
              Cancel trade
            </button>
          </div>
          <p className="social-panel__muted">
            Review every item carefully. Changing an offer clears both confirmations.
          </p>
        </section>
      )}

      {props.social.lastError === undefined ? null : (
        <p className="social-error" role="alert">
          That interaction could not be completed. Move closer and try again.
        </p>
      )}
      {props.social.recentReceipts[0] === undefined ? null : (
        <p className="social-receipt" role="status">
          Latest {props.social.recentReceipts[0].kind} completed safely.
        </p>
      )}
    </aside>
  );
}
