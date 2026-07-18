import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import { chatModerationAction } from '../../../../actions/chat-moderation';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadChatReport } from '../../../../../lib/realtime/chat-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function date(value: string): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

export default async function ChatReportPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly reportId: string }>;
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('multiplayer_chat.reports.read');
  const { reportId } = await params;
  const { notice } = await searchParams;
  const detail = await loadChatReport(reportId);
  const report = detail.report;
  const canModerate = hasAdminPermission(context, 'multiplayer_chat.moderate');

  return (
    <main className="chat-report-detail" aria-labelledby="chat-report-title">
      <Link className="table-link" href="/operations/chat">
        ← Back to chat reports
      </Link>
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Protected evidence</p>
          <h1 id="chat-report-title">Report {report.id.slice(0, 8)}</h1>
          <p>
            Message {report.messageId} · captured {date(report.evidence.sentAt)}
          </p>
        </div>
        <span className={`state-chip state-chip--${report.status}`}>
          {report.status.replace('_', ' ')}
        </span>
      </header>
      {notice === undefined ? null : (
        <p
          className={`notice ${notice === 'action-applied' ? 'notice--success' : 'notice--error'}`}
          role="status"
        >
          {notice === 'action-applied'
            ? 'The moderation action was applied and added to the audit trail.'
            : 'The action could not be applied. Reload the report and try again.'}
        </p>
      )}

      <div className="chat-report-detail__grid">
        <section className="detail-card">
          <h2>Exact message evidence</h2>
          <dl className="detail-list">
            <div>
              <dt>Reported player</dt>
              <dd>{report.reportedDisplayName}</dd>
            </div>
            <div>
              <dt>Reporter</dt>
              <dd>{report.reporterDisplayName}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{report.evidence.scope}</dd>
            </div>
            <div>
              <dt>World</dt>
              <dd>{report.worldId}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{report.channelId}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{report.category.replaceAll('_', ' ')}</dd>
            </div>
          </dl>
          <blockquote className="chat-evidence">{report.evidence.text}</blockquote>
          <p className="card-note">
            Player-submitted evidence cannot be edited or destructively deleted by this interface.
          </p>
        </section>

        <section className="detail-card">
          <h2>Report reason</h2>
          <p className="chat-evidence">{report.reason}</p>
          <p className="card-note">
            Revision {report.revision} · updated {date(report.updatedAt)}
          </p>
          <p className="card-note">
            Active chat mute:{' '}
            {detail.activeMuteUntil === null ? 'None' : `Until ${date(detail.activeMuteUntil)}`}
          </p>
          <Link
            className="table-link"
            href={`/players?search=${encodeURIComponent(report.reportedDisplayName)}`}
          >
            Find safe player profile
          </Link>
        </section>
      </div>

      {canModerate ? (
        <section
          className="detail-card chat-moderation-actions"
          aria-labelledby="chat-actions-title"
        >
          <h2 id="chat-actions-title">Moderation action</h2>
          <form action={chatModerationAction}>
            <input name="reportId" type="hidden" value={report.id} />
            <input name="expectedRevision" type="hidden" value={report.revision} />
            <label>
              Action
              <select name="action" required>
                <option value="under_review">Mark under review</option>
                <option value="warn">Record warning</option>
                <option value="chat_mute">Chat mute</option>
                <option value="chat_unmute">Remove active chat mute</option>
                <option value="escalate">Escalate to player suspension workflow</option>
                <option value="dismiss">Dismiss report</option>
              </select>
            </label>
            <label>
              Mute duration
              <select name="muteDurationMinutes">
                <option value="">Not applicable</option>
                <option value="15">15 minutes</option>
                <option value="60">1 hour</option>
                <option value="1440">24 hours</option>
                <option value="10080">7 days</option>
              </select>
            </label>
            <label>
              Required reason
              <textarea maxLength={500} minLength={12} name="reason" required />
            </label>
            <button type="submit">Apply audited action</button>
          </form>
        </section>
      ) : null}

      <section className="detail-card">
        <h2>Moderation history</h2>
        {detail.moderationHistory.length === 0 ? (
          <p className="card-note">No actions recorded.</p>
        ) : (
          <ol className="chat-moderation-history">
            {detail.moderationHistory.map((entry) => (
              <li key={entry.id}>
                <strong>{entry.action.replaceAll('_', ' ')}</strong>
                <span>{entry.reason}</span>
                <time dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="detail-card">
        <h2>Related reports</h2>
        {detail.relatedReports.length === 0 ? (
          <p className="card-note">No other protected reports for this player.</p>
        ) : (
          <ol className="chat-moderation-history">
            {detail.relatedReports.map((related) => (
              <li key={related.id}>
                <Link className="table-link" href={`/operations/chat/${related.id}`}>
                  {related.category.replaceAll('_', ' ')} · {related.status.replaceAll('_', ' ')}
                </Link>
                <span>Reported by {related.reporterDisplayName}</span>
                <time dateTime={related.createdAt}>{date(related.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
