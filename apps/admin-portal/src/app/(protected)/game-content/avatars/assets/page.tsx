import Link from 'next/link';

import {
  AvatarEmptyState,
  AvatarPageHeader,
  AvatarStatus,
  DirectionCoverage,
} from '../../../../../components/avatar-admin-ui';
import { friendlyKey } from '../../../../../components/economy-admin-ui';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarAssetsPage() {
  await requireAuthorizedAdmin('avatar_content.read');
  const catalog = await loadAvatarCatalog({ pageSize: 100 });

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        actions={<Link href="/world-assets">Open World Assets</Link>}
        description="Inspect the approved World Asset references and animation coverage used by avatar definitions. Asset upload, intake, review, and source-file lifecycle stay in World Assets."
        eyebrow="Approved references only"
        title="Avatar assets"
      />

      <aside className="avatar-authority-note">
        <strong>No duplicate upload pipeline</strong>
        <p>
          This workspace never accepts arbitrary URLs or mutates source artwork. Select approved,
          immutable asset versions in the structured definition editor.
        </p>
      </aside>

      {catalog.items.length === 0 ? (
        <AvatarEmptyState
          description="Create a bounded avatar definition, then attach an approved World Asset version."
          title="No avatar asset references"
        />
      ) : (
        <div className="avatar-catalog-list">
          {catalog.items.map((item) => (
            <article className="avatar-catalog-card" key={item.definitionId}>
              <header>
                <div>
                  <p className="eyebrow">{friendlyKey(item.layer)}</p>
                  <h2>{item.publicName}</h2>
                  <code>{item.stableKey}</code>
                </div>
                <AvatarStatus value={item.assetStatus} />
              </header>
              <DirectionCoverage directions={item.directions} />
              <p>
                States: {item.animationStates.map(friendlyKey).join(', ') || 'No animation states'}
              </p>
              <Link href={`/game-content/avatars/catalog/${item.definitionId}`}>
                Inspect approved references
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
