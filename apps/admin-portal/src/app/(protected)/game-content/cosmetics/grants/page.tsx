import { CosmeticsPageHeader } from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';
import { loadAdminPlayers } from '../../../../../lib/player-operations/api';
import { grantCosmeticAction } from '../../../../actions/cosmetics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticGrantsPage() {
  await requireAuthorizedAdmin('cosmetics.grant');
  const [players, cosmetics] = await Promise.all([
    loadAdminPlayers({
      page: 1,
      pageSize: 50,
      search: '',
      status: 'active',
      rename: 'all',
      mapId: 'all',
      sort: 'display_name',
      direction: 'asc',
    }),
    loadAvatarCatalog({ page: 1, pageSize: 50, state: 'active' }),
  ]);

  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Grant one selected active cosmetic to one selected player. A bounded category, detailed explanation, expected ownership state, request ID, immutable receipt, and audit are mandatory."
        eyebrow="Narrow operational authority"
        title="Cosmetic grant"
      />
      <form
        action={grantCosmeticAction}
        className="avatar-structured-form cosmetics-entitlement-form"
      >
        <label>
          Player
          <select name="playerProfileId" required>
            <option value="">Select a player</option>
            {players.items.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Active cosmetic
          <select name="cosmeticKey" required>
            <option value="">Select an active cosmetic</option>
            {cosmetics.items.map((cosmetic) => (
              <option key={cosmetic.definitionId} value={cosmetic.stableKey}>
                {cosmetic.publicName} · {cosmetic.layer.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Expected ownership state
          <select name="expectedState" required>
            <option value="not_owned">Not owned</option>
            <option value="revoked">Previously revoked</option>
          </select>
        </label>
        <label>
          Reason category
          <select name="reasonCategory" required>
            <option value="customer_support">Customer support</option>
            <option value="event_reward">Event reward</option>
            <option value="content_recovery">Content recovery</option>
            <option value="migration_correction">Migration correction</option>
            <option value="development_test">Development test</option>
          </select>
        </label>
        <label className="avatar-form-span">
          Required explanation
          <textarea maxLength={500} minLength={12} name="explanation" required rows={4} />
        </label>
        <button type="submit">Grant one cosmetic</button>
      </form>
      <p className="avatar-authority-note">
        Arbitrary keys, disabled definitions, quantities, DUST changes, mass grants, and bulk upload
        are unavailable.
      </p>
    </main>
  );
}
