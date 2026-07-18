'use client';

import { useState } from 'react';
import type { AssetType } from '@starville/asset-management';

import {
  assetRequirementGuide,
  generalProductionChecklist,
  guideGroups,
} from '../lib/world-assets/requirements';
import { downloadTransparentTemplate } from '../lib/world-assets/template-canvas';
import { PremiumSelect } from './premium-select';

export function WorldAssetGuidePanel(props: {
  readonly initialType?: AssetType;
  readonly compact?: boolean;
}) {
  const [assetType, setAssetType] = useState<AssetType>(props.initialType ?? 'building');
  const [includeGuides, setIncludeGuides] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guide = assetRequirementGuide(assetType);
  const groups = guideGroups();

  async function downloadTemplate(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      await downloadTransparentTemplate({
        width: guide.recommendedWidth,
        height: guide.recommendedHeight,
        label: `${guide.label} · recommended`,
        fileName: guide.templateFileName,
        showSafeGuides: includeGuides,
      });
      setStatus(
        `Downloaded ${guide.templateFileName}. This file is local only and was not uploaded.`,
      );
    } catch {
      setStatus(
        'The template could not be generated in this browser. Try a modern desktop browser.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`world-asset-guide-panel ${props.compact === true ? 'is-compact' : ''}`}>
      <div className="world-asset-guide-panel__toolbar">
        <label className="field">
          <span>Asset type</span>
          <PremiumSelect
            id="asset-guide-type"
            onChange={(value) => setAssetType(value as AssetType)}
            options={groups.flatMap((group) =>
              group.types.map((type) => ({
                value: type,
                label: assetRequirementGuide(type).label,
              })),
            )}
            value={assetType}
          />
        </label>
        <label className="asset-checkbox">
          <input
            checked={includeGuides}
            onChange={(event) => setIncludeGuides(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Include faint layout guides in the template</span>
        </label>
        <button
          className="button button--primary"
          disabled={busy}
          onClick={() => void downloadTemplate()}
          type="button"
        >
          {busy ? 'Preparing…' : 'Download blank template'}
        </button>
      </div>

      {status === null ? null : (
        <p className="field-hint" role="status">
          {status}
        </p>
      )}

      <section className="detail-card" aria-labelledby="guide-type-title">
        <h2 id="guide-type-title">{guide.label}</h2>
        <p>{guide.description}</p>
        <dl className="asset-requirements-inline">
          <div>
            <dt>Formats</dt>
            <dd>{guide.formats.join(' or ')}</dd>
          </div>
          <div>
            <dt>{guide.dimensionsExact ? 'Required dimensions' : 'Recommended dimensions'}</dt>
            <dd>{guide.recommendedDimensionsLabel}</dd>
          </div>
          <div>
            <dt>Aspect ratio</dt>
            <dd>{guide.recommendedRatio}</dd>
          </div>
          <div>
            <dt>Maximum size</dt>
            <dd>{guide.maxFileSizeLabel}</dd>
          </div>
          <div>
            <dt>Transparency</dt>
            <dd>{guide.transparency === 'required' ? 'Required' : 'Optional'}</dd>
          </div>
        </dl>

        <h3>Checklist</h3>
        <ul className="asset-guide-checklist">
          {guide.checklist.map((item) => (
            <li className={`asset-guide-checklist__item is-${item.severity}`} key={item.id}>
              <strong>
                <span className="sr-only">{item.severity}. </span>
                {item.label}
              </strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>

        <h3>Do not upload</h3>
        <ul className="asset-guide-reject-list">
          {guide.rejectList.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {props.compact === true ? null : (
        <>
          <section className="detail-card" aria-labelledby="guide-general-title">
            <h2 id="guide-general-title">General production checklist</h2>
            <ul className="asset-requirements-checklist">
              {generalProductionChecklist().map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="detail-card" aria-labelledby="guide-groups-title">
            <h2 id="guide-groups-title">Type families</h2>
            <div className="world-asset-guide-groups">
              {groups.map((group) => (
                <article key={group.title}>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                  <ul>
                    {group.types.map((type) => {
                      const entry = assetRequirementGuide(type);
                      return (
                        <li key={type}>
                          <button
                            className="button button--quiet"
                            onClick={() => setAssetType(type)}
                            type="button"
                          >
                            {entry.label}
                          </button>
                          <small>
                            {entry.recommendedDimensionsLabel} · {entry.maxFileSizeLabel}
                          </small>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
