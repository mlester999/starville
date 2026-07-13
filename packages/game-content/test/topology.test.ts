import { describe, expect, it } from 'vitest';

import { mapManifestSchema } from '@starville/game-core';

import { WORLD_MANIFESTS, deriveWorldTopology } from '../src';

describe('published world topology', () => {
  it('derives the seeded five-map cross from transition records', () => {
    const maps = WORLD_MANIFESTS.map((manifest, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: manifest.slug,
      displayName: manifest.name,
      mapStatus: 'active' as const,
      versionId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      versionNumber: 1,
      manifest,
    }));
    const result = deriveWorldTopology({ status: 'loaded', maps });

    expect(result.simpleCross).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.nodes.find((node) => node.isHub)?.map.manifest.id).toBe('lantern-square');
    expect(result.nodes.find((node) => node.map.manifest.id === 'moonpetal-meadow')?.role).toBe(
      'North of Lantern Square',
    );
    expect(result.nodes.find((node) => node.map.manifest.id === 'brooklight-crossing')?.role).toBe(
      'East of Lantern Square',
    );
    expect(result.nodes.find((node) => node.map.manifest.id === 'hearthfield-road')?.role).toBe(
      'South of Lantern Square',
    );
    expect(result.nodes.find((node) => node.map.manifest.id === 'whisperpine-gate')?.role).toBe(
      'West of Lantern Square',
    );
  });

  it('reports one-way links and disconnected future layouts without inventing connections', () => {
    const hub = mapManifestSchema.parse(WORLD_MANIFESTS.find((map) => map.id === 'lantern-square'));
    const north = mapManifestSchema.parse(
      WORLD_MANIFESTS.find((map) => map.id === 'moonpetal-meadow'),
    );
    const brokenNorth = mapManifestSchema.parse({
      ...north,
      exits: north.exits.map((exit) =>
        exit.direction === 'south'
          ? {
              ...exit,
              enabled: false,
              destinationMapId: null,
              destinationSpawnId: null,
              transitionLabel: null,
            }
          : exit,
      ),
    });
    const maps = [hub, brokenNorth].map((manifest, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      slug: manifest.slug,
      displayName: manifest.name,
      mapStatus: 'active' as const,
      versionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      versionNumber: 1,
      manifest,
    }));
    const result = deriveWorldTopology({ status: 'loaded', maps });
    expect(result.simpleCross).toBe(false);
    expect(result.warnings).toContain('Lantern Square: north link is not reciprocal.');
  });
});
