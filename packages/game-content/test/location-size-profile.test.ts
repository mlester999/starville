import { MAP_IDS } from '@starville/game-core';
import { describe, expect, it } from 'vitest';

import { V3_OUTDOOR_LOCATION_SIZE_PROFILES } from '../src/location-size-profile';
import { WORLD_MANIFEST_BY_ID } from '../src/manifests';

describe('V3 outdoor location-size profiles', () => {
  it('binds every baseline to the canonical outdoor manifest', () => {
    expect(Object.keys(V3_OUTDOOR_LOCATION_SIZE_PROFILES)).toEqual(MAP_IDS);

    for (const mapId of MAP_IDS) {
      const canonical = WORLD_MANIFEST_BY_ID.get(mapId);
      const profile = V3_OUTDOOR_LOCATION_SIZE_PROFILES[mapId];
      expect(canonical).toBeDefined();
      expect(profile.baseline).toEqual({
        width: canonical?.width,
        height: canonical?.height,
      });
    }
  });

  it('triples canonical width and height while centering the existing composition', () => {
    for (const mapId of MAP_IDS) {
      const canonical = WORLD_MANIFEST_BY_ID.get(mapId);
      const profile = V3_OUTDOOR_LOCATION_SIZE_PROFILES[mapId];
      if (canonical === undefined) throw new Error(`Missing canonical map '${mapId}'`);

      expect(profile.logical.width).toBe(canonical.width * 3);
      expect(profile.logical.height).toBe(canonical.height * 3);
      expect(profile.logical.width * profile.logical.height).toBe(
        canonical.width * canonical.height * 9,
      );
      expect(profile.centeredContentOffset).toEqual({
        x: canonical.width,
        y: canonical.height,
      });
      expect(profile.contentBounds).toEqual({
        minX: canonical.width,
        minY: canonical.height,
        maxX: canonical.width * 2,
        maxY: canonical.height * 2,
      });
      expect(profile.cameraBounds).toEqual({
        minX: canonical.cameraBounds.minX,
        minY: canonical.cameraBounds.minY,
        maxX: canonical.cameraBounds.maxX * 3,
        maxY: canonical.cameraBounds.maxY * 3,
      });
      expect(profile.playableBounds.maxX).toBeLessThan(profile.logical.width);
      expect(profile.playableBounds.maxY).toBeLessThan(profile.logical.height);
      expect(profile.exitPoints).toHaveLength(4);
    }
  });

  it('remaps every canonical spawn by the exact centered-content offset', () => {
    for (const mapId of MAP_IDS) {
      const canonical = WORLD_MANIFEST_BY_ID.get(mapId);
      const profile = V3_OUTDOOR_LOCATION_SIZE_PROFILES[mapId];
      if (canonical === undefined) throw new Error(`Missing canonical map '${mapId}'`);

      expect(profile.spawnPoints).toEqual(
        canonical.spawns.map((spawn) => ({
          x: spawn.x + profile.centeredContentOffset.x,
          y: spawn.y + profile.centeredContentOffset.y,
        })),
      );
    }
  });
});
