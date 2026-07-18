import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createAdminCozyService } from './admin.js';
import { playableVerticalSliceFixture } from './test-fixtures.js';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
  assuranceLevel: 'aal2' as const,
  authenticationMethods: ['password', 'totp'],
};
const playerId = '33333333-3333-4333-8333-333333333333';
const itemId = '71000000-0000-4000-8000-000000000001';
const cropId = '72000000-0000-4000-8000-000000000001';
const templateId = '73000000-0000-4000-8000-000000000001';
const questVersionId = '74000000-0000-4000-8000-000000000001';
const hoeItemId = '75000000-0000-4000-8000-000000000001';
const wateringCanItemId = '75000000-0000-4000-8000-000000000002';
const produceItemId = '75000000-0000-4000-8000-000000000003';

const editableSeedDefinition = {
  name: 'Moonbean seeds',
  description: 'Starter seeds for a Moonbean crop.',
  category: 'seed' as const,
  stackable: true,
  maxStackSize: 99,
  buyEligible: false,
  sellEligible: false,
  giftable: false,
  tradable: false,
  accountBound: true,
  permanentTool: false,
  minimumTransferQuantity: 1,
  maximumTransferQuantity: 1,
  defaultBuyPrice: null,
  defaultSellPrice: null,
  assetRef: null,
  assetReadiness: 'development_marker' as const,
  active: true,
  metadata: { kind: 'seed' as const, cropSlug: 'moonbean' },
};

const questObjectives = [
  'meet_guide',
  'receive_starter_kit',
  'enter_home_plot',
  'prepare_soil',
  'plant_crops',
  'water_crops',
  'harvest_crop',
  'deliver_produce',
  'receive_reward',
].map((key) => ({
  key,
  label: key.replaceAll('_', ' '),
  required: key === 'plant_crops' || key === 'water_crops' || key === 'deliver_produce' ? 2 : 1,
}));

