import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';

import { MAP_IDS, type MapId } from '@starville/game-core';

import { PremiumSelect } from '../../../components/premium-select';
import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadAdminPlayers } from '../../../lib/player-operations/api';
import {
  parsePlayerDirectoryQuery,
  playerDirectoryHref,
} from '../../../lib/player-operations/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MAP_LABELS = {
  'lantern-square': 'Lantern Square',
  'moonpetal-meadow': 'Moonpetal Meadow',
  'brooklight-crossing': 'Brooklight Crossing',
  'hearthfield-road': 'Hearthfield Road',
  'whisperpine-gate': 'Whisperpine Gate',
} as const satisfies Readonly<Record<MapId, string>>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function shortWallet(value: string): string {
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

export default async function PlayersPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAuthorizedAdmin('players.read');
  const canReadWallet = hasAdminPermission(context, 'wallets.read');
  const query = parsePlayerDirectoryQuery(await props.searchParams);

  try {
    const directory = await loadAdminPlayers(query);
    return (
      <main className="operations-page" aria-labelledby="players-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Staff-only player operations</p>
            <h1 id="players-title">Players</h1>
            <p>
              Search real profiles and review their application moderation, access-session, and safe
              resume state. “Last entered” is not an online-presence signal.
            </p>
          </div>
          <span className="permission-badge">{directory.total} profile(s)</span>
        </header>

        <form className="player-filters" method="get" role="search">
          <label>
            {canReadWallet ? 'Name prefix or exact wallet' : 'Display-name prefix'}
            <input defaultValue={query.search} maxLength={128} name="search" type="search" />
          </label>
          <label>
            Moderation
            <PremiumSelect
              aria-label="Moderation"
              defaultValue={query.status}
              name="status"
              options={[
                { value: 'all', label: 'All states' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
              ]}
              size="compact"
            />
          </label>
          <label>
            Rename
            <PremiumSelect
              aria-label="Rename"
              defaultValue={query.rename}
              name="rename"
              options={[
                { value: 'all', label: 'All' },
                { value: 'required', label: 'Required' },
                { value: 'clear', label: 'Not required' },
              ]}
              size="compact"
            />
          </label>
          <label>
            Recent entry
            <PremiumSelect
              aria-label="Recent entry"
              defaultValue={query.recentDays === undefined ? '' : String(query.recentDays)}
              name="recentDays"
              options={[
                { value: '', label: 'Any time' },
                { value: '1', label: 'Last 24 hours' },
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
              ]}
              size="compact"
            />
          </label>
          <label>
            Map
            <PremiumSelect
              aria-label="Map"
              defaultValue={query.mapId}
              name="mapId"
              options={[
                { value: 'all', label: 'All maps' },
                ...MAP_IDS.map((mapId) => ({ value: mapId, label: MAP_LABELS[mapId] })),
              ]}
              size="compact"
            />
          </label>
          <label>
            Sort
            <PremiumSelect
              aria-label="Sort"
              defaultValue={query.sort}
              name="sort"
              options={[
                { value: 'last_entered_at', label: 'Last entered' },
                { value: 'display_name', label: 'Display name' },
                { value: 'created_at', label: 'Created' },
                { value: 'moderation_status', label: 'Moderation' },
              ]}
              size="compact"
            />
          </label>
          <label>
            Direction
            <PremiumSelect
              aria-label="Direction"
              defaultValue={query.direction}
              name="direction"
              options={[
                { value: 'desc', label: 'Descending' },
                { value: 'asc', label: 'Ascending' },
              ]}
              size="compact"
            />
          </label>
          <input name="pageSize" type="hidden" value={query.pageSize} />
          <button className="button button--primary" type="submit">
            Apply filters
          </button>
          <Link className="button button--quiet" href="/players">
            Clear
          </Link>
        </form>

        {directory.items.length === 0 ? (
          <section className="empty-state">
            <h2>No matching players</h2>
            <p>No stored profile matches the current bounded search and filters.</p>
          </section>
        ) : (
          <div
            className="data-table-region"
            role="region"
            aria-label="Player directory"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Wallet</th>
                  <th scope="col">Moderation</th>
                  <th scope="col">Map</th>
                  <th scope="col">Access sessions</th>
                  <th scope="col">Last entered (UTC)</th>
                  <th scope="col">Last updated (UTC)</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {directory.items.map((player) => (
                  <tr key={player.id}>
                    <td data-label="Player">
                      <strong>{player.displayName}</strong>
                      <small>{player.appearancePreset}</small>
                    </td>
                    <td data-label="Wallet">
                      {player.walletAddress === null ? (
                        <span>Restricted</span>
                      ) : (
                        <code>{shortWallet(player.walletAddress)}</code>
                      )}
                    </td>
                    <td data-label="Moderation">
                      <span className={`state-chip state-chip--${player.moderationStatus}`}>
                        {player.moderationStatus}
                      </span>
                      {player.renameRequired ? <small>Rename required</small> : null}
                    </td>
                    <td data-label="Map">Lantern Square</td>
                    <td data-label="Access sessions">{player.activeAccessSessions}</td>
                    <td data-label="Last entered">{formatDate(player.lastEnteredAt)}</td>
                    <td data-label="Last updated">{formatDate(player.updatedAt)}</td>
                    <td data-label="Open">
                      <Link className="table-link" href={`/players/${player.id}`}>
                        Review<span className="sr-only"> {player.displayName}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav className="pagination" aria-label="Player directory pages">
          {directory.page <= 1 ? (
            <span aria-disabled="true" className="is-disabled">
              Previous
            </span>
          ) : (
            <Link href={playerDirectoryHref(query, { page: directory.page - 1 })}>Previous</Link>
          )}
          <span>
            Page {directory.page} of {Math.max(1, directory.totalPages)}
          </span>
          {directory.page >= directory.totalPages ? (
            <span aria-disabled="true" className="is-disabled">
              Next
            </span>
          ) : (
            <Link href={playerDirectoryHref(query, { page: directory.page + 1 })}>Next</Link>
          )}
        </nav>
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main className="operations-page" aria-labelledby="players-title">
        <h1 id="players-title">Players</h1>
        <section className="empty-state" role="alert">
          <h2>{forbidden ? 'Permission required' : 'Player directory unavailable'}</h2>
          <p>No placeholder player records are shown.</p>
          <Link className="button button--secondary" href="/players">
            Try again
          </Link>
        </section>
      </main>
    );
  }
}
