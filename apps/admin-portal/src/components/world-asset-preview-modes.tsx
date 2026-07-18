'use client';

import dynamic from 'next/dynamic';
import { useRef, useState, type KeyboardEvent } from 'react';

import type {
  AssetDraftConfiguration,
  WorldAssetSummary,
  WorldAssetVersion,
} from '../lib/world-assets/contracts';
import type { AssetSceneWorldDirectory } from '../lib/world-assets/scene-preview-model';
import { WorldAssetPreviewWorkspace } from './world-asset-preview-workspace';

const WorldAssetScenePreview = dynamic(
  () => import('./world-asset-scene-preview').then((module) => module.WorldAssetScenePreview),
  {
    loading: () => (
      <section className="asset-scene-loading" aria-live="polite" role="status">
        <strong>Loading read-only scene preview…</strong>
        <p>Only the selected world context and sanitized derivative will be requested.</p>
      </section>
    ),
    ssr: false,
  },
);

type PreviewMode = 'technical' | 'scene' | 'compare';

const MODES = [
  { id: 'technical', label: 'Technical Preview' },
  { id: 'scene', label: 'In-Game Scene Preview' },
  { id: 'compare', label: 'Compare Versions' },
] as const satisfies readonly Readonly<{ id: PreviewMode; label: string }>[];

export function WorldAssetPreviewModes(props: {
  readonly asset: WorldAssetSummary;
  readonly version: WorldAssetVersion;
  readonly activeVersion: WorldAssetVersion | null;
  readonly configuration: AssetDraftConfiguration;
  readonly onChange: (configuration: AssetDraftConfiguration) => void;
  readonly editable: boolean;
  readonly worldDirectory: AssetSceneWorldDirectory;
}) {
  const [mode, setMode] = useState<PreviewMode>('technical');
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0 && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? MODES.length - 1
          : (index + delta + MODES.length) % MODES.length;
    const next = MODES[nextIndex];
    if (next === undefined) return;
    setMode(next.id);
    tabsRef.current[nextIndex]?.focus();
  }

  return (
    <section className="asset-preview-modes" aria-labelledby="asset-preview-modes-title">
      <header className="asset-preview-modes__header">
        <div>
          <p className="eyebrow">Non-mutating inspection</p>
          <h2 id="asset-preview-modes-title">Asset preview modes</h2>
          <p>
            Technical configuration, real map context, and active-versus-candidate comparison stay
            separate from review, activation, draft editing, and publication.
          </p>
        </div>
        <div aria-label="Asset preview mode" className="asset-preview-tabs" role="tablist">
          {MODES.map((item, index) => (
            <button
              aria-controls={`asset-preview-panel-${item.id}`}
              aria-selected={mode === item.id}
              className="asset-preview-tabs__tab"
              id={`asset-preview-tab-${item.id}`}
              key={item.id}
              onClick={() => setMode(item.id)}
              onKeyDown={(event) => selectFromKeyboard(event, index)}
              ref={(node) => {
                tabsRef.current[index] = node;
              }}
              role="tab"
              tabIndex={mode === item.id ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div
        aria-labelledby={`asset-preview-tab-${mode}`}
        id={`asset-preview-panel-${mode}`}
        role="tabpanel"
        tabIndex={0}
      >
        {mode === 'technical' ? (
          <WorldAssetPreviewWorkspace
            configuration={props.configuration}
            editable={props.editable}
            onChange={props.onChange}
            version={props.version}
          />
        ) : (
          <WorldAssetScenePreview
            activeVersion={props.activeVersion}
            asset={props.asset}
            configuration={props.configuration}
            mode={mode}
            onReturnToTechnical={() => setMode('technical')}
            version={props.version}
            worldDirectory={props.worldDirectory}
          />
        )}
      </div>
    </section>
  );
}
