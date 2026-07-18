import { z } from 'zod';

import {
  dustLedgerEntrySchema,
  economyPurchaseReceiptSchema,
  economyShopOfferSchema,
  economyShopSchema,
  shopEventPageSchema,
  shopReceiptSchema,
  shopTransactionRequestV2Schema,
  shopTransactionResultSchema,
  shopTutorialMutationSchema,
  shopTutorialSchema,
  shopTutorialTurnInSchema,
  shopWorkspaceSchema,
} from '@starville/economy';

import { PlayerRequestError, requestPlayerApi } from './player-client';

const economyViewSchema = z
  .object({
    dustBalance: z.number().int().nonnegative(),
    dustStateVersion: z.number().int().positive(),
    policyVersion: z.number().int().positive(),
    history: z.array(dustLedgerEntrySchema).max(100),
    nextCursor: z.number().int().positive().nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const economyShopViewSchema = z
  .object({
    shop: economyShopSchema.omit({ offers: true }),
    offers: z.array(economyShopOfferSchema).max(100),
    availability: z.enum(['open', 'closed']).optional(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const economyPurchaseResultSchema = z
  .object({
    status: z.enum(['updated', 'replayed']),
    replayed: z.boolean(),
    transactionId: z.uuid().optional(),
    operation: z.literal('buy').optional(),
    itemSlug: z.string().optional(),
    quantity: z.number().int().positive().optional(),
    dustDelta: z.number().int().negative().optional(),
    dustBalance: z.number().int().nonnegative().optional(),
    dustStateVersion: z.number().int().positive().optional(),
    inventoryStateVersion: z.number().int().positive().optional(),
    receipt: economyPurchaseReceiptSchema.omit({
      shopKey: true,
      dustBalance: true,
      replayed: true,
    }),
  })
  .strict();

export type PlayerEconomyView = z.infer<typeof economyViewSchema>;
export type EconomyShopView = z.infer<typeof economyShopViewSchema>;
export type EconomyPurchaseResult = z.infer<typeof economyPurchaseResultSchema>;
export type GeneralStoreWorkspace = z.infer<typeof shopWorkspaceSchema>;
export type GeneralStoreTransaction = z.infer<typeof shopTransactionResultSchema>;

function parse<Data>(schema: z.ZodType<Data>, value: unknown): Data {
  const result = schema.safeParse(value);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_ECONOMY_RESPONSE');
  return result.data;
}

export async function loadPlayerEconomy(
  apiUrl: string,
  before?: number,
): Promise<PlayerEconomyView> {
  const query = new URLSearchParams({ limit: '20' });
  if (before !== undefined) query.set('before', String(before));
  return parse(
    economyViewSchema,
    await requestPlayerApi(apiUrl, `/economy?${query.toString()}`, { method: 'GET' }),
  );
}

export async function loadEconomyShop(apiUrl: string, shopSlug: string): Promise<EconomyShopView> {
  return parse(
    economyShopViewSchema,
    await requestPlayerApi(apiUrl, `/economy/shops/${encodeURIComponent(shopSlug)}`, {
      method: 'GET',
    }),
  );
}

export async function purchaseEconomyShop(
  apiUrl: string,
  shopSlug: string,
  offer: EconomyShopView['offers'][number],
  shop: EconomyShopView['shop'],
  state: { readonly inventory: number; readonly dust: number },
  quantity = 1,
  idempotencyKey = crypto.randomUUID(),
): Promise<EconomyPurchaseResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > offer.maximumQuantity) {
    throw new PlayerRequestError(400, 'INVALID_ECONOMY_QUANTITY');
  }
  return parse(
    economyPurchaseResultSchema,
    await requestPlayerApi(apiUrl, `/economy/shops/${encodeURIComponent(shopSlug)}/purchase`, {
      method: 'POST',
      body: {
        offerId: offer.offerId,
        quantity,
        expectedUnitPrice: offer.unitPrice,
        expectedShopVersionId: shop.versionId,
        expectedShopRevision: shop.revision,
        expectedDustStateVersion: state.dust,
        expectedInventoryStateVersion: state.inventory,
        idempotencyKey,
      },
    }),
  );
}

export async function loadGeneralStore(
  apiUrl: string,
  interactionId: string,
  before?: string,
): Promise<GeneralStoreWorkspace> {
  const query = new URLSearchParams({ limit: '20' });
  if (before !== undefined) query.set('before', before);
  return parse(
    shopWorkspaceSchema,
    await requestPlayerApi(
      apiUrl,
      `/economy/shops/interactions/${encodeURIComponent(interactionId)}?${query.toString()}`,
      { method: 'GET' },
    ),
  );
}

export async function transactGeneralStore(
  apiUrl: string,
  interactionId: string,
  input: z.infer<typeof shopTransactionRequestV2Schema>,
): Promise<GeneralStoreTransaction> {
  return parse(
    shopTransactionResultSchema,
    await requestPlayerApi(
      apiUrl,
      `/economy/shops/interactions/${encodeURIComponent(interactionId)}/transactions`,
      { method: 'POST', body: shopTransactionRequestV2Schema.parse(input) },
    ),
  );
}

export async function loadGeneralStoreEvents(
  apiUrl: string,
  interactionId: string,
  after: number,
): Promise<z.infer<typeof shopEventPageSchema>> {
  const query = new URLSearchParams({ after: String(after), limit: '20' });
  return parse(
    shopEventPageSchema,
    await requestPlayerApi(
      apiUrl,
      `/economy/shops/interactions/${encodeURIComponent(interactionId)}/events?${query.toString()}`,
      { method: 'GET' },
    ),
  );
}

export async function loadGeneralStoreReceipt(
  apiUrl: string,
  receiptId: string,
): Promise<{
  readonly receipt: z.infer<typeof shopReceiptSchema>;
  readonly tutorial: z.infer<typeof shopTutorialSchema> | null;
}> {
  const schema = z
    .object({ receipt: shopReceiptSchema, tutorial: shopTutorialSchema.nullable() })
    .strict();
  return parse(
    schema,
    await requestPlayerApi(apiUrl, `/economy/shop-receipts/${encodeURIComponent(receiptId)}`, {
      method: 'GET',
    }),
  );
}

export async function acceptGeneralStoreTutorial(
  apiUrl: string,
  interactionId: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<unknown> {
  return requestPlayerApi(
    apiUrl,
    `/economy/shops/interactions/${encodeURIComponent(interactionId)}/tutorial/accept`,
    { method: 'POST', body: shopTutorialMutationSchema.parse({ idempotencyKey }) },
  );
}

export async function turnInGeneralStoreTutorial(
  apiUrl: string,
  interactionId: string,
  expectedQuestStateVersion: number,
  idempotencyKey = crypto.randomUUID(),
): Promise<unknown> {
  return requestPlayerApi(
    apiUrl,
    `/economy/shops/interactions/${encodeURIComponent(interactionId)}/tutorial/turn-in`,
    {
      method: 'POST',
      body: shopTutorialTurnInSchema.parse({ expectedQuestStateVersion, idempotencyKey }),
    },
  );
}
