-- Secure, revision-bound World Game Test sessions for the real game client.
-- Grants and sessions are opaque, short-lived, revocable, and store only hashes.

create table public.world_game_test_sessions (
  id uuid primary key default gen_random_uuid(),
  administrator_user_id uuid not null
    references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null
    references public.admin_sessions(id) on delete restrict,
  world_map_id uuid not null,
  world_map_version_id uuid not null,
  environment text not null check (environment in ('development', 'test', 'production')),
  status text not null default 'issued' check (status in ('issued', 'active', 'revoked')),
  grant_token_hash text unique check (
    grant_token_hash is null or grant_token_hash ~ '^[0-9a-f]{64}$'
  ),
  session_token_hash text unique check (
    session_token_hash is null or session_token_hash ~ '^[0-9a-f]{64}$'
  ),
  return_path text not null check (
    char_length(return_path) between 1 and 500
    and return_path like '/%'
    and return_path not like '//%'
    and return_path !~ '[\\[:cntrl:]<>]'
    and return_path !~ '://'
  ),
  client_request_id uuid not null,
  game_client_build text check (
    game_client_build is null or (
      char_length(game_client_build) between 1 and 120
      and game_client_build = btrim(game_client_build)
      and game_client_build !~ '[[:cntrl:]<>]'
    )
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  exchanged_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text check (
    revoke_reason is null or (
      char_length(revoke_reason) between 1 and 200
      and revoke_reason = btrim(revoke_reason)
      and revoke_reason !~ '[[:cntrl:]<>]'
    )
  ),
  foreign key (world_map_id, world_map_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  unique (administrator_user_id, client_request_id),
  constraint world_game_test_sessions_ttl_check check (
    expires_at >= created_at + interval '15 minutes'
    and expires_at <= created_at + interval '30 minutes'
  ),
  constraint world_game_test_sessions_state_check check (
    (
      status = 'issued'
      and grant_token_hash is not null
      and session_token_hash is null
      and exchanged_at is null
      and revoked_at is null
      and revoke_reason is null
    ) or (
      status = 'active'
      and grant_token_hash is null
      and session_token_hash is not null
      and exchanged_at is not null
      and revoked_at is null
      and revoke_reason is null
    ) or (
      status = 'revoked'
      and grant_token_hash is null
      and session_token_hash is null
      and revoked_at is not null
      and revoke_reason is not null
    )
  )
);

comment on table public.world_game_test_sessions is
  'Short-lived administrator Game Test grants bound to one immutable world revision. Only opaque token hashes are retained.';

create index world_game_test_sessions_admin_idx
  on public.world_game_test_sessions(administrator_user_id, created_at desc);
create index world_game_test_sessions_world_idx
  on public.world_game_test_sessions(world_map_version_id, created_at desc);
create index world_game_test_sessions_active_expiry_idx
  on public.world_game_test_sessions(expires_at)
  where status in ('issued', 'active');
create index world_game_test_sessions_admin_session_idx
  on public.world_game_test_sessions(admin_session_id, created_at desc);

create table public.world_game_test_evidence (
  id uuid primary key default gen_random_uuid(),
  game_test_session_id uuid not null
    references public.world_game_test_sessions(id) on delete restrict,
  administrator_user_id uuid not null
    references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null
    references public.admin_sessions(id) on delete restrict,
  world_map_id uuid not null,
  world_map_version_id uuid not null,
  environment text not null check (environment in ('development', 'test', 'production')),
  result text not null check (result in ('passed', 'failed', 'blocked', 'needs_changes')),
  checklist jsonb not null check (
    jsonb_typeof(checklist) = 'object'
    and pg_column_size(checklist) <= 4096
  ),
  notes text not null check (
    char_length(notes) between 1 and 2000
    and notes = btrim(notes)
    and notes !~ '[[:cntrl:]<>]'
  ),
  game_client_build text not null check (
    char_length(game_client_build) between 1 and 120
    and game_client_build = btrim(game_client_build)
    and game_client_build !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  recorded_at timestamptz not null default now(),
  foreign key (world_map_id, world_map_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict
);

comment on table public.world_game_test_evidence is
  'Append-only explicit administrator test outcomes for one exact world revision; evidence never publishes content.';

create index world_game_test_evidence_version_idx
  on public.world_game_test_evidence(world_map_version_id, recorded_at desc, id desc);
create index world_game_test_evidence_session_idx
  on public.world_game_test_evidence(game_test_session_id, recorded_at desc);
create index world_game_test_evidence_admin_idx
  on public.world_game_test_evidence(administrator_user_id, recorded_at desc);

create or replace function private.protect_world_game_test_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'WORLD_GAME_TEST_EVIDENCE_APPEND_ONLY';
end;
$$;

create trigger world_game_test_evidence_append_only
before update or delete on public.world_game_test_evidence
for each row execute function private.protect_world_game_test_evidence();

alter table public.world_game_test_sessions enable row level security;
alter table public.world_game_test_sessions force row level security;
alter table public.world_game_test_evidence enable row level security;
alter table public.world_game_test_evidence force row level security;

revoke all on table public.world_game_test_sessions
  from public, anon, authenticated, service_role;
revoke all on table public.world_game_test_evidence
  from public, anon, authenticated, service_role;

create or replace function private.world_game_test_maintenance_blocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select private.live_operations_maintenance_state(config) in ('active', 'expired')
      from public.live_operations_maintenance as config
      where config.singleton_key
    ),
    true
  );
$$;

create or replace function private.world_game_test_checklist_valid(p_checklist jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item_count integer;
begin
  if p_checklist is null
     or jsonb_typeof(p_checklist) <> 'object'
     or pg_column_size(p_checklist) > 4096 then
    return false;
  end if;
  select count(*) into item_count from jsonb_object_keys(p_checklist);
  if item_count not between 1 and 20 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_each(p_checklist) as item
    where item.key !~ '^[a-z][a-z0-9_]{1,62}$'
      or jsonb_typeof(item.value) <> 'boolean'
  );
end;
$$;

create or replace function private.world_game_test_revision_available(
  p_session public.world_game_test_sessions
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.world_maps as map
    join public.world_map_versions as version
      on version.world_map_id = map.id
     and version.id = p_session.world_map_version_id
    where map.id = p_session.world_map_id
      and map.status = 'active'
      and version.lifecycle_status in ('validated', 'published', 'superseded')
      and version.validation_status = 'valid'
  );
$$;

create or replace function private.world_game_test_projection(
  p_session public.world_game_test_sessions
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'loaded',
    'session', jsonb_build_object(
      'id', p_session.id,
      'worldMapId', p_session.world_map_id,
      'worldMapVersionId', p_session.world_map_version_id,
      'environment', p_session.environment,
      'status', p_session.status,
      'returnPath', p_session.return_path,
      'createdAt', p_session.created_at,
      'expiresAt', p_session.expires_at,
      'gameClientBuild', p_session.game_client_build
    ),
    'map', jsonb_build_object(
      'id', map.id,
      'slug', map.slug,
      'displayName', map.display_name,
      'description', map.description,
      'defaultSpawnId', map.default_spawn_id
    ),
    'version', jsonb_build_object(
      'id', version.id,
      'versionNumber', version.version_number,
      'editVersion', version.edit_version,
      'checksum', version.checksum,
      'lifecycleStatus', version.lifecycle_status
    ),
    'manifest', version.manifest,
    'assetDeliveries', private.world_asset_deliveries_for_version(version.id),
    'previewIdentity', jsonb_build_object(
      'displayName', 'Game Test Administrator',
      'appearancePreset', 'moss'
    ),
    'realtime', jsonb_build_object(
      'mode', 'disabled_private_solo',
      'publicChannelJoined', false
    ),
    'latestEvidence', (
      select jsonb_build_object(
        'id', evidence.id,
        'result', evidence.result,
        'gameClientBuild', evidence.game_client_build,
        'recordedAt', evidence.recorded_at
      )
      from public.world_game_test_evidence as evidence
      where evidence.world_map_version_id = version.id
      order by evidence.recorded_at desc, evidence.id desc
      limit 1
    ),
    'newerDraftAvailable', exists (
      select 1
      from public.world_map_versions as newer_version
      where newer_version.world_map_id = version.world_map_id
        and newer_version.version_number > version.version_number
        and newer_version.lifecycle_status in ('draft', 'validated')
    )
  )
  from public.world_maps as map
  join public.world_map_versions as version
    on version.id = p_session.world_map_version_id
   and version.world_map_id = map.id
  where map.id = p_session.world_map_id
    and map.status = 'active'
    and version.lifecycle_status in ('validated', 'published', 'superseded')
    and version.validation_status = 'valid';
$$;

create or replace function public.get_admin_world_game_test_status(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_version public.world_map_versions%rowtype;
  latest_evidence public.world_game_test_evidence%rowtype;
  tester_display_name text;
  active_sessions jsonb;
  prior_pass_exists boolean;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id
    and world_map_id = p_world_map_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select evidence.*
  into latest_evidence
  from public.world_game_test_evidence as evidence
  where evidence.world_map_version_id = selected_version.id
  order by evidence.recorded_at desc, evidence.id desc
  limit 1;
  if found then
    select administrator.display_name into tester_display_name
    from public.admin_users as administrator
    where administrator.user_id = latest_evidence.administrator_user_id;
  end if;

  select exists (
    select 1
    from public.world_game_test_evidence as evidence
    where evidence.world_map_id = p_world_map_id
      and evidence.world_map_version_id <> p_version_id
      and evidence.result = 'passed'
  ) into prior_pass_exists;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', session.id,
        'status', session.status,
        'createdAt', session.created_at,
        'expiresAt', session.expires_at,
        'exchangedAt', session.exchanged_at,
        'gameClientBuild', session.game_client_build
      ) order by session.created_at desc
    ),
    '[]'::jsonb
  ) into active_sessions
  from public.world_game_test_sessions as session
  where session.administrator_user_id = p_user_id
    and session.world_map_version_id = p_version_id
    and session.status in ('issued', 'active')
    and session.expires_at > now();

  return jsonb_build_object(
    'status', 'loaded',
    'worldMapId', p_world_map_id,
    'worldMapVersionId', p_version_id,
    'gameTestStatus', case
      when latest_evidence.id is not null then latest_evidence.result
      when prior_pass_exists then 'test_outdated'
      else 'not_tested'
    end,
    'latestEvidence', case
      when latest_evidence.id is null then null
      else jsonb_build_object(
        'id', latest_evidence.id,
        'result', latest_evidence.result,
        'testerAdministratorId', latest_evidence.administrator_user_id,
        'testerDisplayName', tester_display_name,
        'gameClientBuild', latest_evidence.game_client_build,
        'environment', latest_evidence.environment,
        'recordedAt', latest_evidence.recorded_at
      )
    end,
    'activeSessions', active_sessions
  );
