import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../../lib/auth/authorization';
import { loadCooperativeActivityInstance } from '../../../../../../lib/realtime/cooperative-activity-api';

export const dynamic = 'force-dynamic';

export default async function CooperativeActivityInstancePage({
  params,
}: {
  readonly params: Promise<{ readonly instanceId: string }>;
}) {
  await requireAuthorizedAdmin('cooperative_activities.read');
  const { instanceId } = await params;
  const detail = await loadCooperativeActivityInstance(instanceId);
  const instance = detail.instance;
  return (
    <main className="chat-moderation-page" aria-labelledby="activity-instance-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Read-only run evidence</p>
          <h1 id="activity-instance-title">{instance.activity.name}</h1>
          <p>
            {instance.status} · revision {instance.revision} · {instance.participants.length} locked
            participants
          </p>
        </div>
        <Link href="/operations/activities?view=instances">Back to instances</Link>
      </header>
      <section>
        <h2>Objective progress</h2>
        <ol className="audit-list">
          {instance.objectives.map((objective) => (
            <li key={objective.key}>
              <strong>{objective.label}</strong>
              <span>
                {objective.current} / {objective.target} · {objective.status}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>Participants</h2>
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Connection</th>
                <th>Contribution</th>
                <th>Reward eligible</th>
              </tr>
            </thead>
            <tbody>
              {instance.participants.map((participant) => (
                <tr key={participant.presenceId}>
                  <td data-label="Player">{participant.displayName}</td>
                  <td data-label="Connection">{participant.connectionStatus}</td>
                  <td data-label="Contribution">{participant.contribution}</td>
                  <td data-label="Reward eligible">
                    {participant.rewardEligible ? 'Eligible' : 'Not eligible'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Immutable reward receipts</h2>
        {instance.receipts.length === 0 ? (
          <p>No reward receipt exists for this view.</p>
        ) : (
          <ul>
            {instance.receipts.map((receipt) => (
              <li key={receipt.receiptId}>
                {receipt.status} · {receipt.dust} DUST · receipt {receipt.receiptId}
              </li>
            ))}
          </ul>
        )}
        <p>No control on this page can force completion, grant rewards, or edit a receipt.</p>
      </section>
      <section>
        <h2>Bounded audit</h2>
        <ol className="audit-list">
          {detail.audit.map((entry) => (
            <li key={entry.entryNumber}>
              <strong>{entry.action.replaceAll('_', ' ')}</strong>
              <span>
                {entry.result} · revision {entry.revision ?? '—'} ·{' '}
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
