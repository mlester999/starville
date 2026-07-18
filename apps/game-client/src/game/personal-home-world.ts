import { validateMapManifest } from '@starville/game-core';
import type { PlayableVerticalSlice } from '@starville/cozy-gameplay';

import type { RuntimeWorld } from './contracts';

export function personalHomeRuntimeWorld(
  publicWorld: RuntimeWorld,
  view: PlayableVerticalSlice,
): RuntimeWorld {
  const { plot } = view;
  const workstations = plot.workstations ?? [];
  const width = plot.bounds.maxX - plot.bounds.minX;
  const height = plot.bounds.maxY - plot.bounds.minY;
  const workstationAssetIds = workstations
    .map((station) => station.definition.assetRef)
    .filter((assetId): assetId is string => assetId !== null);
  const manifest = validateMapManifest(
    {
      schemaVersion: 1,
      id: publicWorld.manifest.id,
      slug: publicWorld.manifest.slug,
      name: 'Private Home Plot',
      description: 'Your owner-only starter cottage garden and safe return path to Lantern Square.',
      version: plot.templateVersion,
      developmentArt: {
        temporary: true,
        label: 'Phase 11A processed-marker fallback art',
      },
      background: { palette: 'meadow' },
      width,
      height,
      tileWidth: publicWorld.manifest.tileWidth,
      tileHeight: publicWorld.manifest.tileHeight,
      projectionOrigin: {
        x: Math.max(480, width * publicWorld.manifest.tileWidth * 0.5),
        y: publicWorld.manifest.tileHeight * 2,
      },
      cameraBounds: {
        minX: 0,
        minY: 0,
        maxX: Math.max(960, width * publicWorld.manifest.tileWidth),
        maxY: Math.max(640, height * publicWorld.manifest.tileHeight * 2),
      },
      safeSaveBounds: {
        minX: plot.bounds.minX + 0.25,
        minY: plot.bounds.minY + 0.25,
        maxX: plot.bounds.maxX - 0.25,
        maxY: plot.bounds.maxY - 0.25,
      },
      defaultSpawnId: 'home-spawn',
      spawns: [
        {
          id: 'home-spawn',
          x: plot.spawn.x,
          y: plot.spawn.y,
          facingDirection: 'north',
          purpose: 'default',
          enabled: true,
        },
      ],
      assets: [...new Set([...publicWorld.manifest.assets, ...workstationAssetIds])],
      terrain: [
        {
          id: 'home-grass',
          terrain: 'grass',
          x: plot.bounds.minX,
          y: plot.bounds.minY,
          width,
          height,
          order: 0,
        },
        {
          id: 'home-path',
          terrain: 'path',
          x: Math.max(plot.bounds.minX, plot.spawn.x - 1),
          y: plot.bounds.minY,
          width: Math.min(3, width),
          height,
          order: 1,
        },
      ],
      collisions: [],
      objects: workstations.flatMap((station) => {
        const assetId = station.definition.assetRef;
        if (assetId === null) return [];
        return [
          {
            id: station.worldObjectId,
            assetId,
            kind:
              station.definition.type === 'cooking_hearth'
                ? ('cooking_station' as const)
                : ('crafting_station' as const),
            x: station.position.x,
            y: station.position.y,
            scale: 1,
          },
        ];
      }),
      interactions: [
        ...plot.tiles.map((tile) => ({
          id: `home-tile-${String(tile.slot)}`,
          type: 'home_farm_tile' as const,
          x: tile.x,
          y: tile.y,
          range: 1.75,
          title: `Garden tile ${String(tile.slot)}`,
          content: 'Use the selected farming tool or seed. The server validates every action.',
          tileKey: tile.tileKey,
          slot: tile.slot,
        })),
        ...workstations.map((station) => ({
          id: station.worldObjectId,
          type:
            station.definition.type === 'cooking_hearth'
              ? ('cooking_station' as const)
              : ('crafting_station' as const),
          x: station.interactionPoint.x,
          y: station.interactionPoint.y,
          range: station.definition.interactionRadius,
          title: station.definition.name,
          content: station.definition.description,
          stationType: station.definition.type,
          workstationInstanceId: station.id,
        })),
        {
          id: 'home-return-exit',
          type: 'home_entrance' as const,
          x: plot.exit.x,
          y: plot.exit.y,
          range: 1.5,
          title: 'Return to Lantern Square',
          content: 'Leave the private home plot and reconnect to the public village safely.',
          homeTemplateSlug: plot.templateSlug,
        },
      ],
      exits: [
        {
          id: 'home-north-edge',
          direction: 'north',
          trigger: { x: width / 2 - 0.5, y: 0, width: 1, height: 0.25 },
          destinationMapId: null,
          destinationSpawnId: null,
          enabled: false,
          transitionLabel: null,
        },
        {
          id: 'home-east-edge',
          direction: 'east',
          trigger: { x: width - 0.25, y: height / 2 - 0.5, width: 0.25, height: 1 },
          destinationMapId: null,
          destinationSpawnId: null,
          enabled: false,
          transitionLabel: null,
        },
        {
          id: 'home-south-edge',
          direction: 'south',
          trigger: { x: width / 2 - 0.5, y: height - 0.25, width: 1, height: 0.25 },
          destinationMapId: null,
          destinationSpawnId: null,
          enabled: false,
          transitionLabel: null,
        },
        {
          id: 'home-west-edge',
          direction: 'west',
          trigger: { x: 0, y: height / 2 - 0.5, width: 0.25, height: 1 },
          destinationMapId: null,
          destinationSpawnId: null,
          enabled: false,
          transitionLabel: null,
        },
      ],
    },
    new Set(publicWorld.manifest.assets),
  );
  const compactId = plot.id.replaceAll('-', '');
  return {
    manifest,
    versionId: plot.id,
    checksum: `${compactId}${compactId}`,
    assetDeliveries: publicWorld.assetDeliveries,
  };
}
