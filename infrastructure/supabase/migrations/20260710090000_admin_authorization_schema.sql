-- Starville Phase 2: trusted administrator authorization storage.
-- This migration intentionally creates no gameplay, wallet, or economy data.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text not null check (char_length(name) between 1 and 100),
  description text not null check (char_length(description) between 1 and 500),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_roles is
  'Trusted administrator roles. Stable system keys are protected by database triggers.';

create table public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 500),
  category text not null check (category ~ '^[a-z][a-z0-9_]{1,62}$'),
  is_sensitive boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_permissions is
  'Stable server-authoritative permission catalog; browser values never grant access.';

create table public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index admin_role_permissions_permission_id_idx
  on public.admin_role_permissions(permission_id);
create index admin_role_permissions_created_by_idx
  on public.admin_role_permissions(created_by)
  where created_by is not null;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'disabled')),
  display_name text not null check (char_length(display_name) between 1 and 100),
  mfa_required boolean not null default false,
  permission_version integer not null default 1 check (permission_version > 0),
  session_version integer not null default 1 check (session_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  suspension_reason text check (suspension_reason is null or char_length(suspension_reason) between 1 and 500),
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) between 1 and 500),
  constraint admin_users_suspension_state_check check (
    (status = 'suspended') = (suspended_at is not null)
    and ((suspended_at is null and suspended_by is null and suspension_reason is null) or suspended_at is not null)
  ),
  constraint admin_users_disabled_state_check check (
    (status = 'disabled') = (disabled_at is not null)
    and ((disabled_at is null and disabled_by is null and disabled_reason is null) or disabled_at is not null)
  )
);

comment on table public.admin_users is
  'Authorization records linked to auth.users. Auth identity without an active row is not an administrator.';

create index admin_users_role_id_idx on public.admin_users(role_id);
create index admin_users_active_role_idx on public.admin_users(role_id, user_id)
  where status = 'active';
create index admin_users_created_by_idx on public.admin_users(created_by)
  where created_by is not null;
create index admin_users_suspended_by_idx on public.admin_users(suspended_by)
  where suspended_by is not null;
