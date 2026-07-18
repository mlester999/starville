import {
  cosmeticEmoteWheelSchema,
  cosmeticWardrobeSchema,
  mutateCosmeticLoadoutSchema,
  renameCosmeticLoadoutSchema,
  saveCosmeticLoadoutSchema,
  type CosmeticWardrobe,
} from '@starville/cosmetics';
import { avatarStableKeySchema, type AvatarSelection } from '@starville/avatar';
import { z } from 'zod';

const PREFIX = '/api/v1/token-access/player/cosmetics';

const envelopeSchema = z
  .object({ success: z.literal(true), data: z.unknown(), requestId: z.string() })
  .strict();

export class CosmeticRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super('The wardrobe request could not be completed.');
    this.name = 'CosmeticRequestError';
  }
}

async function request(
  apiUrl: string,
  path: string,
  options: {
    readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    readonly body?: unknown;
  },
): Promise<unknown> {
  const response = await fetch(new URL(`${PREFIX}${path}`, apiUrl), {
    method: options.method,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const value = (await response.json().catch(() => undefined)) as
    { readonly error?: { readonly code?: string } } | undefined;
  if (!response.ok) throw new CosmeticRequestError(response.status, value?.error?.code ?? 'ERROR');
  return envelopeSchema.parse(value).data;
}

export async function loadCosmeticWardrobe(apiUrl: string): Promise<CosmeticWardrobe> {
  return cosmeticWardrobeSchema.parse(await request(apiUrl, '', { method: 'GET' }));
}

export async function saveCosmeticLoadout(
  apiUrl: string,
  input: {
    readonly slot: number;
    readonly name: string;
    readonly selection: AvatarSelection;
    readonly expectedRevision: number;
    readonly requestId?: string;
  },
): Promise<void> {
  const body = saveCosmeticLoadoutSchema.parse({
    ...input,
    requestId: input.requestId ?? crypto.randomUUID(),
  });
  await request(apiUrl, '/loadouts', { method: 'POST', body });
}

export async function renameCosmeticLoadout(
  apiUrl: string,
  loadoutId: string,
  name: string,
  expectedRevision: number,
): Promise<void> {
  const body = renameCosmeticLoadoutSchema.parse({
    name,
    expectedRevision,
    requestId: crypto.randomUUID(),
  });
  await request(apiUrl, `/loadouts/${encodeURIComponent(z.uuid().parse(loadoutId))}/name`, {
    method: 'PATCH',
    body,
  });
}

export async function deleteCosmeticLoadout(
  apiUrl: string,
  loadoutId: string,
  expectedRevision: number,
): Promise<void> {
  const body = mutateCosmeticLoadoutSchema.parse({
    expectedRevision,
    requestId: crypto.randomUUID(),
  });
  await request(apiUrl, `/loadouts/${encodeURIComponent(z.uuid().parse(loadoutId))}`, {
    method: 'DELETE',
    body,
  });
}

export async function applyCosmeticLoadout(
  apiUrl: string,
  loadoutId: string,
  expectedLoadoutRevision: number,
  expectedAvatarRevision: number,
): Promise<void> {
  await request(apiUrl, `/loadouts/${encodeURIComponent(z.uuid().parse(loadoutId))}/apply`, {
    method: 'POST',
    body: {
      expectedLoadoutRevision,
      expectedAvatarRevision,
      requestId: crypto.randomUUID(),
    },
  });
}

export async function updateCosmeticEmoteWheel(
  apiUrl: string,
  emoteKeys: readonly string[],
  expectedRevision: number,
): Promise<void> {
  const body = cosmeticEmoteWheelSchema.parse({
    emoteKeys,
    expectedRevision,
    requestId: crypto.randomUUID(),
  });
  await request(apiUrl, '/emote-wheel', { method: 'PUT', body });
}

export async function claimCosmeticCollection(
  apiUrl: string,
  collectionKey: string,
): Promise<void> {
  const key = avatarStableKeySchema.parse(collectionKey);
  await request(apiUrl, `/collections/${encodeURIComponent(key)}/claim`, {
    method: 'POST',
    body: { requestId: crypto.randomUUID() },
  });
}
