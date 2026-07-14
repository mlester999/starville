import { platformLifecycleAction } from '../../../../app/actions/platform-configuration';
import { ConfirmedSubmitButton } from '../../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadPlatformConfiguration } from '../../../../lib/platform-configuration/api';

export default async function VersionsPage() {
  const context = await requireAuthorizedAdmin('platform_configuration.read');
  const state = await loadPlatformConfiguration();
  const canRollback = context.permissionKeys.includes('platform_configuration.rollback');
  return (
    <section className="platform-table-card">
      <header>
        <div>
          <p className="eyebrow">Immutable history</p>
          <h2>Configuration versions</h2>
        </div>
        <p>
          Rollback reactivates an existing validated version; it never edits historical
          configuration.
        </p>
      </header>
      <div className="platform-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Status</th>
              <th>Revision</th>
              <th>Created</th>
              <th>Published</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {state.versions.map((version) => {
              const active = version.id === state.active.versionId;
              const rollbackEligible =
                ['published', 'superseded', 'rolled_back'].includes(version.lifecycleStatus) &&
                version.validationResults?.valid === true;
              return (
                <tr key={version.id}>
                  <td>
                    v{version.versionNumber}
                    {active ? ' · Active' : ''}
                  </td>
                  <td>{version.lifecycleStatus.replace('_', ' ')}</td>
                  <td>{version.revision}</td>
                  <td>{new Date(version.createdAt).toLocaleDateString()}</td>
                  <td>
                    {version.publishedAt ? new Date(version.publishedAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    {canRollback && rollbackEligible && !active ? (
                      <form action={platformLifecycleAction} className="platform-inline-action">
                        <input name="action" type="hidden" value="rollback" />
                        <input name="versionId" type="hidden" value={version.id} />
                        <input name="expectedRevision" type="hidden" value={version.revision} />
                        <input
                          name="expectedActiveRevision"
                          type="hidden"
                          value={state.active.revision}
                        />
                        <input name="requestId" type="hidden" value={crypto.randomUUID()} />
                        <input
                          aria-label={`Reason to roll back to version ${version.versionNumber}`}
                          name="reason"
                          minLength={3}
                          maxLength={500}
                          required
                        />
                        <ConfirmedSubmitButton
                          confirmation={`Reactivate immutable version ${String(version.versionNumber)} for the admin portal, admin login, landing, and game-client branding?`}
                        >
                          Roll back
                        </ConfirmedSubmitButton>
                      </form>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
