'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import type { AssetDraftConfiguration, WorldAssetVersion } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import { PremiumSelect } from './premium-select';

type AnchorKey = 'anchor' | 'footAnchor' | 'depthAnchor';
type PreviewSource = 'original' | 'preview' | 'thumbnail' | 'source';

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}

function anchorLabel(anchor: AnchorKey): string {
  if (anchor === 'footAnchor') return 'Foot anchor';
  if (anchor === 'depthAnchor') return 'Depth anchor';
  return 'Render anchor';
}

export function WorldAssetPreviewWorkspace(props: {
  readonly version: WorldAssetVersion;
  readonly configuration: AssetDraftConfiguration;
  readonly onChange: (configuration: AssetDraftConfiguration) => void;
  readonly editable: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<PreviewSource>('preview');
  const [backdrop, setBackdrop] = useState<'checkerboard' | 'light' | 'dark'>('checkerboard');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showCollision, setShowCollision] = useState(true);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [rotation, setRotation] = useState(props.configuration.render.defaultRotation);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const declaredSource =
    source === 'original' || source === 'source'
      ? props.version.sourceUrl
      : source === 'preview'
        ? props.version.previewUrl
        : props.version.thumbnailUrl;
  const previewSource = availableAdminAssetMediaPath(
    props.version.assetId,
    props.version.id,
    source,
    declaredSource,
  );

  function updateAnchor(key: AnchorKey, x: number, y: number): void {
    if (!props.editable) return;
    props.onChange({
      ...props.configuration,
      render: {
        ...props.configuration.render,
        [key]: { x: clamp(x), y: clamp(y) },
      },
    });
  }

  function pointerMove(key: AnchorKey, event: PointerEvent<HTMLButtonElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const frame = frameRef.current;
    if (frame === null) return;
    const bounds = frame.getBoundingClientRect();
    updateAnchor(
      key,
      (event.clientX - bounds.left - pan.x) / bounds.width,
      (event.clientY - bounds.top - pan.y) / bounds.height,
    );
  }

  function keyboardMove(key: AnchorKey, event: KeyboardEvent<HTMLButtonElement>): void {
    const current = props.configuration.render[key];
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();
    updateAnchor(key, current.x + dx, current.y + dy);
  }

  const collision = props.configuration.collision;
  const collisionStyle =
    collision.shape === 'none'
      ? undefined
      : collision.shape === 'rectangle'
        ? {
            width: `${Math.min(90, collision.width * 10)}%`,
            height: `${Math.min(90, collision.height * 10)}%`,
            left: `${50 + collision.offsetX * 5}%`,
            top: `${65 + collision.offsetY * 5}%`,
          }
        : {
            width: `${Math.min(90, (Math.abs(collision.endX - collision.startX) + collision.radius * 2) * 10)}%`,
            height: `${Math.min(90, (Math.abs(collision.endY - collision.startY) + collision.radius * 2) * 10)}%`,
            left: `${50 + ((collision.startX + collision.endX) / 2) * 5}%`,
            top: `${65 + ((collision.startY + collision.endY) / 2) * 5}%`,
          };

  return (
    <section className="asset-preview-workspace" aria-labelledby="asset-preview-title">
      <header>
        <div>
          <p className="eyebrow">Non-mutating visual workspace</p>
          <h2 id="asset-preview-title">Isometric preview</h2>
        </div>
        <div className="asset-preview-toolbar">
          <PremiumSelect
            aria-label="Preview derivative"
            onChange={(value) => setSource(value as PreviewSource)}
            options={[
              { value: 'original', label: 'Uploaded original' },
              { value: 'preview', label: 'Normalized preview' },
              { value: 'thumbnail', label: 'Thumbnail' },
              { value: 'source', label: 'Sanitized source' },
            ]}
            size="compact"
            value={source}
          />
          <PremiumSelect
            aria-label="Preview backdrop"
            onChange={(value) => setBackdrop(value as typeof backdrop)}
            options={[
              { value: 'checkerboard', label: 'Checkerboard' },
              { value: 'light', label: 'Light backdrop' },
              { value: 'dark', label: 'Dark backdrop' },
            ]}
            size="compact"
            value={backdrop}
          />
          <PremiumSelect
            aria-label="Preview rotation"
            onChange={(value) => setRotation(Number(value) as typeof rotation)}
            options={props.configuration.render.supportedRotations.map((value) => ({
              value: String(value),
              label: `${String(value)}°`,
            }))}
            size="compact"
            value={String(rotation)}
          />
        </div>
      </header>

      <div className="asset-preview-toggles" aria-label="Preview overlays">
        <button
          aria-pressed={showGrid}
          className="button button--quiet"
          onClick={() => setShowGrid((value) => !value)}
          type="button"
        >
          Grid
        </button>
        <button
          aria-pressed={showAnchors}
          className="button button--quiet"
          onClick={() => setShowAnchors((value) => !value)}
          type="button"
        >
          Anchors
        </button>
        <button
          aria-pressed={showCollision}
          className="button button--quiet"
          onClick={() => setShowCollision((value) => !value)}
          type="button"
        >
          Collision
        </button>
        <button
          aria-pressed={mobilePreview}
          className="button button--quiet"
          onClick={() => setMobilePreview((value) => !value)}
          type="button"
        >
          Mobile size
        </button>
        <button
          className="button button--quiet"
          onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
          type="button"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="button button--quiet"
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
          type="button"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          aria-label="Pan preview left"
          className="button button--quiet"
          onClick={() => setPan((value) => ({ ...value, x: Math.max(-160, value.x - 24) }))}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Pan preview right"
          className="button button--quiet"
          onClick={() => setPan((value) => ({ ...value, x: Math.min(160, value.x + 24) }))}
          type="button"
        >
          →
        </button>
        <button
          aria-label="Pan preview up"
          className="button button--quiet"
          onClick={() => setPan((value) => ({ ...value, y: Math.max(-120, value.y - 24) }))}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label="Pan preview down"
          className="button button--quiet"
          onClick={() => setPan((value) => ({ ...value, y: Math.min(120, value.y + 24) }))}
          type="button"
        >
          ↓
        </button>
        <button
          className="button button--quiet"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          type="button"
        >
          Fit / reset
        </button>
        <span aria-live="polite">
          {Math.round(zoom * 100)}% · pan {pan.x}, {pan.y}
        </span>
      </div>

      <div
        className={`asset-preview-canvas asset-preview-canvas--${backdrop} ${mobilePreview ? 'is-mobile' : ''}`}
      >
        <div
          className={`asset-preview-canvas__frame ${showGrid ? 'shows-grid' : ''}`}
          ref={frameRef}
        >
          <div
            className="asset-preview-canvas__content"
            style={{ transform: `translate(${String(pan.x)}px, ${String(pan.y)}px)` }}
          >
            <div className="asset-preview-canvas__tile" aria-hidden="true" />
            {/* Same-origin proxy rechecks the administrator session before returning private media. */}
            {previewSource === null ? (
              <span className="asset-preview-canvas__unavailable" role="status">
                No raster derivative for this procedural or pending asset.
              </span>
            ) : (
              <img
                alt={`${source === 'original' ? 'Uploaded original' : 'Sanitized asset derivative'} on an isometric tile`}
                className="asset-preview-canvas__image"
                referrerPolicy="no-referrer"
                src={previewSource}
                style={{
                  height: props.configuration.render.renderHeight,
                  width: props.configuration.render.renderWidth,
                  transform: `translate(-50%, -50%) scale(${zoom * props.configuration.render.scale}) rotate(${rotation}deg)`,
                }}
              />
            )}
            {showCollision && collisionStyle !== undefined ? (
              <span
                aria-label={`${collision.shape} collision footprint`}
                className={`asset-preview-collision asset-preview-collision--${collision.shape}`}
                role="img"
                style={collisionStyle}
              />
            ) : null}
            {showCollision ? (
              <span
                aria-label="Reference player and foot marker for collision scale"
                className="asset-preview-player-marker"
                role="img"
              >
                <span aria-hidden="true" className="asset-preview-player-marker__body" />
                <span aria-hidden="true" className="asset-preview-player-marker__foot" />
              </span>
            ) : null}
            {showAnchors
              ? (['anchor', 'footAnchor', 'depthAnchor'] as const).map((key) => {
                  const point = props.configuration.render[key];
                  return (
                    <button
                      aria-label={`${anchorLabel(key)} at ${point.x.toFixed(2)}, ${point.y.toFixed(2)}. Use arrow keys to adjust.`}
                      className={`asset-anchor-handle asset-anchor-handle--${key}`}
                      disabled={!props.editable}
                      key={key}
                      onKeyDown={(event) => keyboardMove(key, event)}
                      onPointerDown={(event) =>
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }
                      onPointerMove={(event) => pointerMove(key, event)}
                      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                      title={anchorLabel(key)}
                      type="button"
                    >
                      <span aria-hidden="true" />
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      </div>
      <p className="field-hint">
        The reference player and foot marker shows collision scale. Foot anchor is where the object
        touches the ground. Depth anchor controls whether the player appears in front of or behind
        it. Preview changes are saved only with Save draft.
      </p>
    </section>
  );
}
