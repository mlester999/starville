import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
const safeKey = z.string().regex(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u);
const idempotencyKey = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u);
const revision = z.number().int().positive();
const coordinate = z.number().int().min(-128).max(128);

export const housingZoneTypeSchema = z.enum([
  'indoor_floor',
  'indoor_wall',
  'outdoor_ground',
  'outdoor_path_edge',
  'outdoor_garden',
  'workstation_zone',
  'storage_zone',
  'entrance_clearance',
  'restricted',
]);
export type HousingZoneType = z.infer<typeof housingZoneTypeSchema>;

export const housingFurnitureCategorySchema = z.enum([
  'seating',
  'table',
  'storage',
  'decoration',
  'plant',
  'lighting',
  'wall_decoration',
  'outdoor_decoration',
  'utility',
]);

export const housingRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
export type HousingRotation = z.infer<typeof housingRotationSchema>;

export const housingZoneSchema = z
  .object({
    id: z.uuid(),
    key: safeKey,
    type: housingZoneTypeSchema,
    label: z.string().min(2).max(80),
    bounds: z
      .object({ minX: coordinate, minY: coordinate, maxX: coordinate, maxY: coordinate })
      .strict(),
    allowedCategories: z.array(housingFurnitureCategorySchema).max(9),
    capacity: z.number().int().min(0).max(200),
    requiredTier: z.number().int().min(1).max(20),
    collisionPolicy: z.enum(['blocking', 'decorative_overlap', 'restricted']),
    snapPolicy: z.enum(['grid', 'half_grid', 'fixed_anchor']),
    rotations: z.array(housingRotationSchema).min(1).max(4),
    enabled: z.boolean(),
    indoorFoundationOnly: z.boolean(),
    configurationRevision: revision,
  })
  .strict();

export const housingFurnitureDefinitionSchema = z
  .object({
    id: z.uuid(),
    key: safeKey,
    itemDefinitionId: z.uuid(),
    itemSlug: safeKey,
    displayName: z.string().min(2).max(80),
    description: z.string().min(8).max(280),
    category: housingFurnitureCategorySchema,
    worldAssetRef: safeKey.nullable(),
    assetReadiness: z.enum(['approved', 'development_marker', 'missing']),
    footprint: z
      .object({ width: z.number().int().min(1).max(8), height: z.number().int().min(1).max(8) })
      .strict(),
    footAnchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
    depthAnchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
    rotations: z.array(housingRotationSchema).min(1).max(4),
    allowedZones: z.array(housingZoneTypeSchema).min(1).max(9),
    blocksMovement: z.boolean(),
    capacityWeight: z.number().int().min(1).max(20),
    indoorEligible: z.boolean(),
    outdoorEligible: z.boolean(),
    wallMounted: z.boolean(),
    interactionType: safeKey.nullable(),
    storageSlots: z.number().int().min(0).max(200),
    enabled: z.boolean(),
    released: z.boolean(),
    configurationRevision: revision,
  })
  .strict();

export const housingOwnedPlaceableSchema = z
  .object({
    inventoryStackId: z.uuid(),
    furniture: housingFurnitureDefinitionSchema,
    ownedQuantity: z.number().int().min(1).max(99_999),
    placedQuantity: z.number().int().nonnegative().max(99_999),
    availableQuantity: z.number().int().nonnegative().max(99_999),
    recentlyAcquired: z.boolean(),
    unavailableReason: z.string().min(2).max(160).nullable(),
  })
  .strict();

export const housingPlacementSchema = z
  .object({
    instanceId: z.uuid(),
    furnitureDefinitionId: z.uuid(),
    furnitureKey: safeKey,
    itemDefinitionId: z.uuid(),
    zoneId: z.uuid(),
    zoneKey: safeKey,
    x: coordinate,
    y: coordinate,
    layer: z.number().int().min(0).max(20),
    rotation: housingRotationSchema,
    effectiveScale: z.number().min(0.1).max(4),
    stateVersion: revision,
    placementState: z.enum(['placed', 'grandfathered']),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const housingDraftPlacementSchema = z
  .object({
    instanceId: z.uuid().nullable(),
    inventoryStackId: z.uuid().nullable(),
    furnitureDefinitionId: z.uuid(),
    furnitureKey: safeKey,
    zoneId: z.uuid(),
    zoneKey: safeKey,
    x: coordinate,
    y: coordinate,
    layer: z.number().int().min(0).max(20).default(0),
    rotation: housingRotationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.instanceId === null) === (value.inventoryStackId === null)) {
      context.addIssue({
        code: 'custom',
        path: ['inventoryStackId'],
        message: 'A placement must be either a saved instance or one inventory-backed addition',
      });
    }
  });
export type HousingDraftPlacement = z.infer<typeof housingDraftPlacementSchema>;

