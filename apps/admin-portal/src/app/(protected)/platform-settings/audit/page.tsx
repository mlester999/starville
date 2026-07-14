import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadPlatformConfiguration } from '../../../../lib/platform-configuration/api';

export default async function AuditPage() {
  await requireAuthorizedAdmin('platform_configuration.audit.read');
  const state = await loadPlatformConfiguration();
  return (
    <section className="platform-table-card">
      <header>
        <div>
          <p className="eyebrow">Append-only history</p>
          <h2>Configuration audit</h2>
        </div>
        <p>Reasons and bounded before/after summaries contain no secrets or binary asset data.</p>
      </header>
      <div className="platform-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Reason</th>
              <th>Result</th>
              <th>Request</th>
            </tr>
          </thead>
          <tbody>
            {state.audit.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString()}</td>
                <td>{event.action.replaceAll('_', ' ')}</td>
                <td>{event.reason}</td>
                <td>{event.result}</td>
                <td>
                  <code>{event.requestId.slice(0, 12)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.audit.length === 0 ? (
        <p className="platform-help">No audit events are visible to this role.</p>
      ) : null}
    </section>
  );
}
