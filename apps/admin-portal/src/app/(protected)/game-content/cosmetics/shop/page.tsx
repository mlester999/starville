import {
  CosmeticsPageHeader,
  DisabledCosmeticShopBanner,
} from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadCosmeticsShop } from '../../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticShopPage() {
  await requireAuthorizedAdmin('cosmetics.shop.read');
  const { shop } = await loadCosmeticsShop();
  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Inspect the structurally disabled, DUST-only future shop boundary. Draft offer concepts reuse the existing economy lock and ledger design, but no publication or player settlement route exists."
        eyebrow="Draft-only future architecture"
        title="Cosmetic shop"
      />
      <DisabledCosmeticShopBanner />
      <section className="detail-card">
        <h2>Overview</h2>
        <dl className="avatar-definition-list">
          <div>
            <dt>Enabled</dt>
            <dd>{shop.enabled ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Lifecycle</dt>
            <dd>{shop.lifecycle.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt>Currency design</dt>
            <dd>{shop.currency} only</dd>
          </div>
          <div>
            <dt>Published offers</dt>
            <dd>{shop.offers.length}</dd>
          </div>
          <div>
            <dt>Purchase reachable</dt>
            <dd>{shop.purchaseAvailable ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </section>
      <div className="avatar-overview-grid">
        {[
          'Draft Offers',
          'Offer Editor',
          'Preview',
          'Validation',
          'Review',
          'Approval',
          'Schedule',
          'Audit',
          'Simulation Impact',
          'Settings',
        ].map((section) => (
          <section className="detail-card cosmetics-shop-section" key={section}>
            <h2>{section}</h2>
            <p>
              Unavailable for publication in Phase 10B. Local planning and bounded draft review
              only.
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
