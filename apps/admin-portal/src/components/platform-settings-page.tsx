import {
  BRANDING_ASSET_PROFILES,
  type BrandingAssetProfile,
} from '@starville/platform-configuration';

import { createPlatformDraftAction } from '../app/actions/platform-configuration';
import { requireAuthorizedAdmin } from '../lib/auth/authorization';
import { loadPlatformConfiguration } from '../lib/platform-configuration/api';
import { loadAssetDirectory } from '../lib/world-assets/api';
import { PlatformSettingsEditor, type PlatformSettingsSection } from './platform-settings-editor';

async function brandingOptions() {
  const entries = await Promise.all(
    BRANDING_ASSET_PROFILES.map(async (profile) => {
      try {
        const directory = await loadAssetDirectory({
          page: 1,
          pageSize: 100,
          search: '',
          assetType: profile,
          category: 'branding',
          lifecycle: 'active',
          production: 'approved_production',
          sort: 'friendly_name',
          direction: 'asc',
        });
        return [
          profile,
          directory.items.flatMap((asset) =>
            asset.activeVersionId === null
              ? []
              : [{ value: asset.activeVersionId, label: `${asset.friendlyName} · active` }],
          ),
        ] as const;
      } catch {
        return [profile, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<
    BrandingAssetProfile,
    readonly { value: string; label: string }[]
  >;
}

export async function PlatformSettingsPage({
  section,
}: {
  readonly section: PlatformSettingsSection;
}) {
  const context = await requireAuthorizedAdmin('platform_configuration.read');
  const state = await loadPlatformConfiguration();
  const selected = state.draft ?? state.versions.find(({ id }) => id === state.active.versionId);
  const canEdit = context.permissionKeys.includes('platform_configuration.edit');

  if (selected === undefined) {
    return (
      <section className="platform-empty">
        <h2>Configuration unavailable</h2>
        <p>
          The compiled Starville presentation remains active. Try again after the trusted service is
          available.
        </p>
      </section>
    );
  }

  if (state.draft === null) {
    return (
      <section className="platform-empty">
        <p className="platform-badge platform-badge--published">
          Published v{selected.versionNumber}
        </p>
        <h2>Create a draft to edit {section.replace('-', ' ')}</h2>
        <p>
          Normal administrators and public applications remain on the exact published version until
          a reviewed draft is explicitly published.
        </p>
        {canEdit ? (
          <form action={createPlatformDraftAction} className="platform-create-draft">
            <input name="requestId" type="hidden" value={crypto.randomUUID()} />
            <label>
              <span>Reason for starting this draft</span>
              <input maxLength={500} minLength={3} name="reason" required />
            </label>
            <button type="submit">Create draft from published version</button>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <div className="platform-editor-status">
        <span className="platform-badge">Draft v{selected.versionNumber}</span>
        <span>Revision {selected.revision}</span>
        <span>{selected.lifecycleStatus.replace('_', ' ')}</span>
      </div>
      <PlatformSettingsEditor
        {...(section === 'branding' || section === 'landing'
          ? { assetOptions: await brandingOptions() }
          : {})}
        configuration={selected.configuration}
        editable={canEdit && selected.lifecycleStatus === 'draft'}
        revision={selected.revision}
        section={section}
        versionId={selected.id}
      />
    </>
  );
}
