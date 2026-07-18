import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import { economyPolicyDraftAction, economyPolicyTransitionAction } from '../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  LifecycleStepper,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { EconomyConfirmAction } from '../../../../components/economy-confirm-action';
import { ConfirmedSubmitButton } from '../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyPolicies } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function dateTimeLocal(value: string): string {
  return new Date(value).toISOString().slice(0, 16);
}

export default async function EconomyPoliciesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly version?: string; readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('economy.settings.read');
  const [query, policies] = await Promise.all([searchParams, loadEconomyPolicies()]);
  const selected =
    policies.items.find((item) => item.id === query.version) ??
    policies.items.find((item) =>
      ['draft', 'validated', 'in_review', 'approved', 'scheduled'].includes(item.status),
    ) ??
    policies.items.find((item) => item.active) ??
    policies.items[0];
  const active = policies.items.find((item) => item.id === policies.activeVersionId);
  const hasOpenDraft = policies.items.some((item) =>
    ['draft', 'validated', 'in_review', 'approved', 'scheduled'].includes(item.status),
  );
  const canEdit = hasAdminPermission(context, 'economy.settings.edit');
  const canPublish = hasAdminPermission(context, 'economy.settings.publish');

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Author bounded DUST policy versions, preview their impact, validate invariants, and route exact revisions through independent approval. No action publishes automatically."
        eyebrow="Versioned economy controls"
        title="Policies"
      />
      <EconomyNotice notice={query.notice} />

      {selected === undefined ? (
        <EmptyState description="No economy policy version is available." title="No policies" />
      ) : (
        <>
          <nav aria-label="Policy versions" className="economy-version-nav">
            {policies.items.map((policy) => (
              <Link
                aria-current={policy.id === selected.id ? 'page' : undefined}
                href={`/economy/policies?version=${policy.id}`}
                key={policy.id}
              >
                v{policy.versionNumber} · {friendlyKey(policy.status)}
                {policy.active ? ' · Active' : ''}
              </Link>
            ))}
          </nav>

          <section className="economy-panel" aria-labelledby="policy-version-heading">
            <div className="economy-panel__heading">
              <div>
                <p className="eyebrow">Selected configuration</p>
                <h2 id="policy-version-heading">Policy v{selected.versionNumber}</h2>
              </div>
              <div className="economy-status-stack">
                <StatusChip value={selected.status} />
                {selected.active ? <StatusChip value="active" /> : null}
              </div>
            </div>
            <LifecycleStepper kind="policy" status={selected.status} />
            <dl className="economy-detail-list economy-detail-list--columns">
              <div>
                <dt>Economy</dt>
                <dd>{selected.economyEnabled ? 'Enabled' : 'Emergency gate closed'}</dd>
              </div>
              <div>
                <dt>Purchases</dt>
                <dd>{selected.purchasesEnabled ? 'Enabled' : 'Paused'}</dd>
              </div>
              <div>
                <dt>Rewards</dt>
                <dd>{selected.rewardsEnabled ? 'Enabled' : 'Paused'}</dd>
              </div>
              <div>
                <dt>Corrections</dt>
                <dd>{selected.correctionsEnabled ? 'Enabled' : 'Paused'}</dd>
              </div>
              <div>
                <dt>Starter grant</dt>
                <dd>{selected.starterGrant.toLocaleString()} DUST</dd>
              </div>
              <div>
                <dt>Beginner protection</dt>
                <dd>{selected.beginnerProtectionHours} hours</dd>
              </div>
              <div>
                <dt>Low-value correction</dt>
                <dd>Up to {selected.lowValueCorrectionLimit.toLocaleString()} DUST</dd>
              </div>
              <div>
                <dt>Second review threshold</dt>
                <dd>{selected.highValueCorrectionLimit.toLocaleString()} DUST</dd>
              </div>
              <div>
                <dt>Reconciliation tolerance</dt>
                <dd>{selected.reconciliationTolerance} DUST</dd>
              </div>
              <div>
                <dt>Purchase request cap</dt>
                <dd>{selected.purchaseRateLimitPerMinute} per minute</dd>
              </div>
              <div>
                <dt>History retention</dt>
                <dd>{selected.historyRetentionDays} days</dd>
              </div>
              <div>
                <dt>Risk review score</dt>
                <dd>{selected.riskReviewThreshold.toFixed(2)} / 100</dd>
              </div>
              <div>
                <dt>Effective time</dt>
                <dd>{formatDate(selected.effectiveAt)}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{selected.revision}</dd>
              </div>
            </dl>
          </section>

          {!hasOpenDraft && canEdit && active !== undefined ? (
            <section className="economy-panel" aria-labelledby="policy-draft-heading">
              <div className="economy-panel__heading">
                <div>
                  <p className="eyebrow">Structured authoring</p>
                  <h2 id="policy-draft-heading">
                    Create policy draft from active v{active.versionNumber}
                  </h2>
                </div>
              </div>
              <p>
                The active policy remains unchanged until a separately reviewed version is
                explicitly published.
              </p>
              <form action={economyPolicyDraftAction} className="economy-form-grid">
                <input name="baseVersionId" type="hidden" value={active.id} />
                <fieldset className="economy-switch-grid economy-form-grid__wide">
                  <legend>Emergency gates</legend>
                  <label className="economy-checkbox">
                    <input
                      defaultChecked={active.economyEnabled}
                      name="economyEnabled"
                      type="checkbox"
                    />{' '}
                    Economy enabled
                  </label>
                  <label className="economy-checkbox">
                    <input
                      defaultChecked={active.purchasesEnabled}
                      name="purchasesEnabled"
                      type="checkbox"
                    />{' '}
                    Purchases enabled
                  </label>
                  <label className="economy-checkbox">
                    <input
                      defaultChecked={active.rewardsEnabled}
                      name="rewardsEnabled"
                      type="checkbox"
                    />{' '}
                    Rewards enabled
                  </label>
                  <label className="economy-checkbox">
                    <input
                      defaultChecked={active.correctionsEnabled}
                      name="correctionsEnabled"
                      type="checkbox"
                    />{' '}
                    Corrections enabled
                  </label>
                </fieldset>
                <label>
                  Starter grant · DUST
                  <input
                    defaultValue={active.starterGrant}
                    max="10000"
                    min="0"
                    name="starterGrant"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Beginner protection · hours
                  <input
                    defaultValue={active.beginnerProtectionHours}
                    max="720"
                    min="0"
                    name="beginnerProtectionHours"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Low-value correction limit · DUST
                  <input
                    defaultValue={active.lowValueCorrectionLimit}
                    max="100000"
                    min="1"
                    name="lowValueCorrectionLimit"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Second-review threshold · DUST
                  <input
                    defaultValue={active.highValueCorrectionLimit}
                    max="1000000"
                    min="1"
                    name="highValueCorrectionLimit"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Purchase cap · requests per minute
                  <input
                    defaultValue={active.purchaseRateLimitPerMinute}
                    max="60"
                    min="1"
                    name="purchaseRateLimitPerMinute"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Retention · days
                  <input
                    defaultValue={active.historyRetentionDays}
                    max="2555"
                    min="30"
                    name="historyRetentionDays"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Risk review threshold · 0–100
                  <input
                    defaultValue={active.riskReviewThreshold}
                    max="100"
                    min="0"
                    name="riskReviewThreshold"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  Planned effective time
                  <input
                    defaultValue={dateTimeLocal(new Date(Date.now() + 3_600_000).toISOString())}
                    name="effectiveAt"
                    required
                    type="datetime-local"
                  />
                </label>
                <div className="economy-form-grid__actions">
                  <button type="submit">Create policy draft</button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="economy-overview-columns" aria-label="Policy validation and preview">
            <article className="economy-panel">
              <div className="economy-panel__heading">
                <div>
                  <p className="eyebrow">Validation</p>
                  <h2>Invariant checks</h2>
                </div>
              </div>
              {selected.validationResults === null ? (
                <p className="economy-unavailable">This exact revision has not been validated.</p>
              ) : (
                <>
                  <StatusChip
                    value={
                      selected.validationResults.valid === false ? 'validation_failed' : 'validated'
                    }
                  />
                  <ul className="economy-check-list">
                    {(selected.validationResults.checks ?? []).map((check) => (
                      <li key={check}>Passed · {friendlyKey(check)}</li>
                    ))}
                    {(selected.validationResults.errors ?? []).map((error) => (
                      <li key={error}>Issue · {error}</li>
                    ))}
                    {(selected.validationResults.warnings ?? []).map((warning) => (
                      <li key={warning}>Review · {warning}</li>
                    ))}
                  </ul>
                </>
              )}
            </article>
            <article className="economy-panel">
              <div className="economy-panel__heading">
                <div>
                  <p className="eyebrow">Planning estimate only</p>
                  <h2>Policy preview</h2>
                </div>
                <StatusChip value="preview_only" />
              </div>
              <dl className="economy-detail-list economy-detail-list--compact">
                <div>
                  <dt>Starter DUST</dt>
                  <dd>{selected.starterGrant}</dd>
                </div>
                <div>
                  <dt>Ordinary earnings</dt>
                  <dd>{selected.rewardsEnabled ? 'Within published source caps' : 'Paused'}</dd>
                </div>
                <div>
                  <dt>Shop purchases</dt>
                  <dd>{selected.purchasesEnabled ? 'Within active offer limits' : 'Paused'}</dd>
                </div>
                <div>
                  <dt>Correction approvals</dt>
                  <dd>
                    Second review at {selected.highValueCorrectionLimit.toLocaleString()} DUST
                  </dd>
                </div>
                <div>
                  <dt>Emergency gates</dt>
                  <dd>
                    {
                      [
                        selected.economyEnabled,
                        selected.purchasesEnabled,
                        selected.rewardsEnabled,
                        selected.correctionsEnabled,
                      ].filter(Boolean).length
                    }{' '}
                    of 4 open
                  </dd>
                </div>
                <div>
                  <dt>Baseline source : sink</dt>
                  <dd>Approximately 1.42 : 1</dd>
                </div>
              </dl>
              <p className="economy-card-note">
                Preview reads the selected version only. It never changes a player balance, active
                shop, or published configuration.
              </p>
            </article>
          </section>

          <section className="economy-panel" aria-labelledby="policy-actions-heading">
            <div className="economy-panel__heading">
              <div>
                <p className="eyebrow">Exact revision checks</p>
                <h2 id="policy-actions-heading">Lifecycle action</h2>
              </div>
            </div>
            <div className="economy-lifecycle-actions">
              {selected.status === 'draft' && canEdit ? (
                <form action={economyPolicyTransitionAction}>
                  <input name="versionId" type="hidden" value={selected.id} />
                  <input name="expectedRevision" type="hidden" value={selected.revision} />
                  <input name="action" type="hidden" value="validate" />
                  <input name="returnTo" type="hidden" value="/economy/policies" />
                  <button type="submit">Validate draft</button>
                </form>
              ) : null}
              {selected.status === 'validated' && canEdit ? (
                <form action={economyPolicyTransitionAction}>
                  <input name="versionId" type="hidden" value={selected.id} />
                  <input name="expectedRevision" type="hidden" value={selected.revision} />
                  <input name="action" type="hidden" value="submit_review" />
                  <input name="returnTo" type="hidden" value="/economy/policies" />
                  <ConfirmedSubmitButton confirmation="Submit this exact validated policy revision for independent review?">
                    Submit for review
                  </ConfirmedSubmitButton>
                </form>
              ) : null}
              {selected.status === 'in_review' && canPublish ? (
                <form action={economyPolicyTransitionAction}>
                  <input name="versionId" type="hidden" value={selected.id} />
                  <input name="expectedRevision" type="hidden" value={selected.revision} />
                  <input name="action" type="hidden" value="approve" />
                  <input name="returnTo" type="hidden" value="/economy/policies" />
                  <ConfirmedSubmitButton confirmation="Approve this exact reviewed policy revision without activating it?">
                    Approve reviewed version
                  </ConfirmedSubmitButton>
                </form>
              ) : null}
              {selected.status === 'approved' && canPublish ? (
                <>
                  <EconomyConfirmAction
                    action={economyPolicyTransitionAction}
                    confirmLabel="Publish now"
                    description="This explicit operation activates the approved policy immediately and supersedes the prior active policy. No recommendation is published automatically."
                    hiddenFields={{
                      versionId: selected.id,
                      expectedRevision: selected.revision,
                      action: 'publish',
                      returnTo: '/economy/policies',
                    }}
                    title={`Publish policy v${selected.versionNumber}?`}
                    triggerLabel="Publish now"
                  />
                  <EconomyConfirmAction
                    action={economyPolicyTransitionAction}
                    confirmLabel="Schedule policy"
                    description="The approved version remains inactive until its effective time. A trusted worker performs the bounded activation."
                    hiddenFields={{
                      versionId: selected.id,
                      expectedRevision: selected.revision,
                      action: 'schedule',
                      returnTo: '/economy/policies',
                    }}
                    title={`Schedule policy v${selected.versionNumber}?`}
                    triggerLabel="Schedule"
                  >
                    <label>
                      Effective time
                      <input
                        defaultValue={dateTimeLocal(selected.effectiveAt)}
                        name="effectiveAt"
                        required
                        type="datetime-local"
                      />
                    </label>
                  </EconomyConfirmAction>
                </>
              ) : null}
              {selected.status === 'scheduled' && canPublish ? (
                <EconomyConfirmAction
                  action={economyPolicyTransitionAction}
                  confirmLabel="Publish immediately"
                  description="This explicitly activates the already approved scheduled policy now."
                  hiddenFields={{
                    versionId: selected.id,
                    expectedRevision: selected.revision,
                    action: 'publish',
                    returnTo: '/economy/policies',
                  }}
                  title={`Publish scheduled policy v${selected.versionNumber} now?`}
                  triggerLabel="Publish now"
                />
              ) : null}
              {selected.status === 'superseded' && canPublish ? (
                <EconomyConfirmAction
                  action={economyPolicyTransitionAction}
                  confirmLabel="Reactivate version"
                  description="This controlled rollback changes only the active policy pointer and audit trail. The historical published version remains immutable."
                  hiddenFields={{
                    versionId: selected.id,
                    expectedRevision: selected.revision,
                    action: 'rollback',
                    returnTo: '/economy/policies',
                  }}
                  title={`Roll back to policy v${selected.versionNumber}?`}
                  tone="danger"
                  triggerLabel="Roll back to this version"
                />
              ) : null}
              {!canEdit && !canPublish ? (
                <p className="economy-unavailable">You have read-only policy access.</p>
              ) : null}
              {selected.status === 'published' ? (
                <p className="economy-unavailable">
                  Published versions are immutable. Create a new draft to change configuration.
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="policy-history-heading">
            <div className="economy-section-heading">
              <div>
                <p className="eyebrow">Immutable history</p>
                <h2 id="policy-history-heading">Policy versions</h2>
              </div>
            </div>
            <div className="economy-table-region">
              <table className="economy-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Revision</th>
                    <th>Effective</th>
                    <th>Created</th>
                    <th>Reviewed</th>
                    <th>Published</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.items.map((policy) => (
                    <tr key={policy.id}>
                      <td data-label="Version">
                        <Link href={`/economy/policies?version=${policy.id}`}>
                          v{policy.versionNumber}
                        </Link>
                      </td>
                      <td data-label="Status">
                        <StatusChip value={policy.status} />
                      </td>
                      <td data-label="Revision">{policy.revision}</td>
                      <td data-label="Effective">{formatDate(policy.effectiveAt)}</td>
                      <td data-label="Created">{formatDate(policy.createdAt)}</td>
                      <td data-label="Reviewed">{formatDate(policy.reviewedAt)}</td>
                      <td data-label="Published">{formatDate(policy.publishedAt)}</td>
                      <td data-label="Active">{policy.active ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
