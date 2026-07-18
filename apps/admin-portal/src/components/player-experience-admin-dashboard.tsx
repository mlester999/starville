import Link from 'next/link';
import type { AdminPermissionKey } from '@starville/admin-auth';

import {
  playerExperienceCorrectionAction,
  playerExperienceDailyPolicySuccessorAction,
} from '../app/actions/player-experience';
import type { AdminPlayerExperienceWorkspace } from '../lib/player-experience-api';

function can(permissions: readonly string[], permission: AdminPermissionKey) {
  return permissions.includes(permission);
}
function string(value: unknown, fallback = '—') {
  return typeof value === 'string' ? value : fallback;
}
function number(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback;
}
function boolean(value: unknown) {
  return value === true ? 'Yes' : 'No';
}

export function PlayerExperienceAdminDashboard({
  workspace,
  permissions,
  notice,
}: Readonly<{
  workspace: AdminPlayerExperienceWorkspace;
  permissions: readonly string[];
  notice?: string;
}>) {
  return (
    <main className="operations-page" aria-labelledby="player-experience-admin-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Guided early-game operations</p>
          <h1 id="player-experience-admin-title">Player Experience</h1>
          <p>
            Inspect onboarding adoption, authoritative drop-off evidence, Daily Rhythm readiness,
            semantic world guidance, recovery, and aggregate telemetry. This surface has no
            complete-all control and cannot edit DUST, inventory, XP, or canonical quests.
          </p>
        </div>
        <span className="permission-badge">
          Observed {new Date(workspace.generatedAt).toLocaleString('en', { timeZone: 'UTC' })} UTC
        </span>
      </header>

      {notice === undefined ? null : (
        <p className="status-banner" role="status" aria-live="polite">
          {notice.replaceAll('-', ' ')}
        </p>
      )}

      <section className="operations-summary-grid" aria-label="Onboarding funnel">
        {Object.entries(workspace.funnel).map(([key, value]) => (
          <article key={key}>
            <span>{key.replaceAll(/([A-Z])/g, ' $1')}</span>
            <strong>{value === null ? 'Not enough data' : String(value)}</strong>
          </article>
        ))}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Immutable active policies</p>
            <h2>Onboarding and Daily Rhythm</h2>
          </div>
        </header>
        <dl className="detail-grid">
          <div>
            <dt>Onboarding version</dt>
            <dd>{string(workspace.onboardingVersion['key'])}</dd>
          </div>
          <div>
            <dt>Starter quest projection</dt>
            <dd>{string(workspace.onboardingVersion['starterQuestChainKey'])}</dd>
          </div>
          <div>
            <dt>Optional-only skip</dt>
            <dd>{boolean(workspace.onboardingVersion['optionalSkipOnly'])}</dd>
          </div>
          <div>
            <dt>Daily policy</dt>
            <dd>{string(workspace.dailyPolicy['key'])}</dd>
          </div>
          <div>
            <dt>Authority timezone</dt>
            <dd>{string(workspace.dailyPolicy['timezone'])}</dd>
          </div>
          <div>
            <dt>Economic reward</dt>
            <dd>0 DUST · 0 XP</dd>
          </div>
          <div>
            <dt>Published candidate</dt>
            <dd>{boolean(workspace.dailyPolicy['candidatePublished'])}</dd>
          </div>
        </dl>
        <div className="operations-columns">
          <div className="detail-card">
            <h3>Controlled policy history</h3>
            <ul className="service-list">
              {workspace.dailyPolicyVersions.map((row) => (
                <li key={string(row['id'])}>
                  <div>
                    <strong>{string(row['key'])}</strong>
                    <span>{string(row['status'])}</span>
                  </div>
                  <small>
                    Version {number(row['version'])} · revision {number(row['revision'])} ·{' '}
                    {number(row['objectiveCount'])} pinned objectives
                  </small>
                </li>
              ))}
            </ul>
            {can(permissions, 'player_experience.policy.manage') ? (
              <form action={playerExperienceDailyPolicySuccessorAction}>
                <input
                  name="basePolicyVersionId"
                  type="hidden"
                  value={string(workspace.dailyPolicy['id'])}
                />
                <input
                  name="expectedRevision"
                  type="hidden"
                  value={number(workspace.dailyPolicy['revision'], 1)}
                />
                <input name="effectiveAt" type="hidden" value={new Date().toISOString()} />
                <input
                  name="reason"
                  aria-label="Daily policy successor reason"
                  defaultValue="Create a reviewed Daily Rhythm policy successor without changing the active player policy."
                  minLength={20}
                  maxLength={500}
                  required
                />
                <button type="submit">Create draft policy successor</button>
              </form>
            ) : null}
          </div>
          <div className="detail-card">
            <h3>Canonical starter questline</h3>
            <p>
              {string(workspace.starterQuestline['name'])} · version{' '}
              {number(workspace.starterQuestline['version'])} ·{' '}
              {string(workspace.starterQuestline['validationStatus']).replaceAll('_', ' ')}
            </p>
            <p>{string(workspace.starterQuestline['rewardSummary'])}</p>
            <small>
              Active quest definitions remain owned by the canonical progression system; this area
              is inspection-only.
            </small>
          </div>
        </div>
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Isolated validation</p>
            <h2>Phase 12A Game Test</h2>
          </div>
        </header>
        <p>
          {number(workspace.gameTest['scenarioCount'])} deterministic onboarding scenarios are
          backed by {number(workspace.gameTest['fixtureCount'])} bounded fixtures through the
          existing AAL2-protected Lantern Square Game Test workflow. Preview state is isolated and
          cannot persist player progress or rewards.
        </p>
        <Link className="button" href="/worlds/lantern-square/editor">
          Open Lantern Square Game Test workflow
        </Link>
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Observed funnel</p>
            <h2>Drop-off by objective</h2>
          </div>
        </header>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sequence</th>
                <th>Chapter</th>
                <th>Step</th>
                <th>Current players</th>
                <th>Completions</th>
              </tr>
            </thead>
            <tbody>
              {workspace.dropOff.map((row) => (
                <tr key={string(row['stepKey'])}>
                  <td>{number(row['sequence'])}</td>
                  <td>{string(row['chapterKey']).replaceAll('_', ' ')}</td>
                  <td>{string(row['stepKey']).replaceAll('_', ' ')}</td>
                  <td>{number(row['currentPlayers'])}</td>
                  <td>{number(row['completionCount'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Server eligibility</p>
            <h2>Daily objectives and guidance readiness</h2>
          </div>
        </header>
        <div className="operations-columns">
          <div className="detail-card">
            <h3>Daily catalog</h3>
            <ul className="service-list">
              {workspace.dailyObjectives.map((row) => (
                <li key={string(row['id'])}>
                  <div>
                    <strong>{string(row['title'])}</strong>
                    <span>{string(row['category'])}</span>
                  </div>
                  <small>
                    {string(row['eventKey'])} · required {number(row['required'])} · solo-safe{' '}
                    {boolean(row['soloSafe'])}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-card">
            <h3>Semantic targets</h3>
            <ul className="service-list">
              {workspace.guidanceReadiness.map((row) => (
                <li key={string(row['id'])}>
                  <div>
                    <strong>{string(row['label'])}</strong>
                    <span className={`state-chip state-chip--${string(row['status'])}`}>
                      {string(row['status'])}
                    </span>
                  </div>
                  <small>{string(row['semanticObjectKey'])}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Evidence-preserving support</p>
            <h2>Player states</h2>
          </div>
        </header>
        {workspace.players.length === 0 ? (
          <p>No player onboarding state matches this bounded query.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Current step</th>
                  <th>Revision</th>
                  <th>Support</th>
                </tr>
              </thead>
              <tbody>
                {workspace.players.map((row) => (
                  <tr key={string(row['playerId'])}>
                    <td>
                      {string(row['displayName'])}
                      <br />
                      <small>{string(row['playerId'])}</small>
                    </td>
                    <td>{string(row['status'])}</td>
                    <td>{string(row['stepKey']).replaceAll('_', ' ')}</td>
                    <td>{number(row['revision'])}</td>
                    <td>
                      {can(permissions, 'player_experience.support') ? (
                        <form action={playerExperienceCorrectionAction}>
                          <input type="hidden" name="playerId" value={string(row['playerId'])} />
                          <input
                            type="hidden"
                            name="expectedRevision"
                            value={number(row['revision'], 1)}
                          />
                          <input type="hidden" name="recoveryId" value="" />
                          <input
                            type="hidden"
                            name="reason"
                            value="Reset UI-only guide preferences after a verified player support request."
                          />
                          <button name="action" type="submit" value="reset_guide_preferences">
                            Reset guide UI
                          </button>
                          {string(row['status']) === 'blocked' ? (
                            <button name="action" type="submit" value="resume_blocked">
                              Resume blocked guide
                            </button>
                          ) : null}
                        </form>
                      ) : (
                        'Read only'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Bounded worker queue</p>
            <h2>Recovery and telemetry</h2>
          </div>
        </header>
        <section className="operations-summary-grid" aria-label="Player experience telemetry">
          {Object.entries(workspace.telemetry).map(([key, value]) => (
            <article key={key}>
              <span>{key.replaceAll(/([A-Z])/g, ' $1')}</span>
              <strong>{String(value)}</strong>
            </article>
          ))}
        </section>
        <ul className="service-list">
          {workspace.recovery.map((row) => (
            <li key={string(row['id'])}>
              <div>
                <strong>{string(row['displayName'])}</strong>
                <span>{string(row['status'])}</span>
              </div>
              <small>
                {string(row['reasonCode'])} · attempt {number(row['attemptCount'])} ·{' '}
                {string(row['createdAt'])}
              </small>
              {can(permissions, 'player_experience.support') &&
              ['investigation_required', 'rejected'].includes(string(row['status'])) ? (
                <form action={playerExperienceCorrectionAction}>
                  <input type="hidden" name="playerId" value={string(row['playerId'])} />
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={number(row['expectedRevision'], 1)}
                  />
                  <input type="hidden" name="recoveryId" value={string(row['id'])} />
                  <input type="hidden" name="action" value="retry_recovery" />
                  <input
                    type="hidden"
                    name="reason"
                    value="Retry this bounded recovery after administrator review of preserved evidence."
                  />
                  <button type="submit">Retry reviewed recovery</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
