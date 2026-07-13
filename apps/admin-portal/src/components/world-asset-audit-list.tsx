import Link from 'next/link';

import type { AssetAuditEvent } from '../lib/world-assets/contracts';

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

export function WorldAssetAuditList({ events }: { readonly events: readonly AssetAuditEvent[] }) {
  return (
    <ol className="audit-list world-asset-audit-list">
      {events.map((event) => (
        <li key={event.id}>
          <div className="section-heading-row">
            <strong>{event.action.replaceAll('_', ' ').replaceAll('.', ' ')}</strong>
            <span className={`state-chip state-chip--${event.result}`}>{event.result}</span>
          </div>
          <p>{event.reason ?? 'No free-form reason recorded.'}</p>
          <small>
            {formatDate(event.createdAt)} · administrator{' '}
            {event.actorAdminUserId?.slice(0, 8) ?? 'system'} · {event.permission} · request{' '}
            {event.requestId?.slice(0, 8) ?? 'not recorded'}…
          </small>
          <Link href={`/world-assets/${event.assetId}`}>Open asset</Link>
        </li>
      ))}
    </ol>
  );
}
