'use client';

import type { AdminWorldManifest } from '../lib/worlds/contracts';
import type { WorldEditorSelection } from '../lib/worlds/editor-state';

interface WorldManifestCanvasProps {
  readonly manifest: AdminWorldManifest;
  readonly selection?: WorldEditorSelection;
  readonly showGrid: boolean;
  readonly showCollisions: boolean;
  readonly showSpawns: boolean;
  readonly showExits: boolean;
  readonly playerPosition?: Readonly<{ x: number; y: number }>;
  readonly onSelect?: (selection: WorldEditorSelection) => void;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 660;

function projection(manifest: AdminWorldManifest) {
  const scaleX = Math.min(24, 420 / Math.max(manifest.width, manifest.height));
  return {
    scaleX,
    scaleY: scaleX * 0.5,
    originX: VIEW_WIDTH / 2,
    originY: 42,
  };
}

function project(
  x: number,
  y: number,
  value: ReturnType<typeof projection>,
): Readonly<{ x: number; y: number }> {
  return {
    x: value.originX + (x - y) * value.scaleX,
    y: value.originY + (x + y) * value.scaleY,
  };
}

function rectanglePoints(
  rectangle: Readonly<{ x: number; y: number; width: number; height: number }>,
  value: ReturnType<typeof projection>,
): string {
  return [
    project(rectangle.x, rectangle.y, value),
    project(rectangle.x + rectangle.width, rectangle.y, value),
    project(rectangle.x + rectangle.width, rectangle.y + rectangle.height, value),
    project(rectangle.x, rectangle.y + rectangle.height, value),
  ]
    .map(({ x, y }) => `${x},${y}`)
    .join(' ');
}

function selected(
  current: WorldEditorSelection | undefined,
  layer: WorldEditorSelection['layer'],
  id: string,
): boolean {
  return current?.layer === layer && current.id === id;
}

export function WorldManifestCanvas({
  manifest,
  selection,
  showGrid,
  showCollisions,
  showSpawns,
  showExits,
  playerPosition,
  onSelect,
}: WorldManifestCanvasProps) {
  const view = projection(manifest);
  const sortedTerrain = [...manifest.terrain].sort((left, right) => left.order - right.order);
  const sortedObjects = [...manifest.objects].sort((left, right) => left.y - right.y);
  const horizontalGrid = Array.from({ length: manifest.height + 1 }, (_, index) => index);
  const verticalGrid = Array.from({ length: manifest.width + 1 }, (_, index) => index);

  return (
    <svg
      aria-labelledby="world-canvas-title world-canvas-description"
      className="world-canvas"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    >
      <title id="world-canvas-title">Structured isometric preview of {manifest.name}</title>
      <desc id="world-canvas-description">
        A data-driven view of terrain, objects, collision, spawn points, and directional exits.
        Selectable items are also available in the adjacent layer list.
      </desc>
      <rect
        className={`world-canvas__sky world-canvas__sky--${manifest.background.palette}`}
        height={VIEW_HEIGHT}
        width={VIEW_WIDTH}
        x={0}
        y={0}
      />

      {sortedTerrain.map((area) => (
        <polygon
          className={`world-canvas__terrain world-canvas__terrain--${area.terrain}`}
          key={area.id}
          points={rectanglePoints(area, view)}
        />
      ))}

      {showGrid ? (
        <g aria-hidden="true" className="world-canvas__grid">
          {horizontalGrid.map((y) => {
            const start = project(0, y, view);
            const end = project(manifest.width, y, view);
            return <line key={`y-${y}`} x1={start.x} x2={end.x} y1={start.y} y2={end.y} />;
          })}
          {verticalGrid.map((x) => {
            const start = project(x, 0, view);
            const end = project(x, manifest.height, view);
            return <line key={`x-${x}`} x1={start.x} x2={end.x} y1={start.y} y2={end.y} />;
          })}
        </g>
      ) : null}

      {showExits ? (
        <g className="world-canvas__exits">
          {manifest.exits.map((exit) => (
            <polygon
              className={`${exit.enabled ? 'is-enabled' : 'is-disabled'} ${selected(selection, 'exits', exit.id) ? 'is-selected' : ''}`}
              key={exit.id}
              onClick={() => onSelect?.({ layer: 'exits', id: exit.id })}
              points={rectanglePoints(exit.trigger, view)}
            />
          ))}
        </g>
      ) : null}

      {showCollisions ? (
        <g className="world-canvas__collisions">
          {manifest.collisions.map((collision) => {
            const className = selected(selection, 'collisions', collision.id) ? 'is-selected' : '';
            if (collision.shape === 'rectangle') {
              return (
                <polygon
                  className={className}
                  key={collision.id}
                  onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                  points={rectanglePoints(collision, view)}
                />
              );
            }
            if (collision.shape === 'circle') {
              const center = project(collision.x, collision.y, view);
              return (
                <ellipse
                  className={className}
                  cx={center.x}
                  cy={center.y}
                  key={collision.id}
                  onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                  rx={collision.radius * view.scaleX * 1.4}
                  ry={collision.radius * view.scaleY * 1.4}
                />
              );
            }
            const start = project(collision.startX, collision.startY, view);
            const end = project(collision.endX, collision.endY, view);
            return (
              <line
                className={className}
                key={collision.id}
                onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                strokeWidth={Math.max(5, collision.radius * view.scaleX * 2.4)}
                x1={start.x}
                x2={end.x}
                y1={start.y}
                y2={end.y}
              />
            );
          })}
        </g>
      ) : null}

      <g className="world-canvas__objects">
        {sortedObjects.map((object) => {
          const point = project(object.x, object.y, view);
          return (
            <g
              className={selected(selection, 'objects', object.id) ? 'is-selected' : ''}
              key={object.id}
              onClick={() => onSelect?.({ layer: 'objects', id: object.id })}
              transform={`translate(${point.x} ${point.y}) scale(${object.scale})`}
            >
              <ellipse cx={0} cy={4} rx={15} ry={7} />
              <circle cx={0} cy={-12} r={13} />
              <text x={0} y={-8}>
                {object.kind.slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}
      </g>

      {showSpawns ? (
        <g className="world-canvas__spawns">
          {manifest.spawns.map((spawn) => {
            const point = project(spawn.x, spawn.y, view);
            return (
              <g
                className={`${spawn.enabled ? '' : 'is-disabled'} ${selected(selection, 'spawns', spawn.id) ? 'is-selected' : ''}`}
                key={spawn.id}
                onClick={() => onSelect?.({ layer: 'spawns', id: spawn.id })}
                transform={`translate(${point.x} ${point.y})`}
              >
                <circle cx={0} cy={0} r={10} />
                <path d="M 0 -16 L 7 -4 L -7 -4 Z" />
              </g>
            );
          })}
        </g>
      ) : null}

      {playerPosition === undefined
        ? null
        : (() => {
            const player = project(playerPosition.x, playerPosition.y, view);
            return (
              <g
                aria-label="Preview character"
                className="world-canvas__player"
                transform={`translate(${player.x} ${player.y})`}
              >
                <ellipse cx={0} cy={2} rx={9} ry={5} />
                <circle cx={0} cy={-15} r={9} />
                <path d="M -8 -6 L 8 -6 L 6 7 L -6 7 Z" />
              </g>
            );
          })()}
    </svg>
  );
}
