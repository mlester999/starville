'use client';

import { useState } from 'react';

import type { AdminWorldManifest } from '../lib/worlds/contracts';
import type { WorldEditorSelection } from '../lib/worlds/editor-state';
import { shouldShowInteractionLabel, shouldShowObjectLabel } from '../lib/worlds/editor-usability';

interface WorldManifestCanvasProps {
  readonly manifest: AdminWorldManifest;
  readonly selection?: WorldEditorSelection;
  readonly showGrid: boolean;
  readonly showCollisions: boolean;
  readonly showSpawns: boolean;
  readonly showExits: boolean;
  readonly showInteractions?: boolean;
  readonly playerPosition?: Readonly<{ x: number; y: number }>;
  readonly onSelect?: (selection: WorldEditorSelection) => void;
  readonly className?: string;
  /** Viewport zoom factor used only for label declutter (does not mutate draft). */
  readonly zoom?: number;
  readonly activeLayer?: WorldEditorSelection['layer'] | 'metadata' | 'bounds';
  readonly emphasisObjectIds?: readonly string[];
}

export const WORLD_CANVAS_VIEW_WIDTH = 1000;
export const WORLD_CANVAS_VIEW_HEIGHT = 660;

const SKY_FILLS: Record<AdminWorldManifest['background']['palette'], string> = {
  village: '#1d4638',
  meadow: '#1a4a3a',
  brook: '#17444a',
  hearth: '#3a3420',
  forest: '#14352c',
};

const TERRAIN_FILLS: Record<AdminWorldManifest['terrain'][number]['terrain'], string> = {
  grass: '#3f8f63',
  plaza: '#c4b48a',
  path: '#b79a6a',
  water: '#3d8fb5',
  bridge: '#8b6a45',
};

const OBJECT_KIND_META: Record<
  AdminWorldManifest['objects'][number]['kind'],
  { readonly fill: string; readonly label: string; readonly glyph: string }
> = {
  building: { fill: '#c9894a', label: 'Building', glyph: 'B' },
  tree: { fill: '#2f7a48', label: 'Tree', glyph: 'T' },
  rock: { fill: '#7a7f86', label: 'Rock', glyph: 'R' },
  fence: { fill: '#8d6b45', label: 'Fence', glyph: 'F' },
  lamp: { fill: '#e2b24a', label: 'Lamp', glyph: 'L' },
  sign: { fill: '#b8874a', label: 'Sign', glyph: 'S' },
  flowers: { fill: '#d67ea8', label: 'Flowers', glyph: '✦' },
  bush: { fill: '#4f9a5c', label: 'Bush', glyph: 'U' },
  farm_plot: { fill: '#8b6b3d', label: 'Farm plot', glyph: 'P' },
  shop: { fill: '#4aa687', label: 'Shop', glyph: 'G' },
  cooking_station: { fill: '#d8793f', label: 'Cooking', glyph: 'C' },
  crafting_station: { fill: '#4f8ec9', label: 'Crafting', glyph: 'W' },
  home_entrance: { fill: '#8b6fd1', label: 'Home', glyph: 'H' },
};

