import type { AdminPermissionKey } from '@starville/admin-auth';
import type { AdminProgressionWorkspace } from '../lib/progression-api';
import {
  progressionCorrectionAction,
  progressionCorrectionApplyAction,
  progressionCurveActivateAction,
  progressionCurveSuccessorAction,
  progressionCurveValidateAction,
  progressionLiveOpsAction,
  progressionPresentationAction,
  progressionReconciliationAction,
  progressionSimulationAction,
  progressionSuccessorAction,
  progressionTransitionAction,
} from '../app/actions/progression';

function text(record: Record<string, unknown>, key: string, fallback = '—'): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}
function numberValue(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === 'number' ? value : fallback;
}
function booleanValue(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}
function objectValue(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function arrayValue(
  record: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
    : [];
}
function permission(permissions: readonly AdminPermissionKey[], key: AdminPermissionKey): boolean {
  return permissions.includes(key);
}

function SuccessorForm({
  kind,
  definitionId,
  versionId,
  canManage,
}: {
  readonly kind: 'skill' | 'xp_rule' | 'unlock' | 'quest_chain' | 'achievement';
  readonly definitionId: string;
  readonly versionId: string;
  readonly canManage: boolean;
}) {
  if (!canManage) return null;
  return (
    <details>
      <summary>Create immutable successor</summary>
      <form action={progressionSuccessorAction} className="progression-admin-form">
        <input name="kind" type="hidden" value={kind} />
        <input name="definitionId" type="hidden" value={definitionId} />
        <input name="expectedVersionId" type="hidden" value={versionId} />
        <label>
          Structured overrides (JSON)
          <textarea defaultValue="{}" name="definition" required rows={3} />
        </label>
        <label>
          Reason
          <input minLength={12} name="reason" required />
        </label>
        <button type="submit">Create draft successor</button>
      </form>
    </details>
  );
}

export function ProgressionAdminDashboard({
  workspace,
  permissions,
  notice,
}: {
  readonly workspace: AdminProgressionWorkspace;
  readonly permissions: readonly AdminPermissionKey[];
  readonly notice?: string;
}) {
  const liveOps = workspace.liveOps;
  const skillCurve = workspace.curves.find((curve) => text(curve, 'kind') === 'skill');
  const thresholds = skillCurve === undefined ? [] : arrayValue(skillCurve, 'thresholds');
  const thresholdCsv = thresholds
    .map((threshold) => numberValue(threshold, 'cumulativeXp'))
    .join(',');
  const telemetry = workspace.telemetry;

  return (
    <main className="operations-page progression-admin" aria-labelledby="progression-admin-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Gameplay · server authority</p>
          <h1 id="progression-admin-title">Progression operations</h1>
          <p>
            Inspect versioned skills, XP rules, curves, unlocks, quest chains, achievements, titles,
            player projections, reconciliation, and bounded live-ops controls.
          </p>
        </div>
        <span className="state-chip state-chip--active">Phase 11D · local configuration</span>
      </header>
      {notice === undefined ? null : (
        <p className="operations-notice" role="status">
          {notice.replaceAll('-', ' ')}
        </p>
      )}

      <nav aria-label="Progression administration" className="avatar-workflow-links detail-card">
        <a href="#skills">Skills</a>
        <a href="#curves">Level curves</a>
        <a href="#rules">XP rules</a>
        <a href="#unlocks">Unlocks</a>
        <a href="#quests">Quest chains</a>
        <a href="#achievements">Achievements</a>
        <a href="#titles">Titles</a>
        <a href="#players">Player progress</a>
        <a href="#live-ops">Live Ops</a>
      </nav>

      <section className="economy-metrics-grid" aria-label="Progression telemetry">
        <article className="economy-metric-card">
          <span>XP events · 24h</span>
          <strong>{numberValue(telemetry, 'xpEvents24h').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Pending rewards</span>
          <strong>{numberValue(telemetry, 'pendingRewards').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Open reconciliation</span>
          <strong>{numberValue(telemetry, 'openReconciliation').toLocaleString()}</strong>
        </article>
        <article className="economy-metric-card">
          <span>Velocity signals</span>
          <strong>{numberValue(telemetry, 'velocitySignals').toLocaleString()}</strong>
        </article>
      </section>

      <section className="detail-card" id="skills">
        <h2>Skills and player distributions</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Lifecycle</th>
                <th>Cap / curve</th>
                <th>Players</th>
                <th>Successor</th>
              </tr>
            </thead>
            <tbody>
              {workspace.skills.map((skill) => {
                const active = objectValue(skill, 'activeVersion');
                return (
                  <tr key={text(skill, 'id')}>
                    <td>
                      <strong>{text(skill, 'name')}</strong>
                      <small>
                        {text(skill, 'key')} ·{' '}
                        {booleanValue(skill, 'released') ? 'released' : 'future/hidden'}
                      </small>
                    </td>
                    <td>
                      {text(active, 'status')} v{numberValue(active, 'version')}
                    </td>
                    <td>
                      {numberValue(active, 'maximumLevel')} levels
                      <small>{text(active, 'curveVersionId')}</small>
                    </td>
                    <td>{numberValue(skill, 'playerCount')}</td>
                    <td>
                      <SuccessorForm
                        canManage={permission(permissions, 'progression.skills.manage')}
                        definitionId={text(skill, 'id')}
                        kind="skill"
                        versionId={text(active, 'id')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-card" id="curves">
        <h2>XP curves and impact simulation</h2>
        <p>
          Active versions remain immutable. Simulations and activation never migrate existing
          players; earned progress stays pinned to its curve version.
        </p>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Curve</th>
                <th>Status</th>
                <th>Cap</th>
                <th>Growth</th>
              </tr>
            </thead>
            <tbody>
              {workspace.curves.map((curve) => (
                <tr key={text(curve, 'id')}>
                  <td>
                    <strong>{text(curve, 'name')}</strong>
                    <small>
                      {text(curve, 'key')} · v{numberValue(curve, 'version')}
                    </small>
                  </td>
                  <td>{text(curve, 'status')}</td>
                  <td>{numberValue(curve, 'maximumLevel')}</td>
                  <td>
                    {arrayValue(curve, 'thresholds')
                      .map((entry) => numberValue(entry, 'cumulativeXp'))
                      .join(' → ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {permission(permissions, 'progression.curves.manage') && skillCurve !== undefined ? (
          <div className="detail-grid">
            <form action={progressionSimulationAction} className="progression-admin-form">
              <h3>Simulate time-to-level</h3>
              <label>
                Thresholds
                <input defaultValue={thresholdCsv} name="thresholds" required />
              </label>
              <label>
                Events / day
                <input defaultValue="12" min="1" name="eventsPerDay" type="number" />
              </label>
              <label>
                XP / event
                <input defaultValue="8" min="1" name="xpPerEvent" type="number" />
              </label>
              <label>
                Multiplier
                <input
                  defaultValue="1"
                  max="2"
                  min="0.5"
                  name="multiplier"
                  step="0.05"
                  type="number"
                />
              </label>
              <label>
                Players
                <input defaultValue="1000" min="1" name="playerCount" type="number" />
              </label>
              <button type="submit">Run non-mutating simulation</button>
            </form>
            <form action={progressionCurveSuccessorAction} className="progression-admin-form">
              <h3>Create curve successor</h3>
              <input name="expectedVersionId" type="hidden" value={text(skillCurve, 'id')} />
              <label>
                Name
                <input
                  defaultValue={`${text(skillCurve, 'name')} successor`}
                  name="publicName"
                  required
                />
              </label>
              <label>
                Thresholds
                <input defaultValue={thresholdCsv} name="thresholds" required />
              </label>
              <label>
                Reason
                <input minLength={12} name="reason" required />
              </label>
              <button type="submit">Create draft</button>
            </form>
            <form action={progressionCurveValidateAction} className="progression-admin-form">
              <h3>Validate curve draft</h3>
              <label>
                Version UUID
                <input name="versionId" required />
              </label>
              <label>
                Expected revision
                <input defaultValue="1" min="1" name="expectedRevision" type="number" />
              </label>
              <label>
                Reason
                <input minLength={12} name="reason" required />
              </label>
              <button type="submit">Run blocking validation</button>
            </form>
            <form action={progressionCurveActivateAction} className="progression-admin-form">
              <h3>Activate validated curve</h3>
              <label>
                Validated version UUID
                <input name="versionId" required />
              </label>
              <label>
                Expected revision
                <input defaultValue="2" min="1" name="expectedRevision" type="number" />
              </label>
              <label>
                Review reason
                <input minLength={12} name="reason" required />
              </label>
              <button type="submit">Activate with no player migration</button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="detail-card" id="rules">
        <h2>Trusted-event XP rules</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Source</th>
                <th>XP</th>
                <th>Recent grants</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {workspace.xpRules.map((rule) => (
                <tr key={text(rule, 'id')}>
                  <td>
                    <strong>{text(rule, 'key')}</strong>
                    <small>{booleanValue(rule, 'enabled') ? 'enabled' : 'disabled'}</small>
                  </td>
                  <td>{text(rule, 'sourceEvent')}</td>
                  <td>
                    {numberValue(rule, 'baseXp')} + {numberValue(rule, 'perUnitXp')} / unit · cap{' '}
                    {numberValue(rule, 'eventCap')}
                  </td>
                  <td>{numberValue(rule, 'recentGrantCount')}</td>
                  <td>
                    <SuccessorForm
                      canManage={permission(permissions, 'progression.xp_rules.manage')}
                      definitionId={text(rule, 'id')}
                      kind="xp_rule"
                      versionId={text(rule, 'id')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-card" id="unlocks">
        <h2>Unlock requirements and grandfathering</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Unlock</th>
                <th>Target</th>
                <th>Requirement</th>
                <th>Grants</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {workspace.unlocks.map((unlock) => (
                <tr key={text(unlock, 'id')}>
                  <td>
                    <strong>{text(unlock, 'name')}</strong>
                    <small>
                      {text(unlock, 'type')} · {text(unlock, 'grandfatherPolicy')}
                    </small>
                  </td>
                  <td>{text(unlock, 'targetKey', text(unlock, 'targetId'))}</td>
                  <td>
                    Skill {numberValue(unlock, 'skillLevel') || '—'} · Player{' '}
                    {numberValue(unlock, 'playerLevel') || '—'}
                  </td>
                  <td>{numberValue(unlock, 'grantCount')}</td>
                  <td>
                    <SuccessorForm
                      canManage={permission(permissions, 'progression.unlocks.manage')}
                      definitionId={text(unlock, 'id')}
                      kind="unlock"
                      versionId={text(unlock, 'activeVersionId')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-card" id="quests">
        <h2>Starville Beginnings quest chains</h2>
        {workspace.questChains.map((chain) => (
          <article className="progression-admin-chain" key={text(chain, 'id')}>
            <h3>
              {text(chain, 'name')} · v{numberValue(chain, 'version')}
            </h3>
            <p>{text(chain, 'rewardSummary')}</p>
            <ol>
              {arrayValue(chain, 'quests').map((quest) => (
                <li key={text(quest, 'questId')}>
                  Chapter {numberValue(quest, 'sequence')} · {text(quest, 'questId')}
                  <small>Prerequisite: {text(quest, 'prerequisiteQuestId', 'none')}</small>
                </li>
              ))}
            </ol>
            <SuccessorForm
              canManage={permission(permissions, 'progression.quests.manage')}
              definitionId={text(chain, 'id')}
              kind="quest_chain"
              versionId={text(chain, 'activeVersionId')}
            />
          </article>
        ))}
      </section>

      <section className="detail-card" id="achievements">
        <h2>Non-repeatable achievements</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Achievement</th>
                <th>Criteria</th>
                <th>Visibility</th>
                <th>Completion / reward</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {workspace.achievements.map((achievement) => (
                <tr key={text(achievement, 'id')}>
                  <td>
                    <strong>{text(achievement, 'name')}</strong>
                    <small>{text(achievement, 'category')}</small>
                  </td>
                  <td>
                    {text(achievement, 'criteriaType')} · {numberValue(achievement, 'target')}
                  </td>
                  <td>{booleanValue(achievement, 'hidden') ? 'hidden until earned' : 'visible'}</td>
                  <td>
                    {numberValue(achievement, 'completionCount')} complete ·{' '}
                    {numberValue(achievement, 'blockedRewardCount')} blocked
                  </td>
                  <td>
                    <SuccessorForm
                      canManage={permission(permissions, 'progression.achievements.manage')}
                      definitionId={text(achievement, 'id')}
                      kind="achievement"
                      versionId={text(achievement, 'activeVersionId')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-card" id="titles">
        <h2>Titles, badges, and historical ownership</h2>
        <p>Disabling presentation clears active selection but never deletes earned ownership.</p>
        <div className="progression-admin-presentations">
          {[
            ...workspace.titles.map((entry) => ({ kind: 'title' as const, entry })),
            ...workspace.badges.map((entry) => ({ kind: 'badge' as const, entry })),
          ].map(({ kind, entry }) => (
            <article key={`${kind}-${text(entry, 'id')}`}>
              <strong>{text(entry, 'name')}</strong>
              <small>
                {text(entry, 'key')} ·{' '}
                {kind === 'title' ? text(entry, 'rarity') : text(entry, 'iconRef')}
              </small>
              <span>
                {numberValue(entry, 'ownerCount')} owners ·{' '}
                {numberValue(entry, kind === 'title' ? 'equippedCount' : 'selectedCount')} selected
              </span>
              {permission(permissions, 'progression.titles.manage') ? (
                <details>
                  <summary>Update presentation</summary>
                  <form action={progressionPresentationAction} className="progression-admin-form">
                    <input name="kind" type="hidden" value={kind} />
                    <input name="definitionId" type="hidden" value={text(entry, 'id')} />
                    <input
                      name="expectedRevision"
                      type="hidden"
                      value={numberValue(entry, 'configurationRevision', 1)}
                    />
                    <label>
                      Name
                      <input defaultValue={text(entry, 'name')} name="displayName" required />
                    </label>
                    <label>
                      Description
                      <textarea
                        defaultValue={text(entry, 'description')}
                        name="description"
                        required
                      />
                    </label>
                    {kind === 'title' ? (
                      <label>
                        Rarity
                        <select defaultValue={text(entry, 'rarity')} name="rarity">
                          <option value="common">Common</option>
                          <option value="uncommon">Uncommon</option>
                          <option value="rare">Rare</option>
                        </select>
                      </label>
                    ) : (
                      <label>
                        Icon key
                        <input defaultValue={text(entry, 'iconRef')} name="iconRef" required />
                      </label>
                    )}
                    <label>
                      <input
                        defaultChecked={booleanValue(entry, 'enabled')}
                        name="enabled"
                        type="checkbox"
                      />{' '}
                      Enabled
                    </label>
                    <label>
                      <input
                        defaultChecked={booleanValue(entry, 'visible')}
                        name="visible"
                        type="checkbox"
                      />{' '}
                      Visible
                    </label>
                    <label>
                      Reason
                      <input minLength={12} name="reason" required />
                    </label>
                    <button type="submit">Update without deleting ownership</button>
                  </form>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="detail-card" id="players">
        <h2>Player inspection, corrections, and reconciliation</h2>
        <p>
          Search with <code>?wallet=…</code> to load the owner-private projection. Corrections
          create a preview first and apply only as compensating append-only XP events.
        </p>
        {workspace.player === null ? (
          <p>No player selected.</p>
        ) : (
          <pre className="progression-admin-json">{JSON.stringify(workspace.player, null, 2)}</pre>
        )}
        <div className="detail-grid">
          {permission(permissions, 'progression.reconciliation.manage') ? (
            <form action={progressionReconciliationAction} className="progression-admin-form">
              <h3>Queue reconciliation</h3>
              <label>
                Wallet
                <input name="wallet" required />
              </label>
              <label>
                Check
                <select name="type">
                  <option value="full_player">Full player</option>
                  <option value="levels">Levels</option>
                  <option value="unlocks">Unlocks</option>
                  <option value="pending_rewards">Pending rewards</option>
                  <option value="velocity">Velocity</option>
                </select>
              </label>
              <label>
                Priority
                <input defaultValue="50" max="100" min="1" name="priority" type="number" />
              </label>
              <label>
                Evidence / reason
                <textarea minLength={20} name="reason" required />
              </label>
              <button type="submit">Queue bounded check</button>
            </form>
          ) : null}
          {permission(permissions, 'progression.corrections.manage') ? (
            <>
              <form action={progressionCorrectionAction} className="progression-admin-form">
                <h3>Preview correction</h3>
                <label>
                  Wallet
                  <input name="wallet" required />
                </label>
                <label>
                  Skill UUID (blank = Player Level)
                  <input name="skillDefinitionId" />
                </label>
                <label>
                  Compensating XP delta
                  <input max="10000" min="-10000" name="delta" required type="number" />
                </label>
                <label>
                  Expected progression revision
                  <input min="1" name="expectedRevision" required type="number" />
                </label>
                <label>
                  Evidence / reason
                  <textarea minLength={20} name="reason" required />
                </label>
                <button type="submit">Create impact preview</button>
              </form>
              <form action={progressionCorrectionApplyAction} className="progression-admin-form">
                <h3>Apply reviewed correction</h3>
                <label>
                  Correction UUID
                  <input name="correctionId" required />
                </label>
                <label>
                  Expected progression revision
                  <input min="1" name="expectedRevision" required type="number" />
                </label>
                <label>
                  Review reason
                  <textarea minLength={20} name="reason" required />
                </label>
                <button type="submit">Apply compensating event</button>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <section className="detail-card" id="live-ops">
        <h2>Independent progression live-ops controls</h2>
        {permission(permissions, 'progression.live_ops.manage') ? (
          <form action={progressionLiveOpsAction} className="progression-admin-liveops">
            <input
              name="expectedRevision"
              type="hidden"
              value={numberValue(liveOps, 'configuration_revision', 1)}
            />
            {(
              [
                ['xpGrantsEnabled', 'xp_grants_enabled', 'XP grants'],
                ['farmingXpEnabled', 'farming_xp_enabled', 'Farming XP'],
                ['cookingXpEnabled', 'cooking_xp_enabled', 'Cooking XP'],
                ['craftingXpEnabled', 'crafting_xp_enabled', 'Crafting XP'],
                ['levelRewardsEnabled', 'level_rewards_enabled', 'Level rewards'],
                ['questRewardsEnabled', 'quest_rewards_enabled', 'Quest rewards'],
                ['achievementRewardsEnabled', 'achievement_rewards_enabled', 'Achievement rewards'],
                ['unlockGrantsEnabled', 'unlock_grants_enabled', 'Unlock grants'],
              ] as const
            ).map(([formKey, stateKey, label]) => (
              <label key={formKey}>
                <input
                  defaultChecked={booleanValue(liveOps, stateKey)}
                  name={formKey}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
            <label>
              Bounded multiplier
              <input
                defaultValue={numberValue(liveOps, 'xp_multiplier', 1)}
                max="2"
                min="0.5"
                name="multiplier"
                step="0.05"
                type="number"
              />
            </label>
            <label>
              Starts
              <input name="multiplierStartsAt" type="datetime-local" />
            </label>
            <label>
              Ends
              <input name="multiplierEndsAt" type="datetime-local" />
            </label>
            <label>
              Read-only maintenance message
              <input
                defaultValue={text(
                  liveOps,
                  'maintenance_message',
                  'Progression is temporarily paused. Earned history remains available.',
                )}
                name="maintenanceMessage"
                required
              />
            </label>
            <label>
              Reason
              <input minLength={12} name="reason" required />
            </label>
            <button type="submit">Update live-ops controls</button>
          </form>
        ) : (
          <p>Read-only. A progression live-ops permission is required to change grants.</p>
        )}
      </section>

      <section className="detail-card">
        <h2>Append-only administration audit</h2>
        <ul className="cozy-definition-list">
          {workspace.audit.map((event) => (
            <li key={text(event, 'id')}>
              <strong>{text(event, 'action').replaceAll('_', ' ')}</strong>
              <span>
                {text(event, 'targetType')} · {text(event, 'reason')} · {text(event, 'createdAt')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {permission(permissions, 'progression.skills.manage') ? (
        <section className="detail-card">
          <h2>Draft lifecycle transition</h2>
          <form action={progressionTransitionAction} className="progression-admin-form">
            <label>
              Configuration kind
              <select name="kind">
                <option value="skill">Skill</option>
                <option value="xp_rule">XP rule</option>
                <option value="unlock">Unlock</option>
                <option value="quest_chain">Quest chain</option>
                <option value="achievement">Achievement</option>
              </select>
            </label>
            <label>
              Version UUID
              <input name="versionId" required />
            </label>
            <label>
              Expected revision
              <input min="1" name="expectedRevision" required type="number" />
            </label>
            <label>
              Transition
              <select name="transition">
                <option value="validate">Validate</option>
                <option value="activate">Activate reviewed successor</option>
              </select>
            </label>
            <label>
              Reason
              <input minLength={12} name="reason" required />
            </label>
            <button type="submit">Record lifecycle transition</button>
          </form>
          <p>
            <strong>Immutable warning:</strong> active and historical versions cannot be edited or
            deleted. Activation supersedes through the canonical pointer and preserves pinned player
            history.
          </p>
        </section>
      ) : null}
    </main>
  );
}
