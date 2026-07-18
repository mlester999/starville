import Link from 'next/link';

import {
  AVATAR_DIRECTIONS,
  AvatarEmptyState,
  AvatarPageHeader,
  AvatarStatus,
  AvatarValidationPreview,
} from '../../../../../components/avatar-admin-ui';
import { friendlyKey } from '../../../../../components/economy-admin-ui';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarValidationPage() {
  await requireAuthorizedAdmin('avatar_content.review');
  const catalog = await loadAvatarCatalog({ pageSize: 100 });
  const attention = catalog.items.filter(
    (item) =>
      item.validationState !== 'valid' ||
      item.directions.length !== 8 ||
      item.animationStates.length !== 3,
  );

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Preview bounded direction and animation coverage without activating content, modifying a profile, publishing assets, updating presence, or creating receipts."
        eyebrow="Non-mutating preview"
        title="Avatar validation"
      />

      <section className="detail-card" aria-labelledby="preview-matrix-title">
        <h2 id="preview-matrix-title">Eight-direction development preview</h2>
        <p>
          Representative fallback layers exercise alignment at world and mobile scale on light and
          dark backgrounds. Production definitions remain backed by approved World Assets.
        </p>
        <div className="avatar-preview-matrix">
          {AVATAR_DIRECTIONS.map((direction, index) => (
            <AvatarValidationPreview
              backdrop={index % 2 === 0 ? 'light' : 'dark'}
              direction={direction}
              key={direction}
              scale={index % 3 === 0 ? 'mobile' : 'world'}
              state={index % 3 === 0 ? 'idle' : index % 3 === 1 ? 'walk' : 'jog'}
            />
          ))}
        </div>
      </section>

      <section className="detail-card">
        <h2>Definitions needing attention</h2>
        {attention.length === 0 ? (
          <AvatarEmptyState
            description="All returned definitions report complete direction and state coverage."
            title="No validation gaps"
          />
        ) : (
          <div className="cozy-admin-table-wrap">
            <table className="cozy-admin-table">
              <thead>
                <tr>
                  <th>Definition</th>
                  <th>Validation</th>
                  <th>Directions</th>
                  <th>States</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((item) => (
                  <tr key={item.definitionId}>
                    <td>
                      <strong>{item.publicName}</strong>
                      <small>{item.stableKey}</small>
                    </td>
                    <td>
                      <AvatarStatus value={item.validationState} />
                    </td>
                    <td>{item.directions.length}/8</td>
                    <td>{item.animationStates.map(friendlyKey).join(', ') || 'Missing'}</td>
                    <td>
                      <Link href={`/game-content/avatars/catalog/${item.definitionId}`}>
                        Inspect
                      </Link>
                    </td>
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