end;
$$;

create or replace function public.create_admin_world_game_test(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
  p_environment text,
  p_grant_token_hash text,
  p_return_path text,
  p_client_request_id uuid,
  p_request_id text,
  p_rate_limit integer,
  p_ttl_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session uuid;
  selected_version public.world_map_versions%rowtype;
  created public.world_game_test_sessions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_preview', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  if p_environment not in ('development', 'test', 'production')
     or p_grant_token_hash is null
     or p_grant_token_hash !~ '^[0-9a-f]{64}$'
     or p_expected_checksum is null
     or p_expected_checksum !~ '^[0-9a-f]{64}$'
     or p_client_request_id is null
     or p_ttl_minutes not between 15 and 30
     or p_return_path is null
     or char_length(p_return_path) not between 1 and 500
     or p_return_path not like '/%'
     or p_return_path like '//%'
     or p_return_path ~ '[\\[:cntrl:]<>]'
     or p_return_path ~ '://' then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_GAME_TEST_INPUT';
  end if;

  select * into selected_version
  from public.world_map_versions
  where id = p_version_id
    and world_map_id = p_world_map_id
    and lifecycle_status = 'validated'
    and validation_status = 'valid';
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_version.edit_version <> p_expected_edit_version
     or selected_version.checksum <> p_expected_checksum then
    return jsonb_build_object('status', 'stale_revision');
  end if;
  if (
    select count(*)
    from public.world_game_test_sessions
    where administrator_user_id = p_user_id
      and status in ('issued', 'active')
      and expires_at > now()
  ) >= 5 then
    return jsonb_build_object('status', 'active_limit');
  end if;

  insert into public.world_game_test_sessions (
    administrator_user_id, admin_session_id, world_map_id, world_map_version_id,
    environment, grant_token_hash, return_path, client_request_id, expires_at
  ) values (
    p_user_id, trusted_session, p_world_map_id, p_version_id,
    p_environment, p_grant_token_hash, p_return_path, p_client_request_id,
    now() + make_interval(mins => p_ttl_minutes)
  )
  returning * into created;

  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'world.game_test.grant_issued', p_user_id, trusted_session, p_request_id, 'success',
    jsonb_build_object(
      'gameTestSessionId', created.id,
      'worldMapId', created.world_map_id,
      'worldMapVersionId', created.world_map_version_id,
      'environment', created.environment,
      'expiresAt', created.expires_at
    )
  );

  return jsonb_build_object(
    'status', 'issued',
    'sessionId', created.id,
    'worldMapId', created.world_map_id,
    'worldMapVersionId', created.world_map_version_id,
    'environment', created.environment,
    'expiresAt', created.expires_at,
    'returnPath', created.return_path
  );
