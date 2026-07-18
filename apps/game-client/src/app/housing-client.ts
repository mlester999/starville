import { z } from 'zod';
import {
  decorationSessionResponseSchema,
  housingGameTestWorkspaceSchema,
  housingLayoutHistoryPageSchema,
  housingLayoutRevisionInspectionSchema,
  housingLayoutValidationSchema,
  housingMutationResponseSchema,
  housingWorkspaceSchema,
  layoutDraftRequestSchema,
  openDecorationSessionRequestSchema,
  purchaseHomeUpgradeRequestSchema,
  saveLayoutRequestSchema,
  storageTransferRequestSchema,
  type HousingGameTestWorkspace,
  type HousingWorkspace,
} from '@starville/housing';
import { PlayerRequestError, requestPlayerApi } from './player-client';

function parse<Data>(schema: z.ZodType<Data>, value: unknown): Data {
  const result = schema.safeParse(value);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_HOUSING_RESPONSE');
  return result.data;
}
export function housingIdempotencyKey(operation: string): string {
  return `housing-${operation}-${crypto.randomUUID()}`;
}
export async function loadHousing(apiUrl: string): Promise<HousingWorkspace> {
  return parse(
    housingWorkspaceSchema,
    await requestPlayerApi(apiUrl, '/housing', { method: 'GET' }),
  );
}
export async function loadHousingGameTest(apiUrl: string): Promise<HousingGameTestWorkspace> {
  return parse(
    housingGameTestWorkspaceSchema,
    await requestPlayerApi(apiUrl, '/housing/game-test', { method: 'GET' }),
  );
}
export async function openDecorationSession(apiUrl: string, workspace: HousingWorkspace) {
  const input = openDecorationSessionRequestSchema.parse({
    homeId: workspace.home.id,
    expectedLayoutRevision: workspace.layout.activeRevision.revisionNumber,
    idempotencyKey: housingIdempotencyKey('decoration'),
  });
  return parse(
    decorationSessionResponseSchema.extend({ status: z.enum(['opened', 'replayed']) }),
    await requestPlayerApi(apiUrl, '/housing/decoration-sessions', { method: 'POST', body: input }),
  );
}
export async function validateHousingLayout(
  apiUrl: string,
  workspace: HousingWorkspace,
  placements: z.infer<typeof saveLayoutRequestSchema>['placements'],
) {
  const input = layoutDraftRequestSchema.parse({
    homeId: workspace.home.id,
    expectedLayoutRevision: workspace.layout.activeRevision.revisionNumber,
    expectedLayoutHeadStateVersion: workspace.layout.headStateVersion,
    placements,
  });
  const value = parse(
    z
      .object({ status: z.literal('validated'), validation: housingLayoutValidationSchema })
      .strict(),
    await requestPlayerApi(apiUrl, '/housing/layouts/validate', { method: 'POST', body: input }),
  );
  return value.validation;
}
export async function saveHousingLayout(
  apiUrl: string,
  workspace: HousingWorkspace,
  placements: z.infer<typeof saveLayoutRequestSchema>['placements'],
  restorationSourceRevisionId: string | null = null,
) {
  const input = saveLayoutRequestSchema.parse({
    homeId: workspace.home.id,
    expectedLayoutRevision: workspace.layout.activeRevision.revisionNumber,
    expectedLayoutHeadStateVersion: workspace.layout.headStateVersion,
    expectedHomeStateVersion: workspace.home.stateVersion,
    expectedInventoryStateVersion: workspace.inventoryStateVersion,
    expectedStorageStateVersion: workspace.storage.stateVersion,
    placements,
    restorationSourceRevisionId,
    idempotencyKey: housingIdempotencyKey('layout'),
  });
  return parse(
    housingMutationResponseSchema.extend({ status: z.enum(['saved', 'updated', 'replayed']) }),
    await requestPlayerApi(apiUrl, '/housing/layouts', { method: 'POST', body: input }),
  );
}
export async function openHomeStorage(
  apiUrl: string,
  workspace: HousingWorkspace,
): Promise<HousingWorkspace> {
  return parse(
    housingWorkspaceSchema,
    await requestPlayerApi(apiUrl, '/housing/storage/open', {
      method: 'POST',
      body: {
        homeId: workspace.home.id,
        expectedStorageStateVersion: workspace.storage.stateVersion,
      },
    }),
  );
}
export async function transferHomeStorage(
  apiUrl: string,
  workspace: HousingWorkspace,
  operation: 'deposit' | 'withdrawal',
  itemDefinitionId: string,
  quantity = 1,
) {
  const input = storageTransferRequestSchema.parse({
    homeId: workspace.home.id,
    storageId: workspace.storage.id,
    itemDefinitionId,
    quantity,
    expectedInventoryStateVersion: workspace.inventoryStateVersion,
    expectedStorageStateVersion: workspace.storage.stateVersion,
    idempotencyKey: housingIdempotencyKey(`storage-${operation}`),
  });
  return parse(
    housingMutationResponseSchema.extend({ status: z.enum(['updated', 'replayed']) }),
    await requestPlayerApi(apiUrl, `/housing/storage/${operation}`, {
      method: 'POST',
      body: input,
    }),
  );
}
export async function purchaseHomeUpgrade(
  apiUrl: string,
  workspace: HousingWorkspace,
  upgradeVersionId: string,
) {
  const input = purchaseHomeUpgradeRequestSchema.parse({
    homeId: workspace.home.id,
    upgradeVersionId,
    expectedHomeStateVersion: workspace.home.stateVersion,
    expectedDustStateVersion: workspace.dust.stateVersion,
    expectedStorageStateVersion: workspace.storage.stateVersion,
    idempotencyKey: housingIdempotencyKey('upgrade'),
  });
  return parse(
    housingMutationResponseSchema.extend({ status: z.enum(['updated', 'replayed']) }),
    await requestPlayerApi(apiUrl, '/housing/upgrades/purchase', { method: 'POST', body: input }),
  );
}
export async function loadHousingHistory(apiUrl: string, homeId: string, before?: number) {
  const query = new URLSearchParams({ limit: '20' });
  if (before !== undefined) query.set('before', String(before));
  return parse(
    housingLayoutHistoryPageSchema,
    await requestPlayerApi(apiUrl, `/housing/homes/${homeId}/layouts?${query.toString()}`, {
      method: 'GET',
    }),
  );
}
export async function inspectHousingRevision(apiUrl: string, homeId: string, revisionId: string) {
  return parse(
    housingLayoutRevisionInspectionSchema,
    await requestPlayerApi(apiUrl, `/housing/homes/${homeId}/layouts/${revisionId}`, {
      method: 'GET',
    }),
  );
}
