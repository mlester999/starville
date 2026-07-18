import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { PartySnapshot } from '@starville/realtime';
import type {
  CooperativeActivityBootstrap,
  CooperativeActivityCatalogEntry,
  CooperativeActivityInstanceSnapshot,
} from '@starville/cooperative-activities';

import { GameButton, GameEmptyState, GameModalShell, StatusIndicator } from './game-ui';

interface CooperativeActivityPanelProps {
  readonly activity: CooperativeActivityBootstrap & {
    readonly lastError?: { readonly code: string; readonly requestId?: string };
  };
  readonly party: PartySnapshot | null;
  readonly selfPresenceId?: string;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCatalogRequest: () => void;
  readonly onPrepare: (activityKey: string, partyRevision: number) => void;
  readonly onReady: (
    readyCheckId: string,
    partyRevision: number,
    response: 'ready' | 'not_ready',
  ) => void;
  readonly onEnter: (preparationId: string) => void;
  readonly onLeave: (instanceId: string) => void;
  readonly onSnapshotRequest: () => void;
  readonly externalOpenRequest?: number;
  readonly showLauncher?: boolean;
  readonly confirmBeforeLeaving?: boolean;
  readonly onOpenFriends?: (tab: 'friends' | 'party') => void;
}

const AVAILABILITY_LABELS: Readonly<Record<string, string>> = {
  available: 'Available',
  module_disabled: 'Disabled',
  maintenance: 'Temporarily Unavailable',
  party_required: 'Party Required',
  leader_required: 'Waiting for Party Leader',
  party_size: 'Party Required',
  not_ready: 'Waiting for Party',
  cooldown: 'On Cooldown',
  daily_limit: 'Daily Rewards Complete',
  already_active: 'Activity in Progress',
  unavailable: 'Unavailable',
};

const FRIENDLY_ERRORS: Readonly<Record<string, string>> = {
  party_changed: 'Your party changed. Prepare the activity again.',
  party_required: 'Create or join a party before preparing this activity.',
  leader_required: 'Only your party leader can prepare this activity.',
  not_ready: 'Everyone must be ready before entering.',
  cooldown: 'This activity will be available again soon.',
  daily_limit: 'Your rewarded completions are finished for today.',
  maintenance: 'Activities are resting for maintenance.',
  activity_expired: 'The activity ended before the harvest could be delivered.',
};

function secondsRemaining(timestamp: string | null, now: number): number | null {
  if (timestamp === null) return null;
  return Math.max(0, Math.ceil((Date.parse(timestamp) - now) / 1_000));
}

function friendlyCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder.toString().padStart(2, '0')}s` : `${remainder}s`;
}

function friendlyDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `About ${minutes} Minute${minutes === 1 ? '' : 's'}`;
}

function itemName(slug: string): string {
  if (slug === 'moonbean') return 'Moonbeans';
  return slug
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function ActivityRewardCards({ entry }: { readonly entry: CooperativeActivityCatalogEntry }) {
  return (
    <section className="activity-rewards" aria-labelledby="activity-rewards-title">
      <div>
        <p className="game-kicker">Completion Rewards</p>
        <h4 id="activity-rewards-title">A shared village thank-you</h4>
      </div>
      <div className="activity-reward-grid">
        <article>
          <span aria-hidden="true">✦</span>
          <strong>{entry.activity.reward.dust}</strong>
          <small>DUST</small>
        </article>
        {entry.activity.reward.items.map((item) => (
          <article key={item.itemSlug}>
            <span aria-hidden="true">❋</span>
            <strong>{item.quantity}</strong>
            <small>{itemName(item.itemSlug)}</small>
          </article>
        ))}
      </div>
      <p>
        Daily rewarded completions{' '}
        <strong>
          {entry.rewardedCompletionsToday} of {entry.activity.dailyRewardLimit} used
        </strong>
      </p>
    </section>
  );
}

function ActivityObjectiveJourney({
  entry,
  instance,
}: {
  readonly entry: CooperativeActivityCatalogEntry;
  readonly instance?: CooperativeActivityInstanceSnapshot;
}) {
  const progress = new Map(instance?.objectives.map((objective) => [objective.key, objective]));
  return (
    <section className="activity-journey" aria-labelledby="activity-journey-title">
      <div>
        <p className="game-kicker">Objective Journey</p>
        <h4 id="activity-journey-title">Grow a harvest together</h4>
      </div>
      <ol>
        {entry.activity.objectives.map((objective, index) => {
          const state = progress.get(objective.key)?.status ?? 'preview';
          return (
            <li
              className={`activity-journey__step activity-journey__step--${state}`}
              key={objective.key}
            >
              <span aria-hidden="true">{state === 'completed' ? '✓' : index + 1}</span>
              <div>
                <strong>{objective.label}</strong>
                <small>{objective.description}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActivityRequirements({
  entry,
  party,
  leader,
}: {
  readonly entry: CooperativeActivityCatalogEntry;
  readonly party: PartySnapshot | null;
  readonly leader: boolean;
}) {
  const requirements = [
    { label: 'Active party', met: party !== null },
    {
      label: `${entry.activity.minimumPartySize}–${entry.activity.maximumPartySize} villagers`,
      met:
        party !== null &&
        party.members.length >= entry.activity.minimumPartySize &&
        party.members.length <= entry.activity.maximumPartySize,
    },
    { label: 'Party leader prepares', met: leader },
    {
      label: 'Every member ready',
      met: entry.availability === 'available' || entry.availability === 'not_ready',
    },
  ];
  return (
    <section className="activity-requirements" aria-labelledby="activity-requirements-title">
      <h4 id="activity-requirements-title">Before You Begin</h4>
      <ul>
        {requirements.map((requirement) => (
          <li key={requirement.label}>
            <span aria-hidden="true">{requirement.met ? '✓' : '○'}</span>
            <span>{requirement.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityResult({
  instance,
  onReturn,
}: {
  readonly instance: CooperativeActivityInstanceSnapshot;
  readonly onReturn: () => void;
}) {
  const completed = instance.status === 'completed';
  const receipt = instance.receipts[0];
  const elapsed =
    instance.startedAt === null || instance.completedAt === null
      ? null
      : Math.max(
          0,
          Math.round((Date.parse(instance.completedAt) - Date.parse(instance.startedAt)) / 1_000),
        );
  return (
    <GameModalShell
      eyebrow={completed ? 'Community Harvest Complete' : 'Activity Ended'}
      footer={
        <GameButton data-dialog-initial tone="primary" type="button" onClick={onReturn}>
          Return to Starville
        </GameButton>
      }
      size="compact"
      title={completed ? 'Moonpetal Harvest Complete' : 'The Community Harvest Was Not Completed'}
      onClose={onReturn}
    >
      <p>
        {completed
          ? 'Your party prepared and delivered the harvest together.'
          : 'The village harvest was not delivered in time. No rewards were granted and your normal progress is safe.'}
      </p>
      <dl className="activity-result-grid">
        {elapsed === null ? null : (
          <div>
            <dt>Completion Time</dt>
            <dd>{friendlyCountdown(elapsed)}</dd>
          </div>
        )}
        <div>
          <dt>Party</dt>
          <dd>{instance.participants.map((participant) => participant.displayName).join(', ')}</dd>
        </div>
        <div>
          <dt>Objectives</dt>
          <dd>
            {instance.objectives.filter((objective) => objective.status === 'completed').length} of{' '}
            {instance.objectives.length} complete
          </dd>
        </div>
        <div>
          <dt>Your Contribution</dt>
          <dd>{instance.personalContribution} shared actions</dd>
        </div>
      </dl>
      {completed && receipt !== undefined ? (
        <div className="activity-result-rewards">
          <strong>{receipt.dust} DUST</strong>
          {receipt.items.map((item) => (
            <strong key={item.itemSlug}>
              {item.quantity} {itemName(item.itemSlug)}
            </strong>
          ))}
          <span>Daily rewarded completion {receipt.dailyRewardNumber}</span>
        </div>
      ) : (
        <p className="activity-result-no-reward">
          No rewards granted. You can try again when the activity is available.
        </p>
      )}
    </GameModalShell>
  );
}

export function CooperativeActivityPanel(props: CooperativeActivityPanelProps) {
  const { externalOpenRequest = 0, onCatalogRequest, onOpenChange } = props;
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [leavingConfirmation, setLeavingConfirmation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const launcher = useRef<HTMLButtonElement>(null);
  const instance = props.activity.instance;
  const preparation = props.activity.preparation;
  const selected = useMemo(
    () =>
      props.activity.catalog.activities.find(
        (entry) => entry.activity.activityKey === selectedKey,
      ) ?? props.activity.catalog.activities[0],
    [props.activity.catalog.activities, selectedKey],
  );
  const selfMember = props.party?.members.find(
    (member) => member.presenceId === props.selfPresenceId,
  );
  const leader = selfMember?.role === 'leader';
  const myReadyState = preparation?.responses.find(
    (response) => response.presenceId === props.selfPresenceId,
  )?.state;
  const terminal =
    instance !== null &&
    ['completed', 'failed', 'cancelled', 'expired', 'abandoned'].includes(instance.status);
  const modalOpen = open || leavingConfirmation || terminal;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => onOpenChange(modalOpen), [modalOpen, onOpenChange]);
  useEffect(() => {
    if (externalOpenRequest <= 0 || instance !== null) return;
    onCatalogRequest();
    setOpen(true);
  }, [externalOpenRequest, instance, onCatalogRequest]);

  function closeBrowser() {
    setOpen(false);
    window.setTimeout(() => launcher.current?.focus(), 0);
  }

  if (terminal && instance !== null) {
    return (
      <ActivityResult instance={instance} onReturn={() => props.onLeave(instance.instanceId)} />
    );
  }

  const objective = instance?.objectives.find(
    (candidate) => candidate.key === instance.currentObjectiveKey,
  );
  const remaining = secondsRemaining(objective?.timerEndsAt ?? instance?.expiresAt ?? null, now);

  function leaveActivity() {
    if (instance === null) return;
    if (props.confirmBeforeLeaving === false) props.onLeave(instance.instanceId);
    else setLeavingConfirmation(true);
  }

  function transitionToFriends(tab: 'friends' | 'party') {
    closeBrowser();
    window.setTimeout(() => props.onOpenFriends?.(tab), 0);
  }

  function navigateCatalog(event: KeyboardEvent<HTMLButtonElement>, activityKey: string) {
    const entries = props.activity.catalog.activities;
    const currentIndex = entries.findIndex((entry) => entry.activity.activityKey === activityKey);
    const requestedIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? entries.length - 1
          : event.key === 'ArrowDown' || event.key === 'ArrowRight'
            ? (currentIndex + 1) % entries.length
            : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
              ? (currentIndex - 1 + entries.length) % entries.length
              : null;
    if (requestedIndex === null) return;
    event.preventDefault();
    const requested = entries[requestedIndex];
    if (requested === undefined) return;
    setSelectedKey(requested.activity.activityKey);
    document.getElementById(`activity-option-${requested.activity.activityKey}`)?.focus();
  }

  function actionArea(entry: CooperativeActivityCatalogEntry) {
    if (preparation !== null) {
      const readyCount = preparation.responses.filter(
        (response) => response.state === 'ready',
      ).length;
      return (
        <section className="activity-ready" aria-labelledby="activity-ready-title">
          <div className="activity-ready__heading">
            <div>
              <p className="game-kicker">Waiting for Party</p>
              <h4 id="activity-ready-title">Ready Check</h4>
            </div>
            <strong>
              {readyCount} / {preparation.responses.length} ready
            </strong>
          </div>
          <ul>
            {preparation.responses.map((response) => (
              <li key={response.presenceId}>
                <span>{response.displayName}</span>
                <strong>{response.state === 'not_ready' ? 'Not ready' : response.state}</strong>
              </li>
            ))}
          </ul>
          {myReadyState === 'ready' ? (
            <p>Your ready response is recorded.</p>
          ) : (
            <div className="activity-ready__actions">
              <GameButton
                tone="primary"
                type="button"
                onClick={() =>
                  props.onReady(preparation.readyCheckId, preparation.partyRevision, 'ready')
                }
              >
                I’m Ready
              </GameButton>
              <GameButton
                type="button"
                onClick={() =>
                  props.onReady(preparation.readyCheckId, preparation.partyRevision, 'not_ready')
                }
              >
                Not Ready
              </GameButton>
            </div>
          )}
          {preparation.status === 'ready' && leader ? (
            <GameButton
              tone="primary"
              type="button"
              onClick={() => props.onEnter(preparation.preparationId)}
            >
              Enter Activity
            </GameButton>
          ) : null}
        </section>
      );
    }
    if (props.party === null)
      return (
        <div className="activity-cta">
          <div>
            <strong>Party Required</strong>
            <p>Create or join a party with at least two villagers to begin.</p>
          </div>
          <GameButton tone="primary" type="button" onClick={() => transitionToFriends('party')}>
            Open Friends &amp; Party
          </GameButton>
        </div>
      );
    if (props.party.members.length < entry.activity.minimumPartySize)
      return (
        <div className="activity-cta">
          <div>
            <strong>One More Villager</strong>
            <p>Invite one more villager to start this activity.</p>
          </div>
          <GameButton tone="primary" type="button" onClick={() => transitionToFriends('friends')}>
            Invite a Player
          </GameButton>
        </div>
      );
    if (!leader)
      return (
        <div className="activity-cta">
          <div>
            <strong>Waiting for Your Leader</strong>
            <p>Your party leader can prepare the activity when everyone is together.</p>
          </div>
          <GameButton type="button" onClick={() => transitionToFriends('party')}>
            View Party
          </GameButton>
        </div>
      );
    if (entry.availability === 'available' && entry.partyEligible)
      return (
        <div className="activity-cta">
          <div>
            <strong>Ready to Prepare</strong>
            <p>Your party meets the current activity requirements.</p>
          </div>
          <GameButton
            tone="primary"
            type="button"
            onClick={() => props.onPrepare(entry.activity.activityKey, props.party!.revision)}
          >
            Prepare Activity
          </GameButton>
        </div>
      );
    const cooldown = secondsRemaining(entry.availableAt, now);
    return (
      <div className="activity-cta">
        <div>
          <strong>{AVAILABILITY_LABELS[entry.availability] ?? 'Not Available'}</strong>
          <p>
            {cooldown === null
              ? 'This activity is not available right now.'
              : `Available again in ${friendlyCountdown(cooldown)}.`}
          </p>
        </div>
        <GameButton type="button" onClick={closeBrowser}>
          Close
        </GameButton>
      </div>
    );
  }

  return (
    <>
      {instance === null ? (
        props.showLauncher === false ? null : (
          <button
            ref={launcher}
            className="activity-launcher"
            disabled={props.disabled}
            type="button"
            onClick={() => {
              props.onCatalogRequest();
              setOpen(true);
            }}
          >
            <span aria-hidden="true">✿</span>
            <span>
              <strong>Activities</strong>
              <small>Cozy co-op</small>
            </span>
          </button>
        )
      ) : (
        <aside className="activity-hud" aria-labelledby="activity-hud-title">
          <div className="activity-hud__heading">
            <div>
              <p className="game-kicker">Co-op Activity</p>
              <h2 id="activity-hud-title">{instance.activity.name}</h2>
            </div>
            <strong aria-label={remaining === null ? 'No timer' : `${remaining} seconds remaining`}>
              {remaining === null ? '—' : friendlyCountdown(remaining)}
            </strong>
          </div>
          {objective === undefined ? null : (
            <section>
              <strong>{objective.label}</strong>
              <progress max={objective.target} value={objective.current} />
              <span aria-live="polite">
                Shared progress {objective.current} of {objective.target} · Your contribution{' '}
                {instance.personalContribution}
              </span>
            </section>
          )}
          <div className="activity-hud__meta">
            <span>{instance.temporaryItemCount} temporary items</span>
            <span>{instance.participants.length} villagers</span>
          </div>
          <ul aria-label="Activity party connection states">
            {instance.participants.map((participant) => (
              <li key={participant.presenceId}>
                <StatusIndicator
                  tone={participant.connectionStatus === 'online' ? 'success' : 'warning'}
                >
                  {participant.displayName} ·{' '}
                  {participant.connectionStatus === 'online' ? 'Online' : 'Reconnecting'}
                </StatusIndicator>
              </li>
            ))}
          </ul>
          <div className="activity-hud__actions">
            <GameButton tone="quiet" type="button" onClick={props.onSnapshotRequest}>
              Refresh Progress
            </GameButton>
            <GameButton tone="danger" type="button" onClick={leaveActivity}>
              Leave
            </GameButton>
          </div>
          {props.activity.lastError === undefined ? null : (
            <p className="activity-error" role="alert">
              {FRIENDLY_ERRORS[props.activity.lastError.code] ??
                'That activity action was not accepted. Your progress is unchanged.'}
            </p>
          )}
        </aside>
      )}

      {!open || instance !== null ? null : (
        <GameModalShell
          className="activity-browser"
          closeLabel="Close Activities"
          eyebrow="Cozy Co-op"
          size="wide"
          subtitle="Choose a shared village task and gather your party."
          title="Activities"
          onClose={closeBrowser}
        >
          {selected === undefined ? (
            <GameEmptyState
              icon="✿"
              message="Check back after the village has prepared another cooperative task."
              title="No Activities Available"
            />
          ) : (
            <div className="activity-browser__layout">
              <nav aria-label="Available activities">
                {props.activity.catalog.activities.map((entry) => (
                  <button
                    aria-current={entry.activity.activityKey === selected.activity.activityKey}
                    id={`activity-option-${entry.activity.activityKey}`}
                    key={entry.activity.versionId}
                    tabIndex={entry.activity.activityKey === selected.activity.activityKey ? 0 : -1}
                    type="button"
                    onKeyDown={(event) => navigateCatalog(event, entry.activity.activityKey)}
                    onClick={() => setSelectedKey(entry.activity.activityKey)}
                  >
                    <span className="activity-card__marker" aria-hidden="true" />
                    <span>
                      <strong>{entry.activity.name}</strong>
                      <small>{entry.activity.shortDescription}</small>
                    </span>
                    <em>{AVAILABILITY_LABELS[entry.availability] ?? 'Unavailable'}</em>
                  </button>
                ))}
              </nav>
              <article className="activity-details">
                <header>
                  <div>
                    <p className="game-kicker">Cozy Cooperative</p>
                    <h3>{selected.activity.name}</h3>
                    <p>{selected.activity.longDescription}</p>
                  </div>
                  <div className="activity-chip-row">
                    <span>
                      {selected.activity.minimumPartySize}–{selected.activity.maximumPartySize}{' '}
                      Players
                    </span>
                    <span>{friendlyDuration(selected.activity.durationSeconds)}</span>
                    <span>Beginner Friendly</span>
                    <span>Private Party</span>
                  </div>
                </header>
                <div className="activity-detail-grid">
                  <ActivityObjectiveJourney entry={selected} />
                  <div>
                    <ActivityRewardCards entry={selected} />
                    <ActivityRequirements entry={selected} party={props.party} leader={leader} />
                  </div>
                </div>
                {actionArea(selected)}
              </article>
            </div>
          )}
        </GameModalShell>
      )}

      {!leavingConfirmation || instance === null ? null : (
        <GameModalShell
          eyebrow="Activity in Progress"
          footer={
            <>
              <GameButton
                data-dialog-initial
                type="button"
                onClick={() => setLeavingConfirmation(false)}
              >
                Keep Helping
              </GameButton>
              <GameButton
                tone="danger"
                type="button"
                onClick={() => props.onLeave(instance.instanceId)}
              >
                Leave Activity
              </GameButton>
            </>
          }
          size="compact"
          title="Leave This Activity?"
          onClose={() => setLeavingConfirmation(false)}
        >
          <p>
            Leaving may put the shared harvest below its required party size. Incomplete
            participation receives no reward.
          </p>
        </GameModalShell>
      )}
    </>
  );
}
