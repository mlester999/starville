-- Starville Phase 6: versioned world-content authority and narrow permission additions.
-- This is forward-only and intentionally leaves every earlier migration unchanged.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  (
    'maps.preview',
    'Preview map drafts',
    'Open a validated world draft inside the protected administrator preview boundary.',
    'maps',
    false,
    true
  ),
  (
    'maps.audit_read',
    'Read world audit history',
    'View bounded append-only world-content audit history.',
    'maps',
    true,
    true
  )
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    is_sensitive = excluded.is_sensitive,
    is_system = true;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles as role
cross join public.admin_permissions as permission
where role.key = 'super_admin'
on conflict (role_id, permission_id) do nothing;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'maps.edit'),
    ('game_administrator', 'maps.preview'),
    ('game_administrator', 'maps.audit_read'),
    ('live_operations_manager', 'maps.audit_read'),
    ('world_designer', 'maps.preview'),
    ('world_designer', 'maps.audit_read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

create table public.world_maps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    char_length(slug) between 3 and 64
    and slug ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  ),
  display_name text not null check (
    char_length(display_name) between 1 and 80
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  description text not null check (
    char_length(description) between 1 and 280
    and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  ),
  status text not null default 'active' check (status in ('active', 'archived')),
  default_spawn_id text not null check (
    char_length(default_spawn_id) between 1 and 64
    and default_spawn_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  active_published_version_id uuid,
  record_version integer not null default 1 check (record_version > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.world_maps is
  'Stable world-map identities. Normal players load only the active immutable published version.';

create table public.world_map_versions (
  id uuid primary key default gen_random_uuid(),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (
    lifecycle_status in ('draft', 'validated', 'published', 'superseded', 'archived')
  ),
  manifest jsonb not null check (
    jsonb_typeof(manifest) = 'object'
    and pg_column_size(manifest) <= 262144
  ),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  edit_version integer not null default 1 check (edit_version > 0),
  validation_status text not null default 'pending' check (
    validation_status in ('pending', 'valid', 'invalid')
  ),
  validation_result jsonb not null default '{"valid":false,"errors":[],"warnings":[]}'::jsonb check (
    jsonb_typeof(validation_result) = 'object'
    and pg_column_size(validation_result) <= 65536
  ),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_at timestamptz,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  publication_reason text check (
    publication_reason is null or (
      char_length(publication_reason) between 12 and 500
      and publication_reason = btrim(publication_reason)
      and publication_reason !~ '[[:cntrl:]<>]'
    )
  ),
  supersedes_version_id uuid references public.world_map_versions(id) on delete restrict,
  derived_from_version_id uuid references public.world_map_versions(id) on delete restrict,
  unique (world_map_id, version_number),
  unique (world_map_id, id),
  constraint world_map_versions_lifecycle_check check (
    (
      lifecycle_status = 'draft'
      and published_at is null
      and published_by_admin_id is null
      and publication_reason is null
    )
    or (
      lifecycle_status = 'validated'
      and validation_status = 'valid'
      and validated_at is not null
      and published_at is null
      and published_by_admin_id is null
      and publication_reason is null
    )
    or (
      lifecycle_status in ('published', 'superseded')
      and validation_status = 'valid'
      and validated_at is not null
      and published_at is not null
      and publication_reason is not null
    )
    or lifecycle_status = 'archived'
  ),
  constraint world_map_versions_not_self_superseding check (
    supersedes_version_id is null or supersedes_version_id <> id
  ),
  constraint world_map_versions_not_self_derived check (
    derived_from_version_id is null or derived_from_version_id <> id
  )
);

comment on table public.world_map_versions is
  'Versioned data-only manifests. Published and superseded content is immutable historical state.';

alter table public.world_maps
  add constraint world_maps_active_published_version_fk
  foreign key (id, active_published_version_id)
  references public.world_map_versions(world_map_id, id)
  on delete restrict;

create table public.world_assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique check (
    char_length(asset_key) between 3 and 96
    and asset_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique check (
    char_length(storage_path) between 3 and 320
    and storage_path ~ '^(repository|world)/[a-z0-9][a-z0-9/_.-]*$'
    and storage_path !~ '(^|/)\.\.(/|$)'
  ),
  source_type text not null check (source_type in ('repository_procedural', 'storage_raster')),
  media_type text not null check (
    media_type in ('application/x-starville-procedural', 'image/png', 'image/webp', 'image/avif')
  ),
  width integer check (width is null or width between 1 and 4096),
  height integer check (height is null or height between 1 and 4096),
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes between 1 and 5242880),
  approval_status text not null default 'draft' check (
    approval_status in ('draft', 'approved', 'deprecated')
  ),
  repository_owned boolean not null default false,
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  deprecated_at timestamptz,
  constraint world_assets_source_metadata_check check (
    (
      source_type = 'repository_procedural'
      and repository_owned
      and media_type = 'application/x-starville-procedural'
      and width is null and height is null and file_size_bytes is null
    )
    or (
      source_type = 'storage_raster'
      and media_type in ('image/png', 'image/webp', 'image/avif')
      and width is not null and height is not null and file_size_bytes is not null
    )
  ),
  constraint world_assets_approval_state_check check (
    (approval_status = 'draft' and approved_at is null and approved_by_admin_id is null and deprecated_at is null)
    or (approval_status = 'approved' and approved_at is not null and deprecated_at is null)
    or (approval_status = 'deprecated' and approved_at is not null and deprecated_at is not null)
  )
);

comment on table public.world_assets is
  'Approved immutable-key asset metadata. Paths are repository or content-hashed storage paths, never arbitrary URLs.';

create table public.world_map_version_assets (
  world_map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (world_map_version_id, world_asset_id)
);

create table public.world_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key in (
    'world.map_created',
    'world.draft_created',
    'world.draft_updated',
    'world.validation_passed',
    'world.validation_failed',
    'world.preview_opened',
    'world.version_published',
    'world.version_superseded',
    'world.version_derived',
    'world.asset_registered',
    'world.asset_approved',
    'world.asset_deprecated',
    'world.publication_rejected'
  )),
  actor_type text not null check (actor_type in ('admin', 'system')),
  actor_admin_user_id uuid,
  admin_session_id uuid,
  target_world_map_id uuid references public.world_maps(id) on delete restrict,
  target_world_map_version_id uuid references public.world_map_versions(id) on delete restrict,
  target_world_asset_id uuid references public.world_assets(id) on delete restrict,
  request_id text check (request_id is null or char_length(request_id) between 1 and 128),
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  reason text check (
    reason is null or (
      char_length(reason) between 1 and 500
      and reason = btrim(reason)
      and reason !~ '[[:cntrl:]<>]'
    )
  ),
  before_state jsonb not null default '{}'::jsonb check (
    jsonb_typeof(before_state) = 'object' and pg_column_size(before_state) <= 65536
  ),
  after_state jsonb not null default '{}'::jsonb check (
    jsonb_typeof(after_state) = 'object' and pg_column_size(after_state) <= 65536
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 65536
  ),
  created_at timestamptz not null default now(),
  constraint world_audit_actor_check check (
    (actor_type = 'admin' and actor_admin_user_id is not null and admin_session_id is not null)
    or (actor_type = 'system' and actor_admin_user_id is null and admin_session_id is null)
  )
);

