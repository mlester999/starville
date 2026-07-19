'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  WORLD_VISUAL_REVIEW_CHECKS,
  WORLD_VISUAL_REVIEW_MODES,
  WORLD_VISUAL_REVIEW_VIEWPORTS,
  worldVisualReviewMode,
  worldVisualReviewProgress,
  worldVisualReviewViewport,
  type WorldVisualReviewCheckId,
  type WorldVisualReviewModeId,
  type WorldVisualReviewViewportId,
} from '../lib/worlds/visual-readiness-review';
import type { AdminWorldVisualReadinessSnapshot } from '../lib/worlds/visual-readiness-snapshot';
import styles from './world-visual-readiness.module.css';

const FINDING_SEVERITY_LABELS = {
  error: 'Advisory error',
  warning: 'Warning',
  recommendation: 'Recommendation',
} as const;

function toggleInSet<Value>(current: ReadonlySet<Value>, value: Value): ReadonlySet<Value> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function WorldVisualReadiness({
  revision = null,
}: {
  readonly revision?: AdminWorldVisualReadinessSnapshot | null;
}) {
  const [modeId, setModeId] = useState<WorldVisualReviewModeId>('arrival_landmark');
  const [completedChecks, setCompletedChecks] = useState<ReadonlySet<WorldVisualReviewCheckId>>(
    () => new Set(),
  );
  const [capturedViewports, setCapturedViewports] = useState<
    ReadonlySet<WorldVisualReviewViewportId>
  >(() => new Set());
  const mode = worldVisualReviewMode(modeId);
  const viewport = worldVisualReviewViewport(mode.viewportId);
  const progress = useMemo(() => worldVisualReviewProgress(completedChecks), [completedChecks]);
  const activeModeCheckIds = useMemo<ReadonlySet<WorldVisualReviewCheckId>>(
    () => new Set(mode.checkIds),
    [mode],
  );

  function resetLocalReview(): void {
    setModeId('arrival_landmark');
    setCompletedChecks(new Set());
    setCapturedViewports(new Set());
  }

  return (
    <main className={`operations-page ${styles['page']}`} aria-labelledby="visual-readiness-title">
      <header className="operations-intro">
        <div>
          <Link className="back-link" href="/worlds">
            ← Worlds
          </Link>
          <p className="eyebrow">Phase 12C · local inspection workspace</p>
          <h1 id="visual-readiness-title">Visual Readiness</h1>
          <p>
            {revision === null
              ? 'Choose an exact world revision, then run the same camera, composition, mobile, HUD, and screenshot inspection sequence. This area is a checklist—not a second Composer.'
              : `Reviewing ${revision.mapName} Version ${String(revision.versionNumber)} from its immutable server-loaded manifest. This area is a checklist—not a second Composer.`}
          </p>
        </div>
        <span className="permission-badge">Read-only</span>
      </header>

      <section
        className={`notice notice--info ${styles['boundary']}`}
        aria-label="Read-only boundary"
      >
        <div>
          <strong>Browser-local review only</strong>
          <p>
            Selections clear on reload. Nothing here saves a draft, records approval, launches a
            publication, or changes player state. Shared-policy findings and camera frames below are
            derived from the selected revision; open an exact validated revision in Game Test for
            renderer evidence.
          </p>
        </div>
        <div className={styles['boundaryActions']}>
          <Link
            className="button button--secondary"
            href={revision === null ? '/worlds' : `/worlds/${revision.mapId}`}
          >
            {revision === null ? 'Choose a world' : 'Change revision'}
          </Link>
          <Link className="button button--quiet" href="/world-assets/coverage">
            Asset coverage
          </Link>
        </div>
      </section>

      {revision === null ? (
        <section className={styles['revisionEmpty']} role="status">
          <h2>No exact revision selected</h2>
          <p>
            Open Visual Readiness from a Composer, world revision, or version row to see trusted
            revision identity, shared-policy findings, and computed camera coverage.
          </p>
        </section>
      ) : (
        <section className={styles['revisionCard']} aria-labelledby="readiness-revision-title">
          <div className={styles['revisionHeading']}>
            <div>
              <p className="eyebrow">Exact read-only revision</p>
              <h2 id="readiness-revision-title">
                {revision.mapName} · Version {revision.versionNumber}
              </h2>
              <p>
                Manifest <strong>{revision.manifestName}</strong> ·{' '}
                <code>{revision.versionId}</code>
              </p>
            </div>
            <Link
              className="button button--quiet"
              href={`/worlds/${revision.mapId}/revisions/${revision.versionId}`}
            >
              Inspect revision
            </Link>
          </div>
          <dl className={styles['revisionFacts']}>
            <div>
              <dt>Trusted validation</dt>
              <dd>{revision.validationStatus}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{revision.lifecycleStatus}</dd>
            </div>
            <div>
              <dt>Checksum</dt>
              <dd>
                <code>
                  {revision.checksum === null
                    ? 'Unavailable'
                    : `${revision.checksum.slice(0, 16)}…`}
                </code>
              </dd>
            </div>
            <div>
              <dt>Shared visual policy</dt>
              <dd>{revision.readiness.ready ? 'Clear' : 'Advisories present'}</dd>
            </div>
          </dl>
          <div className={styles['severitySummary']} aria-label="Shared visual-policy findings">
            <span className="state-chip state-chip--error">
              Errors: {revision.readiness.counts.error}
            </span>
            <span className="state-chip state-chip--pending">
              Warnings: {revision.readiness.counts.warning}
            </span>
            <span className="state-chip">
              Recommendations: {revision.readiness.counts.recommendation}
            </span>
          </div>
          {revision.readiness.findings.length === 0 ? (
            <p className={styles['revisionClear']} role="status">
              No deterministic shared-policy findings. Manual renderer review remains required.
            </p>
          ) : (
            <ul className={styles['findingList']}>
              {revision.readiness.findings.map((finding) => (
                <li
                  data-visual-severity={finding.severity}
                  key={`${finding.severity}-${finding.code}-${finding.objectIds?.join('-') ?? 'map'}`}
                >
                  <strong>{FINDING_SEVERITY_LABELS[finding.severity]}</strong>
                  <code>{finding.code}</code>
                  <span>{finding.message}</span>
                </li>
              ))}
            </ul>
          )}
          <div
            className="data-table-region"
            role="region"
            aria-label="Computed camera coverage for the exact revision"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Viewport</th>
                  <th scope="col">Computed zoom</th>
                  <th scope="col">Terrain apron</th>
                  <th scope="col">Projected bounds</th>
                </tr>
              </thead>
              <tbody>
                {revision.cameraFrames.map((frame) => (
                  <tr key={frame.viewportId}>
                    <td data-label="Viewport">
                      <strong>{frame.label}</strong>
                      <small>
                        {frame.width}×{frame.height}
                      </small>
                    </td>
                    <td data-label="Computed zoom">{frame.zoom.toFixed(3)}</td>
                    <td data-label="Terrain apron">{frame.apronTiles} tile(s)</td>
                    <td data-label="Projected bounds">
                      {Math.round(frame.projectedWidth)}×{Math.round(frame.projectedHeight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles['revisionBoundary']}>
            These are deterministic advisory calculations, not pixel evidence and not publication
            approval. Manual checkmarks below remain browser-local.
          </p>
        </section>
      )}

      <section className={styles['progressCard']} aria-labelledby="visual-progress-title">
        <div>
          <p className="eyebrow">Local pass progress</p>
          <h2 id="visual-progress-title">
            {progress.complete} of {progress.total} review dimensions checked
          </h2>
          <p>Completion is a working aid only; it is not trusted publication evidence.</p>
        </div>
        <div className={styles['progressControl']}>
          <progress aria-label="Local visual review progress" max={100} value={progress.percent} />
          <span>{progress.percent}%</span>
          <button className="button button--quiet" onClick={resetLocalReview} type="button">
            Reset local review
          </button>
        </div>
      </section>

      <section aria-labelledby="review-modes-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Deterministic review modes</p>
            <h2 id="review-modes-title">Choose one repeatable fixture</h2>
          </div>
          <span className="state-chip">No saved local state</span>
        </div>
        <div className={styles['modeGrid']} role="group" aria-label="Visual review modes">
          {WORLD_VISUAL_REVIEW_MODES.map((candidate) => (
            <button
              aria-pressed={candidate.id === modeId}
              className={`${styles['modeButton']} ${candidate.id === modeId ? styles['modeButtonActive'] : ''}`}
              key={candidate.id}
              onClick={() => setModeId(candidate.id)}
              type="button"
            >
              <strong>{candidate.label}</strong>
              <span>{candidate.purpose}</span>
              <small>{worldVisualReviewViewport(candidate.viewportId).label}</small>
            </button>
          ))}
        </div>
      </section>

      <section className={styles['fixtureCard']} aria-labelledby="active-fixture-title">
        <div className={styles['fixtureIdentity']}>
          <p className="eyebrow">Active fixture</p>
          <h2 id="active-fixture-title">{mode.label}</h2>
          <p>{mode.purpose}</p>
          <dl className={styles['fixtureFacts']}>
            <div>
              <dt>Viewport</dt>
              <dd>
                {viewport.width}×{viewport.height} · {viewport.input}
              </dd>
            </div>
            <div>
              <dt>Starting condition</dt>
              <dd>{mode.fixture}</dd>
            </div>
            <div>
              <dt>Review focus</dt>
              <dd>
                {mode.checkIds
                  .flatMap((id) => {
                    const label = WORLD_VISUAL_REVIEW_CHECKS.find(
                      (check) => check.id === id,
                    )?.label;
                    return label === undefined ? [] : [label];
                  })
                  .join(' · ')}
              </dd>
            </div>
          </dl>
        </div>
        <ol className={styles['steps']}>
          {mode.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="readiness-checks-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Advisory manual review</p>
            <h2 id="readiness-checks-title">Composition and usability checks</h2>
          </div>
          <span className="state-chip state-chip--pending">Local state</span>
        </div>
        <div className={styles['checkGrid']}>
          {WORLD_VISUAL_REVIEW_CHECKS.map((check) => {
            const active = activeModeCheckIds.has(check.id);
            return (
              <label
                className={`${styles['checkCard']} ${active ? styles['checkCardActive'] : ''}`}
                key={check.id}
              >
                <input
                  checked={completedChecks.has(check.id)}
                  onChange={() => setCompletedChecks((current) => toggleInSet(current, check.id))}
                  type="checkbox"
                />
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.guidance}</small>
                  {active ? <em>Active-mode focus</em> : null}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="screenshot-matrix-title">
        <div className={styles['sectionHeading']}>
          <div>
            <p className="eyebrow">Manual screenshot matrix</p>
            <h2 id="screenshot-matrix-title">Capture named, reproducible frames</h2>
          </div>
          <span className="state-chip">
            {capturedViewports.size}/{WORLD_VISUAL_REVIEW_VIEWPORTS.length} captured locally
          </span>
        </div>
        <div
          className="data-table-region"
          role="region"
          aria-label="Screenshot viewport matrix"
          tabIndex={0}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Captured</th>
                <th scope="col">Viewport</th>
                <th scope="col">Input</th>
                <th scope="col">Required frame</th>
              </tr>
            </thead>
            <tbody>
              {WORLD_VISUAL_REVIEW_VIEWPORTS.map((candidate) => (
                <tr key={candidate.id}>
                  <td data-label="Captured">
                    <input
                      aria-label={`Captured ${candidate.label} screenshot`}
                      checked={capturedViewports.has(candidate.id)}
                      onChange={() =>
                        setCapturedViewports((current) => toggleInSet(current, candidate.id))
                      }
                      type="checkbox"
                    />
                  </td>
                  <td data-label="Viewport">
                    <strong>{candidate.label}</strong>
                    <small>
                      {candidate.width}×{candidate.height}
                    </small>
                  </td>
                  <td data-label="Input">{candidate.input}</td>
                  <td data-label="Required frame">{candidate.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles['screenshotNote']}>
          Name captures with world slug, immutable version, viewport ID, and review mode. Capture
          after assets settle, with debug overlays off and the exact same browser zoom on every run.
        </p>
      </section>
    </main>
  );
}
