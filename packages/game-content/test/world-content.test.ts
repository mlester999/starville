import { describe, expect, it } from 'vitest';

import {
  MAX_MAP_MANIFEST_BYTES,
  validateMapManifest,
  validateWorldManifestGraph,
  type MapManifestInput,
  type WorldAssetValidationRecord,
} from '@starville/game-core';

import {
  WORLD_ASSET_CATALOG,
  WORLD_MANIFESTS,
  WORLD_MANIFEST_SEEDS,
  getWorldManifest,
} from '../src/index';

function cloneManifest(index = 0): MapManifestInput {
  const source = WORLD_MANIFEST_SEEDS[index];
  if (source === undefined) throw new Error('Missing world seed');
  return structuredClone(source) as unknown as MapManifestInput;
}

describe('Phase 6 development world graph', () => {
  it('contains five immutable, distinct, data-only published seed manifests', () => {
    expect(WORLD_MANIFESTS.map(({ id }) => id)).toEqual([
      'lantern-square',
      'moonpetal-meadow',
      'brooklight-crossing',
      'hearthfield-road',
      'whisperpine-gate',
    ]);
    expect(new Set(WORLD_MANIFESTS.map(({ background }) => background.palette)).size).toBe(5);
    for (const manifest of WORLD_MANIFESTS) {
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.developmentArt.temporary).toBe(true);
      expect(manifest.interactions).toHaveLength(manifest.id === 'lantern-square' ? 2 : 1);
      expect(
        manifest.interactions.every(({ type }) => type === 'notice' || type === 'starter_npc'),
      ).toBe(true);
      expect(manifest.exits).toHaveLength(4);
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(JSON.stringify(manifest)).not.toMatch(/<script|javascript:|https?:\/\//iu);
    }
  });

  it('connects all four Lantern Square exits to safe returnable destinations', () => {
    const center = getWorldManifest('lantern-square');
    expect(
      center.exits.map(({ direction, destinationMapId }) => [direction, destinationMapId]),
    ).toEqual([
      ['north', 'moonpetal-meadow'],
      ['east', 'brooklight-crossing'],
      ['south', 'hearthfield-road'],
      ['west', 'whisperpine-gate'],
    ]);
    for (const destination of WORLD_MANIFESTS.slice(1)) {
      expect(destination.exits.filter(({ enabled }) => enabled)).toHaveLength(1);
      for (const exit of destination.exits.filter(({ enabled }) => !enabled)) {
        expect(exit.destinationMapId).toBeNull();
        expect(exit.destinationSpawnId).toBeNull();
        expect(exit.transitionLabel).toBeNull();
      }
    }
  });

  it('rejects missing destinations, missing spawns, and immediate arrival loops', () => {
    const missingMap = WORLD_MANIFEST_SEEDS.map((_manifest, index) => cloneManifest(index));
    missingMap.splice(1, 1);
    expect(() => validateWorldManifestGraph(missingMap, WORLD_ASSET_CATALOG)).toThrow(
      'missing destination map',
    );

    const missingSpawn = WORLD_MANIFEST_SEEDS.map((_manifest, index) => cloneManifest(index));
    const center = missingSpawn[0];
    if (center === undefined) throw new Error('Missing center manifest');
    const northExit = center.exits[0];
    if (northExit === undefined) throw new Error('Missing north exit');
    center.exits[0] = { ...northExit, destinationSpawnId: 'missing-spawn' };
    expect(() => validateWorldManifestGraph(missingSpawn, WORLD_ASSET_CATALOG)).toThrow(
      'missing, disabled, or non-transition destination spawn',
    );

    const loop = WORLD_MANIFEST_SEEDS.map((_manifest, index) => cloneManifest(index));
    const meadow = loop[1];
    if (meadow === undefined) throw new Error('Missing meadow manifest');
    const arrival = meadow.spawns.find(({ id }) => id === 'from-south');
    if (arrival === undefined) throw new Error('Missing arrival spawn');
    arrival.x = 10;
    arrival.y = 16.5;
    expect(() => validateWorldManifestGraph(loop, WORLD_ASSET_CATALOG)).toThrow(
      'spawn inside an active exit trigger',
    );
  });
});

describe('map manifest validation boundaries', () => {
  it('rejects duplicate IDs, invalid bounds, blocked spawns, and contradictory exits', () => {
    const duplicate = cloneManifest();
    const firstObject = duplicate.objects[0];
    const secondObject = duplicate.objects[1];
    if (firstObject === undefined || secondObject === undefined) throw new Error('Missing objects');
    duplicate.objects[1] = { ...secondObject, id: firstObject.id };
    expect(() => validateMapManifest(duplicate, WORLD_ASSET_CATALOG)).toThrow('duplicate');

    const bounds = cloneManifest();
    bounds.safeSaveBounds = { ...bounds.safeSaveBounds, maxX: bounds.width + 1 };
    expect(() => validateMapManifest(bounds, WORLD_ASSET_CATALOG)).toThrow('safe save bounds');

    const spawn = cloneManifest();
    const defaultSpawn = spawn.spawns.find(({ id }) => id === spawn.defaultSpawnId);
    if (defaultSpawn === undefined) throw new Error('Missing default spawn');
    defaultSpawn.x = 5;
    defaultSpawn.y = 4.25;
    expect(() => validateMapManifest(spawn, WORLD_ASSET_CATALOG)).toThrow(
      'overlaps blocking collision',
    );

    const disabled = cloneManifest();
    const firstExit = disabled.exits[0];
    if (firstExit === undefined) throw new Error('Missing exit');
    disabled.exits[0] = { ...firstExit, enabled: false };
    expect(() => validateMapManifest(disabled, WORLD_ASSET_CATALOG)).toThrow(
      'inconsistent enabled destination data',
    );
  });

  it('rejects unapproved or undeclared assets and oversized payloads', () => {
    const undeclared = cloneManifest();
    const firstObject = undeclared.objects[0];
    if (firstObject === undefined) throw new Error('Missing object');
    undeclared.objects[0] = { ...firstObject, assetId: 'moonstone-marker' };
    expect(() => validateMapManifest(undeclared, WORLD_ASSET_CATALOG)).toThrow('undeclared asset');

    const unapproved = cloneManifest();
    unapproved.assets[0] = 'draft-only';
    const catalog = new Map<string, WorldAssetValidationRecord>(WORLD_ASSET_CATALOG);
    catalog.set('draft-only', { key: 'draft-only', status: 'draft' });
    expect(() => validateMapManifest(unapproved, catalog)).toThrow('unapproved asset');

    const oversized = cloneManifest();
    oversized.description = 'a'.repeat(MAX_MAP_MANIFEST_BYTES);
    expect(() => validateMapManifest(oversized, WORLD_ASSET_CATALOG)).toThrow(
      'maximum payload size',
    );
  });
});
