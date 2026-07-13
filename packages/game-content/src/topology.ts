import type { MapDirection } from '@starville/game-core';

import type { PublishedWorldTopology } from './management';

const OPPOSITE: Readonly<Record<MapDirection, MapDirection>> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

export interface WorldTopologyNode {
  readonly map: PublishedWorldTopology['maps'][number];
  readonly role: string;
  readonly isHub: boolean;
}

export interface DerivedWorldTopology {
  readonly nodes: readonly WorldTopologyNode[];
  readonly hubId: string | null;
  readonly warnings: readonly string[];
  readonly simpleCross: boolean;
}

export function deriveWorldTopology(topology: PublishedWorldTopology): DerivedWorldTopology {
  const byManifestId = new Map(topology.maps.map((map) => [map.manifest.id, map]));
  const enabledCount = (map: PublishedWorldTopology['maps'][number]) =>
    map.manifest.exits.filter((exit) => exit.enabled).length;
  const ranked = [...topology.maps].sort((left, right) => enabledCount(right) - enabledCount(left));
  const hub = ranked[0] !== undefined && enabledCount(ranked[0]) >= 2 ? ranked[0] : undefined;
  const warnings: string[] = [];

  for (const map of topology.maps) {
    for (const exit of map.manifest.exits.filter((candidate) => candidate.enabled)) {
      const destination =
        exit.destinationMapId === null ? undefined : byManifestId.get(exit.destinationMapId);
      if (destination === undefined) {
        warnings.push(`${map.displayName}: ${exit.direction} exit has no published destination.`);
        continue;
      }
      if (
        !destination.manifest.spawns.some(
          (spawn) => spawn.id === exit.destinationSpawnId && spawn.enabled,
        )
      ) {
        warnings.push(
          `${map.displayName}: ${exit.direction} exit targets a missing or disabled spawn.`,
        );
      }
      const reciprocal = destination.manifest.exits.find(
        (candidate) =>
          candidate.enabled &&
          candidate.direction === OPPOSITE[exit.direction] &&
          candidate.destinationMapId === map.manifest.id,
      );
      if (reciprocal === undefined)
        warnings.push(`${map.displayName}: ${exit.direction} link is not reciprocal.`);
    }
  }

  const hubDirections = new Map<MapDirection, string>();
  if (hub !== undefined) {
    for (const exit of hub.manifest.exits.filter((candidate) => candidate.enabled)) {
      if (exit.destinationMapId !== null) hubDirections.set(exit.direction, exit.destinationMapId);
    }
  }
  const nodes = topology.maps.map((map): WorldTopologyNode => {
    if (map.id === hub?.id) return { map, role: 'Hub', isHub: true };
    const relation = [...hubDirections].find(([, destination]) => destination === map.manifest.id);
    if (relation !== undefined && hub !== undefined) {
      return {
        map,
        role: `${relation[0][0]?.toUpperCase()}${relation[0].slice(1)} of ${hub.displayName}`,
        isHub: false,
      };
    }
    return { map, role: enabledCount(map) === 0 ? 'Disconnected' : 'Outer map', isHub: false };
  });
  const simpleCross = hub !== undefined && hubDirections.size === 4 && topology.maps.length === 5;
  if (!simpleCross && topology.maps.length > 0)
    warnings.push('Published topology is not a simple five-map cross.');
  return { nodes, hubId: hub?.id ?? null, warnings: [...new Set(warnings)], simpleCross };
}
