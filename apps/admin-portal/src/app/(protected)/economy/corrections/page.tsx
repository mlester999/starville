import { hasAdminPermission } from '@starville/admin-auth';

import { economyCorrectionAction, economyCorrectionReviewAction } from '../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  friendlyKey,
} from '../../../../components/economy-admin-ui';
import { ConfirmedSubmitButton } from '../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadEconomyCorrections } from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CorrectionQuery {
  readonly playerProfileId?: string;
  readonly delta?: string;
  readonly reconciliation?: string;
  readonly receipt?: string;
  readonly notice?: string;
}

function displayStatus(correction: {
  readonly status: string;
  readonly requiresSecondApproval: boolean;
  readonly firstApproved: boolean;
}): string {
  if (
    ['pending_review', 'awaiting_review'].includes(correction.status) &&
    correction.requiresSecondApproval &&
    correction.firstApproved
  ) {
    return 'awaiting_second_review';
  }
  return correction.status === 'pending_review' ? 'awaiting_review' : correction.status;
}

export default async function EconomyCorrectionsPage({
  searchParams,
}: {
  readonly searchParams: Promise<CorrectionQuery>;
}) {
  const context = await requireAuthorizedAdmin('economy.read');
  const [query, { items }] = await Promise.all([searchParams, loadEconomyCorrections()]);
  const canCreate = hasAdminPermission(context, 'economy.correction.create');
  const canReview = hasAdminPermission(context, 'economy.correction.review');
  const relatedReference = query.reconciliation ?? query.receipt ?? '';

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Request and review signed DUST deltas against verified evidence. Settlement is exactly-once, debits cannot make a balance negative, and high-value changes require independent review."
        eyebrow="Controlled balance repair"
        title="Corrections"
      />
      <EconomyNotice notice={query.notice} />

      <aside className="economy-safety-note" aria-label="Correction authority">
        <strong>Delta-only workflow</strong>
        <p>
          Every request records the before and after balance, reason, administrator, evidence
          reference, approvals, and immutable settlement receipt.
        </p>
      </aside>

      {canCreate ? (
        <section className="economy-panel" aria-labelledby="correction-create-heading">
          <div className="economy-panel__heading">
            <div>
              <p className="eyebrow">Draft → submitted</p>
              <h2 id="correction-create-heading">Create review request</h2>
            </div>
          </div>
          <p>
            Creating this request does not change DUST. Approval and settlement occur through the
            trusted reviewed workflow.
          </p>
          <form action={economyCorrectionAction} className="economy-form-grid">
            <label>
              Player profile UUID
              <input defaultValue={query.playerProfileId ?? ''} name="playerProfileId" required />
            </label>
            <label>
              Signed DUST delta
              <input
                defaultValue={query.delta ?? ''}
                max="1000000"
                min="-1000000"
                name="delta"
                required
                type="number"
              />
            </label>
            <label>
              Reason category
              <select name="reasonCategory">
                <option value="support_repair">Support repair</option>
                <option value="incident_repair">Incident repair</option>
                <option value="migration_repair">Migration repair</option>
                <option value="refund">Refund</option>
              </select>
            </label>
            <label>
              Receipt or reconciliation reference
              <input
                defaultValue={relatedReference}
                maxLength={128}
                minLength={3}
                name="relatedReference"
                required
              />
            </label>
            <label className="economy-form-grid__wide">
              Explanation
              <textarea maxLength={820} minLength={20} name="explanation" required />
            </label>
            <div className="economy-form-grid__actions">
              <ConfirmedSubmitButton confirmation="Submit this signed DUST delta for independent review? No balance changes at this step.">
                Submit correction request
              </ConfirmedSubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="correction-queue-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Separation of duties</p>
            <h2 id="correction-queue-heading">Review queue and settlement history</h2>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            description="No reviewed correction requests are available."
            title="No corrections"
          />
        ) : (
          <div className="economy-correction-list">
            {items.map((correction) => {
              const status = displayStatus(correction);
              const reviewable = [
                'pending_review',
                'awaiting_review',
                'awaiting_second_review',
                'approved',
              ].includes(status);
              return (
                <article className="economy-correction-card" key={correction.id}>
                  <header>
                    <div>
                      <p className="eyebrow">{correction.publicReceiptId}</p>
                      <h3>{correction.displayName}</h3>
                      <small>{correction.playerProfileId}</small>
                    </div>
                    <div className="economy-status-stack">
                      <StatusChip value={correction.delta > 0 ? 'credit' : 'debit'} />
                      <StatusChip value={status} />
                    </div>
                  </header>
                  <p>{correction.explanation}</p>
                  <dl className="economy-detail-list economy-detail-list--columns">
                    <div>
                      <dt>Delta</dt>
                      <dd
                        className={`economy-amount economy-amount--${correction.delta > 0 ? 'credit' : 'debit'}`}
                      >
                        {correction.delta > 0 ? '+' : ''}
                        {correction.delta.toLocaleString()} DUST
                      </dd>
                    </div>
                    <div>
                      <dt>Balance</dt>
                      <dd>
                        {correction.balanceBefore.toLocaleString()} →{' '}
                        {correction.balanceAfter.toLocaleString()} DUST
                      </dd>
                    </div>
                    <div>
                      <dt>Reason</dt>
                      <dd>{friendlyKey(correction.reasonCategory)}</dd>
                    </div>
                    <div>
                      <dt>Requested</dt>
                      <dd>{formatDate(correction.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Second review</dt>
                      <dd>
                        {correction.requiresSecondApproval
                          ? correction.secondApproved
                            ? 'Complete'
                            : 'Required'
                          : 'Not required'}
                      </dd>
                    </div>
                    <div>
                      <dt>Settled</dt>
                      <dd>{formatDate(correction.settledAt)}</dd>
                    </div>
                  </dl>
                  {correction.creatorIsCurrentAdmin && correction.requiresSecondApproval ? (
                    <p className="economy-inline-warning">
                      You created this high-value request and cannot approve it.
                    </p>
                  ) : null}
                  {canReview && reviewable ? (
                    <div className="economy-card-actions">
                      {!correction.creatorIsCurrentAdmin ? (
                        <form action={economyCorrectionReviewAction}>
                          <input name="correctionId" type="hidden" value={correction.id} />
                          <input name="action" type="hidden" value="approve" />
                          <ConfirmedSubmitButton
                            confirmation={
                              correction.requiresSecondApproval && correction.firstApproved
                                ? 'Record the independent second approval? Settlement remains exactly-once.'
                                : 'Approve this reviewed delta? High-value requests still require a separate second reviewer.'
                            }
                          >
                            {correction.requiresSecondApproval && correction.firstApproved
                              ? 'Second approval'
                              : 'Approve'}
                          </ConfirmedSubmitButton>
                        </form>
                      ) : null}
                      <form action={economyCorrectionReviewAction}>
                        <input name="correctionId" type="hidden" value={correction.id} />
                        <input name="action" type="hidden" value="reject" />
                        <ConfirmedSubmitButton confirmation="Reject this correction request and preserve its audit evidence?">
                          Reject
                        </ConfirmedSubmitButton>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
