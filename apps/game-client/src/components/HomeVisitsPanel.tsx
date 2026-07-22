import { useEffect, useRef, useState } from 'react';
import type { HomeInteractionMode, HomeVisibility, HomeVisitWorkspace } from '@starville/housing';

import {
  appreciateHome,
  createHomeVisitInvitation,
  helpWaterHomeCrop,
  homeVisitIdempotencyKey,
  joinHomeVisit,
  leaveHomeVisit,
  loadHomeVisitGameTest,
  loadHomeVisits,
  moderateHomeVisitor,
  performHomeVisitInteraction,
  reportHomeVisit,
  setHomeVisitAdmissions,
  startHomeVisit,
  stopHomeVisit,
  updateHomeVisitSettings,
  writeHomeGuestbook,
} from '../app/home-visit-client';
import { HomeVisitRealtimeConnection } from '../app/home-visit-realtime-client';
import { PlayerRequestError } from '../app/player-client';

const safeErrors: Readonly<Record<string, string>> = {
  HOME_VISIT_FULL: 'This home already has ten visitors.',
  HOME_VISIT_OWNER_ABSENT: 'Enter your home and connect realtime before hosting.',
  HOME_VISIT_FRIEND_REQUIRED: 'This live home is limited to accepted friends.',
  HOME_VISIT_INVITATION_REQUIRED: 'A current invitation is required.',
  HOME_VISIT_BLOCKED: 'This visit is unavailable because a player block applies.',
  HOME_VISIT_SESSION_CLOSING: 'The owner is ending this visit.',
  HOME_VISIT_DECORATION_CONFLICT: 'Exit Decoration Mode before hosting visitors.',
  HOME_VISIT_TRANSITION_CONFLICT: 'Visit state changed. The latest state was reloaded.',
  HOME_GUESTBOOK_RATE_LIMITED: 'Please wait before signing another guestbook.',
};
function errorMessage(error: unknown) {
  return error instanceof PlayerRequestError
    ? (safeErrors[error.code] ?? 'The home visit could not complete that request safely.')
    : 'The home visit is temporarily unavailable.';
}
function settingsInput(
  settings: NonNullable<HomeVisitWorkspace['settings']>,
  patch: Partial<{
    visibility: HomeVisibility;
    interactionMode: HomeInteractionMode;
    publicDiscoveryEnabled: boolean;
    helperActionsEnabled: boolean;
  }>,
) {
  return {
    homeId: settings.homeId,
    visibility: patch.visibility ?? settings.visibility,
    interactionMode: patch.interactionMode ?? settings.interactionMode,
    publicDiscoveryEnabled: patch.publicDiscoveryEnabled ?? settings.publicDiscoveryEnabled,
    friendInvitationsEnabled: settings.friendInvitationsEnabled,
    partyInvitationsEnabled: settings.partyInvitationsEnabled,
    guestbookEnabled: settings.guestbookEnabled,
    appreciationEnabled: settings.appreciationEnabled,
    helperActionsEnabled: patch.helperActionsEnabled ?? settings.helperActionsEnabled,
    joinNotificationsEnabled: settings.joinNotificationsEnabled,
    leaveNotificationsEnabled: settings.leaveNotificationsEnabled,
    defaultVisitorMuted: settings.defaultVisitorMuted,
    expectedConfigurationRevision: settings.configurationRevision,
    idempotencyKey: homeVisitIdempotencyKey('settings'),
  };
}

