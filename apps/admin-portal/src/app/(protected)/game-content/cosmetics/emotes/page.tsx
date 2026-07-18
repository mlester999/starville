import {
  CosmeticsLifecycleGuide,
  CosmeticsPageHeader,
} from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCosmeticsOverview } from '../../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticEmotesPage() {
  await requireAuthorizedAdmin('cosmetics.read');
  const { overview } = await loadCosmeticsOverview();
  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Manage bounded emote metadata, duration, interruption policy, compatibility, fallback, approved asset references, preview, and audit. Runtime scripts and URLs are not accepted."
        eyebrow="Compact realtime expression"
        title="Emotes"
      />
      <section className="detail-card">
        <h2>Approved starter emotes</h2>
        <p>Wave · Cheer · Nod · Laugh · Sit · Dance</p>
        <strong className="cosmetics-large-metric">
          {overview.activeEmotes.toLocaleString()} active
        </strong>
      </section>
      <CosmeticsLifecycleGuide kind="emote" />
    </main>
  );
}
