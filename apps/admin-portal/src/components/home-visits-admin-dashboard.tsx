import type { AdminPermissionKey } from '@starville/admin-auth';
import type { AdminHomeVisitWorkspace } from '../lib/home-visits-api';
import {
  homeGuestbookModerationAction,
  homeVisitPolicySuccessorAction,
  homeVisitPolicyTransitionAction,
  homeVisitReconciliationAction,
  homeVisitReportTransitionAction,
  homeVisitSessionCloseAction,
} from '../app/actions/home-visits';

function can(permissions: readonly string[], permission: AdminPermissionKey) {
  return permissions.includes(permission);
}
function string(value: unknown, fallback = '—') {
  return typeof value === 'string' ? value : fallback;
}
function number(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback;
}
function nested(value: Record<string, unknown>, key: string) {
  const result = value[key];
  return typeof result === 'object' && result !== null && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : {};
}
function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
    : [];
}

export function HomeVisitsAdminDashboard({
  workspace,
  permissions,
  notice,
}: Readonly<{
  workspace: AdminHomeVisitWorkspace;
  permissions: readonly string[];
  notice?: string;
}>) {
  const policy = workspace.policy;
  return (
    <main className="operations-page home-visits-admin" aria-labelledby="home-visits-admin-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Owner-present social operations</p>
          <h1 id="home-visits-admin-title">Live home visits</h1>
          <p>
            Inspect active owner-bound sessions, invitations, bounded social records, helper
            evidence, reports, reconciliation, and versioned live-ops policy. Player storage,
            inventory, DUST, private contents, and crop ownership are not mutable here.
          </p>
        </div>
      </header>
      {notice === undefined ? null : (
        <p className="status-banner" role="status" aria-live="polite">
          {notice.replaceAll('-', ' ')}
        </p>
      )}
      <section className="operations-summary-grid" aria-label="Home visit telemetry">
        {Object.entries(workspace.telemetry).map(([key, value]) => (
          <article key={key}>
            <span>{key.replaceAll(/([A-Z])/g, ' $1')}</span>
            <strong>{String(value)}</strong>
          </article>
        ))}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Current configuration</p>
            <h2>Policy version {policy.version}</h2>
          </div>
        </header>
        <dl className="detail-grid">
          <div>
            <dt>Maximum visitors</dt>
            <dd>{policy.maximumVisitors}</dd>
          </div>
          <div>
            <dt>Owner grace</dt>
            <dd>{policy.ownerDisconnectGraceSeconds}s</dd>
          </div>
          <div>
            <dt>Visitor grace</dt>
            <dd>{policy.visitorReconnectGraceSeconds}s</dd>
          </div>
          <div>
            <dt>Admissions</dt>
            <dd>{policy.admissionsEnabled ? 'Enabled' : 'Paused'}</dd>
          </div>
          <div>
            <dt>Social interactions</dt>
            <dd>{policy.socialInteractionsEnabled ? 'Enabled' : 'Paused'}</dd>
          </div>
          <div>
            <dt>Helper watering</dt>
            <dd>{policy.helperActionsEnabled ? 'Enabled, once daily' : 'Paused'}</dd>
          </div>
        </dl>
        {can(permissions, 'home_visits.policies.manage') ? (
          <form action={homeVisitPolicySuccessorAction} className="progression-admin-form">
            <h3>Create policy successor</h3>
            <input type="hidden" name="versionId" value={policy.versionId} />
            <input type="hidden" name="expectedRevision" value={policy.configurationRevision} />
            <label>
              Maximum visitors
              <input
                name="maximumVisitors"
                type="number"
                min="1"
                max="10"
                defaultValue={policy.maximumVisitors}
              />
            </label>
            {(
              [
                'visitsEnabled',
                'admissionsEnabled',
                'socialInteractionsEnabled',
                'helperActionsEnabled',
              ] as const
            ).map((key) => (
              <label key={key}>
                {key.replaceAll(/([A-Z])/g, ' $1')}
                <select name={key} defaultValue={String(policy[key])}>
                  <option value="true">Enabled</option>
                  <option value="false">Paused</option>
                </select>
              </label>
            ))}
            <label>
              Reason
              <textarea
                name="reason"
                minLength={20}
                maxLength={500}
                required
                defaultValue="Create a reviewed bounded home-visit policy successor."
              />
            </label>
            <button type="submit">Create draft successor</button>
          </form>
        ) : null}
        {can(permissions, 'home_visits.policies.manage') ? (
          <form action={homeVisitPolicyTransitionAction} className="progression-admin-form">
            <h3>Transition selected policy</h3>
            <label>
              Version UUID
              <input name="versionId" required />
            </label>
            <label>
              Expected revision
              <input name="expectedRevision" type="number" min="1" required />
            </label>
            <label>
              Transition
              <select name="transition">
                <option value="validate">Validate</option>
                <option value="activate">Activate with separation</option>
                <option value="archive">Archive</option>
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={20} maxLength={500} required />
            </label>
            <button type="submit">Apply transition</button>
          </form>
        ) : null}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Realtime authority</p>
            <h2>Active hosted sessions</h2>
          </div>
        </header>
        {workspace.activeSessions.length === 0 ? (
          <p>No live home sessions are active.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Owner</th>
                  <th>Visibility</th>
                  <th>Visitors</th>
                  <th>Participants</th>
                  <th>Presence</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {workspace.activeSessions.map((row) => {
                  const session = nested(row, 'session');
                  const owner = nested(row, 'owner');
                  return (
                    <tr key={string(session['id'])}>
                      <td>{string(session['id'])}</td>
                      <td>{string(owner['displayName'])}</td>
                      <td>{string(session['visibility'])}</td>
                      <td>
                        {number(session['visitorCount'])}/{number(session['maximumVisitors'])}
                      </td>
                      <td>
                        <ul>
                          {records(row['participants']).map((participant) => (
                            <li key={string(participant['id'])}>
                              {string(nested(participant, 'player')['displayName'])} ·{' '}
                              {string(participant['role'])} · {string(participant['presenceState'])}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td>{string(session['ownerPresenceState'])}</td>
                      <td>
                        {can(permissions, 'home_visits.manage') ? (
                          <form action={homeVisitSessionCloseAction}>
                            <input type="hidden" name="sessionId" value={string(session['id'])} />
                            <input
                              type="hidden"
                              name="expectedRevision"
                              value={number(session['configurationRevision'], 1)}
                            />
                            <input
                              type="hidden"
                              name="reason"
                              value="Administrator closed the selected unsafe or stale live home session."
                            />
                            <button type="submit">Close session</button>
                          </form>
                        ) : (
                          'Read only'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Expiring authority</p>
            <h2>Invitations</h2>
          </div>
        </header>
        {workspace.invitations.length === 0 ? (
          <p>No recent invitations.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {workspace.invitations.map((row) => (
                  <tr key={string(row['id'])}>
                    <td>{string(row['id'])}</td>
                    <td>{string(row['type'])}</td>
                    <td>{string(row['status'])}</td>
                    <td>{string(row['expiresAt'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Moderation</p>
            <h2>Guestbook</h2>
          </div>
        </header>
        {workspace.guestbook.length === 0 ? (
          <p>No guestbook entries are available.</p>
        ) : (
          workspace.guestbook.map((entry) => (
            <article key={string(entry['id'])} className="operations-card">
              <strong>{string(nested(entry, 'author')['displayName'])}</strong>
              <p>{string(entry['message'])}</p>
              <small>
                {string(entry['moderationStatus'])} · {number(entry['reportCount'])} reports
              </small>
              {can(permissions, 'home_visits.guestbooks.moderate') ? (
                <form action={homeGuestbookModerationAction}>
                  <input type="hidden" name="entryId" value={string(entry['id'])} />
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={number(entry['stateVersion'], 1)}
                  />
                  <label>
                    Action
                    <select name="action">
                      <option value="hide">Hide</option>
                      <option value="remove">Remove</option>
                      <option value="restore">Restore moderator-hidden</option>
                    </select>
                  </label>
                  <label>
                    Reason
                    <input
                      name="reason"
                      minLength={20}
                      maxLength={500}
                      required
                      defaultValue="Moderate this guestbook entry using reviewed evidence."
                    />
                  </label>
                  <button type="submit">Moderate entry</button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </section>

      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Aggregate-only reactions</p>
            <h2>Appreciation</h2>
          </div>
        </header>
        {workspace.appreciation.length === 0 ? (
          <p>No appreciation has been recorded.</p>
        ) : (
          <ul>
            {workspace.appreciation.map((row, index) => (
              <li key={`${string(row['homeId'])}-${index}`}>
                {string(row['reactionKey'])}: {number(row['count'])}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">No visitor reward</p>
            <h2>Helper activity</h2>
          </div>
        </header>
        {workspace.helpers.length === 0 ? (
          <p>No crop-watering helper evidence.</p>
        ) : (
          <ul>
            {workspace.helpers.map((row) => (
              <li key={string(row['id'])}>
                {string(nested(row, 'helper')['displayName'])} · {string(row['actionType'])} · owner
                retained crop and reward
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Sensitive evidence</p>
            <h2>Reports</h2>
          </div>
        </header>
        {workspace.reports.length === 0 ? (
          <p>No home-visit reports.</p>
        ) : (
          <ul>
            {workspace.reports.map((row) => (
              <li key={string(row['id'])}>
                <strong>{string(row['category'])}</strong> · {string(row['status'])} ·{' '}
                {string(row['reason'])}
                {can(permissions, 'home_visits.manage') ? (
                  <form action={homeVisitReportTransitionAction}>
                    <input type="hidden" name="reportId" value={string(row['id'])} />
                    <input
                      type="hidden"
                      name="expectedRevision"
                      value={number(row['stateVersion'], 1)}
                    />
                    <label>
                      Action
                      <select name="action">
                        <option value="start_review">Start review</option>
                        <option value="action">Record action</option>
                        <option value="dismiss">Dismiss</option>
                      </select>
                    </label>
                    <label>
                      Reason
                      <input
                        name="reason"
                        minLength={20}
                        maxLength={500}
                        required
                        defaultValue="Review this report using the retained safe evidence."
                      />
                    </label>
                    <button type="submit">Update report</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {can(permissions, 'home_visits.reconciliation.manage') ? (
        <section className="operations-panel">
          <h2>Request reconciliation</h2>
          <form action={homeVisitReconciliationAction} className="progression-admin-form">
            <label>
              Session UUID
              <input name="sessionId" required />
            </label>
            <label>
              Check
              <select name="type">
                <option value="visitor_count">Visitor count</option>
                <option value="active_session_owner_presence">Owner presence</option>
                <option value="blocked_participant">Blocked participant</option>
                <option value="helper_evidence">Helper evidence</option>
                <option value="preview_exclusion">Preview exclusion</option>
              </select>
            </label>
            <label>
              Priority
              <input name="priority" type="number" min="1" max="100" defaultValue="50" />
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={20} maxLength={500} required />
            </label>
            <button type="submit">Queue bounded reconciliation</button>
          </form>
        </section>
      ) : null}
      <section className="operations-panel">
        <header>
          <div>
            <p className="eyebrow">Append-only evidence</p>
            <h2>Audit history</h2>
          </div>
        </header>
        {workspace.audit.length === 0 ? (
          <p>No recent home-visit audit events.</p>
        ) : (
          <ul>
            {workspace.audit.map((row) => (
              <li key={string(row['id'])}>
                {string(row['eventKey'])} · {string(row['actorType'])} · {string(row['result'])} ·{' '}
                {string(row['createdAt'])}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
