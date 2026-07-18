import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';

import { cooperativeActivitySettingsAction } from '../../../../actions/cooperative-activities';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCooperativeActivitySettings } from '../../../../../lib/realtime/cooperative-activity-api';

export const dynamic = 'force-dynamic';

export default async function CooperativeActivitySettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('cooperative_activities.settings.read');
  const canEdit = hasAdminPermission(context, 'cooperative_activities.settings.edit');
  const settings = await loadCooperativeActivitySettings();
  const { notice } = await searchParams;
  return (
    <main className="operations-page" aria-labelledby="activity-settings-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Reviewed live policy</p>
          <h1 id="activity-settings-title">Activity settings</h1>
          <p>
            Disable new entries safely, retain durable history, and choose whether active instances
            may finish. Public queue remains hard-disabled in Phase 8D-B.
          </p>
        </div>
        <Link href="/operations/activities">Back to activities</Link>
      </header>
      {notice === undefined ? null : (
        <p className="notice-banner" role="status">
          {notice.replaceAll('-', ' ')}
        </p>
      )}
      <form action={cooperativeActivitySettingsAction} className="settings-form">
        <fieldset disabled={!canEdit}>
          <input name="expectedVersion" type="hidden" value={settings.version} />
          <label>
            Module entry policy
            <select defaultValue={String(settings.moduleEnabled)} name="moduleEnabled">
              <option value="true">New entries enabled</option>
              <option value="false">New entries disabled</option>
            </select>
          </label>
          <label>
            Active instance policy
            <select
              defaultValue={String(settings.allowExistingInstancesToFinish)}
              name="allowExistingInstancesToFinish"
            >
              <option value="true">Allow existing instances to finish</option>
              <option value="false">Pause or safely cancel existing instances</option>
            </select>
          </label>
          <label>
            Maximum active instances
            <input
              defaultValue={settings.maximumActiveInstances}
              max={1000}
              min={1}
              name="maximumActiveInstances"
              type="number"
            />
          </label>
          <label>
            Failed attempts per player/hour
            <input
              defaultValue={settings.maximumFailedAttemptsPerHour}
              max={60}
              min={1}
              name="maximumFailedAttemptsPerHour"
              type="number"
            />
          </label>
          <label>
            Instance preparations per party/hour
            <input
              defaultValue={settings.maximumPartyCreationsPerHour}
              max={60}
              min={1}
              name="maximumPartyCreationsPerHour"
              type="number"
            />
          </label>
          <p>
            Public queue: <strong>Disabled by design</strong>
          </p>
          {canEdit ? <button type="submit">Save reviewed policy</button> : null}
        </fieldset>
      </form>
    </main>
  );
}