comment on table public.world_audit_events is
  'Append-only safe world-content history. Credentials, tokens, signatures, binary content, and private URLs are forbidden.';

create table public.world_operation_rate_limits (
  scope text not null check (scope in (
    'player_manifest_read',
    'player_transition',
    'admin_world_read',
    'admin_draft_write',
    'admin_validate',
    'admin_preview',
    'admin_publish',
    'admin_derive',
    'admin_asset_read',
    'admin_audit_read'
  )),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key),
  constraint world_operation_rate_limit_window_check check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

create index world_maps_status_updated_idx
  on public.world_maps(status, updated_at desc, id);
create index world_maps_active_version_idx
  on public.world_maps(active_published_version_id)
  where active_published_version_id is not null;
create index world_map_versions_lifecycle_idx
  on public.world_map_versions(world_map_id, lifecycle_status, version_number desc);
create unique index world_map_versions_one_published_idx
  on public.world_map_versions(world_map_id)
  where lifecycle_status = 'published';
create unique index world_map_versions_one_open_draft_idx
  on public.world_map_versions(world_map_id)
  where lifecycle_status in ('draft', 'validated');
create index world_map_versions_created_by_idx
  on public.world_map_versions(created_by_admin_id, created_at desc)
  where created_by_admin_id is not null;
create index world_map_versions_supersedes_idx
  on public.world_map_versions(supersedes_version_id)
  where supersedes_version_id is not null;
create index world_map_versions_derived_from_idx
  on public.world_map_versions(derived_from_version_id)
  where derived_from_version_id is not null;
create index world_assets_approval_key_idx
  on public.world_assets(approval_status, asset_key);
create index world_map_version_assets_asset_idx
  on public.world_map_version_assets(world_asset_id, world_map_version_id);
