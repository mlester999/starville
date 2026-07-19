import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  resolveWorldAssetDelivery,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  isPositionWalkable,
  lanternSquareManifest,
  PLAYER_FOOT_RADIUS,
  type PlayerStateUpdate,
} from '@starville/game-core';
import { getPhase12ELanternSquareCandidate, getPhase7LocalDraft } from '@starville/game-content';

import {
  PHASE12C_LOCAL_TERRAIN_ASSET_KEYS,
  phase12CLocalCompositionAvailable,
  selectPhase12CWorldGameTestSource,
  type Phase12CAuthorizedRevisionSource,
} from './phase12c-world-game-test-source';

const exactState: PlayerStateUpdate = {
  mapId: 'lantern-square',
  x: 12,
  y: 9,
  facingDirection: 'south',
};
const exactDeliveries: readonly WorldAssetDelivery[] = [];

function authorized(
  overrides: Partial<Phase12CAuthorizedRevisionSource> = {},
): Phase12CAuthorizedRevisionSource {
  return {
    displayName: 'Lantern Square authorized fixture',
    manifest: lanternSquareManifest(),
    assetDeliveries: exactDeliveries,
    playerState: exactState,
    version: {
      id: '12000000-0000-4000-8000-000000000001',
      checksum: 'a'.repeat(64),
      versionNumber: 7,
      editVersion: 13,
      lifecycleStatus: 'validated',
    },
    ...overrides,
  };
}

describe('Phase 12E World Game Test source selection', () => {
  it('renders the checked-in Phase 12E Lantern Square candidate as an explicit local_draft', () => {
    const source = selectPhase12CWorldGameTestSource({
      mode: 'local_lantern_composition',
      authorized: authorized(),
    });
    const candidate = getPhase12ELanternSquareCandidate();

    expect(source.mode).toBe('local_lantern_composition');
    expect(source.identity).toBe('phase12e_local_lantern_square');
    expect(source.lifecycle).toBe('local_draft');
    expect(source.statusLabel).toBe('LOCAL PHASE 12E DRAFT · UNPUBLISHED · IN MEMORY');
    expect(source.world.manifest).toBe(candidate.manifest);
    expect(source.world.manifest.objects).toHaveLength(47);
    expect(source.world.manifest.collisions).toHaveLength(36);
    expect(source.world.manifest.interactions).toHaveLength(9);
    expect(source.baseState.mapId).toBe('lantern-square');
    expect(
      isPositionWalkable(
        source.baseState,
        PLAYER_FOOT_RADIUS,
        source.world.manifest.safeSaveBounds,
        source.world.manifest.collisions,
      ),
    ).toBe(true);
    expect(source.world.assetResolutionContext).toBe('game_test');
  });

  it('builds a complete bundled-only delivery set without consulting active uploads', () => {
    const source = selectPhase12CWorldGameTestSource({
      mode: 'local_lantern_composition',
      authorized: authorized(),
    });
    const deliveries = source.world.assetDeliveries;
    const neededKeys = [
      ...getPhase12ELanternSquareCandidate().visualAssetKeys,
      ...PHASE12C_LOCAL_TERRAIN_ASSET_KEYS,
    ];

    expect(deliveries).toHaveLength(new Set(neededKeys).size);
    expect(new Set(deliveries.map(({ assetKey }) => assetKey))).toEqual(new Set(neededKeys));
    expect(
      deliveries.every(
        (delivery) =>
          delivery.developmentMarker &&
          delivery.materialClass === 'bundled_candidate' &&
          delivery.bundledManifestVersion === STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION &&
          delivery.url === null &&
          delivery.mediaType === null &&
          (() => {
            const resolved = resolveWorldAssetDelivery({
              assetKey: delivery.assetKey,
              context: 'game_test',
              delivery,
            });
            return (
              resolved.reason === 'exact_pinned_bundled_version' &&
              resolved.bundled.qualityStatus === 'production_candidate'
            );
          })(),
      ),
    ).toBe(true);
  });

  it('retains the exact authorized manifest, pins, state, version, and checksum unchanged', () => {
    const input = authorized();
    const source = selectPhase12CWorldGameTestSource({
      mode: 'authorized_revision',
      authorized: input,
    });

    expect(source.identity).toBe('exact_authorized_revision');
    expect(source.lifecycle).toBe('validated');
    expect(source.world.manifest).toBe(input.manifest);
    expect(source.world.assetDeliveries).toBe(input.assetDeliveries);
    expect(source.baseState).toBe(input.playerState);
    expect(source.world.versionId).toBe(input.version.id);
    expect(source.world.checksum).toBe(input.version.checksum);
    expect(source.world.assetResolutionContext).toBe('game_test');
  });

  it('fails closed for a non-Lantern authorized map instead of substituting local content', () => {
    const meadow = getPhase7LocalDraft('moonpetal-meadow').manifest;
    const input = authorized({
      displayName: 'Moonpetal Meadow',
      manifest: meadow,
      playerState: { ...exactState, mapId: 'moonpetal-meadow' },
    });

    expect(phase12CLocalCompositionAvailable(meadow)).toBe(false);
    expect(() =>
      selectPhase12CWorldGameTestSource({
        mode: 'local_lantern_composition',
        authorized: input,
      }),
    ).toThrow('available only for authorized Lantern Square');
  });

  it('keeps source selection explicit in the protected UI and contains no hosted mutation client', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/components/WorldGameTest.tsx'),
      'utf8',
    );
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/phase12c-world-game-test-source.ts'),
      'utf8',
    );

    for (const expected of [
      'World source',
      'Exact authorized revision',
      'Local Phase 12E beta composition',
      "selectSourceMode('authorized_revision')",
      "selectSourceMode('local_lantern_composition')",
      'local_draft',
      'Bundled-only in-memory deliveries',
    ]) {
      expect(`${component}\n${source}`).toContain(expected);
    }
    for (const forbidden of [
      'requestPlayerApi',
      'usePlayerPersistence',
      'useRealtimePresence',
      'transactGeneralStore',
      'telemetry',
      'analytics',
      'localStorage',
      'sessionStorage',
      '/publish',
      '/activate',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