exception when unique_violation then
  return jsonb_build_object('status', 'request_conflict');
end;
$$;

create or replace function public.exchange_world_game_test_grant(
  p_grant_token_hash text,
  p_session_token_hash text,
  p_environment text,
  p_game_client_build text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected public.world_game_test_sessions%rowtype;
  trusted_admin_session public.admin_sessions%rowtype;
  authorization_result jsonb;
begin
  perform private.assert_valid_request_id(p_request_id);
  if p_grant_token_hash is null
     or p_grant_token_hash !~ '^[0-9a-f]{64}$'
     or p_session_token_hash is null
     or p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_environment not in ('development', 'test', 'production')
     or p_game_client_build is null
     or char_length(p_game_client_build) not between 1 and 120
     or p_game_client_build <> btrim(p_game_client_build)
     or p_game_client_build ~ '[[:cntrl:]<>]' then
    return jsonb_build_object('status', 'invalid_grant');
  end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;

  select * into selected
  from public.world_game_test_sessions
  where grant_token_hash = p_grant_token_hash
  for update;
  if not found or selected.status <> 'issued' or selected.environment <> p_environment then
    return jsonb_build_object('status', 'invalid_grant');
  end if;
  if selected.expires_at <= now() then
    update public.world_game_test_sessions
    set status = 'revoked', grant_token_hash = null, revoked_at = now(),
        revoke_reason = 'Grant expired before exchange'
    where id = selected.id;
    return jsonb_build_object('status', 'expired');
  end if;

  select * into trusted_admin_session
  from public.admin_sessions
  where id = selected.admin_session_id;
  authorization_result := private.evaluate_admin_authorization(
    selected.administrator_user_id,
    trusted_admin_session.auth_session_id,
    'aal2'
  );
  if authorization_result ->> 'outcome' <> 'authorized'
     or not ((authorization_result -> 'context' -> 'permissionKeys') ? 'maps.preview') then
    update public.world_game_test_sessions
    set status = 'revoked', grant_token_hash = null, revoked_at = now(),
        revoke_reason = 'Administrator session no longer authorized'
    where id = selected.id;
    return jsonb_build_object('status', 'revoked');
  end if;
  if not private.world_game_test_revision_available(selected) then
    update public.world_game_test_sessions
    set status = 'revoked', grant_token_hash = null, revoked_at = now(),
        revoke_reason = 'World revision is no longer previewable'
    where id = selected.id;
    return jsonb_build_object('status', 'revoked');
  end if;

  update public.world_game_test_sessions
  set status = 'active',
      grant_token_hash = null,
      session_token_hash = p_session_token_hash,
      game_client_build = p_game_client_build,
      exchanged_at = now(),
      last_seen_at = now()
  where id = selected.id
  returning * into selected;

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    'world.preview_opened', 'admin', selected.administrator_user_id,
    selected.admin_session_id, selected.world_map_id, selected.world_map_version_id,
    p_request_id, 'success',
    jsonb_build_object(
      'mode', 'game_test',
      'gameTestSessionId', selected.id,
      'environment', selected.environment,
      'expiresAt', selected.expires_at
    )
  );

  return private.world_game_test_projection(selected);
