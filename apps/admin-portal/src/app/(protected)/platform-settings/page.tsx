import {
  platformLifecycleAction,
  createPlatformDraftAction,
} from '../../../app/actions/platform-configuration';
import { ConfirmedSubmitButton } from '../../../components/confirmed-submit-button';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadPlatformConfiguration } from '../../../lib/platform-configuration/api';

export default async function PlatformSettingsOverview() {
  const context = await requireAuthorizedAdmin('platform_configuration.read');
  const state = await loadPlatformConfiguration();
  const draft = state.draft;
  return (
    <section className="platform-overview-grid">
      <article className="platform-summary-card">
        <p className="eyebrow">Live presentation</p>
        <h2>{state.active.configuration.branding.fullGameName}</h2>
        <p>
          Published version {state.active.versionNumber} · revision {state.active.revision}
        </p>
        <span className="platform-badge platform-badge--published">Active</span>
      </article>
      <article className="platform-summary-card">
        <p className="eyebrow">Working draft</p>
        {draft === null ? (
          <>
            <h2>No draft</h2>
            <p>Create a versioned copy of the current presentation before editing.</p>
            {context.permissionKeys.includes('platform_configuration.edit') ? (
              <form action={createPlatformDraftAction} className="platform-create-draft">
                <input name="requestId" type="hidden" value={crypto.randomUUID()} />
                <label>
                  <span>Reason</span>
                  <input name="reason" minLength={3} maxLength={500} required />
                </label>
                <button type="submit">Create draft</button>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <h2>Version {draft.versionNumber}</h2>
            <p>
              {draft.lifecycleStatus.replace('_', ' ')} · revision {draft.revision}
            </p>
            {draft.validationResults ? (
              <p>
                {draft.validationResults.valid ? 'Validation passed' : 'Validation needs attention'}{' '}
                · {draft.validationResults.findings.length} checks
              </p>
            ) : (
              <p>Not validated yet.</p>
            )}
            <div className="platform-change-summary">
              <strong>Change summary</strong>
              <span>
                {changedAreas(state.active.configuration, draft.configuration).join(', ')}
              </span>
              <small>
                Affected applications: admin portal, admin login, landing, game-client branding.
              </small>
            </div>
            <div className="platform-lifecycle-actions">
              {context.permissionKeys.includes('platform_configuration.validate') &&
              ['draft', 'validated'].includes(draft.lifecycleStatus) ? (
                <LifecycleForm
                  action="validate"
                  activeRevision={state.active.revision}
                  revision={draft.revision}
                  versionId={draft.id}
                />
              ) : null}
              {context.permissionKeys.includes('platform_configuration.edit') &&
              draft.lifecycleStatus === 'validated' ? (
                <LifecycleForm
                  action="submit-review"
                  activeRevision={state.active.revision}
                  revision={draft.revision}
                  versionId={draft.id}
                />
              ) : null}
              {context.permissionKeys.includes('platform_configuration.review') &&
              draft.lifecycleStatus === 'in_review' &&
              draft.reviewedAt === null ? (
                <LifecycleForm
                  action="review"
                  activeRevision={state.active.revision}
                  revision={draft.revision}
                  versionId={draft.id}
                />
              ) : null}
              {context.permissionKeys.includes('platform_configuration.publish') &&
              draft.reviewedAt !== null ? (
                <LifecycleForm
                  action="publish"
                  activeRevision={state.active.revision}
                  revision={draft.revision}
                  versionId={draft.id}
                />
              ) : null}
            </div>
          </>
        )}
      </article>
      <article className="platform-summary-card platform-summary-card--wide">
        <p className="eyebrow">Safety boundary</p>
        <h2>Presentation only</h2>
        <p>
          These settings cannot change Supabase, database credentials, environment variables, wallet
          networks, RPC endpoints, authentication controls, or permission grants.
        </p>
      </article>
    </section>
  );
}

function LifecycleForm({
  action,
  versionId,
  revision,
  activeRevision,
}: {
  readonly action: 'validate' | 'submit-review' | 'review' | 'publish';
  readonly versionId: string;
  readonly revision: number;
  readonly activeRevision: number;
}) {
  return (
    <form action={platformLifecycleAction} className="platform-lifecycle-form">
      <input name="action" type="hidden" value={action} />
      <input name="versionId" type="hidden" value={versionId} />
      <input name="expectedRevision" type="hidden" value={revision} />
      <input name="expectedActiveRevision" type="hidden" value={activeRevision} />
      <input name="requestId" type="hidden" value={crypto.randomUUID()} />
      <label>
        <span>Reason</span>
        <input name="reason" minLength={3} maxLength={500} required />
      </label>
      {action === 'publish' ? (
        <ConfirmedSubmitButton confirmation="Publish this exact reviewed version to the admin portal, admin login, landing, and game-client branding?">
          publish
        </ConfirmedSubmitButton>
      ) : (
        <button type="submit">{action.replace('-', ' ')}</button>
      )}
    </form>
  );
}

function changedAreas(
  current: Awaited<ReturnType<typeof loadPlatformConfiguration>>['active']['configuration'],
  draft: Awaited<ReturnType<typeof loadPlatformConfiguration>>['active']['configuration'],
) {
  const areas = [
    ['branding', current.branding, draft.branding],
    ['branding assets', current.brandingAssets, draft.brandingAssets],
    ['theme', current.theme, draft.theme],
    ['typography', current.typography, draft.typography],
    ['admin login', current.adminLogin, draft.adminLogin],
    ['landing', current.landing, draft.landing],
    ['navigation', current.navigation, draft.navigation],
    ['modules', current.modules, draft.modules],
  ] as const;
  const changed = areas
    .filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
    .map(([label]) => label);
  return changed.length === 0 ? ['No presentation differences'] : changed;
}