describe('administrator cozy gameplay service', () => {
  it('passes only trusted administrator identity and bounded pagination to economy RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'loaded',
        initialized: false,
        account: null,
        items: [],
        pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 },
      },
      error: null,
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);

    await expect(
      service.getEconomy(identity, playerId, { page: '2', pageSize: '50' }),
    ).resolves.toEqual(expect.objectContaining({ initialized: false, account: null }));
    expect(rpc).toHaveBeenCalledWith('get_admin_player_economy', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_player_profile_id: playerId,
      p_page: 2,
      p_page_size: 50,
    });
  });

  it('maps an authoritative missing-player result without widening access', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'not_found' }, error: null }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);

    await expect(service.getCozy(identity, playerId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PLAYER_NOT_FOUND',
    });
  });

  it('loads one strictly validated player farming projection through the protected admin RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'loaded',
        initialized: true,
        view: playableVerticalSliceFixture,
        lastFarmingAction: '2026-07-13T01:00:00.000Z',
        pendingReconciliationCount: 0,
      },
      error: null,
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);

    await expect(service.getPlayerFarming(identity, playerId)).resolves.toMatchObject({
      initialized: true,
      view: { plot: { ownerPlayerId: playableVerticalSliceFixture.plot.ownerPlayerId } },
    });
    expect(rpc).toHaveBeenCalledWith('get_admin_player_farming', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_player_profile_id: playerId,
    });
  });

  it('updates only bounded farming availability flags with revision and audit evidence', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'updated',
        replayed: false,
        settings: {
          plantingEnabled: false,
          harvestingEnabled: true,
          plotProvisioningEnabled: true,
          starterQuestEnabled: true,
          tutorialRewardsEnabled: false,
          maintenanceMessage: 'Planting is paused during a local safety check.',
          configurationRevision: 2,
        },
      },
      error: null,
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    const body = {
      expectedRevision: 1,
      plantingEnabled: false,
      harvestingEnabled: true,
      plotProvisioningEnabled: true,
      starterQuestEnabled: true,
      tutorialRewardsEnabled: false,
      maintenanceMessage: 'Planting is paused during a local safety check.',
      reason: 'Pause two bounded actions while reviewing local farming telemetry.',
    };

    await expect(
      service.updateFarmingLiveOps(identity, body, 'phase11-admin-liveops'),
    ).resolves.toMatchObject({
      settings: { plantingEnabled: false, tutorialRewardsEnabled: false },
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith('update_admin_farming_live_ops', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_expected_revision: 1,
      p_planting_enabled: false,
      p_harvesting_enabled: true,
      p_plot_provisioning_enabled: true,
      p_starter_quest_enabled: true,
      p_tutorial_rewards_enabled: false,
      p_maintenance_message: body.maintenanceMessage,
      p_reason: body.reason,
      p_request_id: 'phase11-admin-liveops',
    });
  });

  it('returns a stable conflict when the farming configuration revision changed', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'state_conflict' }, error: null }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    await expect(
      service.updateFarmingLiveOps(
        identity,
        {
          expectedRevision: 1,
          plantingEnabled: true,
          harvestingEnabled: true,
          plotProvisioningEnabled: true,
          starterQuestEnabled: true,
          tutorialRewardsEnabled: true,
          maintenanceMessage: null,
          reason: 'Record a bounded local farming policy verification update.',
        },
        'phase11-admin-conflict',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'FARMING_CONFIGURATION_CONFLICT' });
  });

  it('updates an item through the bounded content RPC without accepting immutable identity fields', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'updated',
        replayed: false,
        item: {
          definition: {
            id: itemId,
            slug: 'moonbean-seed',
            ...editableSeedDefinition,
            contentVersion: 2,
          },
          referenceImpact: {
            inventoryStackCount: 2,
            cropDefinitionCount: 1,
            questVersionCount: 1,
            recipeCount: 0,
            shopOfferCount: 0,
            furnitureDefinitionCount: 0,
          },
        },
      },
      error: null,
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    const body = {
      expectedContentVersion: 1,
      definition: editableSeedDefinition,
      reason: 'Clarify the starter seed description without changing its identity.',
    };

    await expect(
      service.updateFarmingItem(identity, itemId, body, 'phase11-admin-item-update'),
    ).resolves.toMatchObject({
      item: { definition: { id: itemId, slug: 'moonbean-seed', contentVersion: 2 } },
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith('update_admin_farming_item', {
      p_user_id: identity.userId,
      p_auth_session_id: identity.authSessionId,
      p_assurance_level: identity.assuranceLevel,
      p_item_id: itemId,
      p_expected_content_version: 1,
      p_definition: editableSeedDefinition,
      p_reason: body.reason,
      p_request_id: 'phase11-admin-item-update',
    });
  });

  it('maps reference-safe crop conflicts and forwards only a validated crop revision', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'reference_conflict' }, error: null }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    const definition = {
      name: 'Moonbean',
      description: 'A compact tutorial crop.',
      seedItemId: itemId,
      produceItemId,
      productionGrowthDurationSeconds: 300,
      localGrowthDurationSeconds: 10,
      growthStageCount: 4,
      deterministicYield: 3,
      wateringPolicy: 'water_once_to_start' as const,
      tutorialEligible: true,
      assetRef: null,
      assetReadiness: 'development_marker' as const,
      active: true,
    };

    await expect(
      service.updateFarmingCrop(
        identity,
        cropId,
        {
          expectedConfigurationRevision: 1,
          definition,
          reason: 'Verify referenced crop item links before publishing a new revision.',
        },
        'phase11-admin-crop-conflict',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'FARMING_REFERENCE_CONFLICT' });
    expect(rpc).toHaveBeenCalledWith(
      'update_admin_farming_crop',
      expect.objectContaining({
        p_crop_id: cropId,
        p_expected_configuration_revision: 1,
        p_definition: definition,
      }),
    );
  });

  it('creates plot-template successors with the pinned active UUID and exactly eight validated tiles', async () => {
    const rpc = vi.fn(async () => ({ data: { status: 'state_conflict' }, error: null }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    const body = {
      expectedTemplateId: templateId,
      expectedTemplateVersion: 1,
      name: 'Starter cottage interior v2',
      bounds: { minX: 0, minY: 0, maxX: 12, maxY: 12 },
      spawn: { x: 2, y: 2 },
      exit: { x: 2, y: 10 },
      blockedCells: [],
      developmentArt: true,
      tiles: Array.from({ length: 8 }, (_, index) => ({
        tileKey: `starter-soil-${index + 1}`,
        slot: index + 1,
        x: 4 + (index % 4),
        y: 5 + Math.floor(index / 4),
      })),
      reason: 'Create a validated successor while preserving every existing player home.',
    };

    await expect(
      service.createFarmingPlotTemplateSuccessor(
        identity,
        body,
        'phase11-admin-template-successor',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'FARMING_CONFIGURATION_CONFLICT' });
    expect(rpc).toHaveBeenCalledWith(
      'create_admin_farming_plot_template_successor',
      expect.objectContaining({
        p_expected_template_id: templateId,
        p_expected_template_version: 1,
        p_definition: expect.objectContaining({ tiles: body.tiles }),
      }),
    );
  });

  it('keeps starter-quest reward changes behind the database reward permission boundary', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'insufficient privilege' },
    }));
    const service = createAdminCozyService({ rpc } as unknown as SupabaseClient);
    const body = {
      expectedVersionId: questVersionId,
      expectedVersionNumber: 1,
      name: 'A Place to Grow',
      description: 'Meet Willow Guide and grow the first Moonbean crop at home.',
      starterSeedQuantity: 4,
      deliveryQuantity: 2,
      rewardDust: 30,
      starterHoeItemId: hoeItemId,
      starterWateringCanItemId: wateringCanItemId,
      starterSeedItemId: itemId,
      deliveryItemId: produceItemId,
      objectives: questObjectives,
      reason: 'Propose a reviewed reward successor without mutating accepted quest versions.',
    };

    await expect(
      service.createStarterQuestSuccessor(identity, body, 'phase11-admin-quest-successor'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_ACCESS_DENIED' });
    expect(rpc).toHaveBeenCalledWith(
      'create_admin_starter_quest_successor',
      expect.objectContaining({
        p_expected_version_id: questVersionId,
        p_expected_version_number: 1,
        p_definition: expect.objectContaining({ rewardDust: 30, objectives: questObjectives }),
      }),
    );
  });
});
