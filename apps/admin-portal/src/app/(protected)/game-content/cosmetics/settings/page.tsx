import {
  CosmeticsPageHeader,
  DisabledCosmeticShopBanner,
} from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCosmeticsSettings } from '../../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticsSettingsPage() {
  await requireAuthorizedAdmin('cosmetics.settings.read');
  const { settings } = await loadCosmeticsSettings();
  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Inspect bounded module controls. Disabling Wardrobe preserves appearances and saved outfits; disabling emotes stops new activations; disabling collections preserves ownership."
        eyebrow="Revisioned module safety"
        title="Cosmetic settings"
      />
      <DisabledCosmeticShopBanner />
      <section className="detail-card">
        <dl className="avatar-definition-list">
          <div>
            <dt>Wardrobe</dt>
            <dd>{settings.wardrobeEnabled ? 'Enabled locally' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Emotes</dt>
            <dd>{settings.emotesEnabled ? 'Enabled locally' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Collections</dt>
            <dd>{settings.collectionsEnabled ? 'Enabled locally' : 'Disabled'}</dd>
          </div>
          <div>
            <dt>Maintenance mode</dt>
            <dd>{settings.maintenanceMode ? 'Active' : 'Inactive'}</dd>
          </div>
          <div>
            <dt>Outfit slots</dt>
            <dd>{settings.maximumLoadouts}</dd>
          </div>
          <div>
            <dt>Emote wheel slots</dt>
            <dd>{settings.maximumEmoteWheelSlots}</dd>
          </div>
          <div>
            <dt>Emote burst bound</dt>
            <dd>{settings.emoteRateLimit} per 10 seconds</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{settings.revision}</dd>
          </div>
        </dl>
      </section>
      <p className="avatar-authority-note">
        This read surface does not publish configuration. Any future settings mutation requires a
        separate narrow permission, expected revision, reason, idempotency, and audit.
      </p>
    </main>
  );
}