create index admin_users_disabled_by_idx on public.admin_users(disabled_by)
  where disabled_by is not null;

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(user_id) on delete restrict,
  auth_session_id uuid not null unique,
  status text not null check (status in ('pending_mfa', 'active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) between 1 and 200),
  permission_version_snapshot integer not null check (permission_version_snapshot > 0),
  session_version_snapshot integer not null check (session_version_snapshot > 0),
  constraint admin_sessions_expiration_check check (expires_at > created_at),
  constraint admin_sessions_revocation_check check (
    (status = 'revoked' and revoked_at is not null and revoke_reason is not null)
    or (status <> 'revoked' and revoked_at is null and revoked_by is null and revoke_reason is null)
  )
);

comment on table public.admin_sessions is
  'Revocable administrator sessions bound to a verified Supabase Auth session identifier; no tokens are stored.';

create index admin_sessions_user_id_idx on public.admin_sessions(user_id, created_at desc);
create index admin_sessions_active_expiry_idx on public.admin_sessions(expires_at)
  where status in ('pending_mfa', 'active');
create index admin_sessions_revoked_by_idx on public.admin_sessions(revoked_by)
  where revoked_by is not null;

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  actor_user_id uuid,
  target_user_id uuid,
  admin_session_id uuid,
  request_id text check (request_id is null or char_length(request_id) between 1 and 128),
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_logs is
  'Append-only security audit events. Identity UUIDs intentionally remain historical rather than using mutating ON DELETE foreign keys. Secrets, credentials, raw IPs, and raw user agents are forbidden.';

create index admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_actor_idx on public.admin_audit_logs(actor_user_id, created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs(target_user_id, created_at desc);
create index admin_audit_logs_event_idx on public.admin_audit_logs(event_key, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger admin_roles_set_updated_at
before update on public.admin_roles
for each row execute function private.set_updated_at();

create trigger admin_permissions_set_updated_at
before update on public.admin_permissions
for each row execute function private.set_updated_at();

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function private.set_updated_at();

create or replace function private.protect_system_catalog_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_system and tg_op = 'DELETE' then
    raise exception 'System authorization metadata cannot be deleted';
  end if;

  if old.is_system and (new.key is distinct from old.key or not new.is_system) then
    raise exception 'System authorization keys and system status are immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger admin_roles_protect_system
before update or delete on public.admin_roles
for each row execute function private.protect_system_catalog_row();

create trigger admin_permissions_protect_system
before update or delete on public.admin_permissions
for each row execute function private.protect_system_catalog_row();

create or replace function private.protect_super_admin_permission_mapping()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.admin_roles as role
    where role.id = old.role_id and role.key = 'super_admin' and role.is_system
  ) then
    raise exception 'Super Admin system permissions cannot be removed or reassigned';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger admin_role_permissions_protect_super_admin
before update or delete on public.admin_role_permissions
for each row execute function private.protect_super_admin_permission_mapping();

create or replace function private.bump_admin_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invalidate_session boolean := false;
begin
  if new.role_id is distinct from old.role_id then
    new.permission_version := old.permission_version + 1;
    invalidate_session := true;
  end if;

  if new.status is distinct from old.status or new.mfa_required is distinct from old.mfa_required then
    invalidate_session := true;
  end if;

  if invalidate_session then
    new.session_version := old.session_version + 1;
  end if;

  return new;
end;
$$;

create trigger admin_users_bump_versions
before update of role_id, status, mfa_required on public.admin_users
for each row execute function private.bump_admin_versions();

create or replace function private.invalidate_admin_sessions_after_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_id is distinct from old.role_id
     or new.status is distinct from old.status
     or new.mfa_required is distinct from old.mfa_required then
    update public.admin_sessions
    set status = 'revoked',
        revoked_at = now(),
        revoked_by = auth.uid(),
        revoke_reason = 'administrator_authorization_changed'
    where user_id = new.user_id and status in ('pending_mfa', 'active');
  end if;

  return new;
end;
$$;

create trigger admin_users_invalidate_sessions
after update of role_id, status, mfa_required on public.admin_users
for each row execute function private.invalidate_admin_sessions_after_user_change();

create or replace function private.bump_role_permission_versions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_role_id uuid;
begin
  affected_role_id := case when tg_op = 'DELETE' then old.role_id else new.role_id end;

  update public.admin_users
  set permission_version = permission_version + 1
  where role_id = affected_role_id;

  if tg_op = 'UPDATE' and old.role_id is distinct from new.role_id then
    update public.admin_users
    set permission_version = permission_version + 1
    where role_id = old.role_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger admin_role_permissions_bump_versions
after insert or update or delete on public.admin_role_permissions
for each row execute function private.bump_role_permission_versions();

create or replace function private.protect_last_active_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_is_active_super boolean;
  new_is_active_super boolean := false;
begin
  old_is_active_super := old.status = 'active' and exists (
    select 1 from public.admin_roles as role
    where role.id = old.role_id and role.key = 'super_admin'
  );

  if tg_op <> 'DELETE' then
    new_is_active_super := new.status = 'active' and exists (
      select 1 from public.admin_roles as role
      where role.id = new.role_id and role.key = 'super_admin'
    );
  end if;

  if old_is_active_super and not new_is_active_super then
    perform pg_advisory_xact_lock(hashtext('starville.last_active_super_admin'));

    if not exists (
      select 1
      from public.admin_users as admin_user
      join public.admin_roles as role on role.id = admin_user.role_id
      where role.key = 'super_admin'
        and admin_user.status = 'active'
        and admin_user.user_id <> old.user_id
    ) then
      raise exception 'The final active Super Admin cannot be removed, demoted, suspended, or disabled';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger admin_users_protect_last_super_admin
before update of role_id, status or delete on public.admin_users
for each row execute function private.protect_last_active_super_admin();

create or replace function private.protect_admin_audit_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Administrator audit logs are append-only';
end;
$$;

create trigger admin_audit_logs_append_only
before update or delete on public.admin_audit_logs
for each row execute function private.protect_admin_audit_log();

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on table public.admin_roles from anon, authenticated, service_role;
revoke all on table public.admin_permissions from anon, authenticated, service_role;
revoke all on table public.admin_role_permissions from anon, authenticated, service_role;
revoke all on table public.admin_users from anon, authenticated, service_role;
revoke all on table public.admin_sessions from anon, authenticated, service_role;
revoke all on table public.admin_audit_logs from anon, authenticated, service_role;

revoke all on function private.set_updated_at() from public;
revoke all on function private.protect_system_catalog_row() from public;
revoke all on function private.protect_super_admin_permission_mapping() from public;
revoke all on function private.bump_admin_versions() from public;
revoke all on function private.invalidate_admin_sessions_after_user_change() from public;
revoke all on function private.bump_role_permission_versions() from public;
revoke all on function private.protect_last_active_super_admin() from public;
revoke all on function private.protect_admin_audit_log() from public;
