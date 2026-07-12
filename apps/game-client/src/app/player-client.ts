import {
  playerProfileSchema,
  persistedPlayerStateSchema,
  type PersistedPlayerState,
  type PlayerProfile,
  type PlayerProfileCreate,
  type PlayerProfileUpdate,
  type PlayerStateUpdate,
} from '@starville/game-core';
import { playerEntryStateSchema, type PlayerEntryState } from '@starville/player-operations';

const PLAYER_API_PREFIX = '/api/v1/token-access/player';

export class PlayerRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super('The Starville player request could not be completed.');
    this.name = 'PlayerRequestError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(value: unknown): string {
  if (!isRecord(value) || !isRecord(value['error']) || typeof value['error']['code'] !== 'string') {
    return 'PLAYER_REQUEST_FAILED';
  }
  return value['error']['code'];
}

export async function requestPlayerApi(
  apiUrl: string,
  pathname: string,
  options: {
    readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
    readonly keepalive?: boolean;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(`${PLAYER_API_PREFIX}${pathname}`, apiUrl), {
      method: options.method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.keepalive === undefined ? {} : { keepalive: options.keepalive }),
    });
  } catch {
    throw new PlayerRequestError(503, 'PLAYER_SERVICE_UNAVAILABLE');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PlayerRequestError(response.status, 'INVALID_PLAYER_RESPONSE');
  }

  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    throw new PlayerRequestError(
      response.status,
      errorCode(payload),
      isRecord(payload) && typeof payload['requestId'] === 'string'
        ? payload['requestId']
        : undefined,
    );
  }

  return payload['data'];
}

function parseProfileData(value: unknown): PlayerProfile | null {
  if (!isRecord(value)) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  const result = playerProfileSchema.nullable().safeParse(value['profile']);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  return result.data;
}

export interface PlayerEntryView {
  readonly profile: PlayerProfile | null;
  readonly entryState: PlayerEntryState;
}

function parseEntryData(value: unknown): PlayerEntryView {
  if (!isRecord(value)) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  const profile = playerProfileSchema.nullable().safeParse(value['profile']);
  const entryState = playerEntryStateSchema.safeParse(value['entryState']);
  if (!profile.success || !entryState.success) {
    throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  }
  return { profile: profile.data, entryState: entryState.data };
}

export async function loadPlayerEntry(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<PlayerEntryView> {
  return parseEntryData(
    await requestPlayerApi(apiUrl, '/profile', {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    }),
  );
}

export async function loadPlayerProfile(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<PlayerProfile | null> {
  return (await loadPlayerEntry(apiUrl, signal)).profile;
}

export async function createPlayerProfile(
  apiUrl: string,
  input: PlayerProfileCreate,
  signal?: AbortSignal,
): Promise<PlayerProfile> {
  const profile = parseProfileData(
    await requestPlayerApi(apiUrl, '/profile', {
      method: 'POST',
      body: input,
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  if (profile === null) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  return profile;
}

export async function updatePlayerProfile(
  apiUrl: string,
  input: PlayerProfileUpdate,
  signal?: AbortSignal,
): Promise<PlayerProfile> {
  const profile = parseProfileData(
    await requestPlayerApi(apiUrl, '/profile', {
      method: 'PATCH',
      body: input,
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  if (profile === null) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  return profile;
}

export async function completePlayerRename(
  apiUrl: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<PlayerProfile> {
  const profile = parseProfileData(
    await requestPlayerApi(apiUrl, '/rename', {
      method: 'POST',
      body: { displayName },
      ...(signal === undefined ? {} : { signal }),
    }),
  );
  if (profile === null) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  return profile;
}

export async function savePlayerState(
  apiUrl: string,
  state: PlayerStateUpdate,
  expectedGameStateVersion: number,
  options: { readonly keepalive?: boolean; readonly signal?: AbortSignal } = {},
): Promise<PersistedPlayerState> {
  const value = await requestPlayerApi(apiUrl, '/state', {
    method: 'PUT',
    body: { ...state, expectedGameStateVersion },
    ...(options.keepalive === undefined ? {} : { keepalive: options.keepalive }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (!isRecord(value)) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  const parsed = persistedPlayerStateSchema.safeParse({
    mapId: value['mapId'],
    x: value['x'],
    y: value['y'],
    facingDirection: value['facingDirection'],
    gameStateVersion: value['gameStateVersion'],
  });
  if (!parsed.success) throw new PlayerRequestError(502, 'INVALID_PLAYER_RESPONSE');
  return parsed.data;
}
