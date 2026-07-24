import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';

import {
  assertDatabaseUrlMatchesProjectRef,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@starville/supabase/server';
import { createSupabaseSsrServerClient } from '@starville/supabase/ssr';
import postgres from 'postgres';

import { createSupabaseAdminAuthGateway } from '../../apps/api/src/admin-auth-gateway';
import { createSupabaseAdminOperationsGateway } from '../../apps/api/src/admin-operations/gateway';
import { createAdminOperationsService } from '../../apps/api/src/admin-operations/service';
import { buildApiApp } from '../../apps/api/src/app';
import type { LogContext, ServiceLogger } from '../../apps/api/src/contracts';
import { createSupabaseAdminWorldGateway } from '../../apps/api/src/world/admin-gateway';
import { createAdminWorldService } from '../../apps/api/src/world/admin-service';
import { createSupabaseAdminChatGateway } from '../../apps/api/src/realtime/chat-admin-gateway';
import { createSupabaseAdminSocialGateway } from '../../apps/api/src/realtime/social-admin-gateway';
import { createSupabaseAdminSocialGraphGateway } from '../../apps/api/src/realtime/social-graph-admin-gateway';
import {
  createHostedFetch,
  decodeHostedJson,
  hostedApiResponseFailure,
  hostedFetch,
  hostedResponseFailure,
  safeHostedEndpoint,
  safeHostedTransportCode,
  withHostedCleanupTimeout,
  type HostedApiLogDiagnostic,
} from './hosted-rls-diagnostics';
import {
  assertHostedDevelopmentFixtureWritesApproved,
  safeHostedTargetSummary,
  verifyCanonicalHostedTarget,
} from './safety';

interface FixtureUser {
  readonly id: string;
  readonly email: string;
}

interface HostedTokenGateResponse {
  readonly success: boolean;
  readonly data: {
    readonly availability: string;
    readonly commitment: string;
    readonly configVersion: number;
    readonly enabled: boolean;
    readonly mintAddress: string | null;
    readonly network: string;
    readonly recheckIntervalSeconds: number;
    readonly requiredAmount: string;
    readonly sessionTtlSeconds: number;
    readonly symbol: string;
  };
}

class RollbackHostedFixture extends Error {}

class HostedTestLogger implements ServiceLogger {
  constructor(
    private readonly events: HostedApiLogDiagnostic[] = [],
    private readonly bindings: LogContext = {},
  ) {}

  child(bindings: LogContext): ServiceLogger {
    return new HostedTestLogger(this.events, { ...this.bindings, ...bindings });
  }

  trace(_message: string, _context?: LogContext): void {}
  debug(_message: string, _context?: LogContext): void {}
  info(_message: string, _context?: LogContext): void {}
  warn(message: string, context?: LogContext): void {
    this.record('warn', message, context);
  }
  error(message: string, context?: LogContext): void {
    this.record('error', message, context);
  }
  fatal(message: string, context?: LogContext): void {
    this.record('fatal', message, context);
  }

  findApiFailure(requestId: string, url: URL): HostedApiLogDiagnostic | null {
    const endpoint = safeHostedEndpoint(url);
    return (
      [...this.events]
        .reverse()
        .find((event) => event.requestId === requestId && event.path === endpoint) ?? null
    );
  }

  private record(
    level: HostedApiLogDiagnostic['level'],
    message: string,
    context?: LogContext,
  ): void {
    const combined = { ...this.bindings, ...context };
    const rawRequestId = Reflect.get(combined, 'requestId');
    const rawMethod = Reflect.get(combined, 'method');
    const rawPath = Reflect.get(combined, 'path');
    const rawStatusCode = Reflect.get(combined, 'statusCode');
    const rawError = Reflect.get(combined, 'error');
    const rawErrorCode =
      typeof rawError === 'object' && rawError !== null ? Reflect.get(rawError, 'code') : null;
    const safePath =
      typeof rawPath === 'string' && rawPath.startsWith('/')
        ? safeHostedEndpoint(new URL(rawPath, 'http://starville.test'))
        : null;

    this.events.push({
      level,
      message: /^[a-z0-9._-]{1,120}$/u.test(message) ? message : 'api.log',
      requestId:
        typeof rawRequestId === 'string' && /^[A-Za-z0-9:._-]{1,160}$/u.test(rawRequestId)
          ? rawRequestId
          : null,
      method:
        typeof rawMethod === 'string' && /^(?:DELETE|GET|PATCH|POST|PUT)$/u.test(rawMethod)
          ? rawMethod
          : null,
      path: safePath,
      statusCode:
        typeof rawStatusCode === 'number' && rawStatusCode >= 100 && rawStatusCode <= 599
          ? rawStatusCode
          : null,
      errorCode:
        typeof rawErrorCode === 'string' && /^[A-Z0-9_-]{1,80}$/u.test(rawErrorCode)
          ? rawErrorCode
          : null,
    });
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomBase58Address(): string {
  return [...randomBytes(44)]
    .map((value) => BASE58_ALPHABET[value % BASE58_ALPHABET.length])
    .join('');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function authorizationOutcome(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'outcome') === 'string'
    ? (Reflect.get(value, 'outcome') as string)
    : undefined;
}

function createCookieBackedSupabaseClient(
  url: string,
  anonKey: string,
  hostedClientFetch: typeof globalThis.fetch,
) {
  const cookieJar = new Map<string, string>();
  const client = createSupabaseSsrServerClient(
    { url, anonKey },
    {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          if (value === '' || options.maxAge === 0) {
            cookieJar.delete(name);
          } else {
            cookieJar.set(name, value);
          }
        }
      },
    },
    {
      cookieOptions: {
        name: 'starville-admin-auth',
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
      fetch: hostedClientFetch,
    },
  );

  return {
    client,
    cookieHeader: () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; '),
  } as const;
}

async function main(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(target))}\n`);

  assertHostedDevelopmentFixtureWritesApproved(target, process.env);

  const privateConfig = loadPrivateSupabaseConfig(process.env);

  if (privateConfig.databaseUrl === undefined) {
    throw new Error('SUPABASE_DATABASE_URL is required for controlled hosted fixture cleanup');
  }

  assertDatabaseUrlMatchesProjectRef(privateConfig.databaseUrl, target.projectRef);

  const runId = randomUUID();
  const requestId = `phase2-test:${runId}`;
  const password = `${randomBytes(24).toString('base64url')}!Aa1`;
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const adminPortalUrl = process.env['NEXT_PUBLIC_ADMIN_URL'];
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'];
  const configuredNetworkName = process.env['SOLANA_NETWORK'];
  const configuredMintAddress = process.env['GAME_TOKEN_MINT_ADDRESS'];
  const configuredTokenSymbol = process.env['GAME_TOKEN_SYMBOL'] ?? 'STAR';
  const configuredRequiredAmount = process.env['GAME_TOKEN_GATE_AMOUNT'] ?? '1000';
  const configuredCommitment = process.env['SOLANA_COMMITMENT'] ?? 'confirmed';

  if (
    anonKey === undefined ||
    adminPortalUrl === undefined ||
    apiUrl === undefined ||
    configuredMintAddress === undefined
  ) {
    throw new Error(
      'Hosted RLS tests require public Supabase, admin/API URLs, and token configuration',
    );
  }

  const configuredNetwork =
    configuredNetworkName === 'mainnet-beta'
      ? 'solana:mainnet-beta'
      : configuredNetworkName === 'devnet'
        ? 'solana:devnet'
        : undefined;
  assert(configuredNetwork !== undefined, 'Hosted RLS tests require a supported Solana network');
  assert(
    configuredCommitment === 'confirmed' || configuredCommitment === 'finalized',
    'Hosted RLS tests require a supported Solana commitment',
  );

  const verifiedAnonKey: string = anonKey;
  const verifiedAdminPortalUrl: string = adminPortalUrl;
  const verifiedConfiguredNetwork: 'solana:devnet' | 'solana:mainnet-beta' = configuredNetwork;

  const apiReadinessUrl = new URL('/ready', apiUrl);
  const apiReadinessResponse = await hostedFetch(
    'api-readiness-preflight',
    apiReadinessUrl,
    requestId,
    { headers: { 'x-request-id': requestId } },
  );
  assert(
    apiReadinessResponse.status === 200,
    hostedResponseFailure(
      'api-readiness-preflight',
      apiReadinessUrl,
      apiReadinessResponse,
      requestId,
    ),
  );

  const adminReadinessUrl = new URL('/login', adminPortalUrl);
  const adminReadinessResponse = await hostedFetch(
    'admin-portal-readiness-preflight',
    adminReadinessUrl,
    requestId,
    { headers: { 'x-request-id': requestId }, redirect: 'manual' },
  );
  assert(
    adminReadinessResponse.status === 200,
    hostedResponseFailure(
      'admin-portal-readiness-preflight',
      adminReadinessUrl,
      adminReadinessResponse,
      requestId,
    ),
  );

  process.stdout.write(`${JSON.stringify({ testRunId: runId, mode: 'hosted-rls' })}\n`);

  const serviceClientFetch = createHostedFetch('supabase-service-request', requestId);
  const anonymousClientFetch = createHostedFetch('supabase-anonymous-request', requestId);
  const sessionClientFetch = createHostedFetch('supabase-session-request', requestId);
  const serviceClient = createSupabaseServiceRoleClient(
    {
      url: privateConfig.url,
      serviceRoleKey: privateConfig.serviceRoleKey,
    },
    { fetch: serviceClientFetch },
  );
  const anonymousClient = createSupabaseServerClient(
    { url: privateConfig.url, anonKey },
    { fetch: anonymousClientFetch },
  );
  const sql = postgres(privateConfig.databaseUrl, {
    max: 1,
    ssl: 'require',
    connect_timeout: 20,
    idle_timeout: 20,
    connection: {
      application_name: 'starville_hosted_rls',
      statement_timeout: 20_000,
      lock_timeout: 10_000,
      idle_in_transaction_session_timeout: 20_000,
    },
  });
  const fixtures: FixtureUser[] = [];
  const testRoleIds: string[] = [];
  let phase5PlayerFixture:
    | { readonly id: string; readonly walletAddress: string; readonly adminUserId: string }
    | undefined;
  let phase5PendingFixture:
    { readonly walletAddress: string; readonly adminUserId: string } | undefined;
  const logger = new HostedTestLogger();
  const adminOperationsService = createAdminOperationsService({
    gateway: createSupabaseAdminOperationsGateway(serviceClient, {
      environmentKey: process.env['NODE_ENV'] ?? 'development',
      network: configuredNetwork,
    }),
    healthReader: {
      read: async () => [
        {
          service: 'api' as const,
          status: 'healthy' as const,
          checkedAt: new Date().toISOString(),
          responseTimeMs: null,
        },
        {
          service: 'realtime-server' as const,
          status: 'unknown' as const,
          checkedAt: new Date().toISOString(),
          responseTimeMs: null,
        },
        {
          service: 'worker' as const,
          status: 'unknown' as const,
          checkedAt: new Date().toISOString(),
          responseTimeMs: null,
        },
      ],
    },
    logger,
    actionRateLimit: 20,
  });
  const adminWorldService = createAdminWorldService({
    gateway: createSupabaseAdminWorldGateway(serviceClient),
    logger,
    manifestMaximumBytes: 262_144,
    readRateLimit: 120,
    draftWriteRateLimit: 30,
    validationRateLimit: 20,
    publishRateLimit: 5,
    deriveRateLimit: 10,
  });
  const api = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
      trustedProxyCidrs: [],
    },
    logger,
    adminAuthGateway: createSupabaseAdminAuthGateway(serviceClient),
    adminSessionTtlMinutes: 60,
    adminOperations: { service: adminOperationsService, readRateLimit: 120 },
    adminWorld: { service: adminWorldService, manifestMaximumBytes: 262_144 },
    adminChat: { gateway: createSupabaseAdminChatGateway(serviceClient) },
    adminSocial: { gateway: createSupabaseAdminSocialGateway(serviceClient) },
    adminSocialGraph: { gateway: createSupabaseAdminSocialGraphGateway(serviceClient) },
  });

  try {
    const missingAuthentication = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: { 'x-request-id': requestId },
    });
    assert(
      missingAuthentication.statusCode === 401,
      'Missing API authentication did not return 401',
    );

    const invalidAuthentication = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: {
        authorization: 'Bearer invalid-phase2-test-token',
        'x-request-id': requestId,
      },
    });
    assert(
      invalidAuthentication.statusCode === 401,
      'Invalid API authentication did not return 401',
    );

    await sql`select set_config('starville.test_run_id', ${runId}, false)`;
    const normalEmail = `starville-phase2-test+${runId}-normal@example.com`;
    const adminEmail = `starville-phase2-test+${runId}-analyst@example.com`;
    const invitedEmail = `starville-phase2-test+${runId}-invited@example.com`;
    const suspendedEmail = `starville-phase2-test+${runId}-suspended@example.com`;
    const disabledEmail = `starville-phase2-test+${runId}-disabled@example.com`;
    const mfaEmail = `starville-phase2-test+${runId}-mfa@example.com`;

    for (const email of [
      normalEmail,
      adminEmail,
      invitedEmail,
      suspendedEmail,
      disabledEmail,
      mfaEmail,
    ]) {
      const created = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { starville_test_run_id: runId },
      });
      assert(
        !created.error && created.data.user !== null,
        'Unable to create a test-owned Auth user',
      );
      fixtures.push({ id: created.data.user.id, email });
    }

    const normal = fixtures[0];
    const administrator = fixtures[1];
    const invited = fixtures[2];
    const suspended = fixtures[3];
    const disabled = fixtures[4];
    const mfaRequired = fixtures[5];
    assert(
      normal !== undefined &&
        administrator !== undefined &&
        invited !== undefined &&
        suspended !== undefined &&
        disabled !== undefined &&
        mfaRequired !== undefined,
      'Hosted test fixtures are incomplete',
    );
    const activeAdministrator = administrator;

    const anonymousRead = await anonymousClient.from('admin_users').select('user_id');
    assert(
      anonymousRead.error !== null || anonymousRead.data?.length === 0,
      'Anonymous caller unexpectedly read administrator records',
    );

    for (const table of [
      'token_gate_configs',
      'wallet_auth_challenges',
      'wallet_auth_rate_limits',
      'wallet_access_sessions',
      'wallet_access_events',
      'player_profiles',
      'player_api_rate_limits',
      'player_moderation_states',
      'player_operation_audit_logs',
      'admin_player_operation_rate_limits',
      'world_maps',
      'world_map_versions',
      'world_assets',
      'world_map_version_assets',
      'world_audit_events',
      'world_operation_rate_limits',
      'world_asset_versions',
      'world_asset_uploads',
      'world_asset_processing_jobs',
      'world_asset_tags',
      'world_asset_version_tags',
      'world_asset_validation_checks',
      'world_asset_reviews',
      'world_asset_references',
      'world_asset_audit_events',
      'world_asset_operation_idempotency',
      'world_asset_operation_rate_limits',
      'social_interaction_settings',
      'social_interaction_requests',
      'player_gift_items',
      'player_trade_offer_items',
      'player_inventory_reservations',
      'social_interaction_receipts',
      'social_interaction_receipt_items',
      'social_interaction_audit',
      'social_interaction_idempotency',
      'social_graph_settings',
      'player_friend_requests',
      'player_friendships',
      'player_parties',
      'player_party_members',
      'player_party_invitations',
      'player_party_ready_checks',
      'player_party_ready_responses',
      'player_social_notifications',
      'player_social_audit',
      'player_social_idempotency',
    ]) {
      const tokenAccessRead = await anonymousClient.from(table).select('*').limit(1);
      assert(
        tokenAccessRead.error !== null || tokenAccessRead.data?.length === 0,
        `Anonymous caller unexpectedly read ${table}`,
      );
    }

    const anonymousTrustedConfig = await anonymousClient.rpc('get_token_gate_runtime_config', {
      p_environment_key: 'development',
      p_network: 'solana:devnet',
    });
    assert(
      anonymousTrustedConfig.error !== null,
      'Anonymous caller unexpectedly executed the trusted token-gate config function',
    );
    const anonymousPlayerDirectory = await anonymousClient.rpc('list_admin_players', {
      p_user_id: randomUUID(),
      p_auth_session_id: randomUUID(),
      p_assurance_level: 'aal1',
      p_environment_key: 'development',
      p_network: configuredNetwork,
      p_page: 1,
      p_page_size: 1,
      p_search: '',
      p_status: 'all',
      p_rename_filter: 'all',
      p_map_id: 'all',
      p_recent_days: null,
      p_sort: 'last_entered_at',
      p_direction: 'desc',
    });
    assert(
      anonymousPlayerDirectory.error !== null,
      'Anonymous caller unexpectedly executed the administrator player directory',
    );
    const anonymousWorldDirectory = await anonymousClient.rpc('list_admin_world_maps', {
      p_user_id: randomUUID(),
      p_auth_session_id: randomUUID(),
      p_assurance_level: 'aal1',
      p_page: 1,
      p_page_size: 1,
      p_search: '',
      p_status: 'all',
      p_sort: 'updated_at',
      p_direction: 'desc',
      p_request_id: `phase6-test:${runId}:anonymous-worlds`,
      p_rate_limit: 10,
    });
    assert(
      anonymousWorldDirectory.error !== null,
      'Anonymous caller unexpectedly executed the administrator world directory',
    );
    const anonymousAssetDirectory = await anonymousClient.rpc('list_admin_game_assets', {
      p_user_id: randomUUID(),
      p_auth_session_id: randomUUID(),
      p_assurance_level: 'aal1',
      p_page: 1,
      p_page_size: 1,
      p_search: '',
      p_asset_type: 'all',
      p_category: 'all',
      p_lifecycle_status: 'all',
      p_production_status: 'all',
      p_sort: 'updated_at',
      p_direction: 'desc',
      p_request_id: `phase75-test:${runId}:anonymous-assets`,
      p_rate_limit: 10,
    });
    assert(
      anonymousAssetDirectory.error !== null,
      'Anonymous caller unexpectedly executed the administrator asset directory',
    );

    const normalClient = createSupabaseServerClient(
      { url: privateConfig.url, anonKey },
      { fetch: sessionClientFetch },
    );
    const normalLogin = await normalClient.auth.signInWithPassword({
      email: normal.email,
      password,
    });
    assert(
      !normalLogin.error && normalLogin.data.session !== null,
      'Normal test identity login failed',
    );
    const normalClaims = await normalClient.auth.getClaims(normalLogin.data.session.access_token);
    assert(!normalClaims.error && normalClaims.data !== null, 'Normal test claims failed');
    const normalAuthSessionId = normalClaims.data.claims.session_id;
    assert(typeof normalAuthSessionId === 'string', 'Normal Auth session identifier is missing');
    const normalAdminSession = await serviceClient.rpc('create_admin_session', {
      p_user_id: normal.id,
      p_auth_session_id: normalAuthSessionId,
      p_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      p_assurance_level: 'aal1',
      p_request_id: requestId,
    });
    assert(
      !normalAdminSession.error && authorizationOutcome(normalAdminSession.data) === 'unauthorized',
      'Auth user without admin_users unexpectedly received administrator access',
    );
    const normalApiResponse = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: {
        authorization: `Bearer ${normalLogin.data.session.access_token}`,
        'x-request-id': requestId,
      },
    });
    assert(normalApiResponse.statusCode === 403, 'Normal user unexpectedly accessed the admin API');
    const normalRead = await normalClient.from('admin_users').select('user_id');
    assert(
      normalRead.error !== null || normalRead.data?.length === 0,
      'Normal authenticated user unexpectedly read administrators',
    );
    const normalModerationRead = await normalClient
      .from('player_moderation_states')
      .select('player_profile_id')
      .limit(1);
    assert(
      normalModerationRead.error !== null || normalModerationRead.data?.length === 0,
      'Normal authenticated user unexpectedly read player moderation state',
    );
    const forgedPlayerAudit = await normalClient.from('player_operation_audit_logs').insert({
      player_profile_id: randomUUID(),
      wallet_address_snapshot: '11111111111111111111111111111111',
      event_key: 'player.suspended',
      actor_type: 'system',
      outcome: 'success',
    });
    assert(
      forgedPlayerAudit.error !== null,
      'Normal authenticated user unexpectedly forged a player operation audit',
    );

    const serviceRoleModerationRead = await serviceClient
      .from('player_moderation_states')
      .select('player_profile_id')
      .limit(1);
    assert(
      serviceRoleModerationRead.error !== null,
      'Service role unexpectedly bypassed the Phase 5 RPC-only table boundary',
    );
    const serviceRoleWorldRead = await serviceClient
      .from('world_map_versions')
      .select('id')
      .limit(1);
    assert(
      serviceRoleWorldRead.error !== null,
      'Service role unexpectedly bypassed the Phase 6 RPC-only world boundary',
    );
    const forgedWorldAudit = await normalClient.from('world_audit_events').insert({
      event_key: 'world.preview_opened',
      actor_type: 'system',
      outcome: 'success',
    });
    assert(
      forgedWorldAudit.error !== null,
      'Normal authenticated user unexpectedly forged a world audit event',
    );

    const fakeTokenConfig = await normalClient.from('token_gate_configs').insert({
      environment_key: `phase3-unsafe-${runId}`,
      network: 'solana:devnet',
      symbol: 'STAR',
      required_display_amount: '1000',
    });
    assert(
      fakeTokenConfig.error !== null,
      'Normal authenticated user unexpectedly created token-gate configuration',
    );

    const fakeWalletEvent = await normalClient.from('wallet_access_events').insert({
      event: 'wallet.access.granted',
      result: 'success',
      request_id: requestId,
    });
    assert(
      fakeWalletEvent.error !== null,
      'Normal authenticated user unexpectedly created a trusted wallet-access event',
    );
    const fakeSession = await normalClient.from('admin_sessions').insert({
      user_id: normal.id,
      auth_session_id: randomUUID(),
      status: 'active',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      permission_version_snapshot: 1,
      session_version_snapshot: 1,
    });
    assert(fakeSession.error !== null, 'Normal user unexpectedly created a trusted admin session');

    const fakeAdministrator = await normalClient.from('admin_users').insert({
      user_id: normal.id,
      role_id: randomUUID(),
      status: 'active',
      display_name: 'Unsafe normal user',
    });
    assert(
      fakeAdministrator.error !== null,
      'Normal user unexpectedly created an administrator record',
    );

    const roleMutation = await normalClient
      .from('admin_roles')
      .update({ name: 'Unsafe role mutation' })
      .eq('key', 'super_admin');
    assert(roleMutation.error !== null, 'Normal user unexpectedly modified administrator roles');

    const permissionMutation = await normalClient
      .from('admin_permissions')
      .update({ name: 'Unsafe permission mutation' })
      .eq('key', 'overview.read');
    assert(
      permissionMutation.error !== null,
      'Normal user unexpectedly modified administrator permissions',
    );

    const fakeAudit = await normalClient.from('admin_audit_logs').insert({
      event_key: 'admin.unsafe.created',
      outcome: 'success',
    });
    assert(fakeAudit.error !== null, 'Normal user unexpectedly inserted an audit event');

    const auditMutation = await normalClient
      .from('admin_audit_logs')
      .update({ outcome: 'error' })
      .eq('event_key', 'admin.unsafe.created');
    assert(auditMutation.error !== null, 'Normal user unexpectedly updated an audit event');

    const auditDeletion = await normalClient
      .from('admin_audit_logs')
      .delete()
      .eq('event_key', 'admin.unsafe.created');
    assert(auditDeletion.error !== null, 'Normal user unexpectedly deleted an audit event');

    const [activeSuperAdminCount] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from public.admin_users as admin_user
      join public.admin_roles as role on role.id = admin_user.role_id
      where role.key = 'super_admin' and admin_user.status = 'active'
    `;
    assert(activeSuperAdminCount !== undefined, 'Unable to inspect active Super Admin count');

    if (Number(activeSuperAdminCount.count) === 0) {
      const [superRole] = await sql<{ id: string }[]>`
        select id from public.admin_roles where key = 'super_admin'
      `;
      const [nonSuperRole] = await sql<{ id: string }[]>`
        select id from public.admin_roles where key = 'read_only_analyst'
      `;
      assert(superRole !== undefined, 'Super Admin system role is missing');
      assert(nonSuperRole !== undefined, 'Non-Super-Admin system role is missing');
      const protectedOperations = new Set<string>();

      try {
        await sql.begin(async (transaction) => {
          await transaction`
            insert into public.admin_users (
              user_id, role_id, status, display_name, mfa_required, created_by
            ) values (
              ${normal.id}, ${superRole.id}, 'active', 'Phase 2 Final Super Test', false, ${normal.id}
            )
          `;

          try {
            await transaction.savepoint(async (savepoint) => {
              await savepoint`
                update public.admin_users
                set status = 'disabled', disabled_at = now()
                where user_id = ${normal.id}
              `;
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes('final active Super Admin')) {
              protectedOperations.add('disable');
            } else {
              throw error;
            }
          }

          try {
            await transaction.savepoint(async (savepoint) => {
              await savepoint`
                update public.admin_users
                set status = 'suspended', suspended_at = now()
                where user_id = ${normal.id}
              `;
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes('final active Super Admin')) {
              protectedOperations.add('suspend');
            } else {
              throw error;
            }
          }

          try {
            await transaction.savepoint(async (savepoint) => {
              await savepoint`
                update public.admin_users
                set role_id = ${nonSuperRole.id}
                where user_id = ${normal.id}
              `;
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes('final active Super Admin')) {
              protectedOperations.add('demote');
            } else {
              throw error;
            }
          }

          try {
            await transaction.savepoint(async (savepoint) => {
              await savepoint`
                delete from public.admin_users where user_id = ${normal.id}
              `;
            });
          } catch (error) {
            if (error instanceof Error && error.message.includes('final active Super Admin')) {
              protectedOperations.add('delete');
            } else {
              throw error;
            }
          }

          throw new RollbackHostedFixture();
        });
      } catch (error) {
        if (!(error instanceof RollbackHostedFixture)) {
          throw error;
        }
      }

      assert(
        protectedOperations.size === 4,
        'Final active Super Admin was not protected from every destructive transition',
      );
    } else {
      process.stdout.write(
        'Skipped destructive last-Super-Admin fixture because a pre-existing active Super Admin is present.\n',
      );
    }

    const [role] = await sql<{ id: string }[]>`
      select id from public.admin_roles where key = 'read_only_analyst'
    `;
    assert(role !== undefined, 'Read-only Analyst system role is missing');
    await sql`
      insert into public.admin_users (
        user_id, role_id, status, display_name, mfa_required, created_by,
        suspended_at, disabled_at
      ) values
        (${administrator.id}, ${role.id}, 'active', 'Phase 2 Test Analyst', false, ${administrator.id}, null, null),
        (${invited.id}, ${role.id}, 'invited', 'Phase 2 Invited', false, ${administrator.id}, null, null),
        (${suspended.id}, ${role.id}, 'suspended', 'Phase 2 Suspended', false, ${administrator.id}, now(), null),
        (${disabled.id}, ${role.id}, 'disabled', 'Phase 2 Disabled', false, ${administrator.id}, null, now()),
        (${mfaRequired.id}, ${role.id}, 'active', 'Phase 2 MFA', true, ${administrator.id}, null, null)
    `;

    for (const deniedFixture of [invited, suspended, disabled]) {
      const deniedClient = createSupabaseServerClient(
        { url: privateConfig.url, anonKey },
        { fetch: sessionClientFetch },
      );
      const deniedLogin = await deniedClient.auth.signInWithPassword({
        email: deniedFixture.email,
        password,
      });
      assert(
        !deniedLogin.error && deniedLogin.data.session !== null,
        'Inactive admin Auth login failed',
      );
      const deniedClaims = await deniedClient.auth.getClaims(deniedLogin.data.session.access_token);
      assert(!deniedClaims.error && deniedClaims.data !== null, 'Inactive admin claims failed');
      const deniedAuthSessionId = deniedClaims.data.claims.session_id;
      assert(
        typeof deniedAuthSessionId === 'string',
        'Inactive admin session identifier is missing',
      );
      const deniedSession = await serviceClient.rpc('create_admin_session', {
        p_user_id: deniedFixture.id,
        p_auth_session_id: deniedAuthSessionId,
        p_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        p_assurance_level: 'aal1',
        p_request_id: requestId,
      });
      assert(
        !deniedSession.error && authorizationOutcome(deniedSession.data) === 'unauthorized',
        'Inactive administrator unexpectedly received a trusted session',
      );
    }

    const mfaClient = createSupabaseServerClient(
      { url: privateConfig.url, anonKey },
      { fetch: sessionClientFetch },
    );
    const mfaLogin = await mfaClient.auth.signInWithPassword({
      email: mfaRequired.email,
      password,
    });
    assert(!mfaLogin.error && mfaLogin.data.session !== null, 'MFA fixture Auth login failed');
    const mfaClaims = await mfaClient.auth.getClaims(mfaLogin.data.session.access_token);
    assert(!mfaClaims.error && mfaClaims.data !== null, 'MFA fixture claims failed');
    const mfaAuthSessionId = mfaClaims.data.claims.session_id;
    assert(typeof mfaAuthSessionId === 'string', 'MFA Auth session identifier is missing');
    const pendingMfa = await serviceClient.rpc('create_admin_session', {
      p_user_id: mfaRequired.id,
      p_auth_session_id: mfaAuthSessionId,
      p_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      p_assurance_level: 'aal1',
      p_request_id: requestId,
    });
    assert(
      !pendingMfa.error && authorizationOutcome(pendingMfa.data) === 'mfa_required',
      'First-factor-only MFA session was not denied',
    );

    async function createActiveAdministratorSession() {
      const cookieClient = createCookieBackedSupabaseClient(
        privateConfig.url,
        verifiedAnonKey,
        sessionClientFetch,
      );
      const client = cookieClient.client;
      const login = await client.auth.signInWithPassword({
        email: activeAdministrator.email,
        password,
      });
      assert(!login.error && login.data.session !== null, 'Administrator test login failed');
      const claims = await client.auth.getClaims(login.data.session.access_token);
      assert(!claims.error && claims.data !== null, 'Administrator test claims were not verified');
      const authSessionId = claims.data.claims.session_id;
      assert(typeof authSessionId === 'string', 'Verified Auth session identifier is missing');

      const createdSession = await serviceClient.rpc('create_admin_session', {
        p_user_id: activeAdministrator.id,
        p_auth_session_id: authSessionId,
        p_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        p_assurance_level: 'aal1',
        p_request_id: requestId,
      });
      assert(
        !createdSession.error && authorizationOutcome(createdSession.data) === 'authorized',
        'Trusted administrator test session creation failed',
      );

      return {
        client,
        accessToken: login.data.session.access_token,
        authSessionId,
        cookieHeader: cookieClient.cookieHeader,
      };
    }

    async function createPhase5AccessSession(walletAddress: string, suffix: string) {
      const [tokenConfig] = await sql<
        {
          id: string;
          config_version: number;
          required_amount_raw: string;
          last_validated_slot: string;
        }[]
      >`
        select id, config_version, required_amount_raw::text, last_validated_slot::text
        from public.token_gate_configs
        where environment_key = ${process.env['NODE_ENV'] ?? 'development'}
          and network = ${verifiedConfiguredNetwork}
          and enabled
          and validation_state = 'validated'
      `;
      assert(tokenConfig !== undefined, 'Validated Phase 5 token configuration is missing');

      const challengeRequestId = `phase5-test:${runId}:${suffix}-challenge`;
      const [challenge] = await sql<{ id: string }[]>`
        insert into public.wallet_auth_challenges (
          wallet_address, network, token_gate_config_id, config_version_snapshot,
          nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at,
          request_id, ip_hash, user_agent_hash
        ) values (
          ${walletAddress}, ${verifiedConfiguredNetwork}, ${tokenConfig.id}, ${tokenConfig.config_version},
          ${randomBytes(32).toString('hex')}, ${randomBytes(32).toString('hex')},
          ${new URL(verifiedAdminPortalUrl).host}, ${verifiedAdminPortalUrl}, now(), now() + interval '5 minutes', now(),
          ${challengeRequestId}, ${randomBytes(32).toString('hex')}, null
        )
        returning id
      `;
      assert(challenge !== undefined, 'Phase 5 access challenge fixture was not created');

      const [session] = await sql<{ id: string }[]>`
        insert into public.wallet_access_sessions (
          challenge_id, wallet_address, network, token_gate_config_id,
          config_version_snapshot, session_token_hash, status, observed_balance_raw,
          required_balance_raw, checked_slot, last_balance_check_at, expires_at
        ) values (
          ${challenge.id}, ${walletAddress}, ${verifiedConfiguredNetwork}, ${tokenConfig.id},
          ${tokenConfig.config_version}, ${randomBytes(32).toString('hex')}, 'active',
          ${tokenConfig.required_amount_raw}, ${tokenConfig.required_amount_raw},
          ${tokenConfig.last_validated_slot}, now(), now() + interval '15 minutes'
        )
        returning id
      `;
      assert(session !== undefined, 'Phase 5 access-session fixture was not created');
      return session.id;
    }

    const activeSession = await createActiveAdministratorSession();
    const adminClient = activeSession.client;

    const apiAuthorization = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': requestId,
      },
    });
    assert(apiAuthorization.statusCode === 200, 'Real bearer session was denied by the admin API');

    const socialList = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/social-interactions?page=1&pageSize=10&type=all&status=all&search=',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': `phase8c-test:${runId}:social-list`,
      },
    });
    assert(
      socialList.statusCode === 200,
      `Read-only Analyst social list failed: status=${String(socialList.statusCode)} code=${String(property(property(socialList.json(), 'error'), 'code'))} requestId=${String(property(socialList.json(), 'requestId'))}`,
    );
    const socialAuditDenied = await api.inject({
      method: 'GET',
      url: `/api/v1/admin/social-interactions/${randomUUID()}`,
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': `phase8c-test:${runId}:social-audit-denied`,
      },
    });
    assert(
      socialAuditDenied.statusCode === 403,
      'Read-only Analyst unexpectedly received protected social receipt audit access',
    );
    const socialGraphList = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/social-graph?page=1&pageSize=10&status=all&search=',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': `phase8d-test:${runId}:social-graph-list`,
      },
    });
    assert(
      socialGraphList.statusCode === 200,
      `Read-only Analyst social graph list failed: status=${String(socialGraphList.statusCode)} code=${String(property(property(socialGraphList.json(), 'error'), 'code'))} requestId=${String(property(socialGraphList.json(), 'requestId'))}`,
    );
    const socialGraphAuditDenied = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/social-graph/audit?page=1&pageSize=10&search=',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': `phase8d-test:${runId}:social-graph-audit-denied`,
      },
    });
    assert(
      socialGraphAuditDenied.statusCode === 403,
      'Read-only Analyst unexpectedly received protected friends and parties audit access',
    );
    const socialGraphSettingsDenied = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/social-graph/settings',
      headers: {
        authorization: `Bearer ${activeSession.accessToken}`,
        'x-request-id': `phase8d-test:${runId}:social-graph-settings-denied`,
      },
    });
    assert(
      socialGraphSettingsDenied.statusCode === 403,
      'Read-only Analyst unexpectedly received social graph settings access',
    );

    const overviewUrl = new URL('/overview', adminPortalUrl);
    const overviewResponse = await hostedFetch('admin-overview', overviewUrl, requestId, {
      headers: { cookie: activeSession.cookieHeader(), 'x-request-id': requestId },
      redirect: 'manual',
    });
    const overviewBody = await overviewResponse.text();
    assert(
      overviewResponse.status === 200,
      hostedResponseFailure('admin-overview', overviewUrl, overviewResponse, requestId),
    );
    assert(
      overviewBody.includes('id="overview-title"') &&
        overviewBody.includes('Phase 2 Test Analyst') &&
        overviewBody.includes('Authorized') &&
        !overviewBody.includes('Total players'),
      'The protected overview did not render real administrator context safely',
    );

    const readOnlyTokenAccessUrl = new URL('/token-access', adminPortalUrl);
    const readOnlyTokenAccessResponse = await hostedFetch(
      'read-only-token-access-page',
      readOnlyTokenAccessUrl,
      requestId,
      {
        headers: { cookie: activeSession.cookieHeader(), 'x-request-id': requestId },
        redirect: 'manual',
      },
    );
    const readOnlyTokenAccessBody = await readOnlyTokenAccessResponse.text();
    assert(
      readOnlyTokenAccessResponse.status === 200 &&
        readOnlyTokenAccessBody.includes('id="token-access-title"') &&
        readOnlyTokenAccessBody.includes('Read only') &&
        !readOnlyTokenAccessBody.includes('Configuration unavailable'),
      `Read-only Token Access page did not render trusted hosted configuration. ${hostedResponseFailure(
        'read-only-token-access-page',
        readOnlyTokenAccessUrl,
        readOnlyTokenAccessResponse,
        requestId,
      )}`,
    );

    const normalPortalClient = createCookieBackedSupabaseClient(
      privateConfig.url,
      anonKey,
      sessionClientFetch,
    );
    const normalPortalLogin = await normalPortalClient.client.auth.signInWithPassword({
      email: normal.email,
      password,
    });
    assert(
      !normalPortalLogin.error && normalPortalLogin.data.session !== null,
      'Normal portal test login failed',
    );
    const normalOverviewUrl = new URL('/overview', adminPortalUrl);
    const normalOverviewResponse = await hostedFetch(
      'normal-user-overview-denial',
      normalOverviewUrl,
      requestId,
      {
        headers: { cookie: normalPortalClient.cookieHeader(), 'x-request-id': requestId },
        redirect: 'manual',
      },
    );
    const normalOverviewLocation = normalOverviewResponse.headers.get('location');
    assert(
      normalOverviewResponse.status === 307 &&
        normalOverviewLocation !== null &&
        new URL(normalOverviewLocation, adminPortalUrl).pathname === '/unauthorized',
      `Normal authenticated user was not denied by the protected overview route. ${hostedResponseFailure(
        'normal-user-overview-denial',
        normalOverviewUrl,
        normalOverviewResponse,
        requestId,
      )}`,
    );

    const currentAuthorization = await adminClient.rpc('get_current_admin_authorization');
    assert(
      !currentAuthorization.error &&
        typeof currentAuthorization.data === 'object' &&
        currentAuthorization.data !== null &&
        Reflect.get(currentAuthorization.data, 'outcome') === 'authorized',
      'Active test administrator was not authorized',
    );
    const authorizationContext = Reflect.get(currentAuthorization.data, 'context');
    const grantedPermissions =
      typeof authorizationContext === 'object' && authorizationContext !== null
        ? Reflect.get(authorizationContext, 'permissionKeys')
        : undefined;
    assert(
      Array.isArray(grantedPermissions) &&
        grantedPermissions.length > 0 &&
        grantedPermissions.every(
          (permission) => typeof permission === 'string' && permission.endsWith('.read'),
        ) &&
        !grantedPermissions.includes('roles.read') &&
        !grantedPermissions.includes('audit_logs.read'),
      'Read-only Analyst received a non-read or security-catalog permission',
    );

    const forbiddenWrite = await adminClient
      .from('admin_roles')
      .update({ name: 'Unsafe' })
      .eq('id', role.id);
    assert(
      forbiddenWrite.error !== null,
      'Administrator browser client unexpectedly changed a role',
    );

    const sessionVersionFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_users
      set session_version = session_version + 1
      where user_id = ${administrator.id}
    `;
    const sessionVersionResult = await sessionVersionFixture.client.rpc(
      'get_current_admin_authorization',
    );
    assert(
      !sessionVersionResult.error &&
        authorizationOutcome(sessionVersionResult.data) === 'session_invalid',
      'Session-version mismatch was not denied',
    );

    const permissionVersionFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_users
      set permission_version = permission_version + 1
      where user_id = ${administrator.id}
    `;
    const permissionVersionResult = await permissionVersionFixture.client.rpc(
      'get_current_admin_authorization',
    );
    assert(
      !permissionVersionResult.error &&
        authorizationOutcome(permissionVersionResult.data) === 'session_invalid',
      'Permission-version mismatch was not denied',
    );

    const expirationFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_sessions
      set expires_at = created_at + interval '1 millisecond'
      where auth_session_id = ${expirationFixture.authSessionId}::uuid
    `;
    const expirationResult = await expirationFixture.client.rpc('get_current_admin_authorization');
    assert(
      !expirationResult.error && authorizationOutcome(expirationResult.data) === 'session_invalid',
      'Expired trusted administrator session was not denied',
    );

    const [supportRole] = await sql<{ id: string }[]>`
      select id from public.admin_roles where key = 'customer_support'
    `;
    assert(supportRole !== undefined, 'Customer Support system role is missing');
    const roleChangeFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_users set role_id = ${supportRole.id}
      where user_id = ${administrator.id}
    `;
    const roleChangeResult = await roleChangeFixture.client.rpc('get_current_admin_authorization');
    assert(
      !roleChangeResult.error && authorizationOutcome(roleChangeResult.data) === 'session_invalid',
      'Role change did not invalidate stale authorization',
    );
    await sql`
      update public.admin_users set role_id = ${role.id}
      where user_id = ${administrator.id}
    `;

    const suspensionFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_users
      set status = 'suspended', suspended_at = now()
      where user_id = ${administrator.id}
    `;
    const suspensionResult = await suspensionFixture.client.rpc('get_current_admin_authorization');
    assert(
      !suspensionResult.error && authorizationOutcome(suspensionResult.data) === 'unauthorized',
      'Suspension did not invalidate administrator access',
    );
    await sql`
      update public.admin_users
      set status = 'active', suspended_at = null, suspended_by = null, suspension_reason = null
      where user_id = ${administrator.id}
    `;

    const disabledFixture = await createActiveAdministratorSession();
    await sql`
      update public.admin_users
      set status = 'disabled', disabled_at = now()
      where user_id = ${administrator.id}
    `;
    const disabledResult = await disabledFixture.client.rpc('get_current_admin_authorization');
    assert(
      !disabledResult.error && authorizationOutcome(disabledResult.data) === 'unauthorized',
      'Disabling did not invalidate administrator access',
    );
    await sql`
      update public.admin_users
      set status = 'active', disabled_at = null, disabled_by = null, disabled_reason = null
      where user_id = ${administrator.id}
    `;

    const testRoleKey = `phase2_test_${runId.replaceAll('-', '')}`;
    const [testRole] = await sql<{ id: string }[]>`
      insert into public.admin_roles (key, name, description, is_system)
      values (${testRoleKey}, 'Phase 2 Test Role', 'Owned by one hosted Phase 2 test run.', false)
      returning id
    `;
    assert(testRole !== undefined, 'Test-owned role creation failed');
    testRoleIds.push(testRole.id);
    await sql`
      insert into public.admin_role_permissions (role_id, permission_id)
      select ${testRole.id}, id from public.admin_permissions where key = 'overview.read'
    `;
    await sql`
      update public.admin_users set role_id = ${testRole.id}
      where user_id = ${administrator.id}
    `;
    const mappingChangeFixture = await createActiveAdministratorSession();
    await sql`
      insert into public.admin_role_permissions (role_id, permission_id)
      select ${testRole.id}, id from public.admin_permissions where key = 'players.read'
    `;
    const mappingChangeResult = await mappingChangeFixture.client.rpc(
      'get_current_admin_authorization',
    );
    assert(
      !mappingChangeResult.error &&
        authorizationOutcome(mappingChangeResult.data) === 'session_invalid',
      'Permission mapping change did not invalidate stale authorization',
    );
    await sql`
      update public.admin_users set role_id = ${role.id}
      where user_id = ${administrator.id}
    `;
    await sql`delete from public.admin_roles where id = ${testRole.id}`;

    const logoutFixture = await createActiveAdministratorSession();
    const logoutResponse = await api.inject({
      method: 'DELETE',
      url: '/api/v1/admin/session',
      headers: {
        authorization: `Bearer ${logoutFixture.accessToken}`,
        'x-request-id': requestId,
      },
    });
    assert(logoutResponse.statusCode === 200, 'Current administrator logout failed');
    const afterLogout = await logoutFixture.client.rpc('get_current_admin_authorization');
    assert(
      !afterLogout.error && authorizationOutcome(afterLogout.data) === 'session_invalid',
      'Logged-out trusted administrator session remained authorized',
    );

    const revocationFixture = await createActiveAdministratorSession();

    const revoked = await serviceClient.rpc('revoke_current_admin_session', {
      p_user_id: administrator.id,
      p_auth_session_id: revocationFixture.authSessionId,
      p_request_id: requestId,
      p_reason: 'explicit_revocation',
    });
    assert(!revoked.error && revoked.data === true, 'Trusted session revocation failed');
    const afterRevocation = await revocationFixture.client.rpc('get_current_admin_authorization');
    assert(
      !afterRevocation.error &&
        typeof afterRevocation.data === 'object' &&
        afterRevocation.data !== null &&
        Reflect.get(afterRevocation.data, 'outcome') === 'session_invalid',
      'Revoked trusted administrator session was not denied',
    );
    const apiAfterRevocation = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/me',
      headers: {
        authorization: `Bearer ${revocationFixture.accessToken}`,
        'x-request-id': requestId,
      },
    });
    assert(
      apiAfterRevocation.statusCode === 403,
      'Revoked session was not denied by the admin API',
    );

    const [blockchainOperatorRole] = await sql<{ id: string }[]>`
      select id from public.admin_roles where key = 'blockchain_operator'
    `;
    assert(blockchainOperatorRole !== undefined, 'Blockchain Operator system role is missing');
    await sql`
      update public.admin_users set role_id = ${blockchainOperatorRole.id}
      where user_id = ${administrator.id}
    `;
    const tokenGateFixture = await createActiveAdministratorSession();
    const tokenGateHeaders = {
      accept: 'application/json',
      authorization: `Bearer ${tokenGateFixture.accessToken}`,
      'content-type': 'application/json',
      'x-request-id': requestId,
    };
    const currentTokenGateUrl = new URL('/api/v1/admin/token-gate', apiUrl);
    const currentTokenGateResponse = await hostedFetch(
      'admin-token-gate-read',
      currentTokenGateUrl,
      requestId,
      { headers: tokenGateHeaders },
    );
    assert(
      currentTokenGateResponse.status === 200,
      hostedResponseFailure(
        'admin-token-gate-read',
        currentTokenGateUrl,
        currentTokenGateResponse,
        requestId,
      ),
    );
    const currentTokenGate = await decodeHostedJson<HostedTokenGateResponse>(
      'admin-token-gate-read',
      currentTokenGateUrl,
      currentTokenGateResponse,
      requestId,
    );
    assert(
      currentTokenGate.success && currentTokenGate.data.network === configuredNetwork,
      'Blockchain Operator received an invalid configured token-gate response',
    );

    const mintValidationUrl = new URL('/api/v1/admin/token-gate/validate', apiUrl);
    const mintValidationResponse = await hostedFetch(
      'admin-token-gate-validation',
      mintValidationUrl,
      requestId,
      {
        method: 'POST',
        headers: tokenGateHeaders,
        body: JSON.stringify({
          network: configuredNetwork,
          mintAddress: configuredMintAddress,
          commitment: configuredCommitment,
        }),
      },
    );
    assert(
      mintValidationResponse.status === 200,
      hostedResponseFailure(
        'admin-token-gate-validation',
        mintValidationUrl,
        mintValidationResponse,
        requestId,
      ),
    );

    assert(
      currentTokenGate.data.enabled &&
        currentTokenGate.data.availability === 'available' &&
        currentTokenGate.data.network === configuredNetwork &&
        currentTokenGate.data.mintAddress === configuredMintAddress &&
        currentTokenGate.data.symbol === configuredTokenSymbol &&
        currentTokenGate.data.requiredAmount === configuredRequiredAmount &&
        currentTokenGate.data.commitment === configuredCommitment &&
        currentTokenGate.data.sessionTtlSeconds === 900 &&
        currentTokenGate.data.recheckIntervalSeconds === 300,
      'Hosted tests require the owner-reviewed token gate to be configured before the run; the test refuses to mutate it',
    );

    const configurableTokenAccessUrl = new URL('/token-access', adminPortalUrl);
    const configurableTokenAccessResponse = await hostedFetch(
      'configurable-token-access-page',
      configurableTokenAccessUrl,
      requestId,
      {
        headers: { cookie: tokenGateFixture.cookieHeader(), 'x-request-id': requestId },
        redirect: 'manual',
      },
    );
    const configurableTokenAccessBody = await configurableTokenAccessResponse.text();
    assert(
      configurableTokenAccessResponse.status === 200 &&
        configurableTokenAccessBody.includes('id="token-access-title"') &&
        configurableTokenAccessBody.includes('Configure access') &&
        configurableTokenAccessBody.includes('available') &&
        !configurableTokenAccessBody.includes('Configuration unavailable'),
      `Configurable Token Access page did not render the validated hosted configuration. ${hostedResponseFailure(
        'configurable-token-access-page',
        configurableTokenAccessUrl,
        configurableTokenAccessResponse,
        requestId,
      )}`,
    );

    const phase5WalletAddress = randomBase58Address();
    const phase5DisplayName = `P5Test${runId.replaceAll('-', '').slice(0, 8)}`;
    phase5PendingFixture = {
      walletAddress: phase5WalletAddress,
      adminUserId: administrator.id,
    };
    const phase5Create = await serviceClient.rpc('create_player_profile', {
      p_wallet_address: phase5WalletAddress,
      p_display_name: phase5DisplayName,
      p_appearance_preset: 'river',
      p_request_id: `phase5-test:${runId}:profile-create`,
      p_rate_limit: 10,
    });
    assert(!phase5Create.error, 'Temporary Phase 5 player profile creation failed');
    const [phase5Player] = await sql<{ id: string }[]>`
      select id from public.player_profiles where wallet_address = ${phase5WalletAddress}
    `;
    assert(phase5Player !== undefined, 'Temporary Phase 5 player profile is missing');
    const phase5PlayerId = phase5Player.id;
    phase5PlayerFixture = {
      id: phase5PlayerId,
      walletAddress: phase5WalletAddress,
      adminUserId: administrator.id,
    };

    const phase6WorldLoad = await serviceClient.rpc('get_current_published_world', {
      p_wallet_address: phase5WalletAddress,
      p_request_id: `phase6-test:${runId}:player-detail-world-load`,
      p_rate_limit: 120,
    });
    const phase6WorldLoadStatus = property(phase6WorldLoad.data, 'status');
    const phase5MapVersionId = property(property(phase6WorldLoad.data, 'version'), 'id');
    assert(
      !phase6WorldLoad.error &&
        phase6WorldLoadStatus === 'loaded' &&
        typeof phase5MapVersionId === 'string',
      'Temporary Phase 5 player could not reconcile to the current Phase 6 publication',
    );

    const forbiddenPhase5Action = await api.inject({
      method: 'POST',
      url: `/api/v1/admin/players/${phase5PlayerId}/suspend`,
      headers: {
        authorization: `Bearer ${tokenGateFixture.accessToken}`,
        origin: 'http://localhost:3002',
        'x-request-id': `phase5-test:${runId}:blockchain-denied`,
      },
      payload: { expectedVersion: 1, reason: 'Verify narrow blockchain role boundaries.' },
    });
    assert(
      forbiddenPhase5Action.statusCode === 403,
      'Blockchain Operator unexpectedly performed player moderation',
    );
    const forbiddenDetailRequestId = `phase5-test:${runId}:blockchain-detail-denied`;
    const forbiddenDetailUrl = new URL(
      `/api/v1/admin/players/${phase5PlayerId}`,
      'http://starville.test',
    );
    const forbiddenDetailResponse = await api.inject({
      method: 'GET',
      url: forbiddenDetailUrl.pathname,
      headers: {
        authorization: `Bearer ${tokenGateFixture.accessToken}`,
        'x-request-id': forbiddenDetailRequestId,
      },
    });
    assert(
      forbiddenDetailResponse.statusCode === 403,
      `Blockchain Operator unexpectedly read Phase 5 player detail. ${hostedApiResponseFailure(
        'unauthorized-player-detail',
        forbiddenDetailUrl,
        forbiddenDetailResponse.statusCode,
        forbiddenDetailResponse.body,
        forbiddenDetailRequestId,
        logger.findApiFailure(forbiddenDetailRequestId, forbiddenDetailUrl),
      )}`,
    );
    const forbiddenWorldDirectory = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/worlds?page=1&pageSize=10',
      headers: {
        authorization: `Bearer ${tokenGateFixture.accessToken}`,
        'x-request-id': `phase6-test:${runId}:blockchain-worlds-denied`,
      },
    });
    assert(
      forbiddenWorldDirectory.statusCode === 403,
      'Blockchain Operator unexpectedly accessed world management',
    );
    const forbiddenChatReports = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/multiplayer-chat/reports',
      headers: {
        authorization: `Bearer ${tokenGateFixture.accessToken}`,
        'x-request-id': `phase8b-test:${runId}:blockchain-chat-denied`,
      },
    });
    assert(
      forbiddenChatReports.statusCode === 403,
      'Blockchain Operator unexpectedly accessed protected chat reports',
    );

    const [gameAdministratorRole] = await sql<{ id: string }[]>`
      select id from public.admin_roles where key = 'game_administrator'
    `;
    assert(gameAdministratorRole !== undefined, 'Game Administrator system role is missing');
    await sql`
      update public.admin_users set role_id = ${gameAdministratorRole.id}
      where user_id = ${administrator.id}
    `;
    const gameAdministratorFixture = await createActiveAdministratorSession();
    const phase5ReadHeaders = {
      authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
      'x-request-id': `phase5-test:${runId}:read`,
    };

    const authorizedChatReports = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/multiplayer-chat/reports?page=1&pageSize=10',
      headers: {
        authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
        'x-request-id': `phase8b-test:${runId}:game-admin-chat-read`,
      },
    });
    assert(
      authorizedChatReports.statusCode === 200 &&
        !authorizedChatReports.body.includes('walletAddress') &&
        !authorizedChatReports.body.includes('evidenceText'),
      'Game Administrator could not safely read the bounded chat report queue',
    );

    const directoryResponse = await api.inject({
      method: 'GET',
      url: `/api/v1/admin/players?search=${phase5DisplayName}&status=active&page=1&pageSize=10&sort=display_name&direction=asc`,
      headers: phase5ReadHeaders,
    });
    assert(
      directoryResponse.statusCode === 200 &&
        directoryResponse.body.includes(phase5DisplayName) &&
        !directoryResponse.body.includes('@example.com'),
      'Authorized Phase 5 player directory search was not safe and successful',
    );

    const worldDirectoryResponse = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/worlds?search=&status=all&sort=display_name&direction=asc&limit=10&offset=0',
      headers: {
        authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
        'x-request-id': `phase6-test:${runId}:world-directory`,
      },
    });
    assert(
      worldDirectoryResponse.statusCode === 200 &&
        worldDirectoryResponse.body.includes('Lantern Square') &&
        worldDirectoryResponse.body.includes('Moonpetal Meadow') &&
        worldDirectoryResponse.body.includes('Brooklight Crossing') &&
        worldDirectoryResponse.body.includes('Hearthfield Road') &&
        worldDirectoryResponse.body.includes('Whisperpine Gate'),
      'Authorized Phase 6 world directory did not return the five published maps',
    );

    const detailRequestId = `phase5-test:${runId}:detail`;
    const detailUrl = new URL(`/api/v1/admin/players/${phase5PlayerId}`, 'http://starville.test');
    const detailResponse = await api.inject({
      method: 'GET',
      url: detailUrl.pathname,
      headers: {
        authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
        'x-request-id': detailRequestId,
      },
    });
    let detailBody: unknown;
    try {
      detailBody = JSON.parse(detailResponse.body) as unknown;
    } catch {
      detailBody = null;
    }
    const detailData = property(detailBody, 'data');
    const detailProfile = property(detailData, 'profile');
    const detailModeration = property(detailData, 'moderation');
    const detailAccess = property(detailData, 'access');
    assert(
      detailResponse.statusCode === 200 &&
        property(detailProfile, 'id') === phase5PlayerId &&
        property(detailProfile, 'displayName') === phase5DisplayName &&
        property(detailProfile, 'walletAddress') === phase5WalletAddress &&
        property(detailProfile, 'mapId') === 'lantern-square' &&
        property(detailProfile, 'mapVersionId') === phase5MapVersionId &&
        typeof property(detailProfile, 'gameStateVersion') === 'number' &&
        property(detailProfile, 'stateVersion') === property(detailProfile, 'gameStateVersion') &&
        property(detailModeration, 'status') === 'active' &&
        typeof property(detailAccess, 'activeSessions') === 'number',
      `Authorized Phase 5 player detail failed. ${hostedApiResponseFailure(
        'authorized-player-detail',
        detailUrl,
        detailResponse.statusCode,
        detailResponse.body,
        detailRequestId,
        logger.findApiFailure(detailRequestId, detailUrl),
      )}`,
    );

    const operationsResponse = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/summary',
      headers: phase5ReadHeaders,
    });
    assert(
      operationsResponse.statusCode === 200 &&
        operationsResponse.body.includes(
          'Unexpired, unrevoked sessions valid for the current token config',
        ) &&
        !operationsResponse.body.toLowerCase().includes('playersonline'),
      'Truthful Phase 5 operations summary failed',
    );

    async function currentPlayerState() {
      const [state] = await sql<
        {
          moderation_status: string;
          rename_required: boolean;
          moderation_version: number;
          game_state_version: number;
          safe_position_x: string;
          safe_position_y: string;
          facing_direction: string;
        }[]
      >`
        select
          moderation.status as moderation_status,
          moderation.rename_required,
          moderation.version as moderation_version,
          profile.game_state_version,
          profile.safe_position_x::text,
          profile.safe_position_y::text,
          profile.facing_direction
        from public.player_profiles as profile
        join public.player_moderation_states as moderation
          on moderation.player_profile_id = profile.id
        where profile.id = ${phase5PlayerId}
      `;
      assert(state !== undefined, 'Phase 5 player state disappeared during the test');
      return state;
    }

    async function performPhase5Action(
      action: 'suspend' | 'restore' | 'reset-position' | 'require-rename' | 'revoke-sessions',
      expectedVersion: number,
      suffix: string,
    ) {
      return api.inject({
        method: 'POST',
        url: `/api/v1/admin/players/${phase5PlayerId}/${action}`,
        headers: {
          authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
          origin: 'http://localhost:3002',
          'x-request-id': `phase5-test:${runId}:${suffix}`,
        },
        payload: {
          expectedVersion,
          reason: `Reviewed hosted Phase 5 ${action} fixture operation.`,
        },
      });
    }

    const suspensionSessionId = await createPhase5AccessSession(phase5WalletAddress, 'suspension');
    const initialState = await currentPlayerState();
    const suspendResponse = await performPhase5Action(
      'suspend',
      initialState.moderation_version,
      'suspend',
    );
    assert(suspendResponse.statusCode === 200, 'Authorized player suspension failed');
    const suspendedState = await currentPlayerState();
    const [suspendedSession] = await sql<{ status: string; revoke_reason: string }[]>`
      select status, revoke_reason
      from public.wallet_access_sessions
      where id = ${suspensionSessionId}
    `;
    assert(
      suspendedState.moderation_status === 'suspended' &&
        suspendedSession?.status === 'revoked' &&
        suspendedSession.revoke_reason === 'administrative',
      'Suspension was not atomic with active-session revocation',
    );

    const suspendedEntry = await serviceClient.rpc('load_player_entry_state', {
      p_wallet_address: phase5WalletAddress,
      p_request_id: `phase5-test:${runId}:suspended-entry`,
      p_touch_entry: true,
    });
    assert(
      !suspendedEntry.error &&
        typeof suspendedEntry.data === 'object' &&
        suspendedEntry.data !== null &&
        Reflect.get(suspendedEntry.data, 'entryState') === 'suspended',
      'Suspended player entry was not blocked',
    );
    const suspendedSave = await serviceClient.rpc('save_player_game_state', {
      p_wallet_address: phase5WalletAddress,
      p_map_id: 'lantern-square',
      p_position_x: 13,
      p_position_y: 8,
      p_facing_direction: 'east',
      p_expected_game_state_version: suspendedState.game_state_version,
      p_request_id: `phase5-test:${runId}:suspended-save`,
      p_rate_limit: 60,
    });
    assert(
      !suspendedSave.error &&
        typeof suspendedSave.data === 'object' &&
        suspendedSave.data !== null &&
        Reflect.get(suspendedSave.data, 'status') === 'suspended',
      'Suspended player unexpectedly changed saved state',
    );

    const duplicateSuspend = await performPhase5Action(
      'suspend',
      suspendedState.moderation_version,
      'already-suspended',
    );
    assert(duplicateSuspend.statusCode === 409, 'Already-suspended state was not rejected');
    const staleRestore = await performPhase5Action(
      'restore',
      suspendedState.moderation_version - 1,
      'stale-restore',
    );
    assert(staleRestore.statusCode === 409, 'Stale restoration version was not rejected');
    const suspendedPeriodSessionId = await createPhase5AccessSession(
      phase5WalletAddress,
      'suspended-period',
    );
    const restoreResponse = await performPhase5Action(
      'restore',
      suspendedState.moderation_version,
      'restore',
    );
    assert(restoreResponse.statusCode === 200, 'Authorized player restoration failed');
    const restoredState = await currentPlayerState();
    const [activeAfterRestore] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from public.wallet_access_sessions
      where wallet_address = ${phase5WalletAddress}
        and status = 'active'
        and expires_at > now()
    `;
    const [suspendedPeriodSession] = await sql<{ status: string }[]>`
      select status
      from public.wallet_access_sessions
      where id = ${suspendedPeriodSessionId}
    `;
    assert(
      restoredState.moderation_status === 'active' &&
        activeAfterRestore?.count === '0' &&
        suspendedPeriodSession?.status === 'revoked',
      'Restoration created or retained an access session',
    );

    const renameSessionId = await createPhase5AccessSession(phase5WalletAddress, 'rename');
    const requireRenameResponse = await performPhase5Action(
      'require-rename',
      restoredState.moderation_version,
      'require-rename',
    );
    assert(requireRenameResponse.statusCode === 200, 'Require-rename operation failed');
    const renameState = await currentPlayerState();
    const [renameSession] = await sql<{ status: string }[]>`
      select status from public.wallet_access_sessions where id = ${renameSessionId}
    `;
    assert(
      renameState.rename_required && renameSession?.status === 'revoked',
      'Require-rename did not block entry and revoke the current session',
    );
    const renameEntry = await serviceClient.rpc('load_player_entry_state', {
      p_wallet_address: phase5WalletAddress,
      p_request_id: `phase5-test:${runId}:rename-entry`,
      p_touch_entry: true,
    });
    assert(
      !renameEntry.error &&
        typeof renameEntry.data === 'object' &&
        renameEntry.data !== null &&
        Reflect.get(renameEntry.data, 'entryState') === 'rename_required',
      'Rename-required player was not routed away from the map',
    );

    await createPhase5AccessSession(phase5WalletAddress, 'rename-completion');
    const renameCompletion = await serviceClient.rpc('complete_required_player_rename', {
      p_wallet_address: phase5WalletAddress,
      p_display_name: `${phase5DisplayName}R`,
      p_request_id: `phase5-test:${runId}:rename-complete`,
      p_rate_limit: 20,
    });
    assert(!renameCompletion.error, 'Protected player rename completion failed');
    const renamedState = await currentPlayerState();
    assert(!renamedState.rename_required, 'Valid player rename did not clear the requirement');

    const movedState = await serviceClient.rpc('save_player_game_state', {
      p_wallet_address: phase5WalletAddress,
      p_map_id: 'lantern-square',
      p_position_x: 18,
      p_position_y: 10,
      p_facing_direction: 'east',
      p_expected_game_state_version: renamedState.game_state_version,
      p_request_id: `phase5-test:${runId}:move-before-reset`,
      p_rate_limit: 60,
    });
    assert(!movedState.error, 'Temporary pre-reset state update failed');
    const beforeReset = await currentPlayerState();
    const resetResponse = await performPhase5Action(
      'reset-position',
      beforeReset.moderation_version,
      'reset-position',
    );
    assert(resetResponse.statusCode === 200, 'Authorized position reset failed');
    const resetState = await currentPlayerState();
    assert(
      Number(resetState.safe_position_x) === 12 &&
        Number(resetState.safe_position_y) === 7.5 &&
        resetState.facing_direction === 'south' &&
        resetState.game_state_version > beforeReset.game_state_version,
      'Position reset did not use the reviewed server spawn and increment state version',
    );

    await createPhase5AccessSession(phase5WalletAddress, 'explicit-revocation');
    const beforeRevocation = await currentPlayerState();
    const revokeResponse = await performPhase5Action(
      'revoke-sessions',
      beforeRevocation.moderation_version,
      'revoke-sessions',
    );
    assert(revokeResponse.statusCode === 200, 'Authorized session revocation failed');
    const replayedRevocation = await performPhase5Action(
      'revoke-sessions',
      beforeRevocation.moderation_version,
      'revoke-sessions',
    );
    assert(replayedRevocation.statusCode === 200, 'Idempotent session revocation replay failed');
    const [sessionHistory] = await sql<{ total: string; active: string }[]>`
      select
        count(*)::text as total,
        count(*) filter (where status = 'active' and expires_at > now())::text as active
      from public.wallet_access_sessions
      where wallet_address = ${phase5WalletAddress}
    `;
    assert(
      Number(sessionHistory?.total ?? 0) >= 4 && sessionHistory?.active === '0',
      'Session revocation removed history or left an active session',
    );

    const missingTargetResponse = await api.inject({
      method: 'POST',
      url: `/api/v1/admin/players/${randomUUID()}/reset-position`,
      headers: {
        authorization: `Bearer ${gameAdministratorFixture.accessToken}`,
        origin: 'http://localhost:3002',
        'x-request-id': `phase5-test:${runId}:missing-target`,
      },
      payload: { expectedVersion: 1, reason: 'Verify a missing cross-player target is rejected.' },
    });
    assert(missingTargetResponse.statusCode === 404, 'Missing player target was not rejected');

    const activityResponse = await api.inject({
      method: 'GET',
      url: `/api/v1/admin/players/${phase5PlayerId}/activity?limit=25`,
      headers: phase5ReadHeaders,
    });
    assert(
      activityResponse.statusCode === 200 &&
        activityResponse.body.includes('player.suspended') &&
        activityResponse.body.includes('wallet.access.revoked'),
      'Bounded player and safe access audit history was incomplete',
    );
    const [auditPairCounts] = await sql<{ player_audits: string; admin_audits: string }[]>`
      select
        (
          select count(*)::text from public.player_operation_audit_logs
          where player_profile_id = ${phase5PlayerId}
            and actor_type = 'admin'
        ) as player_audits,
        (
          select count(*)::text from public.admin_audit_logs
          where metadata ->> 'playerProfileId' = ${phase5PlayerId}
        ) as admin_audits
    `;
    assert(
      Number(auditPairCounts?.player_audits ?? 0) >= 5 &&
        auditPairCounts?.player_audits === auditPairCounts?.admin_audits,
      'Player operations did not append matching player and administrator audit records',
    );

    const gameAdminDetailUrl = new URL(`/players/${phase5PlayerId}`, adminPortalUrl);
    const gameAdminDetailPage = await hostedFetch(
      'game-admin-player-detail',
      gameAdminDetailUrl,
      requestId,
      {
        headers: {
          cookie: gameAdministratorFixture.cookieHeader(),
          'x-request-id': requestId,
        },
        redirect: 'manual',
      },
    );
    const gameAdminDetailBody = await gameAdminDetailPage.text();
    assert(
      gameAdminDetailPage.status === 200 &&
        gameAdminDetailBody.includes('Reset to spawn') &&
        gameAdminDetailBody.includes('Require rename'),
      `Permission-aware player-management controls did not render for Game Administrator. ${hostedResponseFailure(
        'game-admin-player-detail',
        gameAdminDetailUrl,
        gameAdminDetailPage,
        requestId,
      )}`,
    );

    await sql`
      update public.admin_users set role_id = ${role.id}
      where user_id = ${administrator.id}
    `;
    const readOnlyPhase5Fixture = await createActiveAdministratorSession();
    const forbiddenReadOnlyChatReports = await api.inject({
      method: 'GET',
      url: '/api/v1/admin/multiplayer-chat/reports',
      headers: {
        authorization: `Bearer ${readOnlyPhase5Fixture.accessToken}`,
        'x-request-id': `phase8b-test:${runId}:analyst-chat-denied`,
      },
    });
    assert(
      forbiddenReadOnlyChatReports.statusCode === 403,
      'Read-only Analyst unexpectedly accessed protected chat report evidence',
    );
    const readOnlyDetailUrl = new URL(`/players/${phase5PlayerId}`, adminPortalUrl);
    const readOnlyDetailPage = await hostedFetch(
      'read-only-player-detail',
      readOnlyDetailUrl,
      requestId,
      {
        headers: { cookie: readOnlyPhase5Fixture.cookieHeader(), 'x-request-id': requestId },
        redirect: 'manual',
      },
    );
    const readOnlyDetailBody = await readOnlyDetailPage.text();
    assert(
      readOnlyDetailPage.status === 200 &&
        !readOnlyDetailBody.includes('Suspend player') &&
        !readOnlyDetailBody.includes('Reset to spawn') &&
        !readOnlyDetailBody.includes('Revoke sessions'),
      `Read-only staff unexpectedly saw enabled player mutation controls. ${hostedResponseFailure(
        'read-only-player-detail',
        readOnlyDetailUrl,
        readOnlyDetailPage,
        requestId,
      )}`,
    );

    const passwordChangeFixture = await createActiveAdministratorSession();
    const nextPassword = `${randomBytes(24).toString('base64url')}!Bb2`;
    const passwordChange = await serviceClient.auth.admin.updateUserById(administrator.id, {
      password: nextPassword,
    });
    assert(!passwordChange.error, 'Test-owned administrator password change failed');

    const [passwordChangedSession] = await sql<{ status: string; revoke_reason: string | null }[]>`
      select status, revoke_reason
      from public.admin_sessions
      where auth_session_id = ${passwordChangeFixture.authSessionId}::uuid
    `;
    assert(
      passwordChangedSession?.status === 'revoked' &&
        passwordChangedSession.revoke_reason === 'password_changed',
      'Password change did not authoritatively revoke the trusted administrator session',
    );

    const auditEvents = await sql<{ event_key: string }[]>`
      select event_key
      from public.admin_audit_logs
      where target_user_id = ${administrator.id}::uuid
        and (
          request_id = ${requestId}
          or metadata ->> 'testRunId' = ${runId}
        )
    `;
    const auditEventKeys = new Set(auditEvents.map(({ event_key: eventKey }) => eventKey));

    for (const expectedEvent of [
      'admin.login.success',
      'admin.logout',
      'admin.session.created',
      'admin.session.revoked',
      'admin.password.changed',
    ]) {
      assert(auditEventKeys.has(expectedEvent), `Missing expected audit event: ${expectedEvent}`);
    }

    process.stdout.write('Hosted RLS, authorization, and revocation assertions passed.\n');
  } finally {
    const cleanupFailures: Array<{ readonly code: string; readonly operation: string }> = [];
    const recordCleanupFailure = (operation: string, error?: unknown, code?: string): void => {
      cleanupFailures.push({
        operation,
        code: code ?? safeHostedTransportCode(error) ?? 'HOSTED_CLEANUP_FAILURE',
      });
    };
    const runCleanupStep = async (
      operation: string,
      task: () => Promise<unknown>,
    ): Promise<void> => {
      try {
        await withHostedCleanupTimeout(task);
      } catch (error) {
        recordCleanupFailure(operation, error);
      }
    };

    await runCleanupStep('close-local-api', async () => api.close());
    const fixtureIds = fixtures.map(({ id }) => id);
    const pendingPlayerFixture = phase5PendingFixture;

    if (phase5PlayerFixture === undefined && pendingPlayerFixture !== undefined) {
      await runCleanupStep('phase5-cleanup-target-lookup', async () => {
        const [pendingProfile] = await sql<{ id: string }[]>`
          select id
          from public.player_profiles
          where wallet_address = ${pendingPlayerFixture.walletAddress}
            and display_name like 'P5Test%'
        `;
        if (pendingProfile !== undefined) {
          phase5PlayerFixture = {
            id: pendingProfile.id,
            walletAddress: pendingPlayerFixture.walletAddress,
            adminUserId: pendingPlayerFixture.adminUserId,
          };
        }
      });
    }

    const cleanupPlayerFixture = phase5PlayerFixture;
    if (cleanupPlayerFixture !== undefined) {
      await runCleanupStep('phase5-player-operations', async () => {
        await sql`select private.cleanup_phase5_test_player(
          ${runId}::uuid,
          ${cleanupPlayerFixture.id}::uuid,
          ${cleanupPlayerFixture.walletAddress},
          ${cleanupPlayerFixture.adminUserId}::uuid
        )`;
        const [remainingPhase5Profile] = await sql<{ count: string }[]>`
          select count(*)::text as count
          from public.player_profiles
          where id = ${cleanupPlayerFixture.id}
        `;
        if (remainingPhase5Profile?.count !== '0') {
          recordCleanupFailure('phase5-player-profile', undefined, 'FIXTURE_REMAINS');
        }
      });
    }

    if (fixtureIds.length > 0) {
      await runCleanupStep('administrator-rows', async () => {
        await sql`delete from public.admin_sessions where user_id in ${sql(fixtureIds)}`;
        await sql`delete from public.admin_users where user_id in ${sql(fixtureIds)}`;
      });
    }

    if (testRoleIds.length > 0) {
      await runCleanupStep('test-roles', async () => {
        await sql`delete from public.admin_roles where id in ${sql(testRoleIds)}`;
      });
    }

    await runCleanupStep('audit-rows', async () => {
      await sql`select private.cleanup_phase2_test_audit_logs(${runId}::uuid)`;
    });

    for (const fixture of fixtures) {
      await runCleanupStep('auth-user', async () => {
        const deleted = await serviceClient.auth.admin.deleteUser(fixture.id);
        if (deleted.error) {
          recordCleanupFailure('auth-user', deleted.error);
        }
      });
    }

    await runCleanupStep('close-database-connection', async () => sql.end({ timeout: 5 }));

    const cleanupDiagnostic = {
      operation: 'hosted-fixture-cleanup',
      requestId,
      result: cleanupFailures.length === 0 ? 'passed' : 'failed',
      failures: cleanupFailures,
    } as const;
    if (cleanupFailures.length > 0) {
      process.stderr.write(`${JSON.stringify(cleanupDiagnostic)}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify(cleanupDiagnostic)}\n`);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Hosted RLS tests failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