export const housingValidationIssueSchema = z
  .object({
    severity: z.enum(['error', 'warning']),
    code: z.enum([
      'furniture_not_owned',
      'furniture_disabled',
      'zone_locked',
      'zone_incompatible',
      'out_of_bounds',
      'collision',
      'entrance_blocked',
      'farm_tile_blocked',
      'workstation_blocked',
      'rotation_unsupported',
      'capacity_reached',
      'zone_capacity_reached',
      'asset_unresolved',
      'narrow_path',
      'depth_conflict',
    ]),
    placementIndex: z.number().int().nonnegative().nullable(),
    message: z.string().min(2).max(200),
  })
  .strict();

export const housingLayoutValidationSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(housingValidationIssueSchema).max(256),
    furnitureCapacity: z
      .object({ used: z.number().int().nonnegative(), maximum: z.number().int().positive() })
      .strict(),
    configurationRevision: revision,
    validatedAt: timestamp,
  })
  .strict();

export const housingLayoutRevisionSummarySchema = z
  .object({
    id: z.uuid(),
    revisionNumber: revision,
    parentRevisionId: z.uuid().nullable(),
    restorationSourceRevisionId: z.uuid().nullable(),
    templateVersion: revision,
    homeTier: z.number().int().min(1).max(20),
    furnitureCount: z.number().int().nonnegative().max(200),
    changeSummary: z.array(z.string().min(2).max(160)).max(20),
    validationResult: z.enum(['valid', 'grandfathered']),
    current: z.boolean(),
    createdAt: timestamp,
  })
  .strict();

export const housingLayoutRevisionPlacementSchema = z
  .object({
    instanceId: z.uuid(),
    furnitureDefinitionId: z.uuid(),
    itemDefinitionId: z.uuid(),
    zoneId: z.uuid(),
    x: coordinate,
    y: coordinate,
    layer: z.number().int().min(0).max(20),
    rotation: housingRotationSchema,
    effectiveScale: z.number().min(0.1).max(4),
    placementState: z.enum(['placed', 'grandfathered']),
  })
  .strict();

export const housingLayoutRevisionInspectionSchema = z
  .object({
    status: z.literal('loaded'),
    revision: housingLayoutRevisionSummarySchema,
    placements: z.array(housingLayoutRevisionPlacementSchema).max(200),
  })
  .strict();
export type HousingLayoutRevisionInspection = z.infer<typeof housingLayoutRevisionInspectionSchema>;

export const housingLayoutSchema = z
  .object({
    headStateVersion: revision,
    activeRevision: housingLayoutRevisionSummarySchema,
    placements: z.array(housingPlacementSchema).max(200),
    history: z.array(housingLayoutRevisionSummarySchema).max(50),
  })
  .strict();

export const housingStorageStackSchema = z
  .object({
    id: z.uuid(),
    itemDefinitionId: z.uuid(),
    itemSlug: safeKey,
    itemName: z.string().min(2).max(80),
    category: safeKey,
    quantity: z.number().int().positive().max(999_999),
    maxStackSize: z.number().int().positive().max(99_999),
    stateVersion: revision,
  })
  .strict();

export const housingStorageSchema = z
  .object({
    id: z.uuid(),
    type: z.literal('starter_private'),
    lifecycle: z.enum(['active', 'suspended', 'archived']),
    capacity: z.number().int().min(1).max(500),
    usedSlots: z.number().int().nonnegative().max(500),
    stateVersion: revision,
    configurationRevision: revision,
    stacks: z.array(housingStorageStackSchema).max(500),
  })
  .strict();

export const housingUpgradeSchema = z
  .object({
    definitionId: z.uuid(),
    versionId: z.uuid(),
    key: safeKey,
    displayName: z.string().min(2).max(80),
    description: z.string().min(8).max(280),
    currentTier: z.number().int().min(1).max(20),
    targetTier: z.number().int().min(2).max(20),
    dustCost: z.number().int().min(1).max(1_000_000),
    requiredPlayerLevel: z.number().int().min(1).max(50),
    requiredSkillKey: safeKey.nullable(),
    requiredSkillLevel: z.number().int().min(1).max(50).nullable(),
    requiredQuestDefinitionId: z.uuid().nullable(),
    requiredAchievementDefinitionId: z.uuid().nullable(),
    storageCapacity: z.number().int().min(1).max(500),
    furnitureCapacity: z.number().int().min(1).max(200),
    unlockedZoneKeys: z.array(safeKey).max(32),
    roomUnlock: z.enum(['none', 'indoor_foundation']),
    eligible: z.boolean(),
    owned: z.boolean(),
    unavailableReasons: z.array(safeKey).max(10),
    configurationRevision: revision,
  })
  .strict();

