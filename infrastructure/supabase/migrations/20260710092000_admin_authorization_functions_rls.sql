-- Starville Phase 2: trusted authorization evaluation, session operations, bootstrap, and RLS.

create or replace function private.current_auth_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return nullif(auth.jwt() ->> 'session_id', '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.current_auth_aal()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when auth.jwt() ->> 'aal' = 'aal2' then 'aal2' else 'aal1' end;
$$;

create or replace function private.evaluate_admin_authorization(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  administrator record;
  trusted_session record;
  permission_keys jsonb;
  normalized_aal text := case when p_assurance_level = 'aal2' then 'aal2' else 'aal1' end;
begin
  if p_user_id is null or p_auth_session_id is null then
    return jsonb_build_object('outcome', 'unauthenticated');
  end if;

  if not exists (
    select 1
    from auth.sessions as auth_session
    where auth_session.id = p_auth_session_id and auth_session.user_id = p_user_id
  ) then
    return jsonb_build_object('outcome', 'unauthenticated');
  end if;

  select
    admin_user.user_id,
    admin_user.status,
    admin_user.display_name,
    admin_user.mfa_required,
    admin_user.permission_version,
    admin_user.session_version,
    admin_user.last_login_at,
    role.id as role_id,
    role.key as role_key,
    role.name as role_name
  into administrator
  from public.admin_users as admin_user
  join public.admin_roles as role on role.id = admin_user.role_id
  where admin_user.user_id = p_user_id;

  if not found or administrator.status <> 'active' then
    return jsonb_build_object('outcome', 'unauthorized');
  end if;

  select admin_session.*
  into trusted_session
  from public.admin_sessions as admin_session
  where admin_session.user_id = p_user_id
    and admin_session.auth_session_id = p_auth_session_id;

  if not found
     or trusted_session.status in ('revoked', 'expired')
     or trusted_session.expires_at <= now()
     or trusted_session.session_version_snapshot <> administrator.session_version
     or trusted_session.permission_version_snapshot <> administrator.permission_version then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  if trusted_session.status = 'pending_mfa'
     or (administrator.mfa_required and normalized_aal <> 'aal2') then
    return jsonb_build_object('outcome', 'mfa_required');
  end if;

  if trusted_session.status <> 'active' then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  select coalesce(jsonb_agg(permission.key order by permission.key), '[]'::jsonb)
  into permission_keys
  from public.admin_role_permissions as role_permission
  join public.admin_permissions as permission on permission.id = role_permission.permission_id
  where role_permission.role_id = administrator.role_id;

  return jsonb_build_object(
    'outcome', 'authorized',
    'context', jsonb_build_object(
      'userId', administrator.user_id,
      'displayName', administrator.display_name,
      'adminStatus', administrator.status,
      'roleKey', administrator.role_key,
      'roleName', administrator.role_name,
      'permissionKeys', permission_keys,
      'adminSessionId', trusted_session.id,
      'sessionExpiresAt', trusted_session.expires_at,
      'mfaRequired', administrator.mfa_required,
      'assuranceLevel', normalized_aal,
      'lastLoginAt', administrator.last_login_at
    )
  );
end;
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.evaluate_admin_authorization(
    auth.uid(),
    private.current_auth_session_id(),
    private.current_auth_aal()
  ) ->> 'outcome' = 'authorized';
$$;

create or replace function private.current_admin_session_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_admin();
$$;

create or replace function private.current_admin_role_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when result ->> 'outcome' = 'authorized' then result -> 'context' ->> 'roleKey'
    else null
  end
  from (
    select private.evaluate_admin_authorization(
      auth.uid(),
      private.current_auth_session_id(),
      private.current_auth_aal()
    ) as result
  ) as authorization_result;
$$;

create or replace function private.has_admin_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    result ->> 'outcome' = 'authorized'
      and (result -> 'context' -> 'permissionKeys') ? p_permission_key,
    false
  )
  from (
    select private.evaluate_admin_authorization(
      auth.uid(),
      private.current_auth_session_id(),
      private.current_auth_aal()
    ) as result
  ) as authorization_result;
$$;

create or replace function public.get_current_admin_authorization()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.evaluate_admin_authorization(
    auth.uid(),
    private.current_auth_session_id(),
    private.current_auth_aal()
  );
$$;

comment on function public.get_current_admin_authorization() is
  'Returns only the current caller trusted administrator context; never creates or refreshes a session.';

create or replace function public.get_admin_authorization_for_verified_session(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.evaluate_admin_authorization(p_user_id, p_auth_session_id, p_assurance_level);
$$;

create or replace function public.create_admin_session(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_expires_at timestamptz,
  p_assurance_level text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  administrator record;
  existing_session public.admin_sessions%rowtype;
  created_session_id uuid;
  intended_status text;
begin
  if p_request_id is not null and char_length(p_request_id) > 128 then
    raise exception 'Request ID is too long';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '60 minutes' then
    raise exception 'Administrator session expiration is outside the allowed range';
  end if;

  if p_assurance_level not in ('aal1', 'aal2') then
    raise exception 'Invalid assurance level';
  end if;

  if not exists (
    select 1 from auth.sessions as auth_session
    where auth_session.id = p_auth_session_id and auth_session.user_id = p_user_id
  ) then
    return jsonb_build_object('outcome', 'unauthenticated');
  end if;

  select
    admin_user.user_id,
    admin_user.status,
    admin_user.mfa_required,
    admin_user.permission_version,
    admin_user.session_version,
    admin_user.role_id
  into administrator
  from public.admin_users as admin_user
  join public.admin_roles as role on role.id = admin_user.role_id
  where admin_user.user_id = p_user_id;

  if not found or administrator.status <> 'active' then
    insert into public.admin_audit_logs
      (event_key, actor_user_id, target_user_id, request_id, outcome, reason_code)
    values
      ('admin.login.denied', p_user_id, p_user_id, p_request_id, 'denied', 'ADMIN_ACCESS_DENIED');
    return jsonb_build_object('outcome', 'unauthorized');
  end if;

  select * into existing_session
  from public.admin_sessions
  where auth_session_id = p_auth_session_id
  for update;

  if found then
    if existing_session.user_id <> p_user_id
       or existing_session.status in ('revoked', 'expired')
       or existing_session.expires_at <= now()
       or existing_session.permission_version_snapshot <> administrator.permission_version
       or existing_session.session_version_snapshot <> administrator.session_version then
      return jsonb_build_object('outcome', 'session_invalid');
    end if;

    if existing_session.status = 'pending_mfa' and p_assurance_level = 'aal2' then
      update public.admin_sessions
      set status = 'active', last_seen_at = now()
      where id = existing_session.id;

      update public.admin_users set last_login_at = now() where user_id = p_user_id;

      insert into public.admin_audit_logs
        (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome)
      values
        ('admin.mfa.verified', p_user_id, p_user_id, existing_session.id, p_request_id, 'success'),
        ('admin.login.success', p_user_id, p_user_id, existing_session.id, p_request_id, 'success');
    end if;

    return private.evaluate_admin_authorization(p_user_id, p_auth_session_id, p_assurance_level);
  end if;

  -- A missing trusted session may only be created for a freshly issued Auth session.
  if not exists (
    select 1 from auth.sessions as auth_session
    where auth_session.id = p_auth_session_id
      and auth_session.user_id = p_user_id
      and auth_session.created_at >= now() - interval '5 minutes'
  ) then
    return jsonb_build_object('outcome', 'session_invalid');
  end if;

  intended_status := case
    when administrator.mfa_required and p_assurance_level <> 'aal2' then 'pending_mfa'
    else 'active'
  end;

  insert into public.admin_sessions (
    user_id,
    auth_session_id,
    status,
    expires_at,
    permission_version_snapshot,
    session_version_snapshot
  ) values (
    p_user_id,
    p_auth_session_id,
    intended_status,
    p_expires_at,
    administrator.permission_version,
    administrator.session_version
  )
  returning id into created_session_id;

  insert into public.admin_audit_logs
    (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome)
  values
    ('admin.session.created', p_user_id, p_user_id, created_session_id, p_request_id, 'success');

  if intended_status = 'active' then
    update public.admin_users set last_login_at = now() where user_id = p_user_id;
    insert into public.admin_audit_logs
      (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome)
    values
      ('admin.login.success', p_user_id, p_user_id, created_session_id, p_request_id, 'success');
  else
    insert into public.admin_audit_logs
      (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome, reason_code)
    values
      ('admin.login.mfa_required', p_user_id, p_user_id, created_session_id, p_request_id, 'denied', 'MFA_REQUIRED');
  end if;

  return private.evaluate_admin_authorization(p_user_id, p_auth_session_id, p_assurance_level);
end;
$$;

create or replace function public.revoke_current_admin_session(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_request_id text default null,
  p_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_session_id uuid;
begin
  if p_reason not in ('logout', 'explicit_revocation') then
    raise exception 'Unsupported administrator session revocation reason';
  end if;

  update public.admin_sessions
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = p_user_id,
      revoke_reason = p_reason
  where user_id = p_user_id
    and auth_session_id = p_auth_session_id
    and status in ('pending_mfa', 'active')
  returning id into revoked_session_id;

  if revoked_session_id is null then
    return false;
  end if;

  insert into public.admin_audit_logs
    (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome)
  values
    ('admin.session.revoked', p_user_id, p_user_id, revoked_session_id, p_request_id, 'success');

  if p_reason = 'logout' then
    insert into public.admin_audit_logs
      (event_key, actor_user_id, target_user_id, admin_session_id, request_id, outcome)
    values
      ('admin.logout', p_user_id, p_user_id, revoked_session_id, p_request_id, 'success');
  end if;

  return true;
end;
$$;

create or replace function private.invalidate_admin_sessions_after_auth_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  test_run_id text;
begin
  if new.encrypted_password is not distinct from old.encrypted_password then
    return new;
  end if;

  update public.admin_users
  set session_version = session_version + 1
  where user_id = new.id;

  if not found then
    return new;
  end if;

  update public.admin_sessions
  set status = 'revoked',
      revoked_at = now(),
      revoked_by = new.id,
      revoke_reason = 'password_changed'
  where user_id = new.id and status in ('pending_mfa', 'active');

  test_run_id := nullif(
    coalesce(new.raw_app_meta_data, '{}'::jsonb) ->> 'starville_test_run_id',
    ''
  );

  insert into public.admin_audit_logs
    (event_key, actor_user_id, target_user_id, outcome, metadata)
  values
    (
      'admin.password.changed',
      new.id,
      new.id,
      'success',
      jsonb_strip_nulls(jsonb_build_object('testRunId', test_run_id))
    );

  return new;
end;
$$;

create trigger starville_admin_password_changed
after update of encrypted_password on auth.users
for each row execute function private.invalidate_admin_sessions_after_auth_password_change();

create or replace function public.record_admin_authorization_denial(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_request_id text,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_session_id uuid;
begin
  if p_reason_code not in (
    'ADMIN_ACCESS_DENIED',
    'ADMIN_SESSION_INVALID',
    'MFA_REQUIRED',
    'MISSING_PERMISSION'
  ) then
    raise exception 'Unsupported administrator authorization denial reason';
  end if;

  select id into trusted_session_id
  from public.admin_sessions
  where user_id = p_user_id and auth_session_id = p_auth_session_id;

  insert into public.admin_audit_logs (
    event_key,
    actor_user_id,
    target_user_id,
    admin_session_id,
    request_id,
    outcome,
    reason_code
  ) values (
    case when p_reason_code = 'MISSING_PERMISSION'
      then 'admin.permission.denied'
      else 'admin.access.denied'
    end,
    p_user_id,
    p_user_id,
    trusted_session_id,
    p_request_id,
    'denied',
    p_reason_code
  );
end;
$$;

create or replace function private.audit_admin_user_authorization_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role_key text;
  next_role_key text;
begin
  if new.role_id is distinct from old.role_id then
    select key into previous_role_key from public.admin_roles where id = old.role_id;
    select key into next_role_key from public.admin_roles where id = new.role_id;

    insert into public.admin_audit_logs (
      event_key, actor_user_id, target_user_id, outcome, metadata
    ) values (
      'admin.role.changed',
      auth.uid(),
      new.user_id,
      'success',
      jsonb_strip_nulls(jsonb_build_object(
        'previousRoleKey', previous_role_key,
        'newRoleKey', next_role_key,
        'testRunId', nullif(current_setting('starville.test_run_id', true), '')
      ))
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.admin_audit_logs (
      event_key, actor_user_id, target_user_id, outcome, metadata
    ) values (
      'admin.status.changed',
      auth.uid(),
      new.user_id,
      'success',
      jsonb_strip_nulls(jsonb_build_object(
        'previousStatus', old.status,
        'newStatus', new.status,
        'testRunId', nullif(current_setting('starville.test_run_id', true), '')
      ))
    );
  end if;

  return new;
end;
$$;

create trigger admin_users_audit_authorization_change
after update of role_id, status on public.admin_users
for each row execute function private.audit_admin_user_authorization_change();

create or replace function public.preview_first_super_admin_bootstrap(
  p_user_id uuid,
  p_require_mfa boolean default false,
  p_activate_invited boolean default false,
  p_expected_status text default null,
  p_expected_role_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  existing_administrator record;
  operation text;
begin
  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_user_id) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'AUTH_USER_NOT_FOUND');
  end if;

  if p_activate_invited then
    if p_expected_status is distinct from 'invited' or p_expected_role_key is null then
      return jsonb_build_object('allowed', false, 'reasonCode', 'EXPECTED_STATE_REQUIRED');
    end if;
  elsif p_expected_status is not null or p_expected_role_key is not null then
    return jsonb_build_object('allowed', false, 'reasonCode', 'UNEXPECTED_EXPECTED_STATE');
  end if;

  if exists (
    select 1
    from public.admin_users as admin_user
    join public.admin_roles as role on role.id = admin_user.role_id
    where role.key = 'super_admin' and admin_user.status = 'active'
  ) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'ACTIVE_SUPER_ADMIN_EXISTS');
  end if;

  if not exists (
    select 1 from public.admin_roles where key = 'super_admin' and is_system
  ) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'SYSTEM_ROLE_MISSING');
  end if;

  select admin_user.status, role.key as role_key
  into existing_administrator
  from public.admin_users as admin_user
  join public.admin_roles as role on role.id = admin_user.role_id
  where admin_user.user_id = p_user_id;

  if found then
    if not p_activate_invited then
      return jsonb_build_object('allowed', false, 'reasonCode', 'ACTIVATION_REQUIRED');
    end if;

    if existing_administrator.status is distinct from p_expected_status then
      return jsonb_build_object('allowed', false, 'reasonCode', 'EXPECTED_STATUS_MISMATCH');
    end if;

    if existing_administrator.role_key is distinct from p_expected_role_key then
      return jsonb_build_object('allowed', false, 'reasonCode', 'EXPECTED_ROLE_MISMATCH');
    end if;

    operation := 'activate_invited';
  else
    if p_activate_invited then
      return jsonb_build_object('allowed', false, 'reasonCode', 'ADMIN_RECORD_NOT_FOUND');
    end if;

    operation := 'create';
  end if;

  if p_require_mfa and not exists (
    select 1
    from auth.mfa_factors as factor
    where factor.user_id = p_user_id
      and factor.status = 'verified'
      and factor.factor_type = 'totp'
  ) then
    return jsonb_build_object('allowed', false, 'reasonCode', 'VERIFIED_TOTP_FACTOR_REQUIRED');
  end if;

  return jsonb_build_object(
    'allowed', true,
    'reasonCode', null,
    'operation', operation
  );
end;
$$;

create or replace function public.bootstrap_first_super_admin(
  p_user_id uuid,
  p_display_name text,
  p_require_mfa boolean,
  p_activate_invited boolean default false,
  p_expected_status text default null,
  p_expected_role_key text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  super_admin_role_id uuid;
  existing_administrator record;
  operation text;
begin
  perform pg_advisory_xact_lock(hashtext('starville.bootstrap_first_super_admin'));

  if p_request_id is not null and char_length(p_request_id) > 128 then
    raise exception 'Request ID is too long';
  end if;

  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_user_id) then
    raise exception 'Bootstrap Auth user does not exist';
  end if;

  if p_activate_invited then
    if p_expected_status is distinct from 'invited' or p_expected_role_key is null then
      raise exception 'Invited-administrator activation requires its expected role and invited state';
    end if;

    if p_display_name is not null then
      raise exception 'Invited-administrator activation preserves the existing display name';
    end if;
  elsif p_expected_status is not null or p_expected_role_key is not null then
    raise exception 'Expected administrator state is only valid for explicit invited activation';
  elsif p_display_name is null
     or char_length(trim(p_display_name)) not between 1 and 100 then
    raise exception 'Administrator display name is invalid';
  end if;

  if exists (
    select 1
    from public.admin_users as admin_user
    join public.admin_roles as role on role.id = admin_user.role_id
    where role.key = 'super_admin' and admin_user.status = 'active'
  ) then
    raise exception 'An active Super Admin already exists';
  end if;

  select admin_user.status, role.key as role_key
  into existing_administrator
  from public.admin_users as admin_user
  join public.admin_roles as role on role.id = admin_user.role_id
  where admin_user.user_id = p_user_id
  for update of admin_user;

  if found then
    if not p_activate_invited then
      raise exception 'Bootstrap refuses to overwrite an existing administrator record';
    end if;

    if existing_administrator.status is distinct from p_expected_status then
      raise exception 'Bootstrap invited-administrator status no longer matches the expected state';
    end if;

    if existing_administrator.role_key is distinct from p_expected_role_key then
      raise exception 'Bootstrap invited-administrator role no longer matches the expected state';
    end if;

    operation := 'activate_invited';
  else
    if p_activate_invited then
      raise exception 'Bootstrap invited-administrator record no longer exists';
    end if;

    operation := 'create';
  end if;

  if p_require_mfa and not exists (
    select 1
    from auth.mfa_factors as factor
    where factor.user_id = p_user_id
      and factor.status = 'verified'
      and factor.factor_type = 'totp'
  ) then
    raise exception 'Bootstrap MFA requirement needs an existing verified TOTP factor';
  end if;

  select id into super_admin_role_id
  from public.admin_roles
  where key = 'super_admin' and is_system
  for update;

  if super_admin_role_id is null then
    raise exception 'System Super Admin role is missing';
  end if;

  if operation = 'create' then
    insert into public.admin_users (
      user_id,
      role_id,
      status,
      display_name,
      mfa_required,
      created_by
    ) values (
      p_user_id,
      super_admin_role_id,
      'active',
      trim(p_display_name),
      p_require_mfa,
      p_user_id
    );
  else
    update public.admin_users
    set role_id = super_admin_role_id,
        status = 'active',
        mfa_required = p_require_mfa,
        suspended_at = null,
        suspended_by = null,
        suspension_reason = null,
        disabled_at = null,
        disabled_by = null,
        disabled_reason = null
    where user_id = p_user_id;
  end if;

  insert into public.admin_audit_logs
    (event_key, actor_user_id, target_user_id, request_id, outcome, metadata)
  values
    (
      'admin.bootstrap.created',
      p_user_id,
      p_user_id,
      p_request_id,
      'success',
      jsonb_build_object('operation', operation)
    );

  return jsonb_build_object(
    'operation', operation,
    'userId', p_user_id,
    'roleKey', 'super_admin'
  );
end;
$$;

-- Authenticated browser clients receive read access only when the trusted session
-- itself carries the permission required by the policy. There are no browser writes.
grant usage on schema private to authenticated;
grant execute on function private.has_admin_permission(text) to authenticated;

grant select on table public.admin_roles to authenticated;
grant select on table public.admin_permissions to authenticated;
grant select on table public.admin_role_permissions to authenticated;
grant select on table public.admin_users to authenticated;
grant select on table public.admin_sessions to authenticated;
grant select on table public.admin_audit_logs to authenticated;

create policy admin_roles_permission_read
on public.admin_roles for select to authenticated
using (private.has_admin_permission('roles.read'));

create policy admin_permissions_permission_read
on public.admin_permissions for select to authenticated
using (private.has_admin_permission('roles.read'));

create policy admin_role_permissions_permission_read
on public.admin_role_permissions for select to authenticated
using (private.has_admin_permission('roles.read'));

create policy admin_users_permission_read
on public.admin_users for select to authenticated
using (private.has_admin_permission('roles.read'));

create policy admin_sessions_permission_read
on public.admin_sessions for select to authenticated
using (private.has_admin_permission('roles.manage'));

create policy admin_audit_logs_permission_read
on public.admin_audit_logs for select to authenticated
using (private.has_admin_permission('audit_logs.read'));

revoke all on function private.current_auth_session_id() from public, anon, authenticated, service_role;
revoke all on function private.current_auth_aal() from public, anon, authenticated, service_role;
revoke all on function private.evaluate_admin_authorization(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.is_active_admin() from public, anon, authenticated, service_role;
revoke all on function private.current_admin_session_valid() from public, anon, authenticated, service_role;
revoke all on function private.current_admin_role_key() from public, anon, authenticated, service_role;
revoke all on function private.has_admin_permission(text) from public, anon, authenticated, service_role;
revoke all on function private.audit_admin_user_authorization_change() from public, anon, authenticated, service_role;
revoke all on function private.invalidate_admin_sessions_after_auth_password_change() from public, anon, authenticated, service_role;
grant execute on function private.has_admin_permission(text) to authenticated;

revoke all on function public.get_current_admin_authorization() from public, anon, authenticated, service_role;
grant execute on function public.get_current_admin_authorization() to authenticated;

revoke all on function public.get_admin_authorization_for_verified_session(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_session(uuid, uuid, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_current_admin_session(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.record_admin_authorization_denial(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_first_super_admin_bootstrap(uuid, boolean, boolean, text, text) from public, anon, authenticated, service_role;
revoke all on function public.bootstrap_first_super_admin(uuid, text, boolean, boolean, text, text, text) from public, anon, authenticated, service_role;

grant execute on function public.get_admin_authorization_for_verified_session(uuid, uuid, text) to service_role;
grant execute on function public.create_admin_session(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.revoke_current_admin_session(uuid, uuid, text, text) to service_role;
grant execute on function public.record_admin_authorization_denial(uuid, uuid, text, text) to service_role;
grant execute on function public.preview_first_super_admin_bootstrap(uuid, boolean, boolean, text, text) to service_role;
grant execute on function public.bootstrap_first_super_admin(uuid, text, boolean, boolean, text, text, text) to service_role;

-- PostgreSQL-only cleanup for exact test-run audit rows. It is deliberately not
-- exposed to anon, authenticated, or service_role and cannot delete other runs.
create or replace function private.protect_admin_audit_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_user in ('postgres', 'supabase_admin')
     and current_setting('starville.test_cleanup_run_id', true) is not null
     and (
       old.metadata ->> 'testRunId' = current_setting('starville.test_cleanup_run_id', true)
       or old.request_id = 'phase2-test:' || current_setting('starville.test_cleanup_run_id', true)
     ) then
    return old;
  end if;

  raise exception 'Administrator audit logs are append-only';
end;
$$;

create or replace function private.cleanup_phase2_test_audit_logs(p_test_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform set_config('starville.test_cleanup_run_id', p_test_run_id::text, true);
  delete from public.admin_audit_logs
  where metadata ->> 'testRunId' = p_test_run_id::text
     or request_id = 'phase2-test:' || p_test_run_id::text;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.protect_admin_audit_log() from public, anon, authenticated, service_role;
revoke all on function private.cleanup_phase2_test_audit_logs(uuid) from public, anon, authenticated, service_role;
