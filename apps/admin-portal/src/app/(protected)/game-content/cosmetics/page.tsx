import Link from 'next/link';

import {
  CosmeticsPageHeader,
  DisabledCosmeticShopBanner,
} from '../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadCosmeticsOverview } from '../../../../lib/cosmetics-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticsPage() {
  await requireAuthorizedAdmin('cosmetics.read');
  const { overview } = await loadCosmeticsOverview();
  const metrics = [
    ['Owned entitlements', overview.ownedEntitlements],
    ['Revoked entitlements', overview.revokedEntitlements],
    ['Saved outfits', overview.savedLoadouts],
    ['Active emotes', overview.activeEmotes],
    ['Active collections', overview.activeCollections],
  ] as const;

  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        actions={<Link href="/game-content/cosmetics/catalog">Open catalog</Link>}
        description="Operate server-authoritative cosmetic ownership, five-slot outfits, emotes, and cosmetic-only collections. Content lifecycle remains anchored in Avatar Content and World Asset review."
        eyebrow="Cosmetic-only player expression"
        title="Cosmetics"
      />
      <DisabledCosmeticShopBanner />
      <section aria-label="Cosmetics summary" className="avatar-metric-grid">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </article>
        ))}
      </section>
      <div className="avatar-overview-grid">
        <section className="detail-card">
          <h2>Authority boundaries</h2>
          <p>
            Browsers cannot grant ownership, activate unpublished content, invent asset URLs, set
            DUST prices, or expose another player’s acquisition history. Every change resolves
            active Phase 10A versions on the server.
          </p>
        </section>
        <section className="detail-card">
          <h2>Operational shortcuts</h2>
          <nav className="avatar-workflow-links" aria-label="Cosmetic workflows">
            <Link href="/game-content/cosmetics/grants">Controlled grants</Link>
            <Link href="/game-content/cosmetics/revocations">Safe revocations</Link>
            <Link href="/game-content/cosmetics/review">Lifecycle review</Link>
            <Link href="/game-content/cosmetics/audit">Immutable receipts</Link>
          </nav>
        </section>
      </div>
    </main>
  );
}
