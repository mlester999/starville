import Link from 'next/link';

import type { WorldAssetSummary } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import { assetTypeLabel } from '../lib/world-assets/profiles';
import { canonicalWorldAssetPath } from '../lib/world-assets/version-recovery';
import { WorldAssetThumbnail } from './world-asset-thumbnail';

function formatDate(value: string): string {
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export function WorldAssetTable(props: {
  readonly assets: readonly WorldAssetSummary[];
  readonly reviewQueue?: boolean;
}) {
  return (
    <div
      className="data-table-region world-asset-table-region"
      role="region"
      aria-label="World asset directory"
      tabIndex={0}
    >
      <table className="data-table world-asset-table">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col">Type</th>
            <th scope="col">Lifecycle</th>
            <th scope="col">Artwork</th>
            <th scope="col">Active version</th>
            <th scope="col">References</th>
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.assets.map((asset) => (
            <tr key={asset.id}>
              <td data-label="Asset">
                <div className="world-asset-table__identity">
                  <WorldAssetThumbnail
                    alt={`${asset.friendlyName} thumbnail`}
                    fallback={asset.slug}
                    source={
                      asset.activeVersionId === null
                        ? null
                        : availableAdminAssetMediaPath(
                            asset.id,
                            asset.activeVersionId,
                            'thumbnail',
                            asset.thumbnailUrl,
                          )
                    }
                  />
                  <span>
                    <strong>{asset.friendlyName}</strong>
                    <small title={asset.slug}>{asset.slug}</small>
                  </span>
                </div>
              </td>
              <td data-label="Type">
                {assetTypeLabel(asset.assetType)}
                <small>{humanize(asset.category)}</small>
              </td>
              <td data-label="Lifecycle">
                <span className={`state-chip state-chip--${asset.lifecycleStatus}`}>
                  {humanize(asset.lifecycleStatus)}
                </span>
              </td>
              <td data-label="Artwork">
                <span
                  className={`asset-production-badge asset-production-badge--${asset.productionStatus}`}
                >
                  {humanize(asset.productionStatus)}
                </span>
              </td>
              <td data-label="Active version">
                {asset.activeVersionId === null ? 'Not active' : 'Active version pinned'}
                <small>{asset.versionCount} total version(s)</small>
              </td>
              <td data-label="References">{asset.referenceCount} tracked</td>
              <td data-label="Updated">{formatDate(asset.updatedAt)}</td>
              <td data-label="Open">
                <Link className="table-link" href={canonicalWorldAssetPath(asset.id)}>
                  {props.reviewQueue ? 'Review' : 'Manage'}
                  <span className="sr-only"> {asset.friendlyName}</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
