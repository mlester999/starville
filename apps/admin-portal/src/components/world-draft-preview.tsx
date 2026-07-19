'use client';

import { PLAYER_FOOT_RADIUS, moveWithCollisions, type Point } from '@starville/game-core';
import { useState, type KeyboardEvent } from 'react';

import type { WorldDraftAssetPin, WorldPreview } from '../lib/worlds/contracts';
import { WorldManifestCanvas } from './world-manifest-canvas';

function spawnPosition(preview: WorldPreview): Point {
  const spawn = preview.manifest.spawns.find(({ id }) => id === preview.manifest.defaultSpawnId);
  return spawn === undefined ? { x: 0, y: 0 } : { x: spawn.x, y: spawn.y };
}

function movementForKey(key: string, amount: number): Point | undefined {
  const diagonal = amount / Math.SQRT2;
  if (key === 'w') return { x: -diagonal, y: -diagonal };
  if (key === 's') return { x: diagonal, y: diagonal };
  if (key === 'a') return { x: -diagonal, y: diagonal };
  if (key === 'd') return { x: diagonal, y: -diagonal };
  return undefined;
}

function exitAt(preview: WorldPreview, position: Point): string | undefined {
  return preview.manifest.exits.find(
    ({ trigger }) =>
      position.x >= trigger.x &&
      position.x <= trigger.x + trigger.width &&
      position.y >= trigger.y &&
      position.y <= trigger.y + trigger.height,
  )?.direction;
}

export function WorldDraftPreview({
  preview,
  assetPins,
}: {
  readonly preview: WorldPreview;
  /** Exact retained pins from the independently authorized read of this same revision. */
  readonly assetPins?: readonly WorldDraftAssetPin[];
}) {
  const initialPosition = spawnPosition(preview);
  const [position, setPosition] = useState(initialPosition);
  const [showGrid, setShowGrid] = useState(false);
  const [showCollisions, setShowCollisions] = useState(false);
  const [showSpawns, setShowSpawns] = useState(false);
  const [showExits, setShowExits] = useState(true);
  const [announcement, setAnnouncement] = useState(
    'Preview ready. Focus the map and use W, A, S, and D to inspect movement.',
  );

  function move(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key.toLowerCase() === 'e') {
      const interaction = preview.manifest.interactions
        .map((item) => ({ item, distance: Math.hypot(item.x - position.x, item.y - position.y) }))
        .filter(({ item, distance }) => distance <= item.range)
        .sort((left, right) => left.distance - right.distance)[0]?.item;
      setAnnouncement(
        interaction === undefined
          ? 'There is no interaction in range.'
          : `${interaction.title}: ${interaction.content}`,
      );
      event.preventDefault();
      return;
    }
    const delta = movementForKey(event.key.toLowerCase(), event.shiftKey ? 0.52 : 0.34);
    if (delta === undefined) return;
    event.preventDefault();
    const next = moveWithCollisions(
      position,
      delta,
      PLAYER_FOOT_RADIUS,
      preview.manifest.safeSaveBounds,
      preview.manifest.collisions,
    );
    setPosition(next);
    const exit = exitAt(preview, next);
    setAnnouncement(
      exit === undefined
        ? `Preview position ${next.x.toFixed(1)}, ${next.y.toFixed(1)}.`
        : `${exit} exit reached. Preview exits are inert and do not update player state.`,
    );
  }

  if (assetPins === undefined) {
    return (
      <section className="empty-state" data-preview-pin-status="unavailable" role="status">
        <h2>Exact asset rendering unavailable</h2>
        <p>
          This read model does not include the immutable asset-version pins required for renderer
          parity. The Admin canvas is withheld instead of substituting current or bundled artwork.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="draft-preview-banner" aria-label="Draft preview safety boundary">
        <span>DRAFT PREVIEW</span>
        <p>Isolated administrator view · no player persistence · no rewards · no publication</p>
      </section>
      <section className="world-preview-controls" aria-label="Draft preview overlays">
        {[
          ['Grid', showGrid, setShowGrid],
          ['Collision', showCollisions, setShowCollisions],
          ['Spawns', showSpawns, setShowSpawns],
          ['Exit regions', showExits, setShowExits],
        ].map(([label, checked, setter]) => (
          <label key={String(label)}>
            <input
              checked={Boolean(checked)}
              onChange={(event) =>
                (setter as (value: boolean) => void)(event.currentTarget.checked)
              }
              type="checkbox"
            />
            {String(label)}
          </label>
        ))}
        <button
          className="button button--quiet"
          onClick={() => {
            setPosition(initialPosition);
            setAnnouncement('Preview position reset to the approved default spawn.');
          }}
          type="button"
        >
          Reset preview position
        </button>
      </section>
      <div
        aria-describedby="preview-keyboard-help preview-announcement"
        aria-label={`Interactive draft preview of ${preview.manifest.name}`}
        className="world-preview-stage"
        onKeyDown={move}
        tabIndex={0}
      >
        <WorldManifestCanvas
          assetPins={assetPins}
          manifest={preview.manifest}
          playerPosition={position}
          showCollisions={showCollisions}
          showExits={showExits}
          showGrid={showGrid}
          showSpawns={showSpawns}
        />
      </div>
      <div className="world-preview-status">
        <p id="preview-keyboard-help">
          Focus the map, then use WASD to move, Shift to jog, and E to inspect nearby notices.
          Directional exits remain visible but cannot mutate real player state.
        </p>
        <p aria-live="polite" id="preview-announcement" role="status">
          {announcement}
        </p>
      </div>
    </>
  );
}