create index world_audit_map_created_idx
  on public.world_audit_events(target_world_map_id, created_at desc, id desc);
create index world_audit_version_created_idx
  on public.world_audit_events(target_world_map_version_id, created_at desc, id desc);
create index world_audit_actor_created_idx
  on public.world_audit_events(actor_admin_user_id, created_at desc, id desc)
  where actor_admin_user_id is not null;
create index world_operation_rate_limits_expiry_idx
  on public.world_operation_rate_limits(window_expires_at);

create or replace function private.protect_world_map_active_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.active_published_version_id is distinct from old.active_published_version_id
     and coalesce(current_setting('starville.world_publication_transition', true), '') <> 'true' then
    raise exception using errcode = '42501', message = 'WORLD_ACTIVE_VERSION_PROTECTED';
  end if;
  return new;
end;
$$;

create trigger world_maps_protect_active_version
before update on public.world_maps
for each row execute function private.protect_world_map_active_version();

create trigger world_maps_set_updated_at
before update on public.world_maps
for each row execute function private.set_updated_at();

create or replace function private.protect_world_map_version_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'WORLD_VERSION_HISTORY_RETAINED';
  end if;

  if old.lifecycle_status in ('published', 'superseded', 'archived') then
    if current_setting('starville.world_publication_transition', true) = 'true'
       and old.lifecycle_status = 'published'
       and new.lifecycle_status = 'superseded'
       and (to_jsonb(new) - array['lifecycle_status', 'updated_at']) =
           (to_jsonb(old) - array['lifecycle_status', 'updated_at']) then
      return new;
    end if;
    raise exception using errcode = '42501', message = 'PUBLISHED_WORLD_VERSION_IMMUTABLE';
  end if;

  if old.lifecycle_status = 'validated'
     and coalesce(current_setting('starville.world_publication_transition', true), '') <> 'true' then
    raise exception using errcode = '42501', message = 'VALIDATED_WORLD_VERSION_IMMUTABLE';
  end if;

  if new.lifecycle_status in ('published', 'superseded')
     and coalesce(current_setting('starville.world_publication_transition', true), '') <> 'true' then
    raise exception using errcode = '42501', message = 'WORLD_PUBLICATION_FUNCTION_REQUIRED';
  end if;

  return new;
end;
$$;

create trigger world_map_versions_protect_history
before update or delete on public.world_map_versions
for each row execute function private.protect_world_map_version_history();

create trigger world_map_versions_set_updated_at
before update on public.world_map_versions
for each row execute function private.set_updated_at();

create or replace function private.protect_world_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'WORLD_AUDIT_APPEND_ONLY';
end;
$$;

create trigger world_audit_events_append_only
before update or delete on public.world_audit_events
for each row execute function private.protect_world_audit_event();

alter table public.world_maps enable row level security;
alter table public.world_map_versions enable row level security;
alter table public.world_assets enable row level security;
alter table public.world_map_version_assets enable row level security;
alter table public.world_audit_events enable row level security;
alter table public.world_operation_rate_limits enable row level security;

revoke all on table public.world_maps from anon, authenticated, service_role;
revoke all on table public.world_map_versions from anon, authenticated, service_role;
revoke all on table public.world_assets from anon, authenticated, service_role;
revoke all on table public.world_map_version_assets from anon, authenticated, service_role;
revoke all on table public.world_audit_events from anon, authenticated, service_role;
revoke all on table public.world_operation_rate_limits from anon, authenticated, service_role;

revoke all on function private.protect_world_map_active_version()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_world_map_version_history()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_world_audit_event()
  from public, anon, authenticated, service_role;

alter table public.player_profiles
  drop constraint player_profiles_current_map_id_check,
  drop constraint player_profiles_safe_position_x_check,
  drop constraint player_profiles_safe_position_y_check,
  add column current_map_version_id uuid references public.world_map_versions(id) on delete restrict,
  add column last_successful_transition_at timestamptz,
  add column last_transition_exit_id text check (
    last_transition_exit_id is null or (
      char_length(last_transition_exit_id) between 1 and 64
      and last_transition_exit_id ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    )
  ),
  add column last_transition_request_id text check (
    last_transition_request_id is null or char_length(last_transition_request_id) between 1 and 128
  ),
  add constraint player_profiles_world_x_check check (
    safe_position_x::text <> 'NaN' and safe_position_x between 0 and 128
  ),
  add constraint player_profiles_world_y_check check (
    safe_position_y::text <> 'NaN' and safe_position_y between 0 and 128
  );

create index player_profiles_current_world_idx
  on public.player_profiles(current_map_id, current_map_version_id);
