import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerExperienceWorkspace } from '@starville/player-experience';

import {
  acknowledgePlayerExperienceStep,
  loadPlayerExperience,
  refreshPlayerDailyObjectives,
  requestPlayerExperienceRecovery,
  setPlayerOnboardingActivity,
  skipOptionalPlayerOnboarding,
  startPlayerOnboarding,
  updatePlayerGuidePreferences,
} from '../app/player-experience-client';
import { GameModalPortal } from './game-ui';

type GuideTab = 'journey' | 'daily' | 'help';

function progressPercent(current: number, required: number): number {
  return Math.min(100, Math.round((current / required) * 100));
}

function currentRecoveryReason(
  workspace: PlayerExperienceWorkspace,
): 'starter_seed_missing' | 'guidance_target_missing' | 'state_out_of_sync' {
  if (workspace.onboarding.currentStep === 'plant_first_crop') return 'starter_seed_missing';
  if (workspace.activeObjective?.guidanceTarget !== null) return 'guidance_target_missing';
  return 'state_out_of_sync';
}

export function GuidedPlayerExperience({
  apiUrl,
  disabled,
  refreshSignal,
  onObjectiveChange,
  onOpenChange,
  onOpenInventory,
  onOpenProgression,
  portal = false,
}: {
  readonly apiUrl: string;
  readonly disabled: boolean;
  readonly refreshSignal: number;
  readonly onObjectiveChange: (active: boolean) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenInventory: () => void;
  readonly onOpenProgression: () => void;
  readonly portal?: boolean;
}) {
  const [workspace, setWorkspace] = useState<PlayerExperienceWorkspace>();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<GuideTab>('journey');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string>();
  const [dismissedFeedback, setDismissedFeedback] = useState<number>();

  const apply = useCallback(
    (next: PlayerExperienceWorkspace) => {
      setWorkspace(next);
      setWarning(undefined);
      onObjectiveChange(next.activeObjective !== null);
    },
    [onObjectiveChange],
  );

  const refresh = useCallback(async () => {
    try {
      apply(await loadPlayerExperience(apiUrl, workspace?.feedbackCursor ?? 0));
    } catch {
      setWarning('The Guide could not refresh. Your last verified objective remains visible.');
    }
  }, [apiUrl, apply, workspace?.feedbackCursor]);

  useEffect(() => {
    let active = true;
    void loadPlayerExperience(apiUrl)
      .then((next) => {
        if (active) apply(next);
      })
      .catch(() => {
        if (active) setWarning('The Guide is temporarily unavailable. Core gameplay remains safe.');
      });
    return () => {
      active = false;
    };
  }, [apiUrl, apply, refreshSignal]);

  useEffect(() => {
    const focused = () => void refresh();
    window.addEventListener('focus', focused);
    return () => window.removeEventListener('focus', focused);
  }, [refresh]);

  const run = useCallback(
    async (
      operation: (current: PlayerExperienceWorkspace) => Promise<PlayerExperienceWorkspace>,
    ) => {
      if (workspace === undefined || busy) return;
      setBusy(true);
      try {
        apply(await operation(workspace));
      } catch {
        setWarning('That action did not settle. Reload the latest objective and try again.');
      } finally {
        setBusy(false);
      }
    },
    [apply, busy, workspace],
  );

  const currentStep = useMemo(
    () => workspace?.onboarding.steps.find((step) => step.key === workspace.onboarding.currentStep),
    [workspace],
  );
  const objective = workspace?.activeObjective;
  const isWelcome = workspace?.onboarding.status === 'not_started';
  const latestFeedback = workspace?.feedback.at(-1);

  useEffect(() => {
    if (latestFeedback === undefined) return;
    setDismissedFeedback(undefined);
    const timeout = window.setTimeout(
      () => setDismissedFeedback(latestFeedback.eventNumber),
      latestFeedback.priority === 'critical' ? 10_000 : 6_500,
    );
    return () => window.clearTimeout(timeout);
  }, [latestFeedback]);

  useEffect(() => onOpenChange(open || isWelcome), [isWelcome, onOpenChange, open]);

  const acknowledgeAndOpen = (kind: 'inventory' | 'progression') => {
    if (kind === 'inventory') onOpenInventory();
    else onOpenProgression();
    const expected = kind === 'inventory' ? 'inspect_inventory' : 'review_progression';
    if (workspace?.onboarding.currentStep === expected) {
      void run((current) =>
        acknowledgePlayerExperienceStep(apiUrl, expected, current.onboarding.revision),
      );
    }
  };

  return (
    <>
      <button
        className="player-guide-tracker"
        disabled={disabled}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span>{objective?.source === 'daily' ? 'Daily Rhythm' : 'Starville Guide'}</span>
        <strong>{objective?.title ?? 'Open Guide'}</strong>
        <small>
          {objective === null || objective === undefined
            ? (warning ?? 'Journey and help')
            : `${String(objective.progress)}/${String(objective.required)} · ${objective.routeHint}`}
        </small>
      </button>

      {latestFeedback !== undefined && dismissedFeedback !== latestFeedback.eventNumber ? (
        <div
          className={`player-guide-feedback player-guide-feedback--${latestFeedback.priority}`}
          role={latestFeedback.priority === 'critical' ? 'alert' : 'status'}
          aria-live={latestFeedback.priority === 'critical' ? 'assertive' : 'polite'}
        >
          <strong>{latestFeedback.title}</strong>
          <span>{latestFeedback.message}</span>
          <button
            aria-label="Dismiss notification"
            type="button"
            onClick={() => setDismissedFeedback(latestFeedback.eventNumber)}
          >
            ×
          </button>
        </div>
      ) : null}

      {open || isWelcome ? (
        <GameModalPortal portal={portal} {...(isWelcome ? {} : { onClose: () => setOpen(false) })}>
          <div className="world-overlay player-guide-overlay" role="presentation">
            <section
              aria-labelledby="player-guide-title"
              aria-modal="true"
              className="player-guide-dialog"
              role="dialog"
            >
              <header>
                <div>
                  <p className="game-kicker">
                    {isWelcome ? 'Welcome, Starvillian' : 'Player Guide'}
                  </p>
                  <h2 id="player-guide-title">
                    {isWelcome
                      ? 'Your first day starts in Lantern Square'
                      : 'Your Starville rhythm'}
                  </h2>
                </div>
                {isWelcome ? null : (
                  <button
                    aria-label="Close Player Guide"
                    type="button"
                    onClick={() => setOpen(false)}
                  >
                    ×
                  </button>
                )}
              </header>

              {isWelcome ? (
                <div className="player-guide-welcome">
                  <p>
                    Follow one clear objective at a time through your home, first harvest,
                    production, the General Store, progression, housing, and Daily Rhythm.
                  </p>
                  <ul>
                    <li>Real gameplay actions provide progress evidence.</li>
                    <li>DUST is off-chain game currency and never withdrawable.</li>
                    <li>You can pause guidance without losing progress.</li>
                  </ul>
                  <div className="player-guide-actions">
                    <button
                      autoFocus
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void run((current) =>
                          startPlayerOnboarding(apiUrl, current.onboarding.revision),
                        )
                      }
                    >
                      Start guided journey
                    </button>
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void run(async (current) => {
                          const started = await startPlayerOnboarding(
                            apiUrl,
                            current.onboarding.revision,
                          );
                          return updatePlayerGuidePreferences(apiUrl, {
                            minimized: true,
                            reducedGuidance: true,
                            expectedRevision: started.onboarding.revision,
                          });
                        }).then(() => setOpen(false))
                      }
                    >
                      Explore first
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <nav aria-label="Player Guide sections" className="player-guide-tabs">
                    {(['journey', 'daily', 'help'] as const).map((key) => (
                      <button
                        aria-current={tab === key ? 'page' : undefined}
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                      >
                        {key === 'journey' ? 'Journey' : key === 'daily' ? 'Daily Rhythm' : 'Help'}
                      </button>
                    ))}
                  </nav>

                  {warning === undefined ? null : <p className="player-guide-warning">{warning}</p>}

                  {tab === 'journey' && workspace !== undefined ? (
                    <div className="player-guide-content">
                      <section className="player-guide-current">
                        <p className="game-kicker">Current objective</p>
                        <h3>{objective?.title ?? 'Core journey complete'}</h3>
                        <p>{objective?.instruction ?? 'Daily Rhythm and Help remain available.'}</p>
                        {objective == null ? null : (
                          <div
                            aria-label={`${objective.title} progress`}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={progressPercent(objective.progress, objective.required)}
                            className="player-guide-progress"
                            role="progressbar"
                          >
                            <span
                              style={{
                                width: `${String(progressPercent(objective.progress, objective.required))}%`,
                              }}
                            />
                          </div>
                        )}
                        <small>{objective?.routeHint}</small>
                        <div className="player-guide-actions">
                          {workspace.onboarding.currentStep === 'inspect_inventory' ? (
                            <button type="button" onClick={() => acknowledgeAndOpen('inventory')}>
                              Open Inventory
                            </button>
                          ) : null}
                          {workspace.onboarding.currentStep === 'review_progression' ? (
                            <button type="button" onClick={() => acknowledgeAndOpen('progression')}>
                              Open My Journey
                            </button>
                          ) : null}
                          {workspace.onboarding.currentStep === 'review_home_visits' ? (
                            <button
                              type="button"
                              onClick={() =>
                                void run((current) =>
                                  acknowledgePlayerExperienceStep(
                                    apiUrl,
                                    'review_home_visits',
                                    current.onboarding.revision,
                                  ),
                                )
                              }
                            >
                              Mark settings reviewed
                            </button>
                          ) : null}
                          <button type="button" onClick={() => void refresh()}>
                            Refresh progress
                          </button>
                        </div>
                      </section>
                      <ol className="player-guide-step-list">
                        {workspace.onboarding.steps.map((step) => (
                          <li data-status={step.status} key={step.key}>
                            <span aria-hidden="true">
                              {step.status === 'completed'
                                ? '✓'
                                : step.status === 'skipped'
                                  ? '–'
                                  : '•'}
                            </span>
                            <div>
                              <strong>{step.title}</strong>
                              <small>{step.chapter.replaceAll('_', ' ')}</small>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className="player-guide-actions player-guide-actions--secondary">
                        <button
                          disabled={busy || workspace.onboarding.status === 'completed'}
                          type="button"
                          onClick={() =>
                            void run((current) =>
                              setPlayerOnboardingActivity(
                                apiUrl,
                                current.onboarding.status === 'paused' ? 'resume' : 'pause',
                                current.onboarding.revision,
                              ),
                            )
                          }
                        >
                          {workspace.onboarding.status === 'paused'
                            ? 'Resume guidance'
                            : 'Pause guidance'}
                        </button>
                        {currentStep?.optional === true ? (
                          <button
                            disabled={busy}
                            type="button"
                            onClick={() =>
                              void run((current) =>
                                skipOptionalPlayerOnboarding(apiUrl, current.onboarding.revision),
                              )
                            }
                          >
                            Skip optional social step
                          </button>
                        ) : null}
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            void run((current) =>
                              requestPlayerExperienceRecovery(
                                apiUrl,
                                currentRecoveryReason(current),
                                current.onboarding.revision,
                              ),
                            )
                          }
                        >
                          I’m stuck
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {tab === 'daily' && workspace !== undefined ? (
                    <div className="player-guide-content">
                      <p>
                        {workspace.daily.completedCount}/3 complete · resets{' '}
                        {new Date(workspace.daily.resetAt).toLocaleString()} · UTC authority
                      </p>
                      <div className="player-guide-daily-grid">
                        {workspace.daily.objectives.map((daily) => (
                          <article key={daily.assignmentId} data-status={daily.status}>
                            <span>{daily.category.replaceAll('_', ' ')}</span>
                            <h3>{daily.title}</h3>
                            <p>{daily.description}</p>
                            <strong>
                              {daily.progress}/{daily.required}
                            </strong>
                            <small>{daily.rewardLabel}</small>
                          </article>
                        ))}
                      </div>
                      <p className="player-guide-economy-note">
                        Daily v1 grants a non-economic completion mark: 0 DUST and 0 XP.
                      </p>
                      <div className="player-guide-actions">
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            void run((current) =>
                              refreshPlayerDailyObjectives(
                                apiUrl,
                                current.daily.assignmentRevision,
                              ),
                            )
                          }
                        >
                          Refresh daily authority
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {tab === 'help' && workspace !== undefined ? (
                    <div className="player-guide-content player-guide-help">
                      {workspace.guide.map((entry) => (
                        <details key={entry.key}>
                          <summary>{entry.title}</summary>
                          <p>{entry.summary}</p>
                        </details>
                      ))}
                      <label>
                        <input
                          checked={workspace.guidePreferences.reducedGuidance}
                          type="checkbox"
                          onChange={(event) =>
                            void run((current) =>
                              updatePlayerGuidePreferences(apiUrl, {
                                minimized: current.guidePreferences.minimized,
                                reducedGuidance: event.target.checked,
                                expectedRevision: current.onboarding.revision,
                              }),
                            )
                          }
                        />
                        Reduce world guidance and keep text hints
                      </label>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </GameModalPortal>
      ) : null}
    </>
  );
}
