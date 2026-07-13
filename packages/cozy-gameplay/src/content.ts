import { z } from 'zod';

import { PHASE_7_CONTENT_VERSION } from './common';
import { cropDefinitionSchema } from './farming';
import { furnitureDefinitionSchema, homeTemplateSchema } from './housing';
import { itemDefinitionSchema } from './items';
import { recipeDefinitionSchema } from './recipes';
import { shopDefinitionSchema, shopOfferSchema } from './shops';

export const PHASE_7_STARTER_DUST = 250 as const;
export const PHASE_7_STARTER_INVENTORY_CAPACITY = 24 as const;
export const PHASE_7_STARTER_FARM_PLOT_COUNT = 6 as const;

const ids = {
  seedMoonbean: '71000000-0000-4000-8000-000000000001',
  seedSunroot: '71000000-0000-4000-8000-000000000002',
  seedCloudberry: '71000000-0000-4000-8000-000000000003',
  cropMoonbean: '71000000-0000-4000-8000-000000000004',
  cropSunroot: '71000000-0000-4000-8000-000000000005',
  cropCloudberry: '71000000-0000-4000-8000-000000000006',
  flour: '71000000-0000-4000-8000-000000000007',
  timber: '71000000-0000-4000-8000-000000000008',
  salad: '71000000-0000-4000-8000-000000000009',
  soup: '71000000-0000-4000-8000-000000000010',
  tart: '71000000-0000-4000-8000-000000000011',
  biscuit: '71000000-0000-4000-8000-000000000012',
  twine: '71000000-0000-4000-8000-000000000013',
  planks: '71000000-0000-4000-8000-000000000014',
  chair: '71000000-0000-4000-8000-000000000015',
  table: '71000000-0000-4000-8000-000000000016',
  rug: '71000000-0000-4000-8000-000000000017',
  lamp: '71000000-0000-4000-8000-000000000018',
  shelf: '71000000-0000-4000-8000-000000000019',
  planter: '71000000-0000-4000-8000-000000000020',
  wateringCan: '71000000-0000-4000-8000-000000000021',
  cropDefMoonbean: '72000000-0000-4000-8000-000000000001',
  cropDefSunroot: '72000000-0000-4000-8000-000000000002',
  cropDefCloudberry: '72000000-0000-4000-8000-000000000003',
  recipeSalad: '73000000-0000-4000-8000-000000000001',
  recipeSoup: '73000000-0000-4000-8000-000000000002',
  recipeTart: '73000000-0000-4000-8000-000000000003',
  recipeBiscuit: '73000000-0000-4000-8000-000000000004',
  recipeTwine: '73000000-0000-4000-8000-000000000005',
  recipeChair: '73000000-0000-4000-8000-000000000006',
  shop: '74000000-0000-4000-8000-000000000001',
  furnitureChair: '75000000-0000-4000-8000-000000000001',
  furnitureTable: '75000000-0000-4000-8000-000000000002',
  furnitureRug: '75000000-0000-4000-8000-000000000003',
  furnitureLamp: '75000000-0000-4000-8000-000000000004',
  furnitureShelf: '75000000-0000-4000-8000-000000000005',
  furniturePlanter: '75000000-0000-4000-8000-000000000006',
  home: '76000000-0000-4000-8000-000000000001',
} as const;

type ItemInput = z.input<typeof itemDefinitionSchema>;
const developmentAsset = (slug: string) => ({
  assetRef: `phase7-dev-${slug}`,
  assetReadiness: 'development_marker' as const,
});
const itemBase = (
  id: string,
  slug: string,
  name: string,
  description: string,
): Pick<ItemInput, 'id' | 'slug' | 'name' | 'description' | 'active' | 'contentVersion'> => ({
  id,
  slug,
  name,
  description,
  active: true,
  contentVersion: PHASE_7_CONTENT_VERSION,
});
const stackItem = (
  input: Pick<ItemInput, 'id' | 'slug' | 'name' | 'description' | 'category' | 'metadata'> & {
    readonly maxStackSize: number;
    readonly buyPrice?: number;
    readonly sellPrice?: number;
  },
): ItemInput => ({
  ...itemBase(input.id, input.slug, input.name, input.description),
  category: input.category,
  metadata: input.metadata,
  stackable: true,
  maxStackSize: input.maxStackSize,
  buyEligible: input.buyPrice !== undefined,
  sellEligible: input.sellPrice !== undefined,
  defaultBuyPrice: input.buyPrice ?? null,
  defaultSellPrice: input.sellPrice ?? null,
  ...developmentAsset(input.slug),
});
const furnitureItem = (id: string, slug: string, name: string, buyPrice: number): ItemInput => ({
  ...itemBase(id, slug, name, `${name} for a private starter home.`),
  category: 'furniture',
  metadata: { kind: 'furniture', furnitureSlug: slug },
  stackable: false,
  maxStackSize: 1,
  buyEligible: true,
  sellEligible: false,
  defaultBuyPrice: buyPrice,
  defaultSellPrice: null,
  ...developmentAsset(slug),
});

