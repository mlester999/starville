import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assertDatabaseUrlMatchesProjectRef,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import {
  SUPABASE_REALTIME_MAX_PAYLOAD_BYTES,
  SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS,
  SUPABASE_REALTIME_PROTOCOL_VERSION,
  parseSupabaseRealtimePayload,
  supabaseMovementBroadcastSchema,
  supabasePresencePayloadSchema,
  supabaseRealtimeAuthorizationViewSchema,
  type SupabaseMovementBroadcast,
  type SupabasePresencePayload,
  type SupabaseRealtimeAuthorizationView,
} from '@starville/realtime';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@starville/supabase/server';
import postgres from 'postgres';

import {
  assertHostedDevelopmentFixtureWritesApproved,
  safeHostedTargetSummary,
  verifyCanonicalHostedTarget,
} from './safety';
import { summarizeRealtimeManagementSettings } from './verify-realtime-settings';

export type HostedHarnessMode = 'dry-run' | 'execute';

export const PHASE13E_REALTIME_HOSTED_PLAN = {
  target: 'exact starville-dev project ref and URL; production rejected',
  fixtures: 'two uniquely tagged wallet players and two non-anonymous Auth users',
  channel: { private: true, environment: 'development' },
  presence: [
    'subscribe',
    'sync',
    'join',
    'leave',
    'untrack',
    'reconnect-without-duplicate-key',
    'channel-switch-cleanup',
  ],
  broadcast: [
    'strict-versioned-movement',
    'monotonic-sequence',
    '100ms-throttle',
    'cross-topic-isolation',
    'no-postgres-movement-rows',
    'no-gameplay-authority',
  ],
  cleanup: 'finally: channels, Auth users, bindings, memberships, test audit, wallet fixtures',
} as const;

export function parseHostedHarnessMode(arguments_: readonly string[]): HostedHarnessMode {
  const normalized = arguments_[0] === '--' ? arguments_.slice(1) : arguments_;
  if (normalized.length === 0 || (normalized.length === 1 && normalized[0] === '--dry-run')) {
    return 'dry-run';
  }
  if (normalized.length === 1 && normalized[0] === '--execute') return 'execute';
  throw new Error('Phase 13E hosted Realtime harness accepts only --dry-run or --execute');
}