export const housingTutorialSchema = z
  .object({
    questDefinitionId: z.uuid(),
    questInstanceId: z.uuid().nullable(),
    status: z.enum(['available', 'active', 'reward_claimed']),
    objectives: z
      .array(
        z
          .object({
            key: safeKey,
            label: z.string().min(2).max(160),
            current: z.number().int().nonnegative(),
            required: z.number().int().positive(),
            complete: z.boolean(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export const housingLiveOpsSchema = z
  .object({
    decorationStartsEnabled: z.boolean(),
    layoutSavesEnabled: z.boolean(),
    storageDepositsEnabled: z.boolean(),
    storageWithdrawalsEnabled: z.boolean(),
    upgradesEnabled: z.boolean(),
    tutorialGrantsEnabled: z.boolean(),
    tutorialRewardsEnabled: z.boolean(),
    maintenanceMessage: z.string().max(280).nullable(),
    configurationRevision: revision,
  })
  .strict();

export const housingWorkspaceSchema = z
  .object({
    home: z
      .object({
        id: z.uuid(),
        ownerPlayerId: z.uuid(),
        templateId: z.uuid(),
        templateSlug: safeKey,
        templateVersion: revision,
        lifecycle: z.enum([
          'not_provisioned',
          'provisioning',
          'active',
          'suspended',
          'provisioning_failed',
          'archived',
        ]),
        location: z.enum(['public_world', 'personal_home']),
        homeTier: z.number().int().min(1).max(20),
        furnitureCapacity: z.number().int().min(1).max(200),
        storageCapacity: z.number().int().min(1).max(500),
        indoorFoundationEnabled: z.boolean(),
        configurationRevision: revision,
        stateVersion: revision,
      })
      .strict(),
    layout: housingLayoutSchema,
    zones: z.array(housingZoneSchema).max(64),
    ownedPlaceables: z.array(housingOwnedPlaceableSchema).max(200),
    storage: housingStorageSchema,
    upgrades: z.array(housingUpgradeSchema).max(20),
    tutorial: housingTutorialSchema,
    liveOps: housingLiveOpsSchema,
    dust: z.object({ balance: z.number().int().nonnegative(), stateVersion: revision }).strict(),
    inventoryStateVersion: revision,
    gameTest: z.literal(false),
    serverTime: timestamp,
  })
  .strict();
export type HousingWorkspace = z.infer<typeof housingWorkspaceSchema>;

export const openDecorationSessionRequestSchema = z
  .object({ homeId: z.uuid(), expectedLayoutRevision: revision, idempotencyKey })
  .strict();
export const layoutDraftRequestSchema = z
  .object({
    homeId: z.uuid(),
    expectedLayoutRevision: revision,
    expectedLayoutHeadStateVersion: revision,
    placements: z.array(housingDraftPlacementSchema).max(200),
  })
  .strict();
export const saveLayoutRequestSchema = layoutDraftRequestSchema
  .extend({
    expectedHomeStateVersion: revision,
    expectedInventoryStateVersion: revision,
    expectedStorageStateVersion: revision,
    restorationSourceRevisionId: z.uuid().nullable().default(null),
    idempotencyKey,
  })
  .strict();
export const storageTransferRequestSchema = z
  .object({
    homeId: z.uuid(),
    storageId: z.uuid(),
    itemDefinitionId: z.uuid(),
    quantity: z.number().int().min(1).max(99_999),
    expectedInventoryStateVersion: revision,
    expectedStorageStateVersion: revision,
    idempotencyKey,
  })
  .strict();
export const purchaseHomeUpgradeRequestSchema = z
  .object({
    homeId: z.uuid(),
    upgradeVersionId: z.uuid(),
    expectedHomeStateVersion: revision,
    expectedDustStateVersion: revision,
    expectedStorageStateVersion: revision,
    idempotencyKey,
  })
  .strict();

export const housingMutationResponseSchema = z
  .object({
    workspace: housingWorkspaceSchema,
    replayed: z.boolean(),
    announcement: z.string().min(2).max(180),
  })
  .strict();

export const decorationSessionResponseSchema = z
  .object({
    sessionId: z.uuid(),
    expiresAt: timestamp,
    workspace: housingWorkspaceSchema,
    replayed: z.boolean(),
  })
  .strict();

export const housingLayoutHistoryPageSchema = z
  .object({
    revisions: z.array(housingLayoutRevisionSummarySchema).max(50),
    nextCursor: revision.nullable(),
  })
  .strict();

export const housingGameTestWorkspaceSchema = housingWorkspaceSchema
  .omit({ gameTest: true })
  .extend({
    gameTest: z.literal(true),
    persistenceNotice: z.literal('Housing uses temporary preview data. Nothing will be saved.'),
  })
  .strict();
export type HousingGameTestWorkspace = z.infer<typeof housingGameTestWorkspaceSchema>;