export const PHASE_7_ITEM_DEFINITIONS = Object.freeze(
  z.array(itemDefinitionSchema).parse([
    stackItem({
      id: ids.seedMoonbean,
      slug: 'moonbean-seed',
      name: 'Moonbean Seed',
      description: 'A gentle meadow seed for Moonbeans.',
      category: 'seed',
      metadata: { kind: 'seed', cropSlug: 'moonbean' },
      maxStackSize: 99,
      buyPrice: 8,
    }),
    stackItem({
      id: ids.seedSunroot,
      slug: 'sunroot-seed',
      name: 'Sunroot Seed',
      description: 'A warm seed that grows into a golden Sunroot.',
      category: 'seed',
      metadata: { kind: 'seed', cropSlug: 'sunroot' },
      maxStackSize: 99,
      buyPrice: 10,
    }),
    stackItem({
      id: ids.seedCloudberry,
      slug: 'cloudberry-seed',
      name: 'Cloudberry Seed',
      description: 'A pale berry seed suited to Moonpetal Meadow.',
      category: 'seed',
      metadata: { kind: 'seed', cropSlug: 'cloudberry' },
      maxStackSize: 99,
      buyPrice: 12,
    }),
    stackItem({
      id: ids.cropMoonbean,
      slug: 'moonbean',
      name: 'Moonbean',
      description: 'A crisp bean gathered under soft evening light.',
      category: 'crop',
      metadata: { kind: 'crop', cropSlug: 'moonbean' },
      maxStackSize: 99,
      sellPrice: 7,
    }),
    stackItem({
      id: ids.cropSunroot,
      slug: 'sunroot',
      name: 'Sunroot',
      description: 'A mellow root with a naturally golden center.',
      category: 'crop',
      metadata: { kind: 'crop', cropSlug: 'sunroot' },
      maxStackSize: 99,
      sellPrice: 9,
    }),
    stackItem({
      id: ids.cropCloudberry,
      slug: 'cloudberry',
      name: 'Cloudberry',
      description: 'A softly sweet berry with a misty bloom.',
      category: 'crop',
      metadata: { kind: 'crop', cropSlug: 'cloudberry' },
      maxStackSize: 99,
      sellPrice: 11,
    }),
    stackItem({
      id: ids.flour,
      slug: 'meadow-flour',
      name: 'Meadow Flour',
      description: 'Stone-milled flour supplied by the village shop.',
      category: 'ingredient',
      metadata: { kind: 'ingredient' },
      maxStackSize: 99,
      buyPrice: 6,
      sellPrice: 2,
    }),
    stackItem({
      id: ids.timber,
      slug: 'willow-timber',
      name: 'Willow Timber',
      description: 'Smooth local timber for simple home projects.',
      category: 'ingredient',
      metadata: { kind: 'ingredient' },
      maxStackSize: 99,
      buyPrice: 9,
      sellPrice: 4,
    }),
    stackItem({
      id: ids.salad,
      slug: 'moonbean-salad',
      name: 'Moonbean Salad',
      description: 'A fresh bowl of Moonbeans and Cloudberries.',
      category: 'cooked_food',
      metadata: { kind: 'cooked_food' },
      maxStackSize: 20,
      sellPrice: 22,
    }),
    stackItem({
      id: ids.soup,
      slug: 'sunroot-soup',
      name: 'Sunroot Soup',
      description: 'A cozy bowl of smooth Sunroot soup.',
      category: 'cooked_food',
      metadata: { kind: 'cooked_food' },
      maxStackSize: 20,
      sellPrice: 24,
    }),
    stackItem({
      id: ids.tart,
      slug: 'cloudberry-tart',
      name: 'Cloudberry Tart',
      description: 'A small tart filled with bright Cloudberries.',
      category: 'cooked_food',
      metadata: { kind: 'cooked_food' },
      maxStackSize: 20,
      sellPrice: 28,
    }),
    stackItem({
      id: ids.biscuit,
      slug: 'meadow-biscuit',
      name: 'Meadow Biscuit',
      description: 'A tender biscuit dotted with Moonbeans.',
      category: 'cooked_food',
      metadata: { kind: 'cooked_food' },
      maxStackSize: 20,
      sellPrice: 20,
    }),
    stackItem({
      id: ids.twine,
      slug: 'garden-twine',
      name: 'Garden Twine',
      description: 'Strong plant fiber prepared for crafting.',
      category: 'crafted_material',
      metadata: { kind: 'crafted_material' },
      maxStackSize: 99,
      sellPrice: 8,
    }),
    stackItem({
      id: ids.planks,
      slug: 'willow-planks',
      name: 'Willow Planks',
      description: 'Evenly cut planks for future home projects.',
      category: 'crafted_material',
      metadata: { kind: 'crafted_material' },
      maxStackSize: 99,
      sellPrice: 12,
    }),
    furnitureItem(ids.chair, 'willow-chair', 'Willow Chair', 48),
    furnitureItem(ids.table, 'hearth-table', 'Hearth Table', 70),
    furnitureItem(ids.rug, 'moonwoven-rug', 'Moonwoven Rug', 55),
    furnitureItem(ids.lamp, 'lantern-floor-lamp', 'Lantern Floor Lamp', 60),
    furnitureItem(ids.shelf, 'meadow-shelf', 'Meadow Shelf', 65),
    furnitureItem(ids.planter, 'round-leaf-planter', 'Round-leaf Planter', 38),
    {
      ...itemBase(
        ids.wateringCan,
        'starter-watering-can',
        'Starter Watering Can',
        'A permanent village tool that starts crop growth.',
      ),
      category: 'permanent_tool',
      metadata: { kind: 'permanent_tool', toolType: 'watering_can' },
      stackable: false,
      maxStackSize: 1,
      buyEligible: false,
      sellEligible: false,
      defaultBuyPrice: null,
      defaultSellPrice: null,
      ...developmentAsset('starter-watering-can'),
    },
  ]),
);