export function createFixtureTag(runId: string): string {
  const compact = runId.replaceAll('-', '').toLowerCase();
  if (!/^[a-f0-9]{32}$/u.test(compact)) throw new Error('Fixture run id must be a UUID');
  return `phase13e-${compact.slice(0, 12)}`;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function fixtureWallet(tag: string, player: 'a' | 'b'): string {
  const bytes = Buffer.concat([
    createHash('sha256').update(`${tag}:${player}:one`).digest(),
    createHash('sha256').update(`${tag}:${player}:two`).digest(),
  ]);
  return [...bytes.subarray(0, 40)].map((byte) => BASE58[byte % BASE58.length]).join('');
}

export interface MovementAcceptanceContext {
  readonly membershipId: string;
  readonly presenceId: string;
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly channelId: string;
  readonly now: number;
}

export function acceptMovementBroadcast(
  payload: unknown,
  context: MovementAcceptanceContext,
  previousSequence: number,
): SupabaseMovementBroadcast | undefined {
  const movement = parseSupabaseRealtimePayload(supabaseMovementBroadcastSchema, payload);
  if (
    movement === undefined ||
    movement.membershipId !== context.membershipId ||
    movement.presenceId !== context.presenceId ||
    movement.worldId !== context.worldId ||
    movement.worldVersionId !== context.worldVersionId ||
    movement.channelId !== context.channelId ||
    Math.abs(context.now - movement.timestamp) > 30_000 ||
    movement.sequence <= previousSequence
  ) {
    return undefined;
  }
  return movement;
}

export class MovementThrottle {
  private lastSentAt = Number.NEGATIVE_INFINITY;

  public remaining(now: number): number {
    return Math.max(0, SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS - (now - this.lastSentAt));
  }

  public record(now: number): void {
    if (this.remaining(now) > 0) throw new Error('Movement Broadcast throttle was bypassed');
    this.lastSentAt = now;
  }
}

interface DatabaseFixture {
  readonly playerId: string;
  readonly wallet: string;
  readonly accessSessionHash: string;
  readonly challengeId: string;
  readonly accessSessionId: string;
}

interface WorldFixture {
  readonly worldId: string;
  readonly worldVersionId: string;
  readonly channelIds: readonly [string, string];
}

interface AuthFixture {
  readonly userId: string;
  readonly accessToken: string;
  readonly authorization: SupabaseRealtimeAuthorizationView;
}

type BrowserClient = ReturnType<typeof createSupabaseServerClient>;
type RealtimeChannel = ReturnType<BrowserClient['channel']>;

interface SubscribedChannel {
  readonly channel: RealtimeChannel;
  readonly events: { sync: number; join: number; leave: number };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function parseAuthorizedView(input: unknown): SupabaseRealtimeAuthorizationView {
  if (
    typeof input !== 'object' ||
    input === null ||
    Reflect.get(input, 'status') !== 'authorized'
  ) {
    throw new Error('Supabase Realtime authorization did not succeed');
  }
  const view = { ...(input as Record<string, unknown>) };
  delete view['status'];
  return supabaseRealtimeAuthorizationViewSchema.parse(view);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(
  condition: () => boolean,
  label: string,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await delay(25);
  }
}

async function verifyPrivateRealtimeSettings(projectRef: string): Promise<void> {
  const accessToken = requiredEnvironment('SUPABASE_ACCESS_TOKEN');
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/realtime`,
    { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Realtime settings read failed with HTTP ${response.status}`);
  const verification = summarizeRealtimeManagementSettings(await response.json());
  if (
    verification.realtimeService !== 'enabled' ||
    verification.privateOnlyRequirement !== 'proven'
  ) {
    throw new Error(
      'Hosted Realtime execution requires enabled service and proven private-only mode',
    );
  }
}

async function createDatabaseFixtures(
  sql: postgres.TransactionSql,
  tag: string,
): Promise<{
  readonly players: readonly [DatabaseFixture, DatabaseFixture];
  readonly world: WorldFixture;
}> {
  const worldRows = await sql<
    { world_id: string; world_version_id: string; channel_ids: string[] }[]
  >`
    select map.id::text as world_id,
           map.active_published_version_id::text as world_version_id,
           array_agg(channel.id::text order by channel.channel_number) as channel_ids
    from public.world_maps map
    join public.realtime_channels channel
      on channel.world_map_id = map.id and channel.enabled
    where map.slug = 'lantern-square'
      and map.status = 'active'
      and map.active_published_version_id is not null
    group by map.id, map.active_published_version_id
  `;
  const worldRow = worldRows[0];
  if (worldRow === undefined || worldRow.channel_ids.length < 2) {
    throw new Error('Phase 13E hosted validation requires two enabled development channels');
  }

  const configRows = await sql<{ id: string; config_version: number }[]>`
    select id::text, config_version
    from public.token_gate_configs
    where environment_key = 'development' and network = 'solana:devnet'
  `;
  const tokenConfig = configRows[0];
  if (tokenConfig === undefined)
    throw new Error('Development token-gate fixture config is missing');

  const players = [] as DatabaseFixture[];
  for (const player of ['a', 'b'] as const) {
    const wallet = fixtureWallet(tag, player);
    const challengeId = randomUUID();
    const accessSessionId = randomUUID();
    const accessSessionHash = sha256(`${tag}:${player}:wallet-access`);
    const hashSeed = sha256(`${tag}:${player}:fixture`);
    const profileRows = await sql<{ id: string }[]>`
      insert into public.player_profiles(
        wallet_address, display_name, appearance_preset, current_map_id,
        current_map_version_id, safe_position_x, safe_position_y, facing_direction
      ) values(
        ${wallet}, ${`P13E ${tag.slice(-6)} ${player.toUpperCase()}`},
        ${player === 'a' ? 'moss' : 'moonberry'}, 'lantern-square',
        ${worldRow.world_version_id}::uuid, ${player === 'a' ? 12 : 13}, 7.5, 'south'
      )
      returning id::text
    `;
    const profile = profileRows[0];
    if (profile === undefined) throw new Error('Player fixture insert returned no row');

    await sql`
      insert into public.wallet_auth_challenges(
        id, wallet_address, network, token_gate_config_id, config_version_snapshot,
        nonce_hash, message_hash, domain, uri, issued_at, expires_at, request_id, ip_hash
      ) values(
        ${challengeId}::uuid, ${wallet}, 'solana:devnet', ${tokenConfig.id}::uuid,
        ${tokenConfig.config_version}, ${hashSeed}, ${sha256(`${hashSeed}:message`)},
        'phase13e.test', 'https://phase13e.test', now(), now() + interval '5 minutes',
        ${`${tag}:${player}:challenge`}, ${sha256(`${hashSeed}:ip`)}
      )
    `;
    await sql`
      insert into public.wallet_access_sessions(
        id, challenge_id, wallet_address, network, token_gate_config_id,
        config_version_snapshot, session_token_hash, status, observed_balance_raw,
        required_balance_raw, checked_slot, last_balance_check_at, expires_at
      ) values(
        ${accessSessionId}::uuid, ${challengeId}::uuid, ${wallet}, 'solana:devnet',
        ${tokenConfig.id}::uuid, ${tokenConfig.config_version}, ${accessSessionHash},
        'active', 1000, 1000, 1, now(), now() + interval '30 minutes'
      )
    `;
    players.push({
      playerId: profile.id,
      wallet,
      accessSessionHash,
      challengeId,
      accessSessionId,
    });
  }

  return {
    players: players as unknown as readonly [DatabaseFixture, DatabaseFixture],
    world: {
      worldId: 'lantern-square',
      worldVersionId: worldRow.world_version_id,
      channelIds: [worldRow.channel_ids[0]!, worldRow.channel_ids[1]!],
    },
  };
}

async function createAuthFixture(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  browser: BrowserClient,
  player: DatabaseFixture,
  channelId: string,
  tag: string,
): Promise<AuthFixture> {
  const prepared = await service.rpc('prepare_supabase_realtime_player_identity', {
    p_access_session_token_hash: player.accessSessionHash,
    p_request_id: `${tag}:prepare`,
  });
  if (prepared.error !== null) throw prepared.error;
  const email = (prepared.data as { readonly email?: unknown }).email;
  if (typeof email !== 'string')
    throw new Error('Wallet-bound Auth preparation did not return email');

  const generated = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { data: { starville_identity: 'player', fixture_tag: tag } },
  });
  if (generated.error !== null || generated.data.properties === null) {
    throw generated.error ?? new Error('Auth fixture link generation failed');
  }
  if (generated.data.user.is_anonymous === true) {
    throw new Error('Phase 13E Auth fixture must be non-anonymous');
  }

  const bound = await service.rpc('bind_supabase_realtime_player_identity', {
    p_auth_user_id: generated.data.user.id,
    p_access_session_token_hash: player.accessSessionHash,
    p_request_id: `${tag}:bind`,
  });
  if (bound.error !== null || (bound.data as { readonly status?: unknown }).status !== 'bound') {
    throw bound.error ?? new Error('Exact Auth-to-player binding failed');
  }

  const verified = await browser.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (
    verified.error !== null ||
    verified.data.session === null ||
    verified.data.user === null ||
    verified.data.user.is_anonymous === true
  ) {
    throw verified.error ?? new Error('Non-anonymous fixture session verification failed');
  }
  await browser.realtime.setAuth(verified.data.session.access_token);

  const authorized = await service.rpc('authorize_supabase_realtime_player', {
    p_auth_user_id: verified.data.user.id,
    p_access_session_token_hash: player.accessSessionHash,
    p_environment_key: 'development',
    p_requested_channel_id: channelId,
    p_request_id: `${tag}:authorize`,
  });
  if (authorized.error !== null) throw authorized.error;
  const authorization = parseAuthorizedView(authorized.data);
  if (authorization.topic !== `starville:development:world:lantern-square:channel:${channelId}`) {
    throw new Error('Authorization returned an unexpected private world topic');
  }
  return {
    userId: verified.data.user.id,
    accessToken: verified.data.session.access_token,
    authorization,
  };
}