function projection(manifest: AdminWorldManifest) {
  const scaleX = Math.min(24, 420 / Math.max(manifest.width, manifest.height));
  return {
    scaleX,
    scaleY: scaleX * 0.5,
    originX: WORLD_CANVAS_VIEW_WIDTH / 2,
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

function objectIsPhase7(object: AdminWorldManifest['objects'][number]): boolean {
  return (
    object.assetId.startsWith('phase7-') ||
    object.id.startsWith('phase7-') ||
    object.kind === 'shop' ||
    object.kind === 'cooking_station' ||
    object.kind === 'crafting_station' ||
    object.kind === 'home_entrance' ||
    object.kind === 'farm_plot'
  );
}

function friendlyObjectLabel(object: AdminWorldManifest['objects'][number]): string {
  return OBJECT_KIND_META[object.kind].label;
}

export function WorldManifestCanvas({
  manifest,
  selection,
  showGrid,
  showCollisions,
  showSpawns,
  showExits,
  showInteractions = true,
  playerPosition,
  onSelect,
  className,
  zoom = 1,
  activeLayer = 'objects',
  emphasisObjectIds = [],
}: WorldManifestCanvasProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  try {
    const view = projection(manifest);
    const sortedTerrain = [...manifest.terrain].sort((left, right) => left.order - right.order);
    const sortedObjects = [...manifest.objects].sort((left, right) => left.y - right.y);
    const horizontalGrid = Array.from({ length: manifest.height + 1 }, (_, index) => index);
    const verticalGrid = Array.from({ length: manifest.width + 1 }, (_, index) => index);
    const boundsPoints = rectanglePoints(
      { x: 0, y: 0, width: manifest.width, height: manifest.height },
      view,
    );
    const skyFill = SKY_FILLS[manifest.background.palette] ?? SKY_FILLS.village;
    const rootClass = className === undefined ? 'world-canvas' : `world-canvas ${className}`;
    const emphasis = new Set(emphasisObjectIds);

    return (
      <svg
        aria-labelledby="world-canvas-title world-canvas-description"
        className={rootClass}
        data-canvas-ready="true"
        data-map-height={manifest.height}
        data-map-width={manifest.width}
        data-object-count={manifest.objects.length}
        data-zoom={zoom}
        height="100%"
        onMouseLeave={() => setHoveredId(null)}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${WORLD_CANVAS_VIEW_WIDTH} ${WORLD_CANVAS_VIEW_HEIGHT}`}
        width="100%"
      >
        <title id="world-canvas-title">{`Structured isometric preview of ${manifest.name}`}</title>
        <desc id="world-canvas-description">
          A data-driven view of terrain, objects, collision, spawn points, exit regions, and
          interaction markers. Selectable items are also available in the adjacent layer list.
        </desc>

        <rect
          className="world-canvas__base"
          fill="#143028"
          height={WORLD_CANVAS_VIEW_HEIGHT}
          width={WORLD_CANVAS_VIEW_WIDTH}
          x={0}
          y={0}
        />
        <rect
          className={`world-canvas__sky world-canvas__sky--${manifest.background.palette}`}
          fill={skyFill}
          height={WORLD_CANVAS_VIEW_HEIGHT}
          width={WORLD_CANVAS_VIEW_WIDTH}
          x={0}
          y={0}
        />

        {sortedTerrain.map((area) => (
          <polygon
            className={`world-canvas__terrain world-canvas__terrain--${area.terrain}`}
            fill={TERRAIN_FILLS[area.terrain]}
            fillOpacity={0.92}
            key={area.id}
            points={rectanglePoints(area, view)}
            stroke="rgba(20, 40, 32, 0.18)"
            strokeWidth={1}
          />
        ))}

        <polygon
          className="world-canvas__bounds"
          fill="none"
          points={boundsPoints}
          stroke="rgba(226, 184, 92, 0.55)"
          strokeDasharray="8 6"
          strokeWidth={2}
        />

        {showGrid ? (
          <g aria-hidden="true" className="world-canvas__grid">
            {horizontalGrid.map((y) => {
              const start = project(0, y, view);
              const end = project(manifest.width, y, view);
              return (
                <line
                  key={`y-${y}`}
                  stroke="rgba(247, 239, 217, 0.22)"
                  strokeWidth={1}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />
              );
            })}
            {verticalGrid.map((x) => {
              const start = project(x, 0, view);
              const end = project(x, manifest.height, view);
              return (
                <line
                  key={`x-${x}`}
                  stroke="rgba(247, 239, 217, 0.22)"
                  strokeWidth={1}
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />
              );
            })}
          </g>
        ) : null}

        {showExits ? (
          <g className="world-canvas__exits">
            {manifest.exits.map((exit) => {
              const isSelected = selected(selection, 'exits', exit.id);
              return (
                <g key={exit.id}>
                  <polygon
                    className={`${exit.enabled ? 'is-enabled' : 'is-disabled'} ${isSelected ? 'is-selected' : ''}`}
                    fill={
                      exit.enabled
                        ? isSelected
                          ? 'rgba(74, 166, 135, 0.45)'
                          : 'rgba(74, 166, 135, 0.22)'
                        : 'rgba(120, 120, 120, 0.16)'
                    }
                    onClick={() => onSelect?.({ layer: 'exits', id: exit.id })}
                    points={rectanglePoints(exit.trigger, view)}
                    role={onSelect ? 'button' : undefined}
                    stroke={
                      isSelected
                        ? 'rgba(247, 239, 217, 0.95)'
                        : exit.enabled
                          ? 'rgba(129, 215, 173, 0.85)'
                          : 'rgba(160, 160, 160, 0.45)'
                    }
                    strokeWidth={isSelected ? 3 : 1.5}
                    style={{ cursor: onSelect ? 'pointer' : undefined }}
                  />
                  {(() => {
                    const center = project(
                      exit.trigger.x + exit.trigger.width / 2,
                      exit.trigger.y + exit.trigger.height / 2,
                      view,
                    );
                    return (
                      <text
                        className="world-canvas__exit-label"
                        fill="rgba(247, 239, 217, 0.9)"
                        fontSize={11}
                        fontWeight={700}
                        pointerEvents="none"
                        textAnchor="middle"
                        x={center.x}
                        y={center.y + 4}
                      >
                        {exit.direction.slice(0, 1).toUpperCase()}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </g>
        ) : null}

        {showCollisions ? (
          <g className="world-canvas__collisions">
            {manifest.collisions.map((collision) => {
              const isSelected = selected(selection, 'collisions', collision.id);
              const fill = isSelected ? 'rgba(196, 84, 74, 0.55)' : 'rgba(196, 84, 74, 0.22)';
              const stroke = isSelected ? 'rgba(247, 220, 210, 1)' : 'rgba(214, 112, 98, 0.75)';
              if (collision.shape === 'rectangle') {
                return (
                  <polygon
                    className={isSelected ? 'is-selected' : ''}
                    fill={fill}
                    key={collision.id}
                    onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                    points={rectanglePoints(collision, view)}
                    stroke={stroke}
                    strokeDasharray={isSelected ? '0' : undefined}
                    strokeWidth={isSelected ? 3.5 : 1.25}
                    style={{ cursor: onSelect ? 'pointer' : undefined }}
                  />
                );
              }
              if (collision.shape === 'circle') {
                const center = project(collision.x, collision.y, view);
                return (
                  <ellipse
                    className={isSelected ? 'is-selected' : ''}
                    cx={center.x}
                    cy={center.y}
                    fill={fill}
                    key={collision.id}
                    onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                    rx={collision.radius * view.scaleX * 1.4}
                    ry={collision.radius * view.scaleY * 1.4}
                    stroke={stroke}
                    strokeWidth={isSelected ? 3.5 : 1.25}
                    style={{ cursor: onSelect ? 'pointer' : undefined }}
                  />
                );
              }
              const start = project(collision.startX, collision.startY, view);
              const end = project(collision.endX, collision.endY, view);
              return (
                <line
                  className={isSelected ? 'is-selected' : ''}
                  key={collision.id}
                  onClick={() => onSelect?.({ layer: 'collisions', id: collision.id })}
                  stroke={stroke}
                  strokeLinecap="round"
                  strokeWidth={Math.max(5, collision.radius * view.scaleX * 2.4)}
                  style={{ cursor: onSelect ? 'pointer' : undefined }}
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
            const isSelected = selected(selection, 'objects', object.id);
            const isHovered = hoveredId === object.id;
            const meta = OBJECT_KIND_META[object.kind];
            const phase7 = objectIsPhase7(object);
            const showLabel = shouldShowObjectLabel({
              isSelected: isSelected || emphasis.has(object.id),
              isHovered,
              isPhase7: phase7,
              zoom,
              layerActive: activeLayer === 'objects',
            });
            return (
              <g
                className={`world-canvas__object ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''} ${phase7 ? 'is-phase7' : ''}`}
                data-object-id={object.id}
                data-object-kind={object.kind}
                data-show-label={showLabel ? 'true' : 'false'}
                key={object.id}
                onClick={() => onSelect?.({ layer: 'objects', id: object.id })}
                onMouseEnter={() => setHoveredId(object.id)}
                onMouseLeave={() =>
                  setHoveredId((current) => (current === object.id ? null : current))
                }
                style={{ cursor: onSelect ? 'pointer' : undefined }}
                transform={`translate(${point.x} ${point.y}) scale(${object.scale})`}
              >
                <title>{`${friendlyObjectLabel(object)} · ${object.id}`}</title>
                {isSelected ? (
                  <>
                    <ellipse
                      className="world-canvas__selection-glow"
                      cx={0}
                      cy={4}
                      fill="rgba(129, 215, 173, 0.28)"
                      rx={28}
                      ry={16}
                    />
                    <ellipse
                      className="world-canvas__selection-ring"
                      cx={0}
                      cy={4}
                      fill="none"
                      rx={26}
                      ry={14}
                      stroke="rgba(247, 239, 217, 0.98)"
                      strokeDasharray="4 3"
                      strokeWidth={2.5}
                    />
                    <ellipse
                      className="world-canvas__selection-ring-outer"
                      cx={0}
                      cy={4}
                      fill="none"
                      rx={30}
                      ry={17}
                      stroke="rgba(129, 215, 173, 0.95)"
                      strokeWidth={2}
                    />
                  </>
                ) : isHovered ? (
                  <ellipse
                    className="world-canvas__hover-ring"
                    cx={0}
                    cy={4}
                    fill="none"
                    rx={22}
                    ry={12}
                    stroke="rgba(247, 239, 217, 0.55)"
                    strokeWidth={1.5}
                  />
                ) : null}
                <ellipse cx={0} cy={6} fill="rgba(10, 24, 20, 0.35)" rx={16} ry={7} />
                {phase7 ? (
                  <polygon
                    fill={meta.fill}
                    points="0,-22 14,-6 0,10 -14,-6"
                    stroke={isSelected ? 'rgba(247, 239, 217, 1)' : 'rgba(247, 239, 217, 0.75)'}
                    strokeWidth={isSelected ? 2.25 : 1.5}
                  />
                ) : (
                  <>
                    <ellipse cx={0} cy={4} fill="rgba(20, 40, 32, 0.35)" rx={15} ry={7} />
                    <circle
                      cx={0}
                      cy={-12}
                      fill={meta.fill}
                      r={13}
                      stroke={isSelected ? 'rgba(247, 239, 217, 0.95)' : 'rgba(20, 40, 32, 0.35)'}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                  </>
                )}
                <text
                  className="world-canvas__object-glyph"
                  fill="#f7efd9"
                  fontSize={11}
                  fontWeight={700}
                  textAnchor="middle"
                  x={0}
                  y={phase7 ? -4 : -8}
                >
                  {meta.glyph}
                </text>
                {phase7 ? (
                  <text
                    className="world-canvas__object-badge"
                    fill="rgba(226, 184, 92, 0.95)"
                    fontSize={7}
                    fontWeight={700}
                    textAnchor="middle"
                    x={0}
                    y={16}
                  >
                    DEV
                  </text>
                ) : null}
                {showLabel ? (
                  <g className="world-canvas__object-label" pointerEvents="none">
                    <rect
                      fill="rgba(10, 28, 24, 0.88)"
                      height={16}
                      rx={4}
                      stroke={isSelected ? 'rgba(129, 215, 173, 0.95)' : 'rgba(74, 166, 135, 0.45)'}
                      strokeWidth={1}
                      width={Math.min(110, friendlyObjectLabel(object).length * 6.4 + 14)}
                      x={-Math.min(55, friendlyObjectLabel(object).length * 3.2 + 7)}
                      y={phase7 ? 20 : 14}
                    />
                    <text
                      fill="#f7efd9"
                      fontSize={9}
                      fontWeight={700}
                      textAnchor="middle"
                      x={0}
                      y={phase7 ? 31 : 25}
                    >
                      {friendlyObjectLabel(object)}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>

        {showInteractions
          ? manifest.interactions.map((interaction) => {
              const point = project(interaction.x, interaction.y, view);
              const nearbySelected =
                selection?.layer === 'objects' &&
                manifest.objects.some(
                  (object) =>
                    object.id === selection.id &&
                    Math.hypot(object.x - interaction.x, object.y - interaction.y) < 0.35,
                );
              const showLabel = shouldShowInteractionLabel({
                isSelectedNearby: nearbySelected,
                isHovered: hoveredId !== null && nearbySelected,
                zoom,
              });
              return (
                <g
                  className="world-canvas__interaction"
                  data-interaction-id={interaction.id}
                  data-interaction-type={interaction.type}
                  data-show-label={showLabel ? 'true' : 'false'}
                  key={`interaction-${interaction.id}`}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  <circle
                    cx={0}
                    cy={0}
                    fill="none"
                    r={Math.max(10, interaction.range * view.scaleX * 0.55)}
                    stroke="rgba(226, 184, 92, 0.28)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  {showLabel ? (
                    <>
                      <rect
                        fill="rgba(15, 36, 30, 0.82)"
                        height={16}
                        rx={4}
                        width={Math.min(120, interaction.title.length * 6.2 + 12)}
                        x={-Math.min(60, interaction.title.length * 3.1 + 6)}
                        y={-28}
                      />
                      <text
                        fill="rgba(247, 239, 217, 0.92)"
                        fontSize={9}
                        fontWeight={650}
                        textAnchor="middle"
                        x={0}
                        y={-17}
                      >
                        {interaction.title.length > 22
                          ? `${interaction.title.slice(0, 20)}…`
                          : interaction.title}
                      </text>
                    </>
                  ) : null}
                  <title>{interaction.title}</title>
                </g>
              );
            })
          : null}

        {showSpawns ? (
          <g className="world-canvas__spawns">
            {manifest.spawns.map((spawn) => {
              const point = project(spawn.x, spawn.y, view);
              const isSelected = selected(selection, 'spawns', spawn.id);
              return (
                <g
                  className={`${spawn.enabled ? '' : 'is-disabled'} ${isSelected ? 'is-selected' : ''}`}
                  key={spawn.id}
                  onClick={() => onSelect?.({ layer: 'spawns', id: spawn.id })}
                  style={{ cursor: onSelect ? 'pointer' : undefined }}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  {isSelected ? (
                    <circle
                      cx={0}
                      cy={0}
                      fill="none"
                      r={16}
                      stroke="rgba(129, 215, 173, 0.95)"
                      strokeWidth={2}
                    />
                  ) : null}
                  <circle
                    cx={0}
                    cy={0}
                    fill={
                      isSelected
                        ? 'rgba(129, 215, 173, 0.55)'
                        : spawn.enabled
                          ? 'rgba(74, 166, 135, 0.45)'
                          : 'rgba(120, 120, 120, 0.3)'
                    }
                    r={10}
                    stroke={isSelected ? 'rgba(247, 239, 217, 0.95)' : 'rgba(129, 215, 173, 0.9)'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <path
                    d="M 0 -16 L 7 -4 L -7 -4 Z"
                    fill={spawn.enabled ? '#e2b24a' : '#8a8a8a'}
                    stroke="rgba(20, 40, 32, 0.35)"
                    strokeWidth={1}
                  />
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
                  <ellipse cx={0} cy={2} fill="rgba(10, 24, 20, 0.4)" rx={9} ry={5} />
                  <circle
                    cx={0}
                    cy={-15}
                    fill="#f0d9a8"
                    r={9}
                    stroke="rgba(20, 40, 32, 0.4)"
                    strokeWidth={1}
                  />
                  <path
                    d="M -8 -6 L 8 -6 L 6 7 L -6 7 Z"
                    fill="#4aa687"
                    stroke="rgba(20, 40, 32, 0.35)"
                    strokeWidth={1}
                  />
                </g>
              );
            })()}
      </svg>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown rendering failure';
    return (
      <div className="world-canvas-error" data-canvas-error="true" role="alert">
        <strong>Map canvas could not render</strong>
        <p>The structured isometric preview failed while painting this draft.</p>
        <p className="world-canvas-error__detail">{message}</p>
        <p className="world-canvas-error__hint">
          Draft data was not modified. Try reloading the editor or validating the draft schema.
        </p>
      </div>
    );
  }
}