export const PHASE_7_CROP_DEFINITIONS = Object.freeze(
  z.array(cropDefinitionSchema).parse([
    {
      id: ids.cropDefMoonbean,
      slug: 'moonbean',
      name: 'Moonbean',
      description: 'A quick-growing starter bean.',
      seedItemSlug: 'moonbean-seed',
      harvestItemSlug: 'moonbean',
      growthDurationSeconds: 300,
      growthStageCount: 4,
      deterministicYield: 3,
      ...developmentAsset('moonbean-crop'),
      active: true,
      contentVersion: 1,
    },
    {
      id: ids.cropDefSunroot,
      slug: 'sunroot',
      name: 'Sunroot',
      description: 'A sturdy golden starter root.',
      seedItemSlug: 'sunroot-seed',
      harvestItemSlug: 'sunroot',
      growthDurationSeconds: 420,
      growthStageCount: 4,
      deterministicYield: 3,
      ...developmentAsset('sunroot-crop'),
      active: true,
      contentVersion: 1,
    },
    {
      id: ids.cropDefCloudberry,
      slug: 'cloudberry',
      name: 'Cloudberry',
      description: 'A patient meadow berry crop.',
      seedItemSlug: 'cloudberry-seed',
      harvestItemSlug: 'cloudberry',
      growthDurationSeconds: 600,
      growthStageCount: 5,
      deterministicYield: 4,
      ...developmentAsset('cloudberry-crop'),
      active: true,
      contentVersion: 1,
    },
  ]),
);

