import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { PublicPresence } from '@starville/realtime';

import type { RealtimeConnectionStatus, RealtimeSocialGraphView } from '../app/realtime-client';
import { GameButton, GameEmptyState } from './game-ui';

type SocialTab = 'friends' | 'requests' | 'party';

interface SocialGraphPanelProps {
  readonly socialGraph: RealtimeSocialGraphView;
  readonly selfPresenceId: string | undefined;
  readonly nearbyPlayers: readonly PublicPresence[];
  readonly connectionStatus: RealtimeConnectionStatus;
  readonly onOpenChange: (open: boolean) => void;
  readonly externalOpenRequest?: number;
  readonly requestedTab?: SocialTab;
  readonly showLauncher?: boolean;
  readonly showNotifications?: boolean;
  readonly onFindNearby?: () => void;
  readonly onFriendRequest: (presenceId: string) => void;
  readonly onFriendResponse: (requestId: string, action: 'accept' | 'decline' | 'cancel') => void;
  readonly onFriendRemove: (presenceId: string) => void;
  readonly onPartyCreate: () => void;
  readonly onPartyInvite: (presenceId: string, revision: number) => void;
  readonly onPartyInvitationResponse: (
    invitationId: string,
    revision: number,
    action: 'accept' | 'decline' | 'cancel',
  ) => void;
  readonly onPartyLeave: (revision: number) => void;
  readonly onPartyKick: (presenceId: string, revision: number) => void;
  readonly onPartyPromote: (presenceId: string, revision: number) => void;
  readonly onPartyDisband: (revision: number) => void;
  readonly onJoinLeaderChannel: (channelNumber: number) => void;
  readonly onReadyCheckStart: (revision: number) => void;
  readonly onReadyCheckRespond: (
    readyCheckId: string,
    revision: number,
    response: 'ready' | 'not_ready',
  ) => void;
}

function trapFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'),
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

function connectionLabel(status: string): string {
  if (status === 'online') return 'Online';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}

function lastSeenLabel(category: 'recently' | 'today' | 'earlier' | null): string {
  if (category === 'recently') return 'Last seen recently';
  if (category === 'today') return 'Last seen today';
  if (category === 'earlier') return 'Last seen earlier';
  return 'Offline';
}

function locationLabel(worldName: string | null, channelNumber: number | null): string {
  if (worldName === null) return 'Location private';
  return channelNumber === null ? worldName : `${worldName} · Channel ${String(channelNumber)}`;
}

