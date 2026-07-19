import {
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  bundledAssetAdminMediaPath,
  getBundledAsset,
  type AssetVersion,
} from '@starville/asset-management';

import styles from './world-asset-bundled.module.css';

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function uploadedMetric(
  version: AssetVersion | null,
  render: (value: AssetVersion) => string,
): string {
  return version === null ? 'No selected uploaded version' : render(version);
}

function byteLabel(bytes: number | null): string {
  if (bytes === null) return 'Not recorded';
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function WorldAssetBundledComparison(props: {
  readonly assetKey: string;
  readonly bundledSizeBytes: number | null;
  readonly uploadedVersion: AssetVersion | null;
  readonly uploadedMediaUrl: string | null;
  readonly uploadedLabel: string;
}) {
  const bundled = getBundledAsset(props.assetKey);
  const candidate = getBundledAsset(props.assetKey, STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION);
  return (
    <section className="detail-card" aria-labelledby="bundled-comparison-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Read-only source comparison</p>
          <h2 id="bundled-comparison-title">Compare with Bundled Default</h2>
          <p>
            This view does not activate, approve, upload, or repin anything. It compares the stable
            repository baseline with {props.uploadedLabel.toLowerCase()}.
          </p>
        </div>
        <span className="permission-badge">
          {bundled === undefined
            ? 'Bundled key missing'
            : `Bundled v${bundled.bundledVersion} · Candidate v${STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION}`}
        </span>
      </div>

      {bundled === undefined ? (
        <p role="status">
          No bundled default is registered for <code>{props.assetKey}</code>. The safe missing-asset
          fallback remains available to the resolver.
        </p>
      ) : (
        <>
          <div className={styles['previewGrid']}>
            {(['transparent', 'light', 'dark', 'isometric'] as const).map((backdrop) => (
              <article className={styles['previewMode']} key={backdrop}>
                <strong>
                  {backdrop === 'isometric'
                    ? 'Isometric context'
                    : backdrop === 'transparent'
                      ? 'Transparent background'
                      : `${backdrop === 'light' ? 'Light' : 'Dark'} background`}
                </strong>
                <div className={styles['previewPair']}>
                  <div className={styles['previewFrame']} data-backdrop={backdrop}>
                    <span>Bundled default</span>
                    <img
                      alt={`${bundled.displayName} bundled default on ${backdrop} background`}
                      decoding="async"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={bundledAssetAdminMediaPath(bundled.key, 'source')}
                    />
                  </div>
                  {candidate === undefined ? null : (
                    <div className={styles['previewFrame']} data-backdrop={backdrop}>
                      <span>Phase 12D candidate</span>
                      <img
                        alt={`${candidate.displayName} Phase 12D production candidate on ${backdrop} background`}
                        decoding="async"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={bundledAssetAdminMediaPath(
                          candidate.key,
                          'source',
                          STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
                        )}
                      />
                    </div>
                  )}
                  <div className={styles['previewFrame']} data-backdrop={backdrop}>
                    <span>{props.uploadedLabel}</span>
                    {props.uploadedMediaUrl === null ? (
                      <p>No eligible processed uploaded media.</p>
                    ) : (
                      <img
                        alt={`${props.uploadedLabel} on ${backdrop} background`}
                        decoding="async"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        src={props.uploadedMediaUrl}
                      />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div
            className="data-table-region"
            role="region"
            aria-label="Bundled metrics comparison"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Bundled Default</th>
                  <th scope="col">Phase 12D Candidate</th>
                  <th scope="col">{props.uploadedLabel}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Dimensions</th>
                  <td>
                    {bundled.width} × {bundled.height}
                  </td>
                  <td>
                    {candidate === undefined
                      ? 'Unavailable'
                      : `${String(candidate.width)} × ${String(candidate.height)}`}
                  </td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      version.width === null || version.height === null
                        ? 'Not recorded'
                        : `${String(version.width)} × ${String(version.height)}`,
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">File size</th>
                  <td>{byteLabel(props.bundledSizeBytes)}</td>
                  <td>Recorded in candidate coverage report</td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      byteLabel(version.sourceSizeBytes),
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Render scale</th>
                  <td>{bundled.recommendedScale}</td>
                  <td>{candidate?.recommendedScale ?? 'Unavailable'}</td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      String(version.render.scale),
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Foot anchor</th>
                  <td>
                    {bundled.footAnchor.x}, {bundled.footAnchor.y}
                  </td>
                  <td>
                    {candidate === undefined
                      ? 'Unavailable'
                      : `${String(candidate.footAnchor.x)}, ${String(candidate.footAnchor.y)}`}
                  </td>
                  <td>
                    {uploadedMetric(
                      props.uploadedVersion,
                      (version) =>
                        `${String(version.render.footAnchor.x)}, ${String(version.render.footAnchor.y)}`,
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Footprint</th>
                  <td>
                    {bundled.footprint.width} × {bundled.footprint.height} tile(s)
                  </td>
                  <td>
                    {candidate === undefined
                      ? 'Unavailable'
                      : `${String(candidate.footprint.width)} × ${String(candidate.footprint.height)} tile(s)`}
                  </td>
                  <td>World placement remains manifest-owned</td>
                </tr>
                <tr>
                  <th scope="row">Collision</th>
                  <td>{humanize(bundled.collision.shape)}</td>
                  <td>
                    {candidate === undefined ? 'Unavailable' : humanize(candidate.collision.shape)}
                  </td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      humanize(version.collision.shape),
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Rotations</th>
                  <td>
                    {bundled.supportedRotations
                      .map((rotation) => `${String(rotation)}°`)
                      .join(', ')}
                  </td>
                  <td>
                    {candidate === undefined
                      ? 'Unavailable'
                      : candidate.supportedRotations
                          .map((rotation) => `${String(rotation)}°`)
                          .join(', ')}
                  </td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      version.render.supportedRotations
                        .map((rotation) => `${String(rotation)}°`)
                        .join(', '),
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Validation</th>
                  <td>{humanize(bundled.qualityStatus)} · manifest validated</td>
                  <td>
                    {candidate === undefined
                      ? 'Unavailable'
                      : `${humanize(candidate.qualityStatus)} · owner review pending`}
                  </td>
                  <td>
                    {uploadedMetric(props.uploadedVersion, (version) =>
                      humanize(version.validationStatus),
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