const recipeBase = (id: string, slug: string, name: string, description: string) => ({
  id,
  slug,
  name,
  description,
  dustFee: 0,
  active: true,
  contentVersion: PHASE_7_CONTENT_VERSION,
});
export const PHASE_7_RECIPE_DEFINITIONS = Object.freeze(
  z.array(recipeDefinitionSchema).parse([
    {
      ...recipeBase(
        ids.recipeSalad,
        'moonbean-salad',
        'Moonbean Salad',
        'A crisp farm-to-table salad.',
      ),
      kind: 'cooking',
      stationType: 'cooking_hearth',
      ingredients: [
        { itemSlug: 'moonbean', quantity: 2 },
        { itemSlug: 'cloudberry', quantity: 1 },
      ],
      outputItemSlug: 'moonbean-salad',
      outputQuantity: 1,
    },
    {
      ...recipeBase(
        ids.recipeSoup,
        'sunroot-soup',
        'Sunroot Soup',
        'A warm and simple village soup.',
      ),
      kind: 'cooking',
      stationType: 'cooking_hearth',
      ingredients: [
        { itemSlug: 'sunroot', quantity: 2 },
        { itemSlug: 'meadow-flour', quantity: 1 },
      ],
      outputItemSlug: 'sunroot-soup',
      outputQuantity: 1,
    },
    {
      ...recipeBase(
        ids.recipeTart,
        'cloudberry-tart',
        'Cloudberry Tart',
        'A bright tart for a quiet evening.',
      ),
      kind: 'cooking',
      stationType: 'cooking_hearth',
      ingredients: [
        { itemSlug: 'cloudberry', quantity: 2 },
        { itemSlug: 'meadow-flour', quantity: 1 },
      ],
      outputItemSlug: 'cloudberry-tart',
      outputQuantity: 1,
    },
    {
      ...recipeBase(
        ids.recipeBiscuit,
        'meadow-biscuit',
        'Meadow Biscuit',
        'A soft biscuit made from simple harvests.',
      ),
      kind: 'cooking',
      stationType: 'cooking_hearth',
      ingredients: [
        { itemSlug: 'moonbean', quantity: 1 },
        { itemSlug: 'meadow-flour', quantity: 1 },
      ],
      outputItemSlug: 'meadow-biscuit',
      outputQuantity: 2,
    },
    {
      ...recipeBase(
        ids.recipeTwine,
        'garden-twine',
        'Garden Twine',
        'Twist Moonbean fibers into useful twine.',
      ),
      kind: 'crafting',
      stationType: 'crafting_workbench',
      ingredients: [{ itemSlug: 'moonbean', quantity: 2 }],
      outputItemSlug: 'garden-twine',
      outputQuantity: 1,
    },
    {
      ...recipeBase(
        ids.recipeChair,
        'willow-chair',
        'Willow Chair',
        'Build a simple chair for the starter home.',
      ),
      kind: 'crafting',
      stationType: 'crafting_workbench',
      ingredients: [
        { itemSlug: 'willow-timber', quantity: 2 },
        { itemSlug: 'garden-twine', quantity: 1 },
      ],
      outputItemSlug: 'willow-chair',
      outputQuantity: 1,
    },
  ]),
);

export const PHASE_7_SHOP_DEFINITIONS = Object.freeze(
  z.array(shopDefinitionSchema).parse([
    {
      id: ids.shop,
      slug: 'lantern-general-store',
      name: 'Lantern General Store',
      description: 'Seeds, pantry goods, materials, and starter furnishings.',
      active: true,
      contentVersion: 1,
    },
  ]),
);
const offer = (
  suffix: string,
  itemSlug: string,
  buyPrice: number | null,
  sellPrice: number | null,
) => ({
  id: `74000000-0000-4000-8000-0000000000${suffix}`,
  shopSlug: 'lantern-general-store',
  itemSlug,
  buyPrice,
  sellPrice,
  minimumQuantity: 1,
  maximumQuantity: 20,
  active: true,
  availableFrom: null,
  availableUntil: null,
  contentVersion: PHASE_7_CONTENT_VERSION,
});
export const PHASE_7_SHOP_OFFERS = Object.freeze(
  z
    .array(shopOfferSchema)
    .parse([
      offer('11', 'moonbean-seed', 8, null),
      offer('12', 'sunroot-seed', 10, null),
      offer('13', 'cloudberry-seed', 12, null),
      offer('14', 'meadow-flour', 6, 2),
      offer('15', 'willow-timber', 9, 4),
      offer('16', 'moonbean', null, 7),
      offer('17', 'sunroot', null, 9),
      offer('18', 'cloudberry', null, 11),
      offer('19', 'willow-chair', 48, null),
      offer('20', 'hearth-table', 70, null),
      offer('21', 'moonwoven-rug', 55, null),
      offer('22', 'lantern-floor-lamp', 60, null),
      offer('23', 'meadow-shelf', 65, null),
      offer('24', 'round-leaf-planter', 38, null),
    ]),
);