export function SocialGraphPanel(props: SocialGraphPanelProps) {
  const { onOpenChange } = props;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SocialTab>('friends');
  const [destinationGuidanceOpen, setDestinationGuidanceOpen] = useState(false);
  const launcherButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const party = props.socialGraph.party;
  const selfMember = party?.members.find((member) => member.presenceId === props.selfPresenceId);
  const partyLeader = party?.members.find((member) => member.role === 'leader');
  const leader = selfMember?.role === 'leader';
  const knownFriendIds = useMemo(
    () => new Set(props.socialGraph.friends.map((friend) => friend.presenceId)),
    [props.socialGraph.friends],
  );
  const outgoingIds = useMemo(
    () => new Set(props.socialGraph.outgoingRequests.map((request) => request.target.presenceId)),
    [props.socialGraph.outgoingRequests],
  );
  const inviteCandidates = useMemo(() => {
    const players = new Map<string, { presenceId: string; displayName: string }>();
    for (const friend of props.socialGraph.friends) players.set(friend.presenceId, friend);
    for (const player of props.nearbyPlayers) players.set(player.presenceId, player);
    for (const member of party?.members ?? []) players.delete(member.presenceId);
    return [...players.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }, [party?.members, props.nearbyPlayers, props.socialGraph.friends]);
  const requestCount =
    props.socialGraph.incomingRequests.length + props.socialGraph.invitations.length;
  const latestNotification = props.socialGraph.notifications[0];
  const leaderChannelNumber =
    !leader &&
    selfMember !== undefined &&
    partyLeader !== undefined &&
    selfMember.worldId !== null &&
    selfMember.worldId === partyLeader.worldId &&
    selfMember.channelNumber !== partyLeader.channelNumber &&
    partyLeader.channelNumber !== null
      ? partyLeader.channelNumber
      : null;

  useEffect(() => {
    if ((props.externalOpenRequest ?? 0) <= 0) return;
    setTab(props.requestedTab ?? 'friends');
    setOpen(true);
  }, [props.externalOpenRequest, props.requestedTab]);

  useEffect(() => {
    onOpenChange(open);
    const shouldRestoreFocus = wasOpen.current && !open;
    wasOpen.current = open;
    const timer = window.setTimeout(() => {
      if (open) panel.current?.focus({ preventScroll: true });
      else if (shouldRestoreFocus) launcherButton.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onOpenChange, open]);

  function close(): void {
    setOpen(false);
  }

  function findNearby(): void {
    close();
    window.setTimeout(() => props.onFindNearby?.(), 0);
  }

  if (!open) {
    if (props.showLauncher === false) {
      return props.showNotifications === false || latestNotification === undefined ? null : (
        <p className="social-graph-notification" role="status" aria-live="polite">
          {latestNotification.message}
        </p>
      );
    }
    return (
      <>
        <button
          ref={launcherButton}
          className="social-graph-launcher"
          disabled={props.connectionStatus !== 'connected'}
          type="button"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">♢</span>
          <span>Friends</span>
          {requestCount > 0 ? (
            <strong aria-label={`${requestCount} social requests`}>{requestCount}</strong>
          ) : null}
        </button>
        {props.showNotifications === false || latestNotification === undefined ? null : (
          <p className="social-graph-notification" role="status" aria-live="polite">
            {latestNotification.message}
          </p>
        )}
      </>
    );
  }

  return (
    <aside
      ref={panel}
      aria-label="Friends and party"
      aria-modal="true"
      className="social-graph-panel"
      role="dialog"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close();
        else trapFocus(event);
      }}
    >
      <header className="social-graph-panel__header">
        <div>
          <p className="game-kicker">Your village circle</p>
          <h2>Friends &amp; party</h2>
        </div>
        <button aria-label="Close friends and party" type="button" onClick={close}>
          ×
        </button>
      </header>

      <div className="social-graph-panel__tabs" role="tablist" aria-label="Social sections">
        {(['friends', 'requests', 'party'] as const).map((candidate) => (
          <button
            aria-selected={tab === candidate}
            key={candidate}
            onClick={() => setTab(candidate)}
            role="tab"
            type="button"
          >
            {candidate === 'requests' && requestCount > 0
              ? `Requests (${String(requestCount)})`
              : candidate[0]?.toUpperCase() + candidate.slice(1)}
          </button>
        ))}
      </div>

      {latestNotification === undefined ? null : (
        <p className="social-graph-panel__notification" role="status" aria-live="polite">
          {latestNotification.message}
        </p>
      )}

      <div className="social-graph-panel__body" role="tabpanel">
        {tab === 'friends' ? (
          <>
            <p className="social-panel__muted">
              {props.socialGraph.friends.length}/{props.socialGraph.settings.maximumFriends} friends
            </p>
            {props.socialGraph.friends.length === 0 ? (
              <GameEmptyState
                icon="♢"
                message="Meet a nearby villager and send them a request."
                title="No Friends Yet"
                actions={
                  props.onFindNearby === undefined ? null : (
                    <GameButton tone="primary" type="button" onClick={findNearby}>
                      Find Nearby Players
                    </GameButton>
                  )
                }
              />
            ) : (
              <ul className="social-graph-list">
                {props.socialGraph.friends.map((friend) => (
                  <li key={friend.friendshipId}>
                    <div>
                      <strong>{friend.displayName}</strong>
                      <span>
                        Level {friend.level} ·{' '}
                        {friend.connectionStatus === 'offline'
                          ? lastSeenLabel(friend.lastSeenCategory)
                          : connectionLabel(friend.connectionStatus)}
                      </span>
                      <span>
                        {locationLabel(friend.worldName, friend.channelNumber)} ·{' '}
                        {friend.partyState === 'none' ? 'No party' : 'In a party'}
                      </span>
                    </div>
                    <div>
                      {party !== null && leader && friend.partyState === 'none' ? (
                        <button
                          type="button"
                          onClick={() => props.onPartyInvite(friend.presenceId, party.revision)}
                        >
                          Invite
                        </button>
                      ) : null}
                      <button type="button" onClick={() => props.onFriendRemove(friend.presenceId)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {props.nearbyPlayers.some(
              (player) =>
                !knownFriendIds.has(player.presenceId) && !outgoingIds.has(player.presenceId),
            ) ? (
              <h3>Nearby Villagers</h3>
            ) : null}
            <ul className="social-graph-list">
              {props.nearbyPlayers
                .filter(
                  (player) =>
                    !knownFriendIds.has(player.presenceId) && !outgoingIds.has(player.presenceId),
                )
                .map((player) => (
                  <li key={player.presenceId}>
                    <div>
                      <strong>{player.displayName}</strong>
                      <span>Level {player.level}</span>
                    </div>
                    <button type="button" onClick={() => props.onFriendRequest(player.presenceId)}>
                      Add friend
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : null}

        {tab === 'requests' ? (
          <>
            {props.socialGraph.incomingRequests.length > 0 ? (
              <h3>Incoming Friend Requests</h3>
            ) : null}
            {props.socialGraph.incomingRequests.map((request) => (
              <article className="social-request-card" key={request.id}>
                <p>
                  <strong>{request.sender.displayName}</strong> wants to be friends.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => props.onFriendResponse(request.id, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onFriendResponse(request.id, 'decline')}
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
            {props.socialGraph.outgoingRequests.length > 0 ? (
              <h3>Outgoing Friend Requests</h3>
            ) : null}
            {props.socialGraph.outgoingRequests.map((request) => (
              <article className="social-request-card" key={request.id}>
                <p>
                  Request sent to <strong>{request.target.displayName}</strong>.
                </p>
                <button type="button" onClick={() => props.onFriendResponse(request.id, 'cancel')}>
                  Cancel
                </button>
              </article>
            ))}
            {props.socialGraph.invitations.length > 0 ? <h3>Party Invitations</h3> : null}
            {props.socialGraph.invitations.map((invitation) => (
              <article className="social-request-card" key={invitation.id}>
                <p>
                  <strong>{invitation.inviter.displayName}</strong> invited you to a party.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      props.onPartyInvitationResponse(
                        invitation.id,
                        invitation.partyRevision,
                        'accept',
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      props.onPartyInvitationResponse(
                        invitation.id,
                        invitation.partyRevision,
                        'decline',
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
            {requestCount === 0 && props.socialGraph.outgoingRequests.length === 0 ? (
              <GameEmptyState
                icon="✉"
                message="Friend requests and party invitations will appear here."
                title="No Pending Requests"
              />
            ) : null}
          </>
        ) : null}

        {tab === 'party' ? (
          party === null ? (
            <GameEmptyState
              icon="✦"
              message="Create a party or invite nearby villagers to play cooperative activities."
              title="You Are Not in a Party"
              actions={
                <>
                  <GameButton tone="primary" type="button" onClick={props.onPartyCreate}>
                    Create Party
                  </GameButton>
                  {props.onFindNearby === undefined ? null : (
                    <GameButton type="button" onClick={findNearby}>
                      Find Players
                    </GameButton>
                  )}
                </>
              }
            />
          ) : (
            <>
              <div className="social-graph-party-heading">
                <div>
                  <h3>Party</h3>
                  <span>
                    {party.members.length}/{party.capacity} members
                  </span>
                </div>
                {leader ? (
                  <button type="button" onClick={() => props.onReadyCheckStart(party.revision)}>
                    Ready check
                  </button>
                ) : null}
              </div>
              <ul className="social-graph-list">
                {party.members.map((member) => (
                  <li key={member.presenceId}>
                    <div>
                      <strong>
                        {member.displayName}
                        {member.role === 'leader' ? ' · Leader' : ''}
                      </strong>
                      <span>
                        {connectionLabel(member.connectionStatus)} ·{' '}
                        {member.readyState.replace('_', ' ')}
                      </span>
                      <span>{locationLabel(member.worldName, member.channelNumber)}</span>
                    </div>
                    {leader && member.presenceId !== props.selfPresenceId ? (
                      <div>
                        <button
                          type="button"
                          onClick={() => props.onPartyPromote(member.presenceId, party.revision)}
                        >
                          Promote
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onPartyKick(member.presenceId, party.revision)}
                        >
                          Kick
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!leader && partyLeader !== undefined ? (
                <div className="social-graph-route-guidance">
                  {leaderChannelNumber === null ? null : (
                    <button
                      type="button"
                      onClick={() => props.onJoinLeaderChannel(leaderChannelNumber)}
                    >
                      Join leader&apos;s channel
                    </button>
                  )}
                  {selfMember?.worldId !== partyLeader.worldId && partyLeader.worldName !== null ? (
                    <>
                      <button
                        aria-expanded={destinationGuidanceOpen}
                        type="button"
                        onClick={() => setDestinationGuidanceOpen((value) => !value)}
                      >
                        View leader destination
                      </button>
                      {destinationGuidanceOpen ? (
                        <p role="status">
                          Travel to {partyLeader.worldName} through a published village route. The
                          existing world-travel rules remain authoritative.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              {party.readyCheck?.status === 'active' ? (
                <div className="social-ready-check" role="status">
                  <strong>Ready check in progress</strong>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        props.onReadyCheckRespond(party.readyCheck!.id, party.revision, 'ready')
                      }
                    >
                      Ready
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        props.onReadyCheckRespond(party.readyCheck!.id, party.revision, 'not_ready')
                      }
                    >
                      Not ready
                    </button>
                  </div>
                </div>
              ) : null}
              {leader && party.members.length < party.capacity ? (
                <>
                  <h3>Invite</h3>
                  <ul className="social-graph-list">
                    {inviteCandidates.map((candidate) => (
                      <li key={candidate.presenceId}>
                        <strong>{candidate.displayName}</strong>
                        <button
                          type="button"
                          onClick={() => props.onPartyInvite(candidate.presenceId, party.revision)}
                        >
                          Invite
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <div className="social-graph-party-actions">
                {leader ? (
                  <button type="button" onClick={() => props.onPartyDisband(party.revision)}>
                    Disband party
                  </button>
                ) : (
                  <button type="button" onClick={() => props.onPartyLeave(party.revision)}>
                    Leave party
                  </button>
                )}
              </div>
            </>
          )
        ) : null}
      </div>

      {props.socialGraph.lastError === undefined ? null : (
        <p className="social-graph-panel__feedback" role="status">
          {props.socialGraph.lastError.code === 'rate_limited'
            ? 'Please wait before trying that social action again.'
            : 'The social state changed. Refreshing the latest safe state.'}
        </p>
      )}
    </aside>
  );
}

export function CompactPartyHud({
  socialGraph,
}: {
  readonly socialGraph: RealtimeSocialGraphView;
}) {
  const party = socialGraph.party;
  if (party === null) return null;
  return (
    <aside className="compact-party-hud" aria-label="Current party" aria-live="polite">
      <strong>
        Party · {party.members.length}/{party.capacity}
      </strong>
      <ul>
        {party.members.map((member) => (
          <li key={member.presenceId}>
            <span
              className={`party-presence party-presence--${member.connectionStatus}`}
              aria-hidden="true"
            />
            <span>{member.displayName}</span>
            <small>
              {member.connectionStatus === 'reconnecting'
                ? 'Reconnecting'
                : member.connectionStatus === 'offline'
                  ? 'Offline'
                  : member.readyState === 'ready'
                    ? 'Ready'
                    : member.role}
            </small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