end;
$$;

create or replace function public.get_world_game_test_session(
  p_session_token_hash text,
  p_environment text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected public.world_game_test_sessions%rowtype;
  trusted_admin_session public.admin_sessions%rowtype;
  authorization_result jsonb;
begin
  perform private.assert_valid_request_id(p_request_id);
  if p_session_token_hash is null
     or p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_environment not in ('development', 'test', 'production') then
    return jsonb_build_object('status', 'invalid_session');
  end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  select * into selected
  from public.world_game_test_sessions
  where session_token_hash = p_session_token_hash
  for update;
  if not found or selected.status <> 'active' or selected.environment <> p_environment then
    return jsonb_build_object('status', 'invalid_session');
  end if;
  if selected.expires_at <= now() then
    update public.world_game_test_sessions
    set status = 'revoked', session_token_hash = null, revoked_at = now(),
        revoke_reason = 'Game Test session expired'
    where id = selected.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if not private.world_game_test_revision_available(selected) then
    update public.world_game_test_sessions
    set status = 'revoked', session_token_hash = null, revoked_at = now(),
        revoke_reason = 'World revision is no longer previewable'
    where id = selected.id;
    return jsonb_build_object('status', 'revoked');
  end if;
  select * into trusted_admin_session
  from public.admin_sessions
  where id = selected.admin_session_id;
  authorization_result := private.evaluate_admin_authorization(
    selected.administrator_user_id,
    trusted_admin_session.auth_session_id,
    'aal2'
  );
  if authorization_result ->> 'outcome' <> 'authorized'
     or not ((authorization_result -> 'context' -> 'permissionKeys') ? 'maps.preview') then
    update public.world_game_test_sessions
    set status = 'revoked', session_token_hash = null, revoked_at = now(),
        revoke_reason = 'Administrator session no longer authorized'
    where id = selected.id;
    return jsonb_build_object('status', 'revoked');
  end if;
  update public.world_game_test_sessions
  set last_seen_at = now()
  where id = selected.id
  returning * into selected;
  return private.world_game_test_projection(selected);
end;
$$;

create or replace function public.exit_world_game_test_session(
  p_session_token_hash text,
  p_environment text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected public.world_game_test_sessions%rowtype;
begin
  perform private.assert_valid_request_id(p_request_id);
  if p_session_token_hash is null
     or p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_environment not in ('development', 'test', 'production') then
    return jsonb_build_object('status', 'exited');
  end if;
  update public.world_game_test_sessions
  set status = 'revoked', session_token_hash = null, revoked_at = now(),
      revoke_reason = 'Administrator exited Game Test'
  where session_token_hash = p_session_token_hash
    and environment = p_environment
    and status = 'active'
  returning * into selected;
  if found then
    insert into public.admin_audit_logs (
      event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
    ) values (
      'world.game_test.exited', selected.administrator_user_id,
      selected.admin_session_id, p_request_id, 'success',
      jsonb_build_object(
        'gameTestSessionId', selected.id,
        'worldMapId', selected.world_map_id,
        'worldMapVersionId', selected.world_map_version_id
      )
    );
  end if;
  return jsonb_build_object('status', 'exited');
end;
$$;

create or replace function public.revoke_admin_world_game_test_session(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_game_test_session_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session uuid;
  selected public.world_game_test_sessions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  update public.world_game_test_sessions
  set status = 'revoked', grant_token_hash = null, session_token_hash = null,
      revoked_at = now(), revoke_reason = 'Revoked by administrator'
  where id = p_game_test_session_id
    and administrator_user_id = p_user_id
    and status in ('issued', 'active')
  returning * into selected;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'world.game_test.revoked', p_user_id, trusted_session, p_request_id, 'success',
    jsonb_build_object(
      'gameTestSessionId', selected.id,
      'worldMapId', selected.world_map_id,
      'worldMapVersionId', selected.world_map_version_id
    )
  );
  return jsonb_build_object('status', 'revoked', 'sessionId', selected.id);
end;
$$;

create or replace function public.record_admin_world_game_test_evidence(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_game_test_session_id uuid,
  p_result text,
  p_checklist jsonb,
  p_notes text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session uuid;
  selected public.world_game_test_sessions%rowtype;
  evidence public.world_game_test_evidence%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if p_result not in ('passed', 'failed', 'blocked', 'needs_changes')
     or not private.world_game_test_checklist_valid(p_checklist)
     or p_notes is null
     or char_length(p_notes) not between 1 and 2000
     or p_notes <> btrim(p_notes)
     or p_notes ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_GAME_TEST_EVIDENCE';
  end if;
  select * into selected
  from public.world_game_test_sessions
  where id = p_game_test_session_id
    and administrator_user_id = p_user_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected.exchanged_at is null or selected.game_client_build is null then
    return jsonb_build_object('status', 'session_conflict');
  end if;

  insert into public.world_game_test_evidence (
    game_test_session_id, administrator_user_id, admin_session_id,
    world_map_id, world_map_version_id, environment, result, checklist,
    notes, game_client_build, request_id
  ) values (
    selected.id, p_user_id, trusted_session,
    selected.world_map_id, selected.world_map_version_id, selected.environment,
    p_result, p_checklist, p_notes, selected.game_client_build, p_request_id
  ) returning * into evidence;

  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'world.game_test.evidence_recorded', p_user_id, trusted_session,
    p_request_id, 'success',
    jsonb_build_object(
      'gameTestSessionId', selected.id,
      'evidenceId', evidence.id,
      'worldMapId', selected.world_map_id,
      'worldMapVersionId', selected.world_map_version_id,
      'result', evidence.result,
      'gameClientBuild', evidence.game_client_build,
      'environment', evidence.environment
    )
  );

  return jsonb_build_object(
    'status', 'recorded',
    'evidenceId', evidence.id,
    'sessionId', selected.id,
    'worldMapVersionId', selected.world_map_version_id,
    'result', evidence.result,
    'gameClientBuild', evidence.game_client_build,
    'environment', evidence.environment,
    'recordedAt', evidence.recorded_at,
    'publicationReadiness', case
      when evidence.result = 'passed' then 'recommended'
      else 'not_recommended'
    end
  );
end;
$$;

revoke all on function private.protect_world_game_test_evidence()
  from public, anon, authenticated, service_role;
revoke all on function private.world_game_test_maintenance_blocked()
  from public, anon, authenticated, service_role;
revoke all on function private.world_game_test_checklist_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.world_game_test_revision_available(public.world_game_test_sessions)
  from public, anon, authenticated, service_role;
revoke all on function private.world_game_test_projection(public.world_game_test_sessions)
  from public, anon, authenticated, service_role;

revoke all on function public.create_admin_world_game_test(
  uuid, uuid, text, uuid, uuid, integer, text, text, text, text, uuid, text, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_world_game_test_status(
  uuid, uuid, text, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.exchange_world_game_test_grant(text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_world_game_test_session(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.exit_world_game_test_session(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_admin_world_game_test_session(uuid, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_admin_world_game_test_evidence(
  uuid, uuid, text, uuid, text, jsonb, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.create_admin_world_game_test(
  uuid, uuid, text, uuid, uuid, integer, text, text, text, text, uuid, text, integer, integer
) to service_role;
grant execute on function public.get_admin_world_game_test_status(
  uuid, uuid, text, uuid, uuid, text
) to service_role;
grant execute on function public.exchange_world_game_test_grant(text, text, text, text, text)
  to service_role;
grant execute on function public.get_world_game_test_session(text, text, text)
  to service_role;
grant execute on function public.exit_world_game_test_session(text, text, text)
  to service_role;
grant execute on function public.revoke_admin_world_game_test_session(uuid, uuid, text, uuid, text)
  to service_role;
grant execute on function public.record_admin_world_game_test_evidence(
  uuid, uuid, text, uuid, text, jsonb, text, text
) to service_role;
