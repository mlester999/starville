import { z } from 'zod';
import { worldAssetDeliveriesSchema } from '@starville/asset-management';
import { mapManifestSchema, playerStateUpdateSchema, type MapManifest } from '@starville/game-core';

import { isRecord } from './player-client';
import { validatedManifest } from './world-client';

const timestampSchema = z.iso.datetime({ offset: true });
const resultSchema = z.enum(['passed', 'failed', 'blocked', 'needs_changes']);
const projectionSchema = z
  .object({
    session: z
      .object({
        id: z.uuid(),
        worldMapId: z.uuid(),
        worldMapVersionId: z.uuid(),
        environment: z.enum(['development', 'test', 'production']),
        status: z.literal('active'),
        returnPath: z.string().startsWith('/').max(500),
        createdAt: timestampSchema,
        expiresAt: timestampSchema,
        gameClientBuild: z.string().min(1).max(120),
      })
      .strict(),
    map: z
      .object({
        id: z.uuid(),
        slug: z.string(),
        displayName: z.string().min(1).max(80),
        description: z.string().min(1).max(280),
        defaultSpawnId: z.string().min(1).max(64),
      })
      .strict(),
    version: z
      .object({
        id: z.uuid(),
        versionNumber: z.number().int().positive(),
        editVersion: z.number().int().positive(),
        checksum: z.string().regex(/^[0-9a-f]{64}$/u),
        lifecycleStatus: z.enum(['validated', 'published', 'superseded']),
      })
      .strict(),
    manifest: mapManifestSchema,
    assetDeliveries: worldAssetDeliveriesSchema,
    playerState: playerStateUpdateSchema,
    previewIdentity: z
      .object({
        displayName: z.literal('Game Test Administrator'),
        appearancePreset: z.literal('moss'),
      })
      .strict(),
    realtime: z
      .object({
        mode: z.literal('disabled_private_solo'),
        publicChannelJoined: z.literal(false),
      })
      .strict(),
    latestEvidence: z
      .object({
        id: z.uuid(),
        result: resultSchema,
        gameClientBuild: z.string().min(1).max(120),
        recordedAt: timestampSchema,
      })
      .strict()
      .nullable(),
    newerDraftAvailable: z.boolean(),
    restrictions: z.tuple([
      z.literal('no_player_persistence'),
      z.literal('no_rewards'),
      z.literal('no_economy'),
      z.literal('no_inventory'),
      z.literal('no_social'),
      z.literal('no_chat'),
      z.literal('no_public_realtime'),
      z.literal('no_world_transitions'),
    ]),
  })
  .strict();

export type WorldGameTestProjection = Omit<z.infer<typeof projectionSchema>, 'manifest'> & {
  readonly manifest: MapManifest;
};

export class GameTestRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super('The secure World Game Test request did not complete.');
    this.name = 'GameTestRequestError';
  }
}

export function gameTestAdminReturnUrl(
  adminUrl: string,
  returnPath: string,
  gameTestSessionId: string,
): string {
  const base = new URL(adminUrl);
  const target = new URL(returnPath, base);
  if (target.origin !== base.origin) return base.toString();
  target.searchParams.set('gameTest', 'returned');
  target.searchParams.set('gameTestSessionId', gameTestSessionId);
  return target.toString();
}

function errorCode(value: unknown): string {
  if (!isRecord(value) || !isRecord(value['error']) || typeof value['error']['code'] !== 'string') {
    return 'WORLD_GAME_TEST_REQUEST_FAILED';
  }
  return value['error']['code'];
}

async function request(
  apiUrl: string,
  pathname: string,
  options: {
    readonly method: 'GET' | 'POST';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(`/api/v1/game-test${pathname}`, apiUrl), {
      method: options.method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    throw new GameTestRequestError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GameTestRequestError(response.status, 'INVALID_WORLD_GAME_TEST_RESPONSE');
  }
  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    throw new GameTestRequestError(
      response.status,
      errorCode(payload),
      isRecord(payload) && typeof payload['requestId'] === 'string'
        ? payload['requestId']
        : undefined,
    );
  }
  return payload['data'];
}

function parseProjection(value: unknown): WorldGameTestProjection {
  const parsed = projectionSchema.safeParse(value);
  if (!parsed.success) throw new GameTestRequestError(502, 'INVALID_WORLD_GAME_TEST_RESPONSE');
  const manifest = validatedManifest(parsed.data.manifest, parsed.data.assetDeliveries);
  if (
    manifest.id !== parsed.data.playerState.mapId ||
    manifest.slug !== parsed.data.map.slug ||
    parsed.data.map.id !== parsed.data.session.worldMapId ||
    parsed.data.version.id !== parsed.data.session.worldMapVersionId ||
    parsed.data.version.versionNumber !== manifest.version
  ) {
    throw new GameTestRequestError(502, 'INVALID_WORLD_GAME_TEST_RESPONSE');
  }
  return { ...parsed.data, manifest };
}

export function consumeGameTestGrant(location: Location, history: History): string | undefined {
  const parameters = new URLSearchParams(
    location.hash.startsWith('#') ? location.hash.slice(1) : '',
  );
  const grant = parameters.get('grant') ?? undefined;
  const safeQuery = new URLSearchParams(location.search);
  safeQuery.delete('grant');
  const serializedQuery = safeQuery.toString();
  history.replaceState(
    null,
    '',
    `${location.pathname}${serializedQuery.length === 0 ? '' : `?${serializedQuery}`}`,
  );
  return grant;
}

export async function exchangeWorldGameTestGrant(
  apiUrl: string,
  grantToken: string,
  gameClientBuild: string,
  signal?: AbortSignal,
): Promise<WorldGameTestProjection> {
  return parseProjection(
    await request(apiUrl, '/exchange', {
      method: 'POST',
      body: { grantToken, gameClientBuild },
      ...(signal === undefined ? {} : { signal }),
    }),
  );
}

export async function loadWorldGameTestSession(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<WorldGameTestProjection> {
  return parseProjection(
    await request(apiUrl, '/session', {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    }),
  );
}

export async function exitWorldGameTest(apiUrl: string): Promise<void> {
  await request(apiUrl, '/exit', { method: 'POST', body: {} });
}

let bootstrapPromise: Promise<WorldGameTestProjection> | undefined;

/** StrictMode-safe and in-memory only: a document exchanges its one-time grant at most once. */
export function bootstrapWorldGameTest(
  apiUrl: string,
  gameClientBuild: string,
  location: Location,
  history: History,
): Promise<WorldGameTestProjection> {
  bootstrapPromise ??= (() => {
    const grant = consumeGameTestGrant(location, history);
    return grant === undefined
      ? loadWorldGameTestSession(apiUrl)
      : exchangeWorldGameTestGrant(apiUrl, grant, gameClientBuild);
  })();
  return bootstrapPromise;
}
