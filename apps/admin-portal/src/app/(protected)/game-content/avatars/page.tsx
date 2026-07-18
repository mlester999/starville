import Link from 'next/link';

import { AvatarPageHeader, AvatarStatus } from '../../../../components/avatar-admin-ui';
import { formatDate } from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAvatarOverview } from '../../../../lib/avatar-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarContentPage() {
  await requireAuthorizedAdmin('avatar_content.read');
  const overview = await loadAvatarOverview();
  const metrics = [
    ['Definitions', overview.definitions],
    ['Active', overview.activeDefinitions],
    ['Awaiting review', overview.reviewQueue],
    ['Invalid versions', overview.invalidVersions],
    ['Published presets', overview.publishedPresets],
    ['Player profiles', overview.playerProfiles],
  ] as const;

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        actions={<Link href="/game-content/avatars/catalog">Open catalog</Link>}
        description="Manage bounded modular appearance definitions through validation, separated review, explicit approval, activation, superseding, and append-only audit. Nothing on this page publishes automatically."
        eyebrow="Cosmetic-only content authority"
        title="Avatar content"
      />

      <aside className="avatar-authority-note" aria-label="Avatar content trust boundary">
        <strong>World Asset Manager remains authoritative</strong>
        <p>
          Player profiles can reference only compatible active versions backed by approved,
          protected game assets. Browser URLs, scripts, render order, and unpublished cosmetics are
          never accepted.
        </p>
      </aside>

      <section aria-label="Avatar catalog summary" className="avatar-metric-grid">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </article>
        ))}
      </section>

      <div className="avatar-overview-grid">
        <section className="detail-card">
          <h2>Production readiness</h2>
          <dl className="avatar-definition-list">
            <div>
              <dt>Development fallbacks</dt>
              <dd>{overview.developmentFallbacks.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Missing direction coverage</dt>
              <dd>{overview.missingDirections.toLocaleString()}</dd>
            </div>
          </dl>
          <p>
            Development variants are clearly labeled and keep local rendering testable; they are not
            represented as final production illustration.
          </p>
          <Link href="/game-content/avatars/validation">Open validation workspace</Link>
        </section>

        <section className="detail-card">
          <h2>Workflow shortcuts</h2>
          <nav aria-label="Avatar workflow shortcuts" className="avatar-workflow-links">
            <Link href="/game-content/avatars/assets">Approved assets</Link>
            <Link href="/game-content/avatars/review">Review queue</Link>
            <Link href="/game-content/avatars/presets">Starter presets</Link>
            <Link href="/game-content/avatars/audit">Audit history</Link>
          </nav>
        </section>
      </div>

      <section className="detail-card">
        <h2>Recently updated definitions</h2>
        {overview.recent.length === 0 ? (
          <p>No avatar definitions are available in this environment.</p>
        ) : (
          <div className="cozy-admin-table-wrap">
            <table className="cozy-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Layer</th>
                  <th>State</th>
                  <th>Validation</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((definition) => (
                  <tr key={definition.definitionId}>
                    <td>
                      <strong>{definition.publicName}</strong>
                      <small>{definition.stableKey}</small>
                    </td>
                    <td>{definition.layer.replaceAll('_', ' ')}</td>
                    <td>
                      <AvatarStatus value={definition.publicationState} />
                    </td>
                    <td>
                      <AvatarStatus value={definition.validationState} />
                    </td>
                    <td>{formatDate(definition.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
