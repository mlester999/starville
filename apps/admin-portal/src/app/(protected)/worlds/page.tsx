import Link from 'next/link';
import { deriveWorldTopology } from '@starville/game-content';

import { PremiumSelect } from '../../../components/premium-select';
import { WorldTopology } from '../../../components/world-topology';
import { AdminApiError } from '../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadPublishedWorldTopology, loadWorldDirectory } from '../../../lib/worlds/api';
import { parseWorldDirectoryQuery, worldDirectoryHref } from '../../../lib/worlds/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

export default async function WorldsPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('maps.read');
  const rawSearchParams = await props.searchParams;
  const query = parseWorldDirectoryQuery(rawSearchParams);
  const requestedAsset =
    typeof rawSearchParams['assetKey'] === 'string' &&
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(rawSearchParams['assetKey'])
      ? rawSearchParams['assetKey']
      : null;

  try {
    const [directory, topology] = await Promise.all([
      loadWorldDirectory(query),
      loadPublishedWorldTopology(),
    ]);
    const derivedTopology = deriveWorldTopology(topology);
    const topologyBySlug = new Map(derivedTopology.nodes.map((node) => [node.map.slug, node]));
    return (
      <main className="operations-page" aria-labelledby="worlds-title">
        <header className="operations-intro">
          <div>
            <p className="eyebrow">Versioned world content</p>
            <h1 id="worlds-title">Worlds</h1>
            <p>
              Review real map records, drafts, validation state, and immutable publication history.
              Normal players can load only the active published version.
            </p>
          </div>
          <span className="permission-badge">{directory.total} map(s)</span>
        </header>

        <WorldTopology topology={topology} />

        {requestedAsset === null ? null : (
          <section className="notice notice--info" aria-label="World draft placement request">
            <strong>Choose a compatible world draft</strong>
            <p>
              Asset <code>{requestedAsset}</code> will be preselected only. Opening the Composer,
              previewing placement, confirming placement, and saving a new revision remain explicit.
            </p>
          </section>
        )}

        <form className="player-filters" method="get" role="search">
          <label>
            Name or slug
            <input defaultValue={query.search} maxLength={100} name="search" type="search" />
          </label>
          <label>
            Map status
            <PremiumSelect
              aria-label="Map status"
              defaultValue={query.status}
              name="status"
              options={[
                { value: 'all', label: 'All states' },
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
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
                { value: 'updated_at', label: 'Last updated' },
                { value: 'display_name', label: 'Display name' },
                { value: 'slug', label: 'Slug' },
                { value: 'status', label: 'Status' },
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
          <Link className="button button--quiet" href="/worlds">
            Clear
          </Link>
        </form>

        {directory.items.length === 0 ? (
          <section className="empty-state">
            <h2>No matching maps</h2>
            <p>No authorized world record matches the bounded search and filters.</p>
          </section>
        ) : (
          <div
            className="data-table-region"
            role="region"
            aria-label="World directory"
            tabIndex={0}
          >
            <table className="data-table world-table">
              <thead>
                <tr>
                  <th scope="col">World</th>
                  <th scope="col">Map status</th>
                  <th scope="col">Role</th>
                  <th scope="col">Connections</th>
                  <th scope="col">Published</th>
                  <th scope="col">Draft</th>
                  <th scope="col">Validation</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {directory.items.map((world) => (
                  <tr key={world.id}>
                    <td data-label="World">
                      <strong>{world.displayName}</strong>
                      <small>{world.slug}</small>
                    </td>
                    <td data-label="Map status">
                      <span className={`state-chip state-chip--${world.status}`}>
                        {world.status}
                      </span>
                    </td>
                    <td data-label="Role">
                      {topologyBySlug.get(world.slug)?.role ?? 'No published role'}
                    </td>
                    <td data-label="Connections">
                      <div className="connection-chips">
                        {topologyBySlug.get(world.slug)?.map.manifest.exits.map((exit) => (
                          <span
                            className={
                              exit.enabled ? 'connection-chip' : 'connection-chip is-disabled'
                            }
                            key={exit.direction}
                          >
                            {exit.direction.slice(0, 1).toUpperCase()}:{' '}
                            {exit.enabled
                              ? (exit.transitionLabel ?? exit.destinationMapId)
                              : 'Disabled'}
                          </span>
                        )) ?? 'Unavailable'}
                      </div>
                    </td>
                    <td data-label="Published">
                      {world.activeVersionNumber === null
                        ? 'None'
                        : `Version ${world.activeVersionNumber}`}
                    </td>
                    <td data-label="Draft">
                      {world.draftVersionId === null ? 'None' : 'Available'}
                    </td>
                    <td data-label="Validation">
                      {world.draftValidationStatus === null ? (
                        'Not applicable'
                      ) : (
                        <span className={`state-chip state-chip--${world.draftValidationStatus}`}>
                          {world.draftValidationStatus}
                        </span>
                      )}
                    </td>
                    <td data-label="Updated">{formatDate(world.updatedAt)}</td>
                    <td data-label="Open">
                      {requestedAsset !== null && world.draftVersionId !== null ? (
                        <Link
                          className="table-link"
                          href={`/worlds/${world.id}/editor?version=${world.draftVersionId}&assetKey=${encodeURIComponent(requestedAsset)}`}
                        >
                          Use in draft<span className="sr-only"> {world.displayName}</span>
                        </Link>
                      ) : (
                        <Link className="table-link" href={`/worlds/${world.id}`}>
                          Manage<span className="sr-only"> {world.displayName}</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <nav className="pagination" aria-label="World directory pages">
          {directory.page <= 1 ? (
            <span aria-disabled="true" className="is-disabled">
              Previous
            </span>
          ) : (
            <Link href={worldDirectoryHref(query, { page: directory.page - 1 })}>Previous</Link>
          )}
          <span>
            Page {directory.page} of {Math.max(1, directory.totalPages)}
          </span>
          {directory.page >= directory.totalPages ? (
            <span aria-disabled="true" className="is-disabled">
              Next
            </span>
          ) : (
            <Link href={worldDirectoryHref(query, { page: directory.page + 1 })}>Next</Link>
          )}
        </nav>
      </main>
    );
  } catch (error) {
    const forbidden = error instanceof AdminApiError && error.status === 403;
    return (
      <main className="operations-page" aria-labelledby="worlds-title">
        <h1 id="worlds-title">Worlds</h1>
        <section className="empty-state" role="alert">
          <h2>{forbidden ? 'Permission required' : 'World directory unavailable'}</h2>
          <p>No cached drafts, publications, or placeholder maps are shown.</p>
          <Link className="button button--secondary" href="/worlds">
            Try again
          </Link>
        </section>
      </main>
    );
  }
}
