import Link from 'next/link';

import { CosmeticsPageHeader } from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticReviewPage() {
  await requireAuthorizedAdmin('cosmetics.review');
  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Review cosmetic candidates through the existing Avatar Content and World Asset lifecycle. Review does not grant approval, activation, shop publication, or player ownership."
        eyebrow="Separated lifecycle decisions"
        title="Cosmetic review"
      />
      <section className="detail-card">
        <h2>Canonical review queues</h2>
        <p>
          Cosmetic definitions and their protected asset references remain in the established
          content pipelines. This avoids a parallel publication system and preserves reviewer audit.
        </p>
        <nav className="avatar-workflow-links" aria-label="Canonical cosmetic review queues">
          <Link href="/game-content/avatars/review">Avatar definition review</Link>
          <Link href="/world-assets/review">World Asset review</Link>
          <Link href="/game-content/cosmetics/collections">Collection drafts</Link>
          <Link href="/game-content/cosmetics/emotes">Emote drafts</Link>
        </nav>
      </section>
      <aside className="avatar-authority-note">
        Approval and activation require their own permissions. Nothing publishes automatically, and
        cosmetic shop activation remains structurally impossible in Phase 10B.
      </aside>
    </main>
  );
}
