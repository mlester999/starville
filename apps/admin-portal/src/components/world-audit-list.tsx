import type { WorldAuditEvent } from '../lib/worlds/contracts';

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function eventLabel(value: string): string {
  return value.replaceAll('.', ' ').replaceAll('_', ' ');
}

export function WorldAuditList({ events }: { readonly events: readonly WorldAuditEvent[] }) {
  if (events.length === 0) return <p>No world audit events match this view.</p>;

  return (
    <ol className="audit-list world-audit-list">
      {events.map((event) => (
        <li key={event.id}>
          <div>
            <strong>{eventLabel(event.eventKey)}</strong>
            <span className={`state-chip state-chip--${event.outcome}`}>{event.outcome}</span>
          </div>
          <p>{event.reason ?? 'No free-form reason recorded.'}</p>
          <small>
            {formatDate(event.createdAt)} · Actor: {event.actorType}
            {event.actorAdminUserId === null
              ? ''
              : ` · Administrator ${event.actorAdminUserId.slice(0, 8)}…`}
            {event.requestId === null ? '' : ` · Request ${event.requestId.slice(0, 8)}…`}
          </small>
        </li>
      ))}
    </ol>
  );
}
