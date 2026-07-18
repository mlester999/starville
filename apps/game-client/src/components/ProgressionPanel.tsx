import { useCallback, useEffect, useState } from 'react';
import type { ProgressionWorkspace } from '@starville/progression';
import {
  acceptProgressionQuest,
  completeProgressionQuest,
  loadProgression,
  loadProgressionEvents,
  retryProgressionReward,
  trackProgressionQuest,
  updateProgressionIdentity,
} from '../app/progression-client';

type Tab = 'overview' | 'skills' | 'quests' | 'achievements' | 'titles';

function percentage(current: number, required: number | null): number {
  if (required === null) return 100;
  return Math.min(100, Math.round((current / required) * 100));
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={value}
      className="progression-bar"
      role="progressbar"
    >
      <span style={{ width: `${String(value)}%` }} />
    </div>
  );
}

export function ProgressionWorkspaceView({
  workspace,
  preview = false,
  busy = false,
  onAccept,
  onTrack,
  onComplete,
  onEquipTitle,
  onRetryReward,
}: {
  readonly workspace: ProgressionWorkspace;
  readonly preview?: boolean;
  readonly busy?: boolean;
  readonly onAccept?: (questId: string, configurationRevision: number) => void;
  readonly onTrack?: (questId: string, tracked: boolean, revision: number) => void;
  readonly onComplete?: (questId: string, revision: number) => void;
  readonly onEquipTitle?: (titleId: string | null) => void;
  readonly onRetryReward?: (rewardId: string, revision: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedSkill, setSelectedSkill] = useState('farming');
  const selected =
    workspace.skills.find((skill) => skill.skillKey === selectedSkill) ?? workspace.skills[0];
  const tabs: readonly [Tab, string][] = [
    ['overview', 'Overview'],
    ['skills', 'Skills'],
    ['quests', 'Quest journal'],
    ['achievements', 'Achievements'],
    ['titles', 'Titles & badges'],
  ];

  return (
    <div className="progression-workspace" data-preview={preview || undefined}>
      {preview ? (
        <p className="progression-preview-notice" role="status">
          Game Test fixture · temporary preview data · nothing is saved
        </p>
      ) : null}
      <header className="progression-hero">
        <div>
          <p className="game-kicker">Starville journey</p>
          <h3>Player Level {workspace.playerLevel.level}</h3>
          <p>
            {workspace.playerLevel.totalXp.toLocaleString()} total XP · level cap{' '}
            {workspace.playerLevel.maximumLevel}
          </p>
        </div>
        <div className="progression-hero__bar">
          <span>
            {workspace.playerLevel.xpInLevel.toLocaleString()} /{' '}
            {workspace.playerLevel.xpForNextLevel?.toLocaleString() ?? 'MAX'} XP
          </span>
          <ProgressBar
            label={`Player Level ${String(workspace.playerLevel.level)} progress`}
            value={percentage(
              workspace.playerLevel.xpInLevel,
              workspace.playerLevel.xpForNextLevel,
            )}
          />
        </div>
      </header>
      <nav aria-label="Progression views" className="progression-tabs">
        {tabs.map(([key, label]) => (
          <button
            aria-current={tab === key ? 'page' : undefined}
            key={key}
            type="button"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="progression-grid">
          <section>
            <h4>Released skills</h4>
            {workspace.skills.map((skill) => (
              <article key={skill.skillId}>
                <strong>
                  {skill.displayName} · Lv {skill.level}
                </strong>
                <ProgressBar
                  label={`${skill.displayName} progress`}
                  value={percentage(skill.xpInLevel, skill.xpForNextLevel)}
                />
                <small>{skill.totalXp.toLocaleString()} total XP</small>
              </article>
            ))}
          </section>
          <section>
            <h4>Recent XP</h4>
            {workspace.recentXp.length === 0 ? (
              <p>No trusted XP events yet. Farming and workstation collection will appear here.</p>
            ) : (
              workspace.recentXp.map((event) => (
                <article key={event.eventId}>
                  <strong>
                    {event.xp > 0 ? '+' : ''}
                    {event.xp} XP · {event.skillKey ?? 'Player Level'}
                  </strong>
                  <small>{event.sourceEvent.replaceAll('_', ' ')}</small>
                </article>
              ))
            )}
          </section>
          <section>
            <h4>Newly available</h4>
            {workspace.unlocks
              .filter((unlock) => unlock.owned)
              .slice(-5)
              .map((unlock) => (
                <article key={unlock.unlockId}>
                  <strong>{unlock.displayName}</strong>
                  <small>{unlock.unlockType.replaceAll('_', ' ')}</small>
                </article>
              ))}
          </section>
          <section>
            <h4>Reward settlement</h4>
            {workspace.pendingRewards.length === 0 ? (
              <p>All earned rewards are settled.</p>
            ) : (
              workspace.pendingRewards.map((reward) => (
                <article key={reward.rewardId}>
                  <strong>{reward.displayLabel}</strong>
                  <small>
                    {reward.failureCode === 'INVENTORY_FULL'
                      ? 'Free an inventory slot, then retry.'
                      : 'Safe settlement is pending.'}
                  </small>
                  {preview ? null : (
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() => onRetryReward?.(reward.rewardId, reward.revision)}
                    >
                      Retry safely
                    </button>
                  )}
                </article>
              ))
            )}
          </section>
        </div>
      ) : null}

      {tab === 'skills' ? (
        <div className="progression-skill-layout">
          <nav aria-label="Skills">
            {workspace.skills.map((skill) => (
              <button
                aria-current={selected?.skillKey === skill.skillKey ? 'true' : undefined}
                key={skill.skillId}
                type="button"
                onClick={() => setSelectedSkill(skill.skillKey)}
              >
                {skill.displayName}
                <span>Level {skill.level}</span>
              </button>
            ))}
          </nav>
          {selected === undefined ? (
            <p>No released skills are available.</p>
          ) : (
            <section>
              <p className="game-kicker">{selected.category}</p>
              <h4>
                {selected.displayName} · Level {selected.level}
              </h4>
              <p>{selected.description}</p>
              <ProgressBar
                label={`${selected.displayName} level progress`}
                value={percentage(selected.xpInLevel, selected.xpForNextLevel)}
              />
              <dl>
                <div>
                  <dt>Total XP</dt>
                  <dd>{selected.totalXp.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Next level</dt>
                  <dd>
                    {selected.xpForNextLevel === null
                      ? 'Maximum reached'
                      : `${selected.xpInLevel.toLocaleString()} / ${selected.xpForNextLevel.toLocaleString()}`}
                  </dd>
                </div>
              </dl>
              <h5>Next unlocks</h5>
              {selected.nextUnlocks.length === 0 ? (
                <p>No visible unlocks remain in this configuration.</p>
              ) : (
                selected.nextUnlocks.map((unlock) => (
                  <p key={unlock.unlockKey}>
                    {unlock.displayName} · level {unlock.requiredLevel}
                  </p>
                ))
              )}
            </section>
          )}
        </div>
      ) : null}

      {tab === 'quests' ? (
        <div className="progression-quest-columns">
          {(['available', 'active', 'completed'] as const).map((status) => (
            <section key={status}>
              <h4>{status[0]!.toUpperCase() + status.slice(1)}</h4>
              {workspace.quests[status].length === 0 ? (
                <p>No {status} chapters.</p>
              ) : (
                workspace.quests[status].map((quest) => (
                  <article key={`${status}-${quest.questDefinitionId}`}>
                    <span>
                      {quest.chain.name} · Chapter {quest.chain.sequence}
                    </span>
                    <h5>{quest.name}</h5>
                    <p>{quest.description}</p>
                    {quest.objectives.map((objective) => (
                      <div key={objective.objectiveId}>
                        <small>
                          {objective.label} · {objective.currentCount}/{objective.requiredCount}
                        </small>
                        <ProgressBar
                          label={objective.label}
                          value={percentage(objective.currentCount, objective.requiredCount)}
                        />
                      </div>
                    ))}
                    {preview ? null : status === 'available' &&
                      quest.questKind === 'progression_chapter' ? (
                      <button
                        disabled={busy || !quest.prerequisites.met}
                        type="button"
                        onClick={() =>
                          onAccept?.(quest.questDefinitionId, quest.configurationRevision)
                        }
                      >
                        Accept chapter
                      </button>
                    ) : status === 'available' ? (
                      <small>
                        Continue this chapter in the{' '}
                        {quest.questKind === 'farming_tutorial'
                          ? 'personal plot'
                          : quest.questKind === 'workstation_tutorial'
                            ? 'workstation'
                            : 'General Store'}{' '}
                        workflow.
                      </small>
                    ) : status === 'active' && quest.questKind === 'progression_chapter' ? (
                      <div className="progression-actions">
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            quest.questInstanceId === null
                              ? undefined
                              : onTrack?.(quest.questInstanceId, !quest.tracked, quest.stateVersion)
                          }
                        >
                          {quest.tracked ? 'Untrack' : 'Track'}
                        </button>
                        <button
                          disabled={
                            busy ||
                            quest.objectives.some(
                              (objective) => objective.currentCount < objective.requiredCount,
                            )
                          }
                          type="button"
                          onClick={() =>
                            quest.questInstanceId === null
                              ? undefined
                              : onComplete?.(quest.questInstanceId, quest.stateVersion)
                          }
                        >
                          Complete
                        </button>
                      </div>
                    ) : status === 'active' ? (
                      <small>This chapter is tracked by its original gameplay workflow.</small>
                    ) : null}
                  </article>
                ))
              )}
            </section>
          ))}
        </div>
      ) : null}

      {tab === 'achievements' ? (
        <div className="progression-achievements">
          {workspace.achievements.map((achievement) => (
            <article data-hidden={achievement.hidden || undefined} key={achievement.achievementId}>
              <span>{achievement.category}</span>
              <h4>{achievement.displayName}</h4>
              <p>{achievement.description}</p>
              {achievement.progressVisible &&
              achievement.currentProgress !== null &&
              achievement.target !== null ? (
                <>
                  <ProgressBar
                    label={`${achievement.displayName} achievement progress`}
                    value={percentage(achievement.currentProgress, achievement.target)}
                  />
                  <small>
                    {achievement.currentProgress}/{achievement.target}
                  </small>
                </>
              ) : (
                <small>Hidden progress</small>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'titles' ? (
        <div className="progression-grid">
          <section>
            <h4>Owned titles</h4>
            <button disabled={preview || busy} type="button" onClick={() => onEquipTitle?.(null)}>
              Use no title
            </button>
            {workspace.titles.map((title) => (
              <article key={title.titleId}>
                <strong>{title.displayName}</strong>
                <p>{title.description}</p>
                <small>
                  {title.rarity} · {title.source}
                </small>
                {preview ? null : (
                  <button
                    disabled={busy || title.equipped}
                    type="button"
                    onClick={() => onEquipTitle?.(title.titleId)}
                  >
                    {title.equipped ? 'Equipped' : 'Equip'}
                  </button>
                )}
              </article>
            ))}
          </section>
          <section>
            <h4>Badges</h4>
            {workspace.badges.length === 0 ? (
              <p>No badges earned yet.</p>
            ) : (
              workspace.badges.map((badge) => (
                <article key={badge.badgeId}>
                  <strong>{badge.displayName}</strong>
                  <p>{badge.description}</p>
                  <small>{badge.selected ? 'Selected' : 'Owned'}</small>
                </article>
              ))
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function ProgressionPanel({
  apiUrl,
  open,
  onClose,
  onLevelChange,
  onWorkspaceChange,
}: {
  readonly apiUrl: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLevelChange?: (level: number) => void;
  readonly onWorkspaceChange?: (workspace: ProgressionWorkspace) => void;
}) {
  const [workspace, setWorkspace] = useState<ProgressionWorkspace>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notifications, setNotifications] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const next = await loadProgression(apiUrl);
      setWorkspace(next);
      onLevelChange?.(next.playerLevel.level);
      onWorkspaceChange?.(next);
      setError(undefined);
    } catch {
      setError('Progression could not be loaded safely. Your earned state was not changed.');
    }
  }, [apiUrl, onLevelChange, onWorkspaceChange]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('online', refreshOnFocus);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('online', refreshOnFocus);
    };
  }, [load, open]);

  useEffect(() => {
    if (!open || workspace === undefined) return;
    void loadProgressionEvents(apiUrl, workspace.lastEventNumber)
      .then((page) => {
        const messages = page.events
          .filter((event) =>
            [
              'skill_level_up',
              'player_level_up',
              'unlock_granted',
              'achievement_completed',
            ].includes(event.eventKey),
          )
          .map((event) => event.eventKey.replaceAll('_', ' '));
        if (messages.length > 0) setNotifications(messages);
      })
      .catch(() => undefined);
  }, [apiUrl, open, workspace]);

  if (!open) return null;

  async function mutate(action: () => Promise<ProgressionWorkspace>) {
    setBusy(true);
    setError(undefined);
    try {
      const next = await action();
      setWorkspace(next);
      onLevelChange?.(next.playerLevel.level);
      onWorkspaceChange?.(next);
    } catch {
      setError(
        'The authoritative progression state changed or the action is unavailable. Reload and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedBadge = workspace?.badges.find((badge) => badge.selected)?.badgeId ?? null;
  return (
    <div className="game-modal-backdrop progression-modal" role="presentation">
      <section
        aria-labelledby="progression-title"
        aria-modal="true"
        className="game-modal game-modal--wide"
        role="dialog"
      >
        <header className="game-modal__header">
          <div>
            <p className="game-kicker">Authoritative progression</p>
            <h2 id="progression-title">My Starville Journey</h2>
            <p>
              Skills, chapters, achievements, unlocks, and rewards are restored from the village
              server.
            </p>
          </div>
          <button autoFocus type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div aria-live="polite" className="progression-notifications">
          {notifications.join(' · ')}
        </div>
        <div className="game-modal__body">
          {error === undefined ? null : <p role="alert">{error}</p>}
          {workspace === undefined ? (
            <p role="status">Gathering your journey…</p>
          ) : (
            <ProgressionWorkspaceView
              busy={busy}
              workspace={workspace}
              onAccept={(questId, configurationRevision) =>
                void mutate(() => acceptProgressionQuest(apiUrl, questId, configurationRevision))
              }
              onComplete={(questId, revision) =>
                void mutate(() => completeProgressionQuest(apiUrl, questId, revision))
              }
              onEquipTitle={(titleId) =>
                void mutate(() =>
                  updateProgressionIdentity(
                    apiUrl,
                    titleId,
                    selectedBadge,
                    workspace.preferencesRevision,
                  ),
                )
              }
              onRetryReward={(rewardId, revision) =>
                void mutate(() => retryProgressionReward(apiUrl, rewardId, revision))
              }
              onTrack={(questId, tracked, revision) =>
                void mutate(() => trackProgressionQuest(apiUrl, questId, tracked, revision))
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
