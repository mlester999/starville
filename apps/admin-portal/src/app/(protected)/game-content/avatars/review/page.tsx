import Link from 'next/link';

import {
  AvatarEmptyState,
  AvatarPageHeader,
  AvatarStatus,
  DirectionCoverage,
} from '../../../../../components/avatar-admin-ui';
import { formatDate, friendlyKey } from '../../../../../components/economy-admin-ui';
import { loadAvatarReviewQueue } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarReviewPage() {
  await requireAuthorizedAdmin('avatar_content.review');
  const queue = await loadAvatarReviewQueue();

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Review immutable submitted versions separately from authoring. Validation does not approve, approval remains explicit, and stale revisions are rejected by the authoritative service."
        eyebrow="Separated lifecycle authority"
        title="Avatar review queue"
      />
      {queue.items.length === 0 ? (
        <AvatarEmptyState
          description="Validated drafts appear here only after an authorized author submits them."
          title="The review queue is clear"
        />
      ) : (
        <div className="avatar-catalog-list">
          {queue.items.map((item) => (
            <article className="avatar-catalog-card" key={item.definitionId}>
              <header>
                <div>
                  <p className="eyebrow">{friendlyKey(item.layer)}</p>
                  <h2>{item.publicName}</h2>
                  <code>{item.stableKey}</code>
                </div>
                <div className="avatar-status-stack">
                  <AvatarStatus value={item.publicationState} />
                  <AvatarStatus value={item.validationState} />
                </div>
              </header>
              <p>{item.description}</p>
              <DirectionCoverage directions={item.directions} />
              <p>
                Submitted version {item.activeVersionNumber ?? 'draft'} · updated{' '}
                {formatDate(item.updatedAt)} · reviewer {item.reviewerDisplayName ?? 'unassigned'}
              </p>
              <Link href={`/game-content/avatars/catalog/${item.definitionId}`}>
                Open review evidence
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
