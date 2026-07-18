import { hasAdminPermission } from '@starville/admin-auth';

import { publishAvatarPresetAction } from '../../../../actions/avatar-content';
import {
  AvatarEmptyState,
  AvatarPageHeader,
  AvatarStatus,
} from '../../../../../components/avatar-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { loadAvatarPresets } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarPresetsPage() {
  const context = await requireAuthorizedAdmin('avatar_content.edit');
  const presets = await loadAvatarPresets();

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Inspect curated starter combinations assembled only from compatible active definitions. Publication is explicit, revision-checked, and independent from individual content activation."
        eyebrow="Curated starter combinations"
        title="Avatar presets"
      />
      {presets.items.length === 0 ? (
        <AvatarEmptyState
          description="Starter presets will appear after compatible catalog content has passed review and activation."
          title="No starter presets"
        />
      ) : (
        <div className="avatar-catalog-list">
          {presets.items.map((preset) => (
            <article className="avatar-catalog-card" key={preset.presetId}>
              <header>
                <div>
                  <p className="eyebrow">Version {preset.version}</p>
                  <h2>{preset.publicName}</h2>
                  <code>{preset.stableKey}</code>
                </div>
                <AvatarStatus value={preset.state} />
              </header>
              <p>{preset.description}</p>
              <dl className="avatar-definition-list">
                {Object.entries(preset.selection)
                  .filter(([key]) => key !== 'accessories')
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{friendlyKey(key)}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                <div>
                  <dt>Accessories</dt>
                  <dd>{preset.selection.accessories.join(', ') || 'None'}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(preset.updatedAt)}</dd>
                </div>
              </dl>
              {preset.state !== 'active' &&
              hasAdminPermission(context, 'avatar_content.activate') ? (
                <form action={publishAvatarPresetAction} className="avatar-inline-action">
                  <input name="presetId" type="hidden" value={preset.presetId} />
                  <input name="expectedRevision" type="hidden" value={preset.revision} />
                  <label>
                    Publication reason
                    <input maxLength={500} minLength={12} name="reason" required />
                  </label>
                  <button type="submit">Publish preset explicitly</button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
