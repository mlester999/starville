import {
  CosmeticsLifecycleGuide,
  CosmeticsPageHeader,
} from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCosmeticsOverview } from '../../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticCollectionsPage() {
  await requireAuthorizedAdmin('cosmetics.read');
  const { overview } = await loadCosmeticsOverview();
  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Build structured cosmetic-only collection candidates from approved avatar definitions. Completion can grant exactly one reviewed cosmetic and can never grant DUST, tokens, or gameplay power."
        eyebrow="Exact-once cosmetic rewards"
        title="Cosmetic collections"
      />
      <section className="detail-card">
        <h2>Active locally</h2>
        <strong className="cosmetics-large-metric">
          {overview.activeCollections.toLocaleString()}
        </strong>
        <p>
          Drafts remain private until validation, separated review, approval, and explicit
          activation.
        </p>
      </section>
      <CosmeticsLifecycleGuide kind="collection" />
    </main>
  );
}
