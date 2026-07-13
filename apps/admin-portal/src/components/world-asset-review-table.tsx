import Link from 'next/link';

import type { AssetReviewQueueItem } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import { assetTypeLabel } from '../lib/world-assets/profiles';
import { WorldAssetThumbnail } from './world-asset-thumbnail';

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export function WorldAssetReviewTable(props: {
  readonly candidates: readonly AssetReviewQueueItem[];
}) {
  return (
    <div
      aria-label="World asset review candidates"
      className="data-table-region world-asset-table-region"
      role="region"
      tabIndex={0}
    >
      <table className="data-table world-asset-table">
        <thead>
          <tr>
            <th scope="col">Candidate</th>
            <th scope="col">Type</th>
            <th scope="col">Validation</th>
            <th scope="col">References</th>
            <th scope="col">Submitted</th>
            <th scope="col">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.candidates.map(({ asset, version, referenceSummary }) => (
            <tr key={version.id}>
              <td data-label="Candidate">
                <div className="world-asset-table__identity">
                  <WorldAssetThumbnail
                    alt={`${asset.friendlyName} review thumbnail`}
                    fallback={asset.slug}
                    source={availableAdminAssetMediaPath(
                      asset.id,
                      version.id,
                      'thumbnail',
                      version.thumbnailUrl,
                    )}
                  />
                  <span>
                    <strong>{asset.friendlyName}</strong>
                    <small>
                      {asset.slug} · version {version.versionNumber}
                    </small>
                  </span>
                </div>
              </td>
              <td data-label="Type">
                {assetTypeLabel(asset.assetType)}
                <small>{humanize(asset.category)}</small>
              </td>
              <td data-label="Validation">
                <span className={`state-chip state-chip--${version.validationStatus}`}>
                  {humanize(version.validationStatus)}
                </span>
                <small>{humanize(version.lifecycleStatus)}</small>
              </td>
              <td data-label="References">
                {referenceSummary.published} published
                <small>
                  {referenceSummary.drafts} draft · {referenceSummary.activeConfiguration} active
                  configuration
                </small>
              </td>
              <td data-label="Submitted">
                {version.submittedAt === null
                  ? 'Not recorded'
                  : `${new Date(version.submittedAt).toLocaleString('en', { timeZone: 'UTC' })} UTC`}
              </td>
              <td data-label="Open">
                <Link
                  className="table-link"
                  href={`/world-assets/${asset.id}/versions/${version.id}`}
                >
                  Review<span className="sr-only"> {asset.friendlyName}</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