async function subscribe(
  client: BrowserClient,
  authorization: SupabaseRealtimeAuthorizationView,
  onMovement: (payload: unknown) => void,
): Promise<SubscribedChannel> {
  const events = { sync: 0, join: 0, leave: 0 };
  const channel = client.channel(authorization.topic, {
    config: { private: true, presence: { key: authorization.membershipId } },
  });
  channel
    .on('presence', { event: 'sync' }, () => {
      events.sync += 1;
    })
    .on('presence', { event: 'join' }, () => {
      events.join += 1;
    })
    .on('presence', { event: 'leave' }, () => {
      events.leave += 1;
    })
    .on('broadcast', { event: 'movement' }, ({ payload }) => onMovement(payload));

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`Private Realtime subscription failed: ${status}`));
      }
    });
  });
  const presence: SupabasePresencePayload = {
    version: SUPABASE_REALTIME_PROTOCOL_VERSION,
    membershipId: authorization.membershipId,
    player: authorization.self,
    status: 'online',
  };
  supabasePresencePayloadSchema.parse(presence);
  if ((await channel.track(presence)) !== 'ok') {
    throw new Error('Private Presence track failed');
  }
  return { channel, events };
}

function presenceKeyCount(channel: RealtimeChannel, membershipId: string): number {
  const state = channel.presenceState() as Readonly<Record<string, readonly unknown[]>>;
  return Object.values(state).reduce(
    (total, metas) =>
      total +
      metas.filter(
        (meta) =>
          typeof meta === 'object' &&
          meta !== null &&
          Reflect.get(meta, 'membershipId') === membershipId,
      ).length,
    0,
  );
}

