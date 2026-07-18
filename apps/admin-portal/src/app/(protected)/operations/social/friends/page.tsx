import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadSocialGraph } from '../../../../../lib/realtime/social-graph-api';

export const dynamic = 'force-dynamic';

export default async function FriendsOperationsPage() {
  await requireAuthorizedAdmin('social_graph.read');
  const graph = await loadSocialGraph({ page: 1, pageSize: 10, status: 'all', search: '' });
  return (
    <main className="chat-moderation-page" aria-labelledby="friends-operations-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Privacy-bounded social graph</p>
          <h1 id="friends-operations-title">Friendships</h1>
          <p>
            Aggregate friendship health only. Private friend lists, conversations, wallets, and
            inventories are not exposed.
          </p>
        </div>
      </header>
      <nav className="social-admin-links" aria-label="Friends and parties operations">
        <Link href="/operations/social/friends">Friends</Link>
        <Link href="/operations/social/parties">Parties</Link>
        <Link href="/operations/social/audit">Audit</Link>
      </nav>
      <section className="overview-grid">
        <article>
          <span>Accepted friendships</span>
          <strong>{graph.acceptedFriendshipCount}</strong>
        </article>
        <article>
          <span>Requests · last 24 hours</span>
          <strong>{graph.friendshipRequestCount}</strong>
        </article>
        <article>
          <span>Recent party closures</span>
          <strong>{graph.recentDisbandCount}</strong>
        </article>
      </section>
      <section className="empty-state">
        <h2>No arbitrary social controls</h2>
        <p>
          Administrators cannot add friends, create memberships, or read private party chat from
          this page. Existing player suspension remains the enforcement boundary.
        </p>
      </section>
    </main>
  );
}
