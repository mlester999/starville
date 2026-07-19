import { useEffect, useMemo, useRef, useState } from 'react';

import {
  STARVILLE_BUNDLED_ASSETS,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  getBundledManifest,
  resolveAssetSource,
  type AssetRotation,
  type BundledAssetEntry,
  type BundledManifestVersion,
} from '@starville/asset-management';

import { BundledAssetImage } from './BundledAssetImage';

type Gallery = 'terrain' | 'world' | 'farming' | 'housing' | 'markers';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const STAGE_WIDTH = 320;
const STAGE_HEIGHT = 200;
const HALF_TILE_WIDTH = 24;
const HALF_TILE_HEIGHT = 12;

function galleriesFor(
  bundledAssets: readonly BundledAssetEntry[],
): Readonly<Record<Gallery, readonly BundledAssetEntry[]>> {
  return {
    terrain: bundledAssets.filter((asset) => asset.category === 'terrain'),
    world: bundledAssets.filter((asset) =>
      ['nature', 'structure', 'boundary', 'lighting', 'signage', 'shop'].includes(asset.category),
    ),
    farming: bundledAssets.filter((asset) => ['farming', 'crop'].includes(asset.category)),
    housing: bundledAssets.filter((asset) => asset.assetType === 'furniture'),
    markers: bundledAssets.filter(
      (asset) => asset.key.startsWith('ui.') || asset.category === 'interaction',
    ),
  };
}

function collisionLabel(asset: BundledAssetEntry): string {
  if (asset.collision.shape === 'none') return 'non-blocking';
  if (asset.collision.shape === 'rectangle') {
    return `${asset.collision.width} × ${asset.collision.height} rectangle`;
  }
  return `${asset.collision.radius} radius capsule`;
}

type StagePoint = Readonly<{ x: number; y: number }>;

function stageImageBox(asset: BundledAssetEntry) {
  const scale = Math.min(STAGE_WIDTH / asset.width, STAGE_HEIGHT / asset.height);
  const width = asset.width * scale;
  const height = asset.height * scale;
  return {
    left: (STAGE_WIDTH - width) / 2,
    top: (STAGE_HEIGHT - height) / 2,
    width,
    height,
  };
}

function bitmapAnchor(asset: BundledAssetEntry, anchor: StagePoint): StagePoint {
  const box = stageImageBox(asset);
  return { x: box.left + anchor.x * box.width, y: box.top + anchor.y * box.height };
}

function projectRelativeToFoot(asset: BundledAssetEntry, point: StagePoint): StagePoint {
  const foot = bitmapAnchor(asset, asset.footAnchor);
  return {
    x: foot.x + (point.x - point.y) * HALF_TILE_WIDTH,
    y: foot.y + (point.x + point.y) * HALF_TILE_HEIGHT,
  };
}