export function HomeVisitsPanel({
  apiUrl,
  realtimeUrl,
  onAuthoritativeMutation,
}: Readonly<{
  apiUrl: string;
  realtimeUrl?: string | undefined;
  onAuthoritativeMutation?: (() => void) | undefined;
}>) {
  const [workspace, setWorkspace] = useState<HomeVisitWorkspace>();
  const [preview, setPreview] = useState<HomeVisitWorkspace>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [guestbookMessage, setGuestbookMessage] = useState('');
  const [inviteeId, setInviteeId] = useState('');
  const [interactionTargetId, setInteractionTargetId] = useState('');
  const [helperCropId, setHelperCropId] = useState('');
  const [helperCropVersion, setHelperCropVersion] = useState(1);
  const [realtimeState, setRealtimeState] = useState<'offline' | 'connecting' | 'connected'>(
    'offline',
  );
  const realtime = useRef<HomeVisitRealtimeConnection | undefined>(undefined);

  async function refresh() {
    const value = await loadHomeVisits(apiUrl);
    setWorkspace(value);
  }
  useEffect(() => {
    let active = true;
    void loadHomeVisits(apiUrl)
      .then((value) => active && setWorkspace(value))
      .catch((cause) => active && setError(errorMessage(cause)));
    return () => {
      active = false;
    };
  }, [apiUrl]);
  const activeParticipantId = workspace?.activeParticipant?.id;
  useEffect(() => {
    if (activeParticipantId === undefined || realtimeUrl === undefined) {
      setRealtimeState('offline');
      return;
    }
    setRealtimeState('connecting');
    const connection = new HomeVisitRealtimeConnection({
      apiUrl,
      realtimeUrl,
      participantId: activeParticipantId,
      onMessage: (message) => {
        if (message.type === 'authenticated') setRealtimeState('connected');
        if (message.type === 'snapshot')
          void loadHomeVisits(apiUrl)
            .then(setWorkspace)
            .catch(() => undefined);
        if (message.type === 'error' && !message.retryable) setRealtimeState('offline');
      },
      onClose: () => setRealtimeState('offline'),
    });
    realtime.current = connection;
    void connection.connect().catch(() => setRealtimeState('offline'));
    return () => {
      connection.close();
      if (realtime.current === connection) realtime.current = undefined;
    };
  }, [activeParticipantId, apiUrl, realtimeUrl]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await refresh();
      setNotice(success);
      onAuthoritativeMutation?.();
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (workspace === undefined) {
    return (
      <section className="home-visits" aria-live="polite">
        <strong>Loading live home visits…</strong>
        {error === undefined ? null : <p role="alert">{error}</p>}
      </section>
    );
  }
  const settings = workspace.settings;
  const session = workspace.hostSession;
  const participant = workspace.activeParticipant;

  return (
    <section className="home-visits" aria-labelledby="home-visits-title">
      <header>
        <div>
          <p className="game-kicker">Owner-present social space</p>
          <h4 id="home-visits-title">Live Home Visits</h4>
          <p>
            Public discovery, accepted friends, or current invitations can admit up to ten visitors.
            Storage, Decoration Mode, DUST, upgrades, workstations, and harvest ownership stay
            private.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </header>
      {notice === undefined ? null : (
        <p role="status" className="home-visits__notice">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p role="alert" className="home-visits__error">
          {error}
        </p>
      )}

      {settings === null || workspace.ownedHome === null ? (
        <p>Your personal home must be initialized before hosting visitors.</p>
      ) : (
        <section className="home-visits__settings" aria-labelledby="visitor-settings-title">
          <h5 id="visitor-settings-title">Visitor settings</h5>
          <label>
            Who may visit
            <select
              value={settings.visibility}
              disabled={busy || session !== null}
              onChange={(event) => {
                const visibility = event.target.value as HomeVisibility;
                void run(
                  () =>
                    updateHomeVisitSettings(
                      apiUrl,
                      settingsInput(settings, {
                        visibility,
                        publicDiscoveryEnabled:
                          visibility === 'public' && settings.publicDiscoveryEnabled,
                      }),
                    ),
                  'Visitor visibility updated.',
                );
              }}
            >
              <option value="private">Private</option>
              <option value="invite_only">Invite Only</option>
              <option value="friends_only">Friends Only</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label>
            What visitors may do
            <select
              value={settings.interactionMode}
              disabled={busy}
              onChange={(event) => {
                const interactionMode = event.target.value as HomeInteractionMode;
                void run(
                  () =>
                    updateHomeVisitSettings(
                      apiUrl,
                      settingsInput(settings, {
                        interactionMode,
                        helperActionsEnabled: interactionMode === 'allow_helpers',
                      }),
                    ),
                  'Visitor capabilities updated.',
                );
              }}
            >
              <option value="view_only">View Only</option>
              <option value="social_interactions">Social Interactions</option>
              <option value="allow_helpers">Allow Helpers</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.publicDiscoveryEnabled}
              disabled={busy || settings.visibility !== 'public'}
              onChange={(event) =>
                void run(
                  () =>
                    updateHomeVisitSettings(
                      apiUrl,
                      settingsInput(settings, {
                        publicDiscoveryEnabled: event.target.checked,
                      }),
                    ),
                  'Public discovery preference updated.',
                )
              }
            />{' '}
            Show while hosting in public discovery
          </label>
          {session === null ? (
            <button
              type="button"
              disabled={
                busy || !workspace.ownedHome.insideHome || settings.visibility === 'private'
              }
              onClick={() =>
                void run(
                  () =>
                    startHomeVisit(apiUrl, {
                      homeId: settings.homeId,
                      expectedSettingsRevision: settings.configurationRevision,
                      idempotencyKey: homeVisitIdempotencyKey('start'),
                    }),
                  'Your live home is now hosting visitors.',
                )
              }
            >
              Start Hosting
            </button>
          ) : (
            <div className="home-visits__session-controls">
              <strong>
                {session.visitorCount}/{session.maximumVisitors} visitors ·{' '}
                {session.ownerPresenceState}
              </strong>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      setHomeVisitAdmissions(apiUrl, {
                        visitSessionId: session.id,
                        open: !session.admissionsOpen,
                        expectedSessionRevision: session.configurationRevision,
                        idempotencyKey: homeVisitIdempotencyKey('admissions'),
                      }),
                    session.admissionsOpen
                      ? 'New visitor admissions closed.'
                      : 'New visitor admissions reopened.',
                  )
                }
              >
                {session.admissionsOpen ? 'Close admissions' : 'Reopen admissions'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      stopHomeVisit(apiUrl, {
                        visitSessionId: session.id,
                        expectedSessionRevision: session.configurationRevision,
                        idempotencyKey: homeVisitIdempotencyKey('stop'),
                      }),
                    'The live home visit ended and visitors returned safely.',
                  )
                }
              >
                End Visit
              </button>
            </div>
          )}
        </section>
      )}

      {session === null ? null : (
        <section aria-labelledby="home-invitations-title">
          <h5 id="home-invitations-title">Invite a selected player</h5>
          <label>
            Player profile UUID
            <input
              value={inviteeId}
              onChange={(event) => setInviteeId(event.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
            />
          </label>
          <button
            type="button"
            disabled={busy || inviteeId.length !== 36}
            onClick={() =>
              void run(
                () =>
                  createHomeVisitInvitation(apiUrl, {
                    visitSessionId: session.id,
                    inviteePlayerProfileId: inviteeId,
                    invitationType: 'direct_player',
                    idempotencyKey: homeVisitIdempotencyKey('invite'),
                  }),
                'Invitation sent with a bounded expiration.',
              )
            }
          >
            Send invitation
          </button>
        </section>
      )}

      <section aria-labelledby="home-discovery-title">
        <h5 id="home-discovery-title">Homes hosting now</h5>
        {workspace.discovery.length === 0 ? (
          <p>No public homes are accepting visitors right now.</p>
        ) : (
          workspace.discovery.map((card) => (
            <article key={card.session.id}>
              <div>
                <strong>{card.owner.displayName}</strong>
                <span>
                  Tier {card.homeTier} · {card.session.visitorCount}/{card.session.maximumVisitors}
                </span>
              </div>
              <button
                type="button"
                disabled={busy || !card.joinEligible}
                onClick={() =>
                  void run(
                    () =>
                      joinHomeVisit(apiUrl, {
                        visitSessionId: card.session.id,
                        invitationId: null,
                        expectedSessionRevision: card.session.configurationRevision,
                        idempotencyKey: homeVisitIdempotencyKey('join'),
                      }),
                    `Entered ${card.owner.displayName}'s live home.`,
                  )
                }
              >
                Visit
              </button>
            </article>
          ))
        )}
      </section>

      {workspace.invitations.length === 0 ? null : (
        <section aria-labelledby="pending-home-invitations">
          <h5 id="pending-home-invitations">Invitations</h5>
          {workspace.invitations.map((invitation) => (
            <article key={invitation.id}>
              <div>
                <strong>{invitation.owner.displayName}</strong>
                <span>
                  {invitation.type.replaceAll('_', ' ')} · expires{' '}
                  {new Date(invitation.expiresAt).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                disabled={busy || invitation.sessionId === null}
                onClick={() =>
                  invitation.sessionId === null
                    ? undefined
                    : void run(
                        () =>
                          joinHomeVisit(apiUrl, {
                            visitSessionId: invitation.sessionId as string,
                            invitationId: invitation.id,
                            expectedSessionRevision: invitation.sessionConfigurationRevision ?? 1,
                            idempotencyKey: homeVisitIdempotencyKey('join-invite'),
                          }),
                        'Invitation accepted and live home entered.',
                      )
                }
              >
                Accept and visit
              </button>
            </article>
          ))}
        </section>
      )}

      {participant === null ? null : (
        <section className="home-visits__visitor-hud" aria-labelledby="visitor-hud-title">
          <h5 id="visitor-hud-title">
            Visiting · {participant.interactionMode.replaceAll('_', ' ')}
          </h5>
          <p>{participant.capabilities.join(' · ')}</p>
          <p aria-live="polite">
            Realtime presence: {realtimeState}. Sitting state:{' '}
            {participant.socialState.replaceAll('_', ' ')}.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  leaveHomeVisit(apiUrl, {
                    participantId: participant.id,
                    expectedParticipantRevision: participant.stateVersion,
                    idempotencyKey: homeVisitIdempotencyKey('leave'),
                  }),
                'You left the home and returned to your previous safe destination.',
              )
            }
          >
            Leave Home
          </button>
          {participant.capabilities.includes('home.guestbook.write') ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    writeHomeGuestbook(apiUrl, {
                      participantId: participant.id,
                      message: guestbookMessage,
                      idempotencyKey: homeVisitIdempotencyKey('guestbook'),
                    }),
                  'Guestbook entry posted.',
                ).then(() => setGuestbookMessage(''));
              }}
            >
              <label>
                Sign guestbook
                <textarea
                  maxLength={300}
                  required
                  value={guestbookMessage}
                  onChange={(event) => setGuestbookMessage(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy || guestbookMessage.trim().length === 0}>
                Post entry
              </button>
            </form>
          ) : null}
          {participant.capabilities.includes('home.appreciate') ? (
            <div role="group" aria-label="Appreciate this home">
              {(['cozy', 'beautiful', 'creative', 'welcoming'] as const).map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        appreciateHome(apiUrl, {
                          participantId: participant.id,
                          reaction,
                          expectedRevision: workspace.ownAppreciation?.stateVersion ?? 0,
                          idempotencyKey: homeVisitIdempotencyKey('appreciation'),
                        }),
                      `Appreciation changed to ${reaction}.`,
                    )
                  }
                >
                  {reaction}
                </button>
              ))}
            </div>
          ) : null}
          {participant.capabilities.includes('home.emote') ? (
            <div
              className="home-visits__interaction-controls"
              role="group"
              aria-label="Social home interactions"
            >
              <label>
                Furniture UUID for sitting, photo area, or inspection
                <input
                  value={interactionTargetId}
                  onChange={(event) => setInteractionTargetId(event.target.value)}
                  placeholder="00000000-0000-4000-8000-000000000000"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'emote',
                        targetId: null,
                        interactionKey: 'wave',
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('emote'),
                      }),
                    'Wave emote shared with this home only.',
                  )
                }
              >
                Wave
              </button>
              <button
                type="button"
                disabled={busy || interactionTargetId.length !== 36}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'sit',
                        targetId: interactionTargetId,
                        interactionKey: null,
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('sit'),
                      }),
                    'You are seated. Occupancy is synchronized as text and in the scene.',
                  )
                }
              >
                Sit
              </button>
              <button
                type="button"
                disabled={busy || participant.socialState !== 'seated'}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'stand',
                        targetId: null,
                        interactionKey: null,
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('stand'),
                      }),
                    'You stood up and released the seat.',
                  )
                }
              >
                Stand
              </button>
              <button
                type="button"
                disabled={busy || interactionTargetId.length !== 36}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'join_photo_area',
                        targetId: interactionTargetId,
                        interactionKey: null,
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('photo-join'),
                      }),
                    'You joined an available photo-area pose slot.',
                  )
                }
              >
                Join photo area
              </button>
              <button
                type="button"
                disabled={busy || participant.socialState !== 'photo_area'}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'leave_photo_area',
                        targetId: null,
                        interactionKey: null,
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('photo-leave'),
                      }),
                    'You left the photo area.',
                  )
                }
              >
                Leave photo area
              </button>
              <button
                type="button"
                disabled={busy || interactionTargetId.length !== 36}
                onClick={() =>
                  void run(
                    () =>
                      performHomeVisitInteraction(apiUrl, {
                        participantId: participant.id,
                        action: 'inspect_furniture',
                        targetId: interactionTargetId,
                        interactionKey: null,
                        expectedParticipantRevision: participant.stateVersion,
                        idempotencyKey: homeVisitIdempotencyKey('inspect-furniture'),
                      }),
                    'Safe public furniture details loaded; storage and inventory remain private.',
                  )
                }
              >
                Inspect furniture
              </button>
            </div>
          ) : null}
          {participant.capabilities.includes('home.helper.water_crop') ? (
            <div className="home-visits__helper-controls">
              <label>
                Eligible owner crop UUID
                <input
                  value={helperCropId}
                  onChange={(event) => setHelperCropId(event.target.value)}
                  placeholder="00000000-0000-4000-8000-000000000000"
                />
              </label>
              <label>
                Crop state version
                <input
                  type="number"
                  min={1}
                  value={helperCropVersion}
                  onChange={(event) => setHelperCropVersion(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                disabled={busy || helperCropId.length !== 36}
                onClick={() =>
                  void run(
                    () =>
                      helpWaterHomeCrop(apiUrl, {
                        participantId: participant.id,
                        cropInstanceId: helperCropId,
                        expectedCropStateVersion: helperCropVersion,
                        idempotencyKey: homeVisitIdempotencyKey('helper-water'),
                      }),
                    'Crop watered once. The owner keeps crop output and progression; you receive no reward.',
                  )
                }
              >
                Help water crop
              </button>
            </div>
          ) : (
            <p>Helper actions are unavailable in this interaction mode.</p>
          )}
        </section>
      )}

      <section aria-labelledby="visitors-title">
        <h5 id="visitors-title">Live participants</h5>
        {workspace.participants.length === 0 ? (
          <p>No visitors are present.</p>
        ) : (
          <ul>
            {workspace.participants.map((entry) => (
              <li key={entry.id}>
                <span>
                  {entry.player.displayName} · level {entry.player.level} · {entry.role} ·{' '}
                  {entry.presenceState} · {entry.socialState}
                </span>
                {entry.role === 'visitor' && session !== null ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            moderateHomeVisitor(apiUrl, {
                              visitSessionId: session.id,
                              visitorParticipantId: entry.id,
                              action: 'remove',
                              reason: 'Removed by the home owner.',
                              expectedSessionRevision: session.configurationRevision,
                              idempotencyKey: homeVisitIdempotencyKey('remove'),
                            }),
                          'Visitor removed and returned safely.',
                        )
                      }
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            moderateHomeVisitor(apiUrl, {
                              visitSessionId: session.id,
                              visitorParticipantId: entry.id,
                              action: 'block',
                              reason: 'Blocked by the home owner.',
                              expectedSessionRevision: session.configurationRevision,
                              idempotencyKey: homeVisitIdempotencyKey('block'),
                            }),
                          'Visitor blocked, removed, and denied future discovery and entry.',
                        )
                      }
                    >
                      Block
                    </button>
                  </>
                ) : null}
                {participant !== null && entry.id !== participant.id ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          reportHomeVisit(apiUrl, {
                            visitSessionId: participant.sessionId,
                            reportedParticipantId: entry.id,
                            guestbookEntryId: null,
                            category: 'unsafe_behavior',
                            reason: 'Reported from the live home participant list.',
                            idempotencyKey: homeVisitIdempotencyKey('report'),
                          }),
                        'Report saved for authorized moderation review.',
                      )
                    }
                  >
                    Report
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="home-visits__game-test" aria-labelledby="visit-game-test-title">
        <h5 id="visit-game-test-title">Game Test Visit</h5>
        <p>
          Temporary preview participants and data only. No friendships, blocks, invitations, crops,
          progress, guestbook entries, appreciation, history, or realtime grants are persisted.
        </p>
        {preview === undefined ? (
          <button
            type="button"
            onClick={() =>
              void loadHomeVisitGameTest(apiUrl)
                .then(setPreview)
                .catch((cause) => setError(errorMessage(cause)))
            }
          >
            Load owner + ten visitor fixture
          </button>
        ) : (
          <p>
            <strong>{preview.participants.length} preview participants</strong> ·{' '}
            {preview.hostSession?.visitorCount} visitors · modes and moderation are simulated
            locally.
          </p>
        )}
      </section>
    </section>
  );
}
