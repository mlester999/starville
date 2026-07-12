import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';

import { MAP_IDS, type MapId } from '@starville/game-core';

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
            <select defaultValue={query.status} name="status">
              <option value="all">All states</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label>
            Rename
            <select defaultValue={query.rename} name="rename">
              <option value="all">All</option>
              <option value="required">Required</option>
              <option value="clear">Not required</option>
            </select>
          </label>
          <label>
            Recent entry
            <select defaultValue={query.recentDays ?? ''} name="recentDays">
              <option value="">Any time</option>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </label>
          <label>
            Map
            <select defaultValue={query.mapId} name="mapId">
              <option value="all">All maps</option>
              {MAP_IDS.map((mapId) => (
                <option key={mapId} value={mapId}>
                  {MAP_LABELS[mapId]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select defaultValue={query.sort} name="sort">
              <option value="last_entered_at">Last entered</option>
              <option value="display_name">Display name</option>
              <option value="created_at">Created</option>
              <option value="moderation_status">Moderation</option>
            </select>
          </label>
          <label>
            Direction
            <select defaultValue={query.direction} name="direction">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
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