function pointList(points: readonly StagePoint[]): string {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function footprintPoints(asset: BundledAssetEntry): string {
  const halfWidth = asset.footprint.width / 2;
  const halfHeight = asset.footprint.height / 2;
  return pointList(
    [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((point) => projectRelativeToFoot(asset, point)),
  );
}

function AssetGeometry({ asset }: Readonly<{ asset: BundledAssetEntry }>) {
  const renderAnchor = bitmapAnchor(asset, asset.anchor);
  const footAnchor = bitmapAnchor(asset, asset.footAnchor);
  const depthAnchor = bitmapAnchor(asset, asset.depthAnchor);
  const collision = asset.collision;
  const collisionRectangle =
    collision.shape === 'rectangle'
      ? pointList(
          [
            {
              x: collision.offsetX - collision.width / 2,
              y: collision.offsetY - collision.height / 2,
            },
            {
              x: collision.offsetX + collision.width / 2,
              y: collision.offsetY - collision.height / 2,
            },
            {
              x: collision.offsetX + collision.width / 2,
              y: collision.offsetY + collision.height / 2,
            },
            {
              x: collision.offsetX - collision.width / 2,
              y: collision.offsetY + collision.height / 2,
            },
          ].map((point) => projectRelativeToFoot(asset, point)),
        )
      : null;
  const capsule =
    collision.shape === 'capsule'
      ? {
          start: projectRelativeToFoot(asset, { x: collision.startX, y: collision.startY }),
          end: projectRelativeToFoot(asset, { x: collision.endX, y: collision.endY }),
          strokeWidth: Math.max(3, collision.radius * HALF_TILE_HEIGHT * 2),
        }
      : null;

  return (
    <svg
      aria-hidden="true"
      className="asset-coverage-card__geometry"
      preserveAspectRatio="none"
      viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
    >
      <polygon className="asset-coverage-card__footprint" points={footprintPoints(asset)} />
      {collisionRectangle === null ? null : (
        <polygon className="asset-coverage-card__collision" points={collisionRectangle} />
      )}
      {capsule === null ? null : (
        <line
          className="asset-coverage-card__collision"
          strokeWidth={capsule.strokeWidth}
          x1={capsule.start.x}
          x2={capsule.end.x}
          y1={capsule.start.y}
          y2={capsule.end.y}
        />
      )}
      <circle
        className="asset-coverage-card__anchor asset-coverage-card__anchor--render"
        cx={renderAnchor.x}
        cy={renderAnchor.y}
        r="4"
      />
      <circle
        className="asset-coverage-card__anchor asset-coverage-card__anchor--foot"
        cx={footAnchor.x}
        cy={footAnchor.y}
        r="5"
      />
      <circle
        className="asset-coverage-card__anchor asset-coverage-card__anchor--depth"
        cx={depthAnchor.x}
        cy={depthAnchor.y}
        r="4"
      />
    </svg>
  );
}

function AssetCard({
  asset,
  rotation = 0,
  manifestVersion,
}: Readonly<{
  asset: BundledAssetEntry;
  rotation?: AssetRotation;
  manifestVersion: BundledManifestVersion;
}>) {
  return (
    <article className="asset-coverage-card">
      <div className="asset-coverage-card__stage">
        <BundledAssetImage
          assetKey={asset.key}
          alt={`${asset.displayName}${rotation === 0 ? '' : ` at ${rotation} degrees`}`}
          context="game_test"
          bundledManifestVersion={manifestVersion}
          rotation={rotation}
        />
        <AssetGeometry asset={asset} />
      </div>
      <strong>{asset.displayName}</strong>
      <code>{asset.key}</code>
      <span className="asset-coverage-source">Bundled default · v{asset.bundledVersion}</span>
      <small>
        {asset.width} × {asset.height} · footprint {asset.footprint.width} ×{' '}
        {asset.footprint.height} · {collisionLabel(asset)}
      </small>
      <small>
        Rotation {rotation}° · foot anchor {asset.footAnchor.x}, {asset.footAnchor.y} · depth anchor{' '}
        {asset.depthAnchor.x}, {asset.depthAnchor.y}
      </small>
    </article>
  );
}

function FixtureStates({
  bundledAssets,
  manifestVersion,
}: {
  readonly bundledAssets: readonly BundledAssetEntry[];
  readonly manifestVersion: BundledManifestVersion;
}) {
  const uploadedFixture = useMemo(() => {
    const base = bundledAssets.find((asset) => asset.key === 'lamp-star')!;
    const bundledFixture = resolveAssetSource({
      assetKey: base.key,
      context: 'game_test',
      preferredBundledManifestVersion: manifestVersion,
    });
    return resolveAssetSource({
      assetKey: base.key,
      context: 'game_test',
      exactPinned: {
        sourceKind: 'uploaded',
        identity: 'game-test-uploaded-fixture',
        versionId: '00000000-0000-4000-8000-000000000012',
        eligible: true,
        url: bundledFixture.url,
        thumbnailUrl: bundledFixture.thumbnailUrl,
        checksum: 'game-test-local-fixture',
        render: {
          width: base.width,
          height: base.height,
          renderWidth: base.width,
          renderHeight: base.height,
          scale: base.recommendedScale,
          anchor: base.anchor,
          footAnchor: base.footAnchor,
          depthAnchor: base.depthAnchor,
          collision: base.collision,
          supportedRotations: base.supportedRotations,
          defaultRotation: base.defaultRotation,
        },
      },
    });
  }, [bundledAssets, manifestVersion]);

  return (
    <section className="asset-coverage-fixtures" aria-labelledby="asset-fixtures-title">
      <h3 id="asset-fixtures-title">Resolver and rendering fixtures</h3>
      <div>
        <article>
          <BundledAssetImage
            assetKey="phase7-general-store-marker"
            alt="Bundled General Store fixture"
            context="game_test"
            bundledManifestVersion={manifestVersion}
          />
          <strong>Bundled default state</strong>
          <span className="asset-coverage-source">bundled_default</span>
        </article>
        <article>
          <img
            alt="Local uploaded-override fixture"
            decoding="async"
            loading="lazy"
            src={uploadedFixture.url}
          />
          <strong>Uploaded override fixture</strong>
          <span className="asset-coverage-source">{uploadedFixture.source}</span>
          <small>Local resolver fixture only; no upload or asset history is created.</small>
        </article>
        <article>
          <BundledAssetImage
            assetKey="game-test.intentionally-missing"
            alt="Missing-asset fixture"
            context="game_test"
            bundledManifestVersion={manifestVersion}
          />
          <strong>Missing stable key</strong>
          <span className="asset-coverage-source">missing_placeholder</span>
        </article>
        <article className="asset-coverage-fixtures__animation">
          <BundledAssetImage
            assetKey="world.station.cooking-hearth.active"
            alt="Reduced-motion-safe active hearth fixture"
            context="game_test"
          />
          <strong>Animation foundation</strong>
          <span className="asset-coverage-source">CSS preview pulse · non-authoritative</span>
        </article>
      </div>
      <div className="asset-depth-fixture" aria-label="Depth sorting fixture, back to front">
        <BundledAssetImage
          assetKey="tree-maple"
          alt="Back depth: maple tree"
          bundledManifestVersion={manifestVersion}
          context="game_test"
        />
        <BundledAssetImage
          assetKey="lamp-star"
          alt="Middle depth: lantern"
          bundledManifestVersion={manifestVersion}
          context="game_test"
        />
        <BundledAssetImage
          assetKey="flowers-moon"
          alt="Front depth: moonbell flowers"
          bundledManifestVersion={manifestVersion}
          context="game_test"
        />
        <span>Back → middle → front depth order</span>
      </div>
    </section>
  );
}

export function AssetCoverageGameTest({
  onClose,
  manifestVersion = STARVILLE_BUNDLED_MANIFEST_VERSION,
}: Readonly<{ onClose: () => void; manifestVersion?: BundledManifestVersion }>) {
  const [gallery, setGallery] = useState<Gallery>('terrain');
  const bundledAssets =
    manifestVersion === STARVILLE_BUNDLED_MANIFEST_VERSION
      ? STARVILLE_BUNDLED_ASSETS
      : getBundledManifest(manifestVersion).assets;
  const galleries = useMemo(() => galleriesFor(bundledAssets), [bundledAssets]);
  const assets = galleries[gallery];
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });

    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialog.focus();
      } else if (document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keyDown, true);
    return () => {
      document.removeEventListener('keydown', keyDown, true);
      previous?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="asset-coverage-overlay" role="presentation">
      <section
        ref={dialogRef}
        aria-labelledby="asset-coverage-title"
        aria-modal="true"
        className="asset-coverage"
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <p className="game-kicker">Deterministic local visual QA</p>
            <h2 id="asset-coverage-title">Bundled asset coverage</h2>
            <p>
              Inspection only. This fixture cannot upload, activate, approve, publish, or persist
              asset mutations or telemetry.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            Close coverage
          </button>
        </header>

        <FixtureStates bundledAssets={bundledAssets} manifestVersion={manifestVersion} />

        <nav aria-label="Asset coverage galleries">
          {(Object.keys(galleries) as Gallery[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-current={gallery === key ? 'page' : undefined}
              onClick={() => setGallery(key)}
            >
              {key} ({galleries[key].length})
            </button>
          ))}
        </nav>

        {gallery === 'housing' ? (
          <div
            className="asset-coverage-grid"
            aria-label="Housing furniture and authored rotations"
          >
            {assets.flatMap((asset) =>
              asset.supportedRotations.map((rotation) => (
                <AssetCard
                  key={`${asset.key}:${rotation}`}
                  asset={asset}
                  manifestVersion={manifestVersion}
                  rotation={rotation}
                />
              )),
            )}
          </div>
        ) : (
          <div className="asset-coverage-grid" aria-label={`${gallery} bundled assets`}>
            {assets.map((asset) => (
              <AssetCard key={asset.key} asset={asset} manifestVersion={manifestVersion} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