async function removeChannel(client: BrowserClient, channel: RealtimeChannel): Promise<void> {
  const untracked = await channel.untrack();
  if (untracked !== 'ok') throw new Error(`Presence untrack failed: ${untracked}`);
  const removed = await client.removeChannel(channel);
  if (removed !== 'ok') throw new Error(`Realtime channel removal failed: ${removed}`);
}

async function executeHostedValidation(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  assertHostedDevelopmentFixtureWritesApproved(target, process.env);
  await verifyPrivateRealtimeSettings(target.projectRef);
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(target))}\n`);

  const privateConfig = loadPrivateSupabaseConfig(process.env);
  const databaseUrl = privateConfig.databaseUrl;
  if (databaseUrl === undefined) throw new Error('SUPABASE_DATABASE_URL is required');
  assertDatabaseUrlMatchesProjectRef(databaseUrl, target.projectRef);
  const anonKey = requiredEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const sql = postgres(databaseUrl, { max: 2, ssl: 'require' });
  const service = createSupabaseServiceRoleClient({
    url: privateConfig.url,
    serviceRoleKey: privateConfig.serviceRoleKey,
  });
  const browserA = createSupabaseServerClient({ url: privateConfig.url, anonKey });
  const browserB = createSupabaseServerClient({ url: privateConfig.url, anonKey });
  const runId = randomUUID();
  const tag = createFixtureTag(runId);
  const authUserIds = new Set<string>();
  const channels: { readonly client: BrowserClient; readonly channel: RealtimeChannel }[] = [];
  let fixtures:
    | {
        readonly players: readonly [DatabaseFixture, DatabaseFixture];
        readonly world: WorldFixture;
      }
    | undefined;
  const cleanupErrors: string[] = [];
  let validationError: unknown;

  try {
    fixtures = await sql.begin((transaction) => createDatabaseFixtures(transaction, tag));
    const [playerA, playerB] = fixtures.players;
    const authA = await createAuthFixture(
      service,
      browserA,
      playerA,
      fixtures.world.channelIds[0],
      `${tag}:a`,
    );
    authUserIds.add(authA.userId);
    const authB = await createAuthFixture(
      service,
      browserB,
      playerB,
      fixtures.world.channelIds[0],
      `${tag}:b`,
    );
    authUserIds.add(authB.userId);

    const unbound = await service.auth.admin.createUser({
      email: `${tag}-unbound@auth.starville.game`,
      email_confirm: true,
      user_metadata: { fixture_tag: tag },
    });
    if (unbound.error !== null || unbound.data.user === null) {
      throw unbound.error ?? new Error('Unbound denial fixture failed');
    }
    authUserIds.add(unbound.data.user.id);
    const unboundResult = await service.rpc('authorize_supabase_realtime_player', {
      p_auth_user_id: unbound.data.user.id,
      p_access_session_token_hash: playerA.accessSessionHash,
      p_environment_key: 'development',
      p_requested_channel_id: fixtures.world.channelIds[0],
      p_request_id: `${tag}:unbound-denial`,
    });
    if (
      unboundResult.error !== null ||
      (unboundResult.data as { readonly status?: unknown }).status !== 'auth_identity_invalid'
    ) {
      throw unboundResult.error ?? new Error('Unbound Auth identity did not fail closed');
    }

    const messageRowsBefore = await sql<{ count: number }[]>`
      select count(*)::integer as count from realtime.messages
      where topic = ${authA.authorization.topic}
    `;
    let previousSequence = -1;
    const accepted: SupabaseMovementBroadcast[] = [];
    const receiveAtB = (payload: unknown) => {
      const movement = acceptMovementBroadcast(
        payload,
        {
          membershipId: authA.authorization.membershipId,
          presenceId: authA.authorization.self.presenceId,
          worldId: fixtures!.world.worldId,
          worldVersionId: fixtures!.world.worldVersionId,
          channelId: fixtures!.world.channelIds[0],
          now: Date.now(),
        },
        previousSequence,
      );
      if (movement !== undefined) {
        previousSequence = movement.sequence;
        accepted.push(movement);
      }
    };

    const subscribedA = await subscribe(browserA, authA.authorization, () => undefined);
    channels.push({ client: browserA, channel: subscribedA.channel });
    const subscribedB = await subscribe(browserB, authB.authorization, receiveAtB);
    channels.push({ client: browserB, channel: subscribedB.channel });
    await waitFor(
      () =>
        presenceKeyCount(subscribedA.channel, authB.authorization.membershipId) === 1 &&
        presenceKeyCount(subscribedB.channel, authA.authorization.membershipId) === 1,
      'two-client Presence sync',
    );

    await subscribedA.channel.untrack();
    await waitFor(() => subscribedB.events.leave > 0, 'Player B Presence leave observation');
    await subscribedA.channel.track({
      version: SUPABASE_REALTIME_PROTOCOL_VERSION,
      membershipId: authA.authorization.membershipId,
      player: authA.authorization.self,
      status: 'online',
    });
    await waitFor(() => subscribedB.events.join > 0, 'Player B Presence join observation');
    await subscribedB.channel.untrack();
    await waitFor(() => subscribedA.events.leave > 0, 'Player A Presence leave observation');
    await subscribedB.channel.track({
      version: SUPABASE_REALTIME_PROTOCOL_VERSION,
      membershipId: authB.authorization.membershipId,
      player: authB.authorization.self,
      status: 'online',
    });
    await waitFor(() => subscribedA.events.join > 0, 'Player A Presence join observation');
    if (subscribedA.events.sync === 0 || subscribedB.events.sync === 0) {
      throw new Error('Both clients must observe Presence sync');
    }

    const baseMovement: SupabaseMovementBroadcast = {
      version: SUPABASE_REALTIME_PROTOCOL_VERSION,
      membershipId: authA.authorization.membershipId,
      presenceId: authA.authorization.self.presenceId,
      worldId: fixtures.world.worldId,
      worldVersionId: fixtures.world.worldVersionId,
      channelId: fixtures.world.channelIds[0],
      sequence: 1,
      timestamp: Date.now(),
      x: 12.25,
      y: 7.5,
      facingDirection: 'east',
      movementState: 'walking',
      animationState: 'walk-east',
    };
    const throttle = new MovementThrottle();
    const firstSentAt = Date.now();
    throttle.record(firstSentAt);
    if (
      (await subscribedA.channel.send({
        type: 'broadcast',
        event: 'movement',
        payload: supabaseMovementBroadcastSchema.parse(baseMovement),
      })) !== 'ok'
    ) {
      throw new Error('Movement Broadcast send failed');
    }
    await waitFor(() => accepted.length === 1, 'Player B movement receipt');
    const throttleDelay = throttle.remaining(Date.now());
    if (throttleDelay > 0) await delay(throttleDelay);
    const secondSentAt = Date.now();
    throttle.record(secondSentAt);
    if (secondSentAt - firstSentAt < SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS) {
      throw new Error('Movement Broadcast throttle interval was shorter than 100 ms');
    }
    if (
      (await subscribedA.channel.send({
        type: 'broadcast',
        event: 'movement',
        payload: { ...baseMovement, sequence: 2, timestamp: secondSentAt, x: 12.5 },
      })) !== 'ok'
    ) {
      throw new Error('Throttled movement Broadcast send failed');
    }
    await waitFor(() => accepted.length === 2, 'Player B throttled movement receipt');
    receiveAtB({ ...baseMovement, sequence: 2, timestamp: secondSentAt, x: 12.5 });
    receiveAtB({ ...baseMovement, sequence: 1 });
    receiveAtB({ ...baseMovement, sequence: 3, x: Number.NaN });
    receiveAtB({ ...baseMovement, sequence: 3, inventory: ['forbidden'] });
    receiveAtB({ ...baseMovement, sequence: 3, version: 2 });
    receiveAtB({ ...baseMovement, sequence: 3, worldId: 'other-world' });
    receiveAtB({
      ...baseMovement,
      sequence: 3,
      animationState: 'x'.repeat(SUPABASE_REALTIME_MAX_PAYLOAD_BYTES),
    });
    if (accepted.length !== 2) throw new Error('Strict movement validation failed');

    await removeChannel(browserB, subscribedB.channel);
    channels.splice(
      channels.findIndex((entry) => entry.channel === subscribedB.channel),
      1,
    );
    const switchedResult = await service.rpc('authorize_supabase_realtime_player', {
      p_auth_user_id: authB.userId,
      p_access_session_token_hash: playerB.accessSessionHash,
      p_environment_key: 'development',
      p_requested_channel_id: fixtures.world.channelIds[1],
      p_request_id: `${tag}:b:channel-switch`,
    });
    if (switchedResult.error !== null) throw switchedResult.error;
    const switchedAuthorization = parseAuthorizedView(switchedResult.data);
    const membershipSwitch = await sql<{ active: number; closed_previous: number }[]>`
      select
        count(*) filter (
          where status = 'active' and channel_id = ${fixtures.world.channelIds[1]}::uuid
        )::integer as active,
        count(*) filter (
          where status = 'closed'
            and channel_id = ${fixtures.world.channelIds[0]}::uuid
            and close_reason = 'channel_switch'
        )::integer as closed_previous
      from public.supabase_realtime_memberships
      where auth_user_id = ${authB.userId}::uuid
    `;
    if (membershipSwitch[0]?.active !== 1 || membershipSwitch[0].closed_previous < 1) {
      throw new Error('Channel switch did not close the previous membership exactly');
    }
    const crossTopicReceived: unknown[] = [];
    const switchedB = await subscribe(browserB, switchedAuthorization, (payload) => {
      crossTopicReceived.push(payload);
    });
    channels.push({ client: browserB, channel: switchedB.channel });
    await delay(150);
    if (
      (await subscribedA.channel.send({
        type: 'broadcast',
        event: 'movement',
        payload: { ...baseMovement, sequence: 3, timestamp: Date.now() },
      })) !== 'ok'
    ) {
      throw new Error('Cross-topic isolation probe send failed');
    }
    await delay(300);
    if (crossTopicReceived.length !== 0) throw new Error('Movement leaked across private topics');

    await removeChannel(browserA, subscribedA.channel);
    channels.splice(
      channels.findIndex((entry) => entry.channel === subscribedA.channel),
      1,
    );
    const reconnectedA = await subscribe(browserA, authA.authorization, () => undefined);
    channels.push({ client: browserA, channel: reconnectedA.channel });
    await waitFor(
      () => presenceKeyCount(reconnectedA.channel, authA.authorization.membershipId) === 1,
      'reconnected Presence key',
    );

    const messageRowsAfter = await sql<{ count: number }[]>`
      select count(*)::integer as count from realtime.messages
      where topic = ${authA.authorization.topic}
    `;
    if (messageRowsAfter[0]?.count !== messageRowsBefore[0]?.count) {
      throw new Error('Movement Broadcast unexpectedly persisted PostgreSQL message rows');
    }
  } catch (error) {
    validationError = error;
  } finally {
    for (const tracked of channels.reverse()) {
      try {
        await removeChannel(tracked.client, tracked.channel);
      } catch {
        cleanupErrors.push('channel');
      }
    }
    for (const userId of authUserIds) {
      try {
        const deleted = await service.auth.admin.deleteUser(userId);
        if (deleted.error !== null) cleanupErrors.push('auth-user');
      } catch {
        cleanupErrors.push('auth-user');
      }
    }
    try {
      if (fixtures !== undefined) {
        const playerIds = fixtures.players.map((player) => player.playerId);
        const accessIds = fixtures.players.map((player) => player.accessSessionId);
        const challengeIds = fixtures.players.map((player) => player.challengeId);
        const trackedAuthIds = [...authUserIds];
        await sql.begin(async (transaction) => {
          await transaction`delete from public.supabase_realtime_authorization_audit
            where player_profile_id = any(${playerIds}::uuid[])
               or auth_user_id = any(${trackedAuthIds}::uuid[])`;
          await transaction`delete from public.supabase_realtime_memberships
            where player_profile_id = any(${playerIds}::uuid[])`;
          await transaction`delete from public.supabase_realtime_player_identities
            where player_profile_id = any(${playerIds}::uuid[])`;
          await transaction`delete from public.player_profiles where id = any(${playerIds}::uuid[])`;
          await transaction`delete from public.wallet_access_sessions
            where id = any(${accessIds}::uuid[])`;
          await transaction`delete from public.wallet_auth_challenges
            where id = any(${challengeIds}::uuid[])`;
        });
        const remaining = await sql<{ count: number }[]>`
          select (
            (select count(*) from public.player_profiles where id = any(${playerIds}::uuid[]))
            + (select count(*) from public.wallet_access_sessions
               where id = any(${accessIds}::uuid[]))
            + (select count(*) from public.wallet_auth_challenges
               where id = any(${challengeIds}::uuid[]))
            + (select count(*) from public.supabase_realtime_memberships
               where player_profile_id = any(${playerIds}::uuid[]))
            + (select count(*) from public.supabase_realtime_player_identities
               where player_profile_id = any(${playerIds}::uuid[]))
            + (select count(*) from public.supabase_realtime_authorization_audit
               where player_profile_id = any(${playerIds}::uuid[])
                  or auth_user_id = any(${trackedAuthIds}::uuid[]))
          )::integer as count
        `;
        if (remaining[0]?.count !== 0) cleanupErrors.push('database-fixture');
      }
    } catch {
      cleanupErrors.push('database-fixture');
    } finally {
      await sql.end();
    }
  }
  if (cleanupErrors.length > 0) {
    throw new Error(
      `Phase 13E hosted cleanup failed for ${[...new Set(cleanupErrors)].join(', ')}`,
    );
  }
  if (validationError !== undefined) throw validationError;
  process.stdout.write(
    `${JSON.stringify({ status: 'ok', harness: 'phase13e-realtime', fixtureTag: tag })}\n`,
  );
}

async function main(): Promise<void> {
  const mode = parseHostedHarnessMode(process.argv.slice(2));
  if (mode === 'dry-run') {
    process.stdout.write(
      `${JSON.stringify({ status: 'dry-run', remoteCalls: 0, remoteWrites: 0, plan: PHASE13E_REALTIME_HOSTED_PLAN })}\n`,
    );
    return;
  }
  await executeHostedValidation();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Hosted Realtime validation failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
