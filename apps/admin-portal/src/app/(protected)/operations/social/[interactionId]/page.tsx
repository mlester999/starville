import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadSocialInteraction } from '../../../../../lib/realtime/social-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function date(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

export default async function SocialInteractionDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly interactionId: string }>;
}) {
  await requireAuthorizedAdmin('social_interactions.audit.read');
  const { interactionId } = await params;
  const detail = await loadSocialInteraction(interactionId);
  const interaction = detail.interaction;
  const participants =
    interaction.kind === 'gift'
      ? [interaction.sender, interaction.target]
      : [interaction.senderOffer.participant, interaction.targetOffer.participant];

  return (
    <main className="chat-report-detail" aria-labelledby="social-detail-title">
      <Link className="table-link" href="/operations/social">
        ← Back to social interactions
      </Link>
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Protected transfer evidence</p>
          <h1 id="social-detail-title">
            {interaction.kind} {interaction.id.slice(0, 8)}
          </h1>
          <p>
            {participants[0]?.displayName} with {participants[1]?.displayName}
          </p>
        </div>
        <span className={`state-chip state-chip--${interaction.status}`}>{interaction.status}</span>
      </header>
      <div className="chat-report-detail__grid">
        <section className="detail-card">
          <h2>Interaction</h2>
          <dl className="detail-list">
            <div>
              <dt>Type</dt>
              <dd>{interaction.kind}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{date(interaction.createdAt)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{date(interaction.expiresAt)}</dd>
            </div>
            {interaction.kind === 'trade' ? (
              <div>
                <dt>Revision</dt>
                <dd>{interaction.revision}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="detail-card">
          <h2>Immutable receipt</h2>
          {detail.receipt === null ? (
            <p className="card-note">No completed settlement receipt exists.</p>
          ) : (
            <>
              <p>Completed {date(detail.receipt.completedAt)}</p>
              <ul className="service-list">
                {detail.receipt.items.map((item) => (
                  <li key={`${item.fromPresenceId}-${item.itemSlug}`}>
                    <div>
                      <strong>
                        {item.quantity} × {item.name}
                      </strong>
                      <span>
                        {item.fromPresenceId.slice(0, 8)} → {item.toPresenceId.slice(0, 8)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <section className="detail-card">
        <h2>Bounded audit history</h2>
        {detail.audit.length === 0 ? (
          <p className="card-note">No audit events.</p>
        ) : (
          <ol className="chat-moderation-history">
            {detail.audit.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action.replaceAll('_', ' ')}</strong>
                <span>
                  Revision {entry.revision} · {entry.result}
                </span>
                <time dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
