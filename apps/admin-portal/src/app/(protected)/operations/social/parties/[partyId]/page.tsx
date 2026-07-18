import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../../lib/auth/authorization';
import { loadSocialGraphParty } from '../../../../../../lib/realtime/social-graph-api';

export const dynamic = 'force-dynamic';

export default async function PartyDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly partyId: string }>;
}) {
  await requireAuthorizedAdmin('social_graph.audit.read');
  const { partyId } = await params;
  const detail = await loadSocialGraphParty(partyId);
  return (
    <main className="chat-moderation-page" aria-labelledby="party-detail-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Party evidence</p>
          <h1 id="party-detail-title">Party {detail.party.partyId}</h1>
          <p>
            Revision {detail.party.revision} · {detail.party.status} · {detail.party.members.length}
            /{detail.party.capacity} members
          </p>
        </div>
        <Link href="/operations/social/parties">Back to parties</Link>
      </header>
      <section>
        <h2>Members</h2>
        <div className="chat-report-table table-scroll">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Role</th>
                <th>Status</th>
                <th>World</th>
                <th>Channel</th>
                <th>Ready</th>
              </tr>
            </thead>
            <tbody>
              {detail.party.members.map((member) => (
                <tr key={member.presenceId}>
                  <td data-label="Player">{member.displayName}</td>
                  <td data-label="Role">{member.role}</td>
                  <td data-label="Status">{member.connectionStatus}</td>
                  <td data-label="World">{member.worldName ?? 'Private or offline'}</td>
                  <td data-label="Channel">{member.channelNumber ?? '—'}</td>
                  <td data-label="Ready">{member.readyState.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Invitations</h2>
        <p>{detail.invitations.length} bounded invitation records are retained for this view.</p>
      </section>
      <section>
        <h2>Bounded audit</h2>
        <ol className="audit-list">
          {detail.audit.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action.replaceAll('_', ' ')}</strong>
              <span>
                {entry.result} · revision {entry.partyRevision ?? '—'} ·{' '}
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