const rotations = [0, 90, 180, 270] as const;
const furniture = (
  id: string,
  slug: string,
  name: string,
  width: number,
  height: number,
  blocksMovement: boolean,
) => ({
  id,
  slug,
  itemSlug: slug,
  name,
  footprintWidth: width,
  footprintHeight: height,
  supportedRotations: rotations,
  blocksMovement,
  ...developmentAsset(slug),
  active: true,
  contentVersion: PHASE_7_CONTENT_VERSION,
});
export const PHASE_7_FURNITURE_DEFINITIONS = Object.freeze(
  z
    .array(furnitureDefinitionSchema)
    .parse([
      furniture(ids.furnitureChair, 'willow-chair', 'Willow Chair', 1, 1, true),
      furniture(ids.furnitureTable, 'hearth-table', 'Hearth Table', 2, 2, true),
      furniture(ids.furnitureRug, 'moonwoven-rug', 'Moonwoven Rug', 2, 3, false),
      furniture(ids.furnitureLamp, 'lantern-floor-lamp', 'Lantern Floor Lamp', 1, 1, true),
      furniture(ids.furnitureShelf, 'meadow-shelf', 'Meadow Shelf', 2, 1, true),
      furniture(ids.furniturePlanter, 'round-leaf-planter', 'Round-leaf Planter', 1, 1, true),
    ]),
);

export const PHASE_7_STARTER_HOME_TEMPLATE = Object.freeze(
  homeTemplateSchema.parse({
    id: ids.home,
    slug: 'starter-cottage-interior',
    name: 'Starter Cottage',
    templateVersion: PHASE_7_CONTENT_VERSION,
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
    spawn: { x: 5, y: 6 },
    exit: { x: 5, y: 7 },
    blockedCells: [
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 0, y: 7 },
      { x: 9, y: 7 },
    ],
    developmentArt: true,
    active: true,
  }),
);

export const phase7CanonicalContentSchema = z
  .object({
    contentVersion: z.literal(PHASE_7_CONTENT_VERSION),
    items: z.array(itemDefinitionSchema).min(1),
    crops: z.array(cropDefinitionSchema).min(3),
    recipes: z.array(recipeDefinitionSchema).min(6),
    shops: z.array(shopDefinitionSchema).min(1),
    offers: z.array(shopOfferSchema).min(1),
    furniture: z.array(furnitureDefinitionSchema).min(6),
    homeTemplate: homeTemplateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const itemSlugs = new Set(value.items.map((item) => item.slug));
    const cropSlugs = new Set(value.crops.map((crop) => crop.slug));
    const cookingCount = value.recipes.filter((recipe) => recipe.kind === 'cooking').length;
    const craftingCount = value.recipes.filter((recipe) => recipe.kind === 'crafting').length;
    if (cookingCount < 4 || craftingCount < 2) {
      context.addIssue({
        code: 'custom',
        path: ['recipes'],
        message: 'Canonical content requires four cooking and two crafting recipes',
      });
    }
    for (const crop of value.crops) {
      if (!itemSlugs.has(crop.seedItemSlug) || !itemSlugs.has(crop.harvestItemSlug)) {
        context.addIssue({
          code: 'custom',
          path: ['crops'],
          message: `Crop ${crop.slug} has missing item references`,
        });
      }
    }
    for (const recipe of value.recipes) {
      if (
        !itemSlugs.has(recipe.outputItemSlug) ||
        recipe.ingredients.some((ingredient) => !itemSlugs.has(ingredient.itemSlug))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['recipes'],
          message: `Recipe ${recipe.slug} has missing item references`,
        });
      }
    }
    for (const item of value.items.filter((entry) => entry.category === 'seed')) {
      if (item.metadata.kind !== 'seed' || !cropSlugs.has(item.metadata.cropSlug)) {
        context.addIssue({
          code: 'custom',
          path: ['items'],
          message: `Seed ${item.slug} has no crop`,
        });
      }
    }
  });

export const PHASE_7_CANONICAL_CONTENT = Object.freeze(
  phase7CanonicalContentSchema.parse({
    contentVersion: PHASE_7_CONTENT_VERSION,
    items: PHASE_7_ITEM_DEFINITIONS,
    crops: PHASE_7_CROP_DEFINITIONS,
    recipes: PHASE_7_RECIPE_DEFINITIONS,
    shops: PHASE_7_SHOP_DEFINITIONS,
    offers: PHASE_7_SHOP_OFFERS,
    furniture: PHASE_7_FURNITURE_DEFINITIONS,
    homeTemplate: PHASE_7_STARTER_HOME_TEMPLATE,
  }),
);

export type Phase7CanonicalContent = z.infer<typeof phase7CanonicalContentSchema>;
