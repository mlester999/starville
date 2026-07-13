-- Starville Phase 7.5A: reusable, versioned production-asset authority.
-- This migration is additive and preserves the Phase 6 stable asset keys and published worlds.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('assets.edit', 'Edit asset drafts', 'Edit bounded metadata for managed asset-version drafts.', 'assets', false, true),
  ('assets.validate', 'Validate assets', 'Run trusted file and configuration validation for managed assets.', 'assets', false, true),
  ('assets.review', 'Review assets', 'Request changes or reject managed asset submissions.', 'assets', true, true),
  ('assets.approve', 'Approve assets', 'Approve validated managed asset versions.', 'assets', true, true),
  ('assets.activate', 'Activate assets', 'Activate an approved immutable asset version for controlled use.', 'assets', true, true),
  ('assets.deprecate', 'Deprecate assets', 'Deprecate or safely archive managed assets.', 'assets', true, true),
  ('assets.audit_read', 'Read asset audit', 'Read bounded append-only asset lifecycle history.', 'assets', true, true)
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
    ('game_administrator', 'assets.upload'),
    ('game_administrator', 'assets.edit'),
    ('game_administrator', 'assets.validate'),
    ('game_administrator', 'assets.review'),
    ('game_administrator', 'assets.approve'),
    ('game_administrator', 'assets.activate'),
    ('game_administrator', 'assets.deprecate'),
    ('game_administrator', 'assets.audit_read'),
    ('game_administrator', 'assets.publish'),
    ('content_manager', 'assets.edit'),
    ('content_manager', 'assets.validate'),
    ('content_manager', 'assets.review'),
    ('content_manager', 'assets.approve'),
    ('content_manager', 'assets.activate'),
    ('content_manager', 'assets.deprecate'),
    ('content_manager', 'assets.audit_read'),
    ('world_designer', 'assets.edit'),
    ('world_designer', 'assets.validate'),
    ('world_designer', 'assets.audit_read'),
    ('asset_manager', 'assets.edit'),
    ('asset_manager', 'assets.validate'),
    ('asset_manager', 'assets.review'),
    ('asset_manager', 'assets.approve'),
    ('asset_manager', 'assets.activate'),
    ('asset_manager', 'assets.deprecate'),
    ('asset_manager', 'assets.audit_read'),
    ('read_only_analyst', 'assets.audit_read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

create or replace function private.valid_world_asset_collision_profile(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  shape text := p_value ->> 'shape';
  expected_keys text[];
begin
  if jsonb_typeof(p_value) <> 'object' then return false; end if;

  if shape = 'none' then
    expected_keys := array['blocking', 'shape'];
    return p_value = '{"shape":"none","blocking":false}'::jsonb;
  elsif shape = 'rectangle' then
    expected_keys := array['blocking', 'height', 'offsetX', 'offsetY', 'shape', 'width'];
    if jsonb_typeof(p_value -> 'blocking') <> 'boolean'
       or jsonb_typeof(p_value -> 'offsetX') <> 'number'
       or jsonb_typeof(p_value -> 'offsetY') <> 'number'
       or jsonb_typeof(p_value -> 'width') <> 'number'
       or jsonb_typeof(p_value -> 'height') <> 'number'
       or (p_value ->> 'width')::numeric <= 0
       or (p_value ->> 'height')::numeric <= 0
       or abs((p_value ->> 'offsetX')::numeric) > 128
       or abs((p_value ->> 'offsetY')::numeric) > 128
       or (p_value ->> 'width')::numeric > 128
       or (p_value ->> 'height')::numeric > 128 then return false; end if;
  elsif shape = 'capsule' then
    expected_keys := array['blocking', 'endX', 'endY', 'radius', 'shape', 'startX', 'startY'];
    if jsonb_typeof(p_value -> 'blocking') <> 'boolean'
       or jsonb_typeof(p_value -> 'startX') <> 'number'
       or jsonb_typeof(p_value -> 'startY') <> 'number'
       or jsonb_typeof(p_value -> 'endX') <> 'number'
       or jsonb_typeof(p_value -> 'endY') <> 'number'
       or jsonb_typeof(p_value -> 'radius') <> 'number'
       or (p_value ->> 'radius')::numeric <= 0
       or (p_value ->> 'radius')::numeric > 64
       or abs((p_value ->> 'startX')::numeric) > 128
       or abs((p_value ->> 'startY')::numeric) > 128
       or abs((p_value ->> 'endX')::numeric) > 128
       or abs((p_value ->> 'endY')::numeric) > 128
       or ((p_value ->> 'startX')::numeric = (p_value ->> 'endX')::numeric
           and (p_value ->> 'startY')::numeric = (p_value ->> 'endY')::numeric) then return false; end if;
  else
    return false;
  end if;

  return not exists (
    select 1 from jsonb_object_keys(p_value) as item(key)
    where not (item.key = any(expected_keys))
  ) and (select count(*) from jsonb_object_keys(p_value)) = cardinality(expected_keys);
exception when others then
  return false;
end;
$$;

create or replace function private.valid_world_asset_validation_results(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  issue jsonb;
begin
  if jsonb_typeof(p_value) <> 'object'
     or jsonb_typeof(p_value -> 'valid') <> 'boolean'
     or jsonb_typeof(p_value -> 'checkedAt') <> 'string'
     or jsonb_typeof(p_value -> 'issues') <> 'array'
     or jsonb_array_length(p_value -> 'issues') > 100
     or pg_column_size(p_value) > 65536 then return false; end if;

  perform (p_value ->> 'checkedAt')::timestamptz;
  if exists (
    select 1 from jsonb_object_keys(p_value) as item(key)
    where item.key not in ('valid', 'checkedAt', 'issues')
  ) then return false; end if;

  for issue in select value from jsonb_array_elements(p_value -> 'issues') loop
    if jsonb_typeof(issue) <> 'object'
       or issue ->> 'level' not in ('blocking_error', 'warning', 'recommendation', 'passed')
       or coalesce(issue ->> 'code', '') !~ '^[A-Z][A-Z0-9_]{1,79}$'
       or char_length(coalesce(issue ->> 'path', '')) > 160
       or char_length(coalesce(issue ->> 'message', '')) not between 1 and 300
       or issue ->> 'message' ~ '[[:cntrl:]<>]'
       or exists (
         select 1 from jsonb_object_keys(issue) as item(key)
         where item.key not in ('code', 'level', 'path', 'message')
       ) then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.valid_world_asset_rotations(p_value smallint[])
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_value) between 1 and 4
    and p_value <@ array[0,90,180,270]::smallint[]
    and cardinality(p_value) = (
      select count(distinct value)::integer from unnest(p_value) as item(value)
    );
$$;

alter table public.world_assets
  alter column content_hash drop not null,
  alter column storage_path drop not null,
  alter column source_type drop not null,
  alter column media_type drop not null,
  add column game_key text not null default 'starville',
  add column friendly_name text not null default 'Legacy Asset',
  add column asset_type text not null default 'decoration',
  add column category text not null default 'nature',
  add column lifecycle_status text not null default 'draft',
  add column production_status text not null default 'production_candidate',
  add column active_version_id uuid,
  add column development_marker_replacement_key text,
  add column record_version integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add constraint world_assets_game_key_check check (
    char_length(game_key) between 3 and 48 and game_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  ),
  add constraint world_assets_friendly_name_check check (
    char_length(friendly_name) between 1 and 100 and friendly_name = btrim(friendly_name)
    and friendly_name !~ '[[:cntrl:]<>]'
  ),
  add constraint world_assets_asset_type_check check (asset_type in (
    'building', 'shop', 'cooking_station', 'crafting_station', 'home_entrance',
    'decoration', 'tree', 'rock', 'fence', 'lamp', 'sign', 'terrain_tile', 'bridge',
    'farm_plot', 'crop_stage', 'furniture', 'home_interior_object', 'interaction_marker',
    'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
  )),
  add constraint world_assets_category_check check (category in (
    'terrain', 'structure', 'nature', 'boundary', 'lighting', 'signage', 'farming',
    'crop', 'furniture', 'interior', 'interaction', 'inventory', 'recipe', 'shop'
  )),
  add constraint world_assets_lifecycle_check check (
    lifecycle_status in ('draft', 'active', 'deprecated', 'archived')
  ),
  add constraint world_assets_production_check check (
    production_status in ('development_marker', 'production_candidate', 'approved_production', 'deprecated')
  ),
  add constraint world_assets_replacement_key_check check (
    development_marker_replacement_key is null or (
      char_length(development_marker_replacement_key) between 3 and 96
      and development_marker_replacement_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    )
  ),
  add constraint world_assets_record_version_check check (record_version > 0);

alter table public.world_assets
  drop constraint world_assets_source_metadata_check,
  add constraint world_assets_source_metadata_check check (
    (
      approval_status = 'draft'
      and source_type is null and media_type is null
      and width is null and height is null and file_size_bytes is null
    )
    or (
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
  );

update public.world_assets
set friendly_name = initcap(replace(replace(asset_key, '-', ' '), '_', ' ')),
    asset_type = case
      when asset_key like '%cottage%' then 'building'
      when asset_key like '%tree%' then 'tree'
      when asset_key like '%rock%' or asset_key = 'moonstone-marker' then 'rock'
      when asset_key like '%fence%' or asset_key like '%gate%' or asset_key = 'closed-route-marker' then 'fence'
      when asset_key like '%lamp%' then 'lamp'
      when asset_key like '%sign%' or asset_key = 'notice-board' then 'sign'
      when asset_key like '%farm-plot%' then 'farm_plot'
      when asset_key like '%general-store%' then 'shop'
      when asset_key like '%cooking-hearth%' then 'cooking_station'
      when asset_key like '%crafting-workbench%' then 'crafting_station'
      when asset_key like '%home-entrance%' then 'home_entrance'
      else 'decoration'
    end,
    category = case
      when asset_key like '%cottage%' then 'structure'
      when asset_key like '%tree%' or asset_key like '%rock%' or asset_key in ('moonstone-marker', 'bush-round', 'flowers-moon') then 'nature'
      when asset_key like '%fence%' or asset_key like '%gate%'
        or asset_key = 'closed-route-marker' then 'boundary'
      when asset_key like '%lamp%' then 'lighting'
      when asset_key like '%sign%' or asset_key = 'notice-board' then 'signage'
      when asset_key like '%farm-plot%' then 'farming'
      when asset_key like '%general-store%' then 'shop'
      when asset_key like '%cooking-hearth%' or asset_key like '%crafting-workbench%' or asset_key like '%home-entrance%' then 'structure'
      else 'nature'
    end,
    lifecycle_status = case when approval_status = 'deprecated' then 'deprecated' else 'active' end,
    production_status = case when repository_owned then 'development_marker' else 'approved_production' end,
    -- The stable marker is identified by its own asset key. This column belongs to
    -- production candidates that explicitly replace that marker.
    development_marker_replacement_key = null,
    updated_at = created_at;

create unique index world_assets_game_slug_idx on public.world_assets(game_key, asset_key);
create unique index world_assets_replacement_key_idx
  on public.world_assets(game_key, development_marker_replacement_key)
  where development_marker_replacement_key is not null;
create index world_assets_directory_idx
  on public.world_assets(game_key, lifecycle_status, asset_type, category, updated_at desc, id desc);

create table public.world_asset_versions (
  id uuid primary key default gen_random_uuid(),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'processing', 'validation_failed', 'validated', 'in_review',
    'changes_requested', 'rejected', 'approved', 'active', 'deprecated', 'archived'
  )),
  source_kind text not null check (source_kind in (
    'repository_procedural', 'legacy_storage_raster', 'storage_raster'
  )),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  detected_mime_type text check (detected_mime_type is null or detected_mime_type in (
    'application/x-starville-procedural', 'image/png', 'image/webp', 'image/avif'
  )),
  source_width integer check (source_width is null or source_width between 1 and 4096),
  source_height integer check (source_height is null or source_height between 1 and 4096),
  source_size_bytes integer check (source_size_bytes is null or source_size_bytes between 1 and 10485760),
  processed_source_width integer check (processed_source_width is null or processed_source_width between 1 and 8192),
  processed_source_height integer check (processed_source_height is null or processed_source_height between 1 and 8192),
  processed_source_size_bytes integer check (processed_source_size_bytes is null or processed_source_size_bytes between 1 and 8388608),
  processed_preview_width integer check (processed_preview_width is null or processed_preview_width between 1 and 2048),
  processed_preview_height integer check (processed_preview_height is null or processed_preview_height between 1 and 2048),
  processed_preview_size_bytes integer check (processed_preview_size_bytes is null or processed_preview_size_bytes between 1 and 8388608),
  processed_thumbnail_width integer check (processed_thumbnail_width is null or processed_thumbnail_width between 1 and 512),
  processed_thumbnail_height integer check (processed_thumbnail_height is null or processed_thumbnail_height between 1 and 512),
  processed_thumbnail_size_bytes integer check (processed_thumbnail_size_bytes is null or processed_thumbnail_size_bytes between 1 and 8388608),
  processed_source_path text,
  processed_preview_path text,
  processed_thumbnail_path text,
  delivery_source_path text,
  delivery_preview_path text,
  delivery_thumbnail_path text,
  render_width numeric(8,2) check (render_width is null or render_width between 1 and 4096),
  render_height numeric(8,2) check (render_height is null or render_height between 1 and 4096),
  render_scale numeric(7,4) not null default 1 check (render_scale between 0.05 and 8),
  anchor_x numeric(7,6) not null default 0.5 check (anchor_x between 0 and 1),
  anchor_y numeric(7,6) not null default 1 check (anchor_y between 0 and 1),
  foot_anchor_x numeric(7,6) not null default 0.5 check (foot_anchor_x between 0 and 1),
  foot_anchor_y numeric(7,6) not null default 1 check (foot_anchor_y between 0 and 1),
  depth_anchor_x numeric(7,6) not null default 0.5 check (depth_anchor_x between 0 and 1),
  depth_anchor_y numeric(7,6) not null default 1 check (depth_anchor_y between 0 and 1),
  collision_profile jsonb not null default '{"shape":"none","blocking":false}'::jsonb
    check (private.valid_world_asset_collision_profile(collision_profile)),
  supported_rotations smallint[] not null default array[0]::smallint[]
    check (private.valid_world_asset_rotations(supported_rotations)),
  default_rotation smallint not null default 0 check (default_rotation in (0, 90, 180, 270)),
  interaction_compatibility text[] not null default array['decorative']::text[] check (
    cardinality(interaction_compatibility) between 1 and 7
    and interaction_compatibility <@ array[
      'decorative', 'shop', 'cooking_station', 'crafting_station',
      'home_entrance', 'farm_plot', 'sign'
    ]::text[]
  ),
  transparent_background_expected boolean not null default false,
  transparency_result text not null default 'unknown' check (
    transparency_result in ('unknown', 'opaque', 'transparent', 'partial')
  ),
  automated_validation_status text not null default 'pending' check (
    automated_validation_status in ('pending', 'valid', 'invalid')
  ),
  validation_results jsonb
    check (validation_results is null or private.valid_world_asset_validation_results(validation_results)),
  internal_notes text not null default '' check (
    char_length(internal_notes) between 0 and 2000 and internal_notes = btrim(internal_notes)
    and internal_notes !~ '[[:cntrl:]<>]'
  ),
  edit_version integer not null default 1 check (edit_version > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  submitted_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  unique (world_asset_id, version_number),
  unique (world_asset_id, id),
  constraint world_asset_versions_rotation_default_check check (default_rotation = any(supported_rotations)),
  constraint world_asset_versions_processed_path_check check (
    (processed_source_path is null and processed_preview_path is null and processed_thumbnail_path is null)
    or (
      processed_source_path ~ '^starville/[0-9a-f-]{36}/[0-9a-f-]{36}/processed/source\.webp$'
      and processed_preview_path ~ '^starville/[0-9a-f-]{36}/[0-9a-f-]{36}/processed/preview\.webp$'
      and processed_thumbnail_path ~ '^starville/[0-9a-f-]{36}/[0-9a-f-]{36}/processed/thumbnail\.webp$'
    )
  ),
  constraint world_asset_versions_delivery_path_check check (
    (delivery_source_path is null and delivery_preview_path is null and delivery_thumbnail_path is null)
    or (
      delivery_source_path ~ '^starville/[a-z][a-z0-9-]*/v[1-9][0-9]*/source\.webp$'
      and delivery_preview_path ~ '^starville/[a-z][a-z0-9-]*/v[1-9][0-9]*/preview\.webp$'
      and delivery_thumbnail_path ~ '^starville/[a-z][a-z0-9-]*/v[1-9][0-9]*/thumbnail\.webp$'
    )
  ),
  constraint world_asset_versions_file_state_check check (
    source_kind in ('repository_procedural', 'legacy_storage_raster')
    or lifecycle_status in ('draft', 'processing', 'validation_failed', 'archived')
    or (
      checksum_sha256 is not null and detected_mime_type in ('image/png', 'image/webp')
      and source_width is not null and source_height is not null and source_size_bytes is not null
      and processed_source_width is not null and processed_source_height is not null
      and processed_source_size_bytes is not null
      and processed_preview_width is not null and processed_preview_height is not null
      and processed_preview_size_bytes is not null
      and processed_thumbnail_width is not null and processed_thumbnail_height is not null
      and processed_thumbnail_size_bytes is not null
      and processed_source_path is not null and automated_validation_status = 'valid'
    )
  ),
  constraint world_asset_versions_activation_check check (
    lifecycle_status <> 'active'
    or source_kind in ('repository_procedural', 'legacy_storage_raster')
    or delivery_source_path is not null
  )
);

create index world_asset_versions_lifecycle_idx
  on public.world_asset_versions(world_asset_id, lifecycle_status, version_number desc);
create index world_asset_versions_checksum_idx
  on public.world_asset_versions(checksum_sha256)
  where checksum_sha256 is not null;

insert into public.world_asset_versions (
  world_asset_id, version_number, lifecycle_status, source_kind, checksum_sha256,
  detected_mime_type, source_width, source_height, source_size_bytes,
  delivery_source_path, render_width, render_height, automated_validation_status,
  validation_results, interaction_compatibility,
  created_by_admin_id, approved_by_admin_id, created_at, updated_at,
  reviewed_at, approved_at
)
select
  asset.id,
  1,
  case when asset.approval_status = 'deprecated' then 'deprecated' else 'active' end,
  case when asset.source_type = 'storage_raster' then 'legacy_storage_raster' else asset.source_type end,
  asset.content_hash,
  asset.media_type,
  asset.width,
  asset.height,
  asset.file_size_bytes,
  null,
  coalesce(asset.width, 128),
  coalesce(asset.height, 128),
  'valid',
  jsonb_build_object(
    'valid', true,
    'checkedAt', to_char(asset.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'issues', jsonb_build_array(jsonb_build_object(
      'code', 'LEGACY_ASSET_REVIEWED', 'level', 'passed', 'path', '',
      'message', 'Existing reviewed asset was backfilled as immutable version one.'
    ))
  ),
  case asset.asset_type
    when 'shop' then array['shop']::text[]
    when 'cooking_station' then array['cooking_station']::text[]
    when 'crafting_station' then array['crafting_station']::text[]
    when 'home_entrance' then array['home_entrance']::text[]
    when 'farm_plot' then array['farm_plot']::text[]
    when 'sign' then array['sign']::text[]
    else array['decorative']::text[]
  end,
  asset.created_by_admin_id,
  asset.approved_by_admin_id,
  asset.created_at,
  asset.created_at,
  asset.approved_at,
  asset.approved_at
from public.world_assets as asset
on conflict (world_asset_id, version_number) do nothing;

update public.world_assets as asset
set active_version_id = version.id
from public.world_asset_versions as version
where version.world_asset_id = asset.id and version.version_number = 1;

alter table public.world_assets
  add constraint world_assets_active_version_fk
  foreign key (id, active_version_id)
  references public.world_asset_versions(world_asset_id, id)
  on delete restrict,
  add constraint world_assets_active_state_check check (
    (lifecycle_status = 'draft' and active_version_id is null)
    or (lifecycle_status in ('active', 'deprecated') and active_version_id is not null)
    or lifecycle_status = 'archived'
  );

alter table public.world_map_version_assets
  add column world_asset_version_id uuid;

update public.world_map_version_assets as reference
set world_asset_version_id = asset.active_version_id
from public.world_assets as asset
where asset.id = reference.world_asset_id;

alter table public.world_map_version_assets
  alter column world_asset_version_id set not null,
  add constraint world_map_version_assets_version_fk
  foreign key (world_asset_id, world_asset_version_id)
  references public.world_asset_versions(world_asset_id, id)
  on delete restrict;

create index world_map_version_assets_version_idx
  on public.world_map_version_assets(world_asset_version_id, world_map_version_id);

create or replace function private.pin_world_asset_version_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.world_asset_version_id is null then
    select active_version_id into new.world_asset_version_id
    from public.world_assets
    where id = new.world_asset_id and active_version_id is not null;
  end if;
  if new.world_asset_version_id is null or not exists (
    select 1 from public.world_asset_versions
    where id = new.world_asset_version_id and world_asset_id = new.world_asset_id
  ) then
    raise exception using errcode = '23503', message = 'WORLD_ASSET_VERSION_PIN_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger world_map_version_assets_pin_version
before insert or update of world_asset_id, world_asset_version_id
on public.world_map_version_assets
for each row execute function private.pin_world_asset_version_reference();

create table public.world_asset_uploads (
  id uuid primary key default gen_random_uuid(),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  intake_storage_path text not null unique check (
    intake_storage_path ~ '^starville/[0-9a-f-]{36}/[0-9a-f-]{36}/original\.(png|webp)$'
  ),
  original_file_name text not null check (
    char_length(original_file_name) between 1 and 180 and original_file_name = btrim(original_file_name)
    and original_file_name !~ '[/\\[:cntrl:]<>]'
  ),
  declared_mime_type text not null check (declared_mime_type in ('image/png', 'image/webp')),
  declared_size_bytes integer not null check (declared_size_bytes between 1 and 10485760),
  status text not null default 'reserved' check (status in (
    'reserved', 'uploaded', 'processing', 'validated', 'failed', 'cancelled', 'expired'
  )),
  safe_error_code text check (safe_error_code is null or safe_error_code in (
    'UNSUPPORTED_IMAGE', 'MIME_MISMATCH', 'MALFORMED_IMAGE', 'ANIMATED_IMAGE',
    'IMAGE_TOO_LARGE', 'DIMENSIONS_TOO_LARGE', 'DECOMPRESSION_LIMIT',
    'DUPLICATE_CONTENT', 'PROCESSING_FAILED', 'STORAGE_FAILED'
  )),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  detected_mime_type text check (detected_mime_type is null or detected_mime_type in ('image/png', 'image/webp')),
  detected_width integer check (detected_width is null or detected_width between 1 and 4096),
  detected_height integer check (detected_height is null or detected_height between 1 and 4096),
  detected_size_bytes integer check (detected_size_bytes is null or detected_size_bytes between 1 and 10485760),
  validation_results jsonb
    check (validation_results is null or private.valid_world_asset_validation_results(validation_results)),
  revision integer not null default 1 check (revision > 0),
  created_by_admin_id uuid not null references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  completed_at timestamptz,
  constraint world_asset_uploads_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '2 hours'
  ),
  constraint world_asset_uploads_failure_check check (
    (status = 'failed' and safe_error_code is not null)
    or (status <> 'failed' and safe_error_code is null)
  )
);

create index world_asset_uploads_status_expiry_idx
  on public.world_asset_uploads(status, expires_at, id);
create index world_asset_uploads_asset_idx
  on public.world_asset_uploads(world_asset_id, created_at desc, id desc);

create table public.world_asset_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references public.world_asset_uploads(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_reference text check (
    worker_reference is null or (char_length(worker_reference) between 1 and 100 and worker_reference !~ '[[:cntrl:]<>]')
  ),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index world_asset_processing_jobs_claim_idx
  on public.world_asset_processing_jobs(status, available_at, id)
  where status in ('pending', 'processing');

create table public.world_asset_tags (
  id uuid primary key default gen_random_uuid(),
  game_key text not null,
  slug text not null check (
    char_length(slug) between 2 and 48 and slug ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  ),
  display_name text not null check (
    char_length(display_name) between 1 and 64 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  created_at timestamptz not null default now(),
  unique (game_key, slug)
);

create table public.world_asset_version_tags (
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  world_asset_tag_id uuid not null references public.world_asset_tags(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (world_asset_version_id, world_asset_tag_id)
);

create index world_asset_version_tags_tag_idx
  on public.world_asset_version_tags(world_asset_tag_id, world_asset_version_id);

create table public.world_asset_validation_checks (
  id uuid primary key default gen_random_uuid(),
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  validation_run_id uuid not null,
  check_code text not null check (check_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  level text not null check (level in ('blocking_error', 'warning', 'recommendation', 'passed')),
  message text not null check (
    char_length(message) between 1 and 500 and message = btrim(message) and message !~ '[[:cntrl:]<>]'
  ),
  created_at timestamptz not null default now(),
  unique (world_asset_version_id, validation_run_id, check_code)
);

create index world_asset_validation_checks_version_idx
  on public.world_asset_validation_checks(world_asset_version_id, created_at desc, id desc);

create table public.world_asset_reviews (
  id uuid primary key default gen_random_uuid(),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  action text not null check (action in ('submitted', 'changes_requested', 'rejected', 'approved')),
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  reason text not null check (
    char_length(reason) between 12 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create index world_asset_reviews_queue_idx
  on public.world_asset_reviews(world_asset_version_id, created_at desc, id desc);

create table public.world_asset_references (
  id uuid primary key default gen_random_uuid(),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  reference_type text not null check (reference_type in (
    'item_definition', 'crop_definition', 'recipe', 'shop_offer', 'furniture_definition',
    'home_template', 'game_content_definition'
  )),
  reference_key text not null check (
    char_length(reference_key) between 1 and 128 and reference_key ~ '^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$'
  ),
  reference_lifecycle text not null check (reference_lifecycle in ('draft', 'active', 'published')),
  created_at timestamptz not null default now(),
  unique (reference_type, reference_key, world_asset_version_id)
);

create index world_asset_references_asset_idx
  on public.world_asset_references(world_asset_id, reference_lifecycle, id);

create table public.world_asset_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key ~ '^asset\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  action text not null check (char_length(action) between 3 and 80 and action ~ '^[a-z][a-z0-9_]*$'),
  permission_key text not null check (
    permission_key ~ '^assets\.[a-z_]+$' or permission_key = 'maps.edit'
  ),
  actor_admin_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  target_world_asset_id uuid references public.world_assets(id) on delete restrict,
  target_world_asset_version_id uuid references public.world_asset_versions(id) on delete restrict,
  target_upload_id uuid references public.world_asset_uploads(id) on delete restrict,
  target_world_map_id uuid references public.world_maps(id) on delete restrict,
  target_world_map_version_id uuid references public.world_map_versions(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  reason text check (
    reason is null or (
      char_length(reason) between 1 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
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
  unique (request_id, event_key)
);

create index world_asset_audit_created_idx
  on public.world_asset_audit_events(created_at desc, id desc);
create index world_asset_audit_asset_idx
  on public.world_asset_audit_events(target_world_asset_id, created_at desc, id desc);
create index world_asset_audit_version_idx
  on public.world_asset_audit_events(target_world_asset_version_id, created_at desc, id desc);

create table public.world_asset_operation_idempotency (
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  operation text not null check (operation ~ '^[a-z][a-z0-9_]{2,79}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  response_body jsonb not null check (
    jsonb_typeof(response_body) = 'object' and pg_column_size(response_body) <= 131072
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (administrator_user_id, operation, request_id),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index world_asset_operation_idempotency_expiry_idx
  on public.world_asset_operation_idempotency(expires_at);

create table public.world_asset_operation_rate_limits (
  scope text not null check (scope in (
    'directory_read', 'detail_read', 'review_read', 'audit_read', 'candidate_read',
    'upload_create', 'processing_write', 'draft_write', 'validation_write',
    'review_write', 'activation_write', 'deprecation_write', 'replacement_write'
  )),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key),
  check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

create index world_asset_operation_rate_limits_expiry_idx
  on public.world_asset_operation_rate_limits(window_expires_at);

create or replace function private.protect_world_asset_active_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.active_version_id is distinct from old.active_version_id
     and coalesce(current_setting('starville.asset_lifecycle_transition', true), '') <> 'true' then
    raise exception using errcode = '42501', message = 'ASSET_ACTIVE_VERSION_PROTECTED';
  end if;
  return new;
end;
$$;

create trigger world_assets_protect_active_version
before update on public.world_assets
for each row execute function private.protect_world_asset_active_version();

create trigger world_assets_set_updated_at
before update on public.world_assets
for each row execute function private.set_updated_at();

create trigger world_asset_versions_set_updated_at
before update on public.world_asset_versions
for each row execute function private.set_updated_at();

create trigger world_asset_uploads_set_updated_at
before update on public.world_asset_uploads
for each row execute function private.set_updated_at();

create trigger world_asset_processing_jobs_set_updated_at
before update on public.world_asset_processing_jobs
for each row execute function private.set_updated_at();

create or replace function private.protect_world_asset_version_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'ASSET_VERSION_HISTORY_RETAINED';
  end if;

  if old.lifecycle_status in ('rejected', 'approved', 'active', 'deprecated', 'archived') then
    if coalesce(current_setting('starville.asset_lifecycle_transition', true), '') <> 'true' then
      raise exception using errcode = '42501', message = 'APPROVED_ASSET_VERSION_IMMUTABLE';
    end if;
    if (to_jsonb(new) - array[
          'lifecycle_status', 'delivery_source_path', 'delivery_preview_path',
          'delivery_thumbnail_path', 'activated_at', 'edit_version', 'updated_at'
        ]) is distinct from
       (to_jsonb(old) - array[
          'lifecycle_status', 'delivery_source_path', 'delivery_preview_path',
          'delivery_thumbnail_path', 'activated_at', 'edit_version', 'updated_at'
        ]) then
      raise exception using errcode = '42501', message = 'APPROVED_ASSET_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

create trigger world_asset_versions_protect_history
before update or delete on public.world_asset_versions
for each row execute function private.protect_world_asset_version_history();

create or replace function private.reject_world_asset_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ASSET_HISTORY_APPEND_ONLY';
end;
$$;

create trigger world_asset_validation_checks_append_only
before update or delete on public.world_asset_validation_checks
for each row execute function private.reject_world_asset_append_only_mutation();
create trigger world_asset_reviews_append_only
before update or delete on public.world_asset_reviews
for each row execute function private.reject_world_asset_append_only_mutation();
create trigger world_asset_audit_events_append_only
before update or delete on public.world_asset_audit_events
for each row execute function private.reject_world_asset_append_only_mutation();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'world_asset_versions', 'world_asset_uploads', 'world_asset_processing_jobs',
    'world_asset_tags', 'world_asset_version_tags', 'world_asset_validation_checks',
    'world_asset_reviews', 'world_asset_references', 'world_asset_audit_events',
    'world_asset_operation_idempotency', 'world_asset_operation_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end;
$$;

alter table public.world_assets force row level security;
alter table public.world_map_version_assets force row level security;

revoke all on function private.valid_world_asset_collision_profile(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_world_asset_validation_results(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_world_asset_rotations(smallint[])
  from public, anon, authenticated, service_role;
revoke all on function private.pin_world_asset_version_reference()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_world_asset_active_version()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_world_asset_version_history()
  from public, anon, authenticated, service_role;
revoke all on function private.reject_world_asset_append_only_mutation()
  from public, anon, authenticated, service_role;
