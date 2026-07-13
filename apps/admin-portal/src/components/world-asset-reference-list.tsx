import type { AssetReferenceDirectory } from '../lib/world-assets/contracts';

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export function WorldAssetReferenceList(props: { readonly references: AssetReferenceDirectory }) {
  return (
    <section className="detail-card" aria-labelledby="asset-reference-records-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Bounded reference inspection</p>
          <h2 id="asset-reference-records-title">Reference records</h2>
        </div>
        <span className="permission-badge">{props.references.total} tracked</span>
      </div>
      {props.references.items.length === 0 ? (
        <p>No world or game-content reference currently points to this asset.</p>
      ) : (
        <ol className="asset-reference-list">
          {props.references.items.map((reference) => (
            <li key={`${reference.versionId}-${reference.referenceType}-${reference.referenceKey}`}>
              <strong>{humanize(reference.referenceType)}</strong>
              <span>{reference.referenceKey}</span>
              <small>
                {humanize(reference.lifecycle)} · pinned version {reference.versionId.slice(0, 8)}…
              </small>
            </li>
          ))}
        </ol>
      )}
      {props.references.total > props.references.items.length ? (
        <p className="field-hint">
          Showing the first {props.references.items.length} of {props.references.total} bounded
          references. The totals above remain authoritative for deprecation and archival safety.
        </p>
      ) : null}
    </section>
  );
}
