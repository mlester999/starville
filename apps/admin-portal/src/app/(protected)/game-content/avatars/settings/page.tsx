import { hasAdminPermission } from '@starville/admin-auth';

import { updateAvatarSettingsAction } from '../../../../actions/avatar-content';
import { AvatarPageHeader } from '../../../../../components/avatar-admin-ui';
import { formatDate } from '../../../../../components/economy-admin-ui';
import { loadAvatarSettings } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarSettingsPage() {
  const context = await requireAuthorizedAdmin('avatar_content.settings.read');
  const settings = await loadAvatarSettings();
  const editable = hasAdminPermission(context, 'avatar_content.settings.edit');

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Configure bounded avatar behavior independently from content publication. Changes are revision-checked, idempotent, audited, and never publish catalog definitions."
        eyebrow="Protected platform behavior"
        title="Avatar settings"
      />
      <form action={editable ? updateAvatarSettingsAction : undefined} className="detail-card">
        <input name="expectedRevision" type="hidden" value={settings.revision} />
        <fieldset className="avatar-settings-grid" disabled={!editable}>
          <legend>Customization controls</legend>
          <label className="avatar-toggle-row">
            <span>
              <strong>Customization enabled</strong>
              <small>Allow trusted player APIs to return and save active catalog choices.</small>
            </span>
            <input
              defaultChecked={settings.customizationEnabled}
              name="customizationEnabled"
              type="checkbox"
            />
          </label>
          <label className="avatar-toggle-row">
            <span>
              <strong>Creator required for new players</strong>
              <small>Stage first-time appearance before permanent world entry.</small>
            </span>
            <input
              defaultChecked={settings.creatorRequiredForNewPlayers}
              name="creatorRequiredForNewPlayers"
              type="checkbox"
            />
          </label>
          <label className="avatar-toggle-row">
            <span>
              <strong>Maintenance mode</strong>
              <small>Temporarily block mutations while keeping safe resolved appearances.</small>
            </span>
            <input
              defaultChecked={settings.maintenanceMode}
              name="maintenanceMode"
              type="checkbox"
            />
          </label>
          <label>
            Maximum accessories
            <input
              defaultValue={settings.maximumAccessories}
              max={4}
              min={0}
              name="maximumAccessories"
              required
              type="number"
            />
          </label>
          <label>
            Active fallback preset key
            <input
              defaultValue={settings.fallbackPresetKey}
              maxLength={80}
              minLength={3}
              name="fallbackPresetKey"
              pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*"
              required
            />
          </label>
        </fieldset>
        <p>
          Revision {settings.revision} · last updated {formatDate(settings.updatedAt)}
        </p>
        {editable ? <button type="submit">Save revision-checked settings</button> : null}
      </form>
    </main>
  );
}
