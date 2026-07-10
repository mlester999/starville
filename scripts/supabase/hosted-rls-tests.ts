import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';

import {
  assertDatabaseUrlMatchesProjectRef,
  assertHostedTestsApproved,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from '@starville/supabase/server';
import { createSupabaseSsrServerClient } from '@starville/supabase/ssr';
import postgres from 'postgres';

import { createSupabaseAdminAuthGateway } from '../../apps/api/src/admin-auth-gateway';
import { buildApiApp } from '../../apps/api/src/app';
import type { LogContext, ServiceLogger } from '../../apps/api/src/contracts';
import { safeHostedTargetSummary, verifyCanonicalHostedTarget } from './safety';

interface FixtureUser {
  readonly id: string;
  readonly email: string;
}

class RollbackHostedFixture extends Error {}

class HostedTestLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }

  trace(_message: string, _context?: LogContext): void {}
  debug(_message: string, _context?: LogContext): void {}
  info(_message: string, _context?: LogContext): void {}
  warn(_message: string, _context?: LogContext): void {}
  error(_message: string, _context?: LogContext): void {}
  fatal(_message: string, _context?: LogContext): void {}
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function authorizationOutcome(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'outcome') === 'string'
    ? (Reflect.get(value, 'outcome') as string)
    : undefined;
}

function createCookieBackedSupabaseClient(url: string, anonKey: string) {
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

  assertHostedTestsApproved(target);

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

  if (anonKey === undefined || adminPortalUrl === undefined) {
    throw new Error('Hosted RLS tests require the public Supabase key and admin portal URL');
  }

  const verifiedAnonKey: string = anonKey;

  process.stdout.write(`${JSON.stringify({ testRunId: runId, mode: 'hosted-rls' })}\n`);

  const serviceClient = createSupabaseServiceRoleClient({
    url: privateConfig.url,
    serviceRoleKey: privateConfig.serviceRoleKey,
  });
  const anonymousClient = createSupabaseServerClient({ url: privateConfig.url, anonKey });
  const sql = postgres(privateConfig.databaseUrl, { max: 1, ssl: 'require' });
  const fixtures: FixtureUser[] = [];
  const testRoleIds: string[] = [];
  const api = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3002'],
    },
    logger: new HostedTestLogger(),
    adminAuthGateway: createSupabaseAdminAuthGateway(serviceClient),
    adminSessionTtlMinutes: 60,
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

    const normalClient = createSupabaseServerClient({ url: privateConfig.url, anonKey });
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
      const deniedClient = createSupabaseServerClient({ url: privateConfig.url, anonKey });
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

    const mfaClient = createSupabaseServerClient({ url: privateConfig.url, anonKey });
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
      const cookieClient = createCookieBackedSupabaseClient(privateConfig.url, verifiedAnonKey);
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

    const overviewResponse = await fetch(new URL('/overview', adminPortalUrl), {
      headers: { cookie: activeSession.cookieHeader() },
      redirect: 'manual',
    });
    const overviewBody = await overviewResponse.text();
    assert(overviewResponse.status === 200, 'Active administrator was denied by /overview');
    assert(
      overviewBody.includes('id="overview-title"') &&
        overviewBody.includes('Phase 2 Test Analyst') &&
        overviewBody.includes('Authorized') &&
        !overviewBody.includes('Total players'),
      'The protected overview did not render real administrator context safely',
    );

    const normalPortalClient = createCookieBackedSupabaseClient(privateConfig.url, anonKey);
    const normalPortalLogin = await normalPortalClient.client.auth.signInWithPassword({
      email: normal.email,
      password,
    });
    assert(
      !normalPortalLogin.error && normalPortalLogin.data.session !== null,
      'Normal portal test login failed',
    );
    const normalOverviewResponse = await fetch(new URL('/overview', adminPortalUrl), {
      headers: { cookie: normalPortalClient.cookieHeader() },
      redirect: 'manual',
    });
    const normalOverviewLocation = normalOverviewResponse.headers.get('location');
    assert(
      normalOverviewResponse.status === 307 &&
        normalOverviewLocation !== null &&
        new URL(normalOverviewLocation, adminPortalUrl).pathname === '/unauthorized',
      'Normal authenticated user was not denied by the protected overview route',
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

    process.stdout.write('Hosted RLS, authorization, revocation, and cleanup assertions passed.\n');
  } finally {
    await api.close();
    const fixtureIds = fixtures.map(({ id }) => id);
    const cleanupFailures: string[] = [];

    if (fixtureIds.length > 0) {
      try {
        await sql`delete from public.admin_sessions where user_id in ${sql(fixtureIds)}`;
        await sql`delete from public.admin_users where user_id in ${sql(fixtureIds)}`;
      } catch {
        cleanupFailures.push('test-owned administrator rows');
      }
    }

    if (testRoleIds.length > 0) {
      try {
        await sql`delete from public.admin_roles where id in ${sql(testRoleIds)}`;
      } catch {
        cleanupFailures.push('test-owned roles');
      }
    }

    try {
      await sql`select private.cleanup_phase2_test_audit_logs(${runId}::uuid)`;
    } catch {
      cleanupFailures.push('test-owned audit rows');
    }

    for (const fixture of fixtures) {
      const deleted = await serviceClient.auth.admin.deleteUser(fixture.id);
      if (deleted.error) {
        process.stderr.write(`Cleanup failed for test-owned Auth user ${fixture.id}.\n`);
        cleanupFailures.push(`Auth user ${fixture.id}`);
      }
    }

    await sql.end();

    if (cleanupFailures.length > 0) {
      process.stderr.write(`Hosted cleanup failed for: ${cleanupFailures.join(', ')}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Hosted RLS tests failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
