-- Starville Phase 10A: server-authoritative modular avatar schema.
-- This migration is additive. It preserves player_profiles.appearance_preset as
-- the safe legacy fallback and publishes no modular avatar content.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('avatar_content.read', 'Read avatar content', 'Read bounded avatar catalog, lifecycle, and validation data.', 'avatar_content', false, true),
  ('avatar_content.audit.read', 'Read avatar audit', 'Read bounded append-only avatar review and audit history.', 'avatar_content', true, true),
  ('avatar_content.edit', 'Edit avatar drafts', 'Create and edit bounded avatar content drafts.', 'avatar_content', false, true),
  ('avatar_content.review', 'Review avatar content', 'Submit, request changes for, or reject avatar content.', 'avatar_content', true, true),
  ('avatar_content.approve', 'Approve avatar content', 'Approve a validated avatar content version.', 'avatar_content', true, true),
  ('avatar_content.activate', 'Activate avatar content', 'Activate or supersede an approved immutable avatar content version.', 'avatar_content', true, true),
  ('avatar_content.settings.read', 'Read avatar settings', 'Read bounded avatar customization settings.', 'avatar_content', false, true),
  ('avatar_content.settings.edit', 'Edit avatar settings', 'Edit bounded avatar customization settings.', 'avatar_content', true, true),
  ('avatar_profile.support.read', 'Read safe avatar profiles', 'Read privacy-safe resolved player appearance for support.', 'avatar_content', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles as role
cross join public.admin_permissions as permission
where role.key = 'super_admin'
  and permission.key in (
    'avatar_content.read', 'avatar_content.audit.read', 'avatar_content.edit',
    'avatar_content.review', 'avatar_content.approve', 'avatar_content.activate',
    'avatar_content.settings.read', 'avatar_content.settings.edit',
    'avatar_profile.support.read'
  )
on conflict (role_id, permission_id) do nothing;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'avatar_content.read'),
    ('game_administrator', 'avatar_content.audit.read'),
    ('game_administrator', 'avatar_content.edit'),
    ('game_administrator', 'avatar_content.review'),
    ('game_administrator', 'avatar_content.approve'),
    ('game_administrator', 'avatar_content.activate'),
    ('game_administrator', 'avatar_content.settings.read'),
    ('game_administrator', 'avatar_profile.support.read'),
    ('live_operations_manager', 'avatar_content.read'),
    ('live_operations_manager', 'avatar_content.audit.read'),
    ('live_operations_manager', 'avatar_content.review'),
    ('content_manager', 'avatar_content.read'),
    ('content_manager', 'avatar_content.edit'),
    ('content_manager', 'avatar_content.review'),
    ('customer_support', 'avatar_profile.support.read'),
    ('read_only_analyst', 'avatar_content.read'),
    ('read_only_analyst', 'avatar_content.audit.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

-- Extend the existing reviewed World Asset Manager registry. Avatar assets use
-- the same intake, processing, approval, activation, and reference protection.
alter table public.world_assets drop constraint world_assets_asset_type_check;
alter table public.world_assets add constraint world_assets_asset_type_check check (asset_type in (
  'building', 'shop', 'cooking_station', 'crafting_station', 'home_entrance',
  'decoration', 'tree', 'rock', 'fence', 'lamp', 'sign', 'terrain_tile', 'bridge',
  'farm_plot', 'crop_stage', 'furniture', 'home_interior_object', 'interaction_marker',
  'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon',
  'brand_logo', 'brand_mark', 'favicon', 'admin_login_background',
  'landing_hero_background', 'social_share_image',
  'avatar_sprite_sheet', 'avatar_layer_sheet', 'avatar_preview', 'avatar_thumbnail',
  'avatar_palette', 'avatar_accessory_sheet'
));

alter table public.world_assets drop constraint world_assets_category_check;
alter table public.world_assets add constraint world_assets_category_check check (category in (
  'terrain', 'structure', 'nature', 'boundary', 'lighting', 'signage', 'farming',
  'crop', 'furniture', 'interior', 'interaction', 'inventory', 'recipe', 'shop',
  'branding', 'avatar'
));

create or replace function private.avatar_unique_smallint_array(p_value smallint[])
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_value) = (
    select count(distinct value)::integer from unnest(p_value) as item(value)
  );
$$;

create or replace function private.avatar_unique_text_array(p_value text[])
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_value) = (
    select count(distinct value)::integer from unnest(p_value) as item(value)
  );
$$;

create or replace function private.avatar_valid_color_tokens(p_value text[])
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_value) between 1 and 16
    and private.avatar_unique_text_array(p_value)
    and not exists (
      select 1 from unnest(p_value) as item(value)
      where item.value !~ '^#[0-9A-Fa-f]{6}$'
    );
$$;

create table public.avatar_body_presets (
  id uuid primary key default gen_random_uuid(),
  preset_key text not null unique,
  display_name text not null,
  frame_width integer not null default 32 check (frame_width between 16 and 512),
  frame_height integer not null default 48 check (frame_height between 16 and 512),
  anchor_x numeric(7,6) not null default 0.5 check (anchor_x between 0 and 1),
  anchor_y numeric(7,6) not null default 1 check (anchor_y between 0 and 1),
  sort_order integer not null check (sort_order between 0 and 10000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avatar_body_presets_key_check check (
    char_length(preset_key) between 3 and 80
    and preset_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint avatar_body_presets_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  )
);

comment on table public.avatar_body_presets is
  'Closed compiled structural body geometries. Legacy appearance_preset remains a separate rendering fallback registry.';

create table public.avatar_content_definitions (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  content_type text not null check (content_type in (
    'base_body', 'skin_tone', 'face', 'eyes', 'eyebrows', 'hair', 'top', 'bottom',
    'footwear', 'accessory', 'activity_override', 'shadow'
  )),
  category text not null check (category in (
    'body', 'skin', 'face', 'hair', 'outfit', 'footwear', 'accessory',
    'activity', 'rendering'
  )),
  content_layer text not null check (content_layer in (
    'base_body', 'skin_tone', 'face', 'eyes', 'eyebrows', 'hair_back', 'hair_front',
    'top', 'bottom', 'footwear', 'head_accessory', 'face_accessory',
    'back_accessory', 'handheld_visual', 'activity_override', 'shadow'
  )),
  display_name text not null,
  description text not null default '',
  access_level text not null default 'starter' check (access_level in (
    'starter', 'standard', 'protected_administrator'
  )),
  enabled boolean not null default true,
  active_version_id uuid,
  record_revision integer not null default 1 check (record_revision > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avatar_content_definitions_key_check check (
    char_length(content_key) between 3 and 80
    and content_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint avatar_content_definitions_name_check check (
    char_length(display_name) between 1 and 100 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  constraint avatar_content_definitions_description_check check (
    char_length(description) between 0 and 500 and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  ),
  constraint avatar_content_definitions_layer_type_check check (
    (content_layer = 'base_body' and content_type = 'base_body' and category = 'body')
    or (content_layer = 'skin_tone' and content_type = 'skin_tone' and category = 'skin')
    or (content_layer in ('face', 'eyes', 'eyebrows') and content_type = content_layer
        and category = 'face')
    or (content_layer in ('hair_back', 'hair_front') and content_type = 'hair'
        and category = 'hair')
    or (content_layer in ('top', 'bottom') and content_type = content_layer
        and category = 'outfit')
    or (content_layer = 'footwear' and content_type = 'footwear' and category = 'footwear')
    or (content_layer in ('head_accessory', 'face_accessory', 'back_accessory', 'handheld_visual')
        and content_type = 'accessory' and category = 'accessory')
    or (content_layer = 'activity_override' and content_type = 'activity_override'
        and category = 'activity')
    or (content_layer = 'shadow' and content_type = 'shadow' and category = 'rendering')
  )
);

create table public.avatar_content_versions (
  id uuid primary key default gen_random_uuid(),
  avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'validating', 'invalid', 'in_review', 'changes_requested', 'approved',
    'active', 'superseded', 'disabled', 'rejected'
  )),
  public_name text not null,
  description text not null default '',
  render_order integer not null check (render_order between -1000 and 1000),
  frame_width integer not null check (frame_width between 1 and 2048),
  frame_height integer not null check (frame_height between 1 and 2048),
  sheet_rows integer not null check (sheet_rows between 1 and 128),
  sheet_columns integer not null check (sheet_columns between 1 and 128),
  padding integer not null default 0 check (padding between 0 and 128),
  preview_scale numeric(7,4) not null default 1 check (preview_scale between 0.05 and 8),
  anchor_x numeric(7,6) not null default 0.5 check (anchor_x between 0 and 1),
  anchor_y numeric(7,6) not null default 1 check (anchor_y between 0 and 1),
  offset_x integer not null default 0 check (offset_x between -512 and 512),
  offset_y integer not null default 0 check (offset_y between -512 and 512),
  depth_behavior text not null default 'layered' check (depth_behavior in (
    'behind_body', 'layered', 'in_front', 'activity_override'
  )),
  casts_shadow boolean not null default false,
  fallback_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  preview_metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(preview_metadata) = 'object' and pg_column_size(preview_metadata) <= 8192
  ),
  configuration jsonb not null default '{}'::jsonb check (
    jsonb_typeof(configuration) = 'object' and pg_column_size(configuration) <= 32768
    and configuration::text !~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
  ),
  edit_revision integer not null default 1 check (edit_revision > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  submitted_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  activated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  disabled_at timestamptz,
  unique (avatar_content_definition_id, version_number),
  unique (avatar_content_definition_id, id),
  constraint avatar_content_versions_public_name_check check (
    char_length(public_name) between 1 and 100 and public_name = btrim(public_name)
    and public_name !~ '[[:cntrl:]<>]'
  ),
  constraint avatar_content_versions_description_check check (
    char_length(description) between 0 and 500 and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  ),
  constraint avatar_content_versions_review_state_check check (
    (lifecycle_status in ('in_review', 'changes_requested', 'approved', 'active', 'superseded', 'disabled', 'rejected') and submitted_at is not null and submitted_by_admin_id is not null)
    or lifecycle_status in ('draft', 'validating', 'invalid')
  ),
  constraint avatar_content_versions_approval_state_check check (
    (lifecycle_status in ('approved', 'active', 'superseded', 'disabled') and approved_at is not null and approved_by_admin_id is not null)
    or lifecycle_status not in ('approved', 'active', 'superseded', 'disabled')
  ),
  constraint avatar_content_versions_activation_state_check check (
    (lifecycle_status in ('active', 'superseded') and activated_at is not null and activated_by_admin_id is not null)
    or lifecycle_status not in ('active', 'superseded')
  )
);

alter table public.avatar_content_definitions
  add constraint avatar_content_definitions_active_version_fk
  foreign key (id, active_version_id)
  references public.avatar_content_versions(avatar_content_definition_id, id)
  on delete restrict;

create unique index avatar_content_versions_one_active_idx
  on public.avatar_content_versions(avatar_content_definition_id)
  where lifecycle_status = 'active';
create index avatar_content_versions_lifecycle_idx
  on public.avatar_content_versions(lifecycle_status, updated_at desc, id desc);

create table public.avatar_content_assets (
  id uuid primary key default gen_random_uuid(),
  avatar_content_version_id uuid not null
    references public.avatar_content_versions(id) on delete restrict,
  asset_role text not null check (asset_role in (
    'sprite_sheet', 'layer_sheet', 'preview', 'thumbnail', 'palette', 'accessory_sheet'
  )),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (avatar_content_version_id, asset_role),
  foreign key (world_asset_id, world_asset_version_id)
    references public.world_asset_versions(world_asset_id, id) on delete restrict
);

create index avatar_content_assets_world_asset_idx
  on public.avatar_content_assets(world_asset_id, world_asset_version_id);

create table public.avatar_content_compatibility (
  id uuid primary key default gen_random_uuid(),
  avatar_content_version_id uuid not null
    references public.avatar_content_versions(id) on delete restrict,
  compatibility_type text not null check (compatibility_type in (
    'body_preset', 'incompatible_content'
  )),
  body_preset_id uuid references public.avatar_body_presets(id) on delete restrict,
  other_avatar_content_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint avatar_content_compatibility_target_check check (
    (compatibility_type = 'body_preset' and body_preset_id is not null and other_avatar_content_version_id is null)
    or (compatibility_type = 'incompatible_content' and body_preset_id is null and other_avatar_content_version_id is not null
        and other_avatar_content_version_id <> avatar_content_version_id)
  )
);

create unique index avatar_content_compatibility_body_idx
  on public.avatar_content_compatibility(avatar_content_version_id, body_preset_id)
  where compatibility_type = 'body_preset';
create unique index avatar_content_compatibility_content_idx
  on public.avatar_content_compatibility(
    least(avatar_content_version_id, other_avatar_content_version_id),
    greatest(avatar_content_version_id, other_avatar_content_version_id)
  ) where compatibility_type = 'incompatible_content';

create table public.avatar_animation_definitions (
  id uuid primary key default gen_random_uuid(),
  avatar_content_version_id uuid not null
    references public.avatar_content_versions(id) on delete restrict,
  direction text not null check (direction in (
    'north', 'northeast', 'east', 'southeast',
    'south', 'southwest', 'west', 'northwest'
  )),
  animation_state text not null check (animation_state in ('idle', 'walk', 'jog')),
  frame_order smallint[] not null check (
    cardinality(frame_order) between 1 and 64
    and private.avatar_unique_smallint_array(frame_order)
  ),
  frame_duration_ms integer not null check (frame_duration_ms between 40 and 2000),
  loop_animation boolean not null default true,
  offset_x integer not null default 0 check (offset_x between -512 and 512),
  offset_y integer not null default 0 check (offset_y between -512 and 512),
  created_at timestamptz not null default now(),
  unique (avatar_content_version_id, direction, animation_state)
);

create table public.avatar_palette_definitions (
  id uuid primary key default gen_random_uuid(),
  palette_key text not null,
  palette_type text not null check (palette_type in ('skin', 'hair')),
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'validating', 'invalid', 'in_review', 'changes_requested', 'approved',
    'active', 'superseded', 'disabled', 'rejected'
  )),
  display_name text not null,
  color_tokens text[] not null check (private.avatar_valid_color_tokens(color_tokens)),
  access_level text not null default 'starter' check (access_level in (
    'starter', 'standard', 'protected_administrator'
  )),
  edit_revision integer not null default 1 check (edit_revision > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  activated_at timestamptz,
  unique (palette_key, version_number),
  constraint avatar_palette_definitions_key_check check (
    char_length(palette_key) between 3 and 80
    and palette_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint avatar_palette_definitions_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  )
);

create unique index avatar_palette_definitions_one_active_idx
  on public.avatar_palette_definitions(palette_key)
  where lifecycle_status = 'active';

create table public.avatar_presets (
  id uuid primary key default gen_random_uuid(),
  preset_key text not null,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'validating', 'invalid', 'in_review', 'changes_requested', 'approved',
    'active', 'superseded', 'disabled', 'rejected'
  )),
  display_name text not null,
  description text not null default '',
  body_preset_id uuid not null references public.avatar_body_presets(id) on delete restrict,
  skin_palette_id uuid references public.avatar_palette_definitions(id) on delete restrict,
  hair_palette_id uuid references public.avatar_palette_definitions(id) on delete restrict,
  edit_revision integer not null default 1 check (edit_revision > 0),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  activated_at timestamptz,
  unique (preset_key, version_number),
  constraint avatar_presets_key_check check (
    char_length(preset_key) between 3 and 80
    and preset_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint avatar_presets_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  constraint avatar_presets_description_check check (
    char_length(description) between 0 and 280 and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  )
);

create unique index avatar_presets_one_active_idx
  on public.avatar_presets(preset_key) where lifecycle_status = 'active';

create table public.avatar_preset_selections (
  avatar_preset_id uuid not null references public.avatar_presets(id) on delete restrict,
  layer_type text not null check (layer_type in (
    'face', 'eyes', 'eyebrows', 'hair', 'top', 'bottom', 'footwear', 'accessory'
  )),
  avatar_content_version_id uuid not null references public.avatar_content_versions(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (avatar_preset_id, layer_type, avatar_content_version_id)
);

create unique index avatar_preset_selections_one_scalar_layer_idx
  on public.avatar_preset_selections(avatar_preset_id, layer_type)
  where layer_type <> 'accessory';

create table public.player_avatar_profiles (
  id uuid primary key default gen_random_uuid(),
  appearance_id uuid not null unique default gen_random_uuid(),
  player_profile_id uuid not null unique references public.player_profiles(id) on delete restrict,
  body_preset_id uuid not null references public.avatar_body_presets(id) on delete restrict,
  skin_palette_id uuid references public.avatar_palette_definitions(id) on delete restrict,
  face_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  eyes_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  eyebrows_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  hair_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  hair_palette_id uuid references public.avatar_palette_definitions(id) on delete restrict,
  top_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  bottom_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  footwear_version_id uuid references public.avatar_content_versions(id) on delete restrict,
  preset_version_id uuid references public.avatar_presets(id) on delete restrict,
  legacy_fallback_preset text not null check (
    legacy_fallback_preset in ('moss', 'marigold', 'moonberry', 'river')
  ),
  revision integer not null default 0 check (revision >= 0),
  creator_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_avatar_profiles_completion_check check (
    (revision = 0 and creator_completed_at is null)
    or (revision > 0 and creator_completed_at is not null)
  )
);

comment on column public.player_avatar_profiles.legacy_fallback_preset is
  'Pinned from player_profiles.appearance_preset for safe rendering whenever the module or modular content is unavailable.';

create table public.player_avatar_profile_accessories (
  player_avatar_profile_id uuid not null
    references public.player_avatar_profiles(id) on delete restrict,
  avatar_content_version_id uuid not null references public.avatar_content_versions(id) on delete restrict,
  sort_order integer not null check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (player_avatar_profile_id, avatar_content_version_id),
  unique (player_avatar_profile_id, sort_order)
);

create table public.player_avatar_profile_history (
  id uuid primary key default gen_random_uuid(),
  player_avatar_profile_id uuid not null
    references public.player_avatar_profiles(id) on delete restrict,
  revision integer not null check (revision > 0),
  actor_type text not null check (actor_type in ('player', 'administrator', 'system')),
  actor_player_profile_id uuid references public.player_profiles(id) on delete restrict,
  actor_admin_user_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  before_profile jsonb not null check (
    jsonb_typeof(before_profile) = 'object' and pg_column_size(before_profile) <= 65536
  ),
  after_profile jsonb not null check (
    jsonb_typeof(after_profile) = 'object' and pg_column_size(after_profile) <= 65536
  ),
  created_at timestamptz not null default now(),
  unique (player_avatar_profile_id, revision),
  unique (actor_type, request_id)
);

create table public.avatar_content_reviews (
  id uuid primary key default gen_random_uuid(),
  avatar_content_version_id uuid not null references public.avatar_content_versions(id) on delete restrict,
  action text not null check (action in (
    'submitted', 'reviewed', 'changes_requested', 'rejected', 'approved',
    'activated', 'superseded', 'disabled'
  )),
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  reason text not null check (
    char_length(reason) between 12 and 500 and reason = btrim(reason)
    and reason !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create table public.avatar_content_validation_results (
  id uuid primary key default gen_random_uuid(),
  avatar_content_version_id uuid not null references public.avatar_content_versions(id) on delete restrict,
  valid boolean not null,
  findings jsonb not null check (
    jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) <= 200
    and pg_column_size(findings) <= 65536
  ),
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (request_id)
);

create table public.avatar_idempotency (
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  operation text not null check (
    char_length(operation) between 3 and 80 and operation ~ '^[a-z][a-z0-9_]*$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null check (
    jsonb_typeof(response_body) = 'object' and pg_column_size(response_body) <= 131072
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (subject_key, operation, request_id),
  constraint avatar_idempotency_expiration_check check (
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  )
);

create table public.avatar_rate_limits (
  scope text not null check (scope in (
    'player_catalog_read', 'player_profile_read', 'player_preview', 'player_create',
    'player_update', 'public_profile_read', 'admin_read', 'admin_mutation',
    'admin_validation', 'admin_activation', 'settings'
  )),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key),
  constraint avatar_rate_limits_window_check check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

create table public.avatar_settings (
  game_key text primary key check (game_key = 'starville'),
  customization_enabled boolean not null default true,
  creator_required_for_new_players boolean not null default true,
  maintenance_mode boolean not null default false,
  max_accessories integer not null default 3 check (max_accessories between 0 and 4),
  fallback_body_preset_id uuid not null references public.avatar_body_presets(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  updated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_avatar_profiles_updated_idx
  on public.player_avatar_profiles(updated_at desc, id desc);
create index player_avatar_profile_history_created_idx
  on public.player_avatar_profile_history(player_avatar_profile_id, created_at desc, id desc);
create index avatar_content_reviews_version_idx
  on public.avatar_content_reviews(avatar_content_version_id, created_at desc, id desc);
create index avatar_content_validation_version_idx
  on public.avatar_content_validation_results(avatar_content_version_id, created_at desc, id desc);
create index avatar_idempotency_expiry_idx on public.avatar_idempotency(expires_at);
create index avatar_rate_limits_expiry_idx on public.avatar_rate_limits(window_expires_at);

insert into public.avatar_body_presets
  (preset_key, display_name, frame_width, frame_height, sort_order)
values
  ('willow-frame', 'Willow Frame', 32, 48, 10),
  ('meadow-frame', 'Meadow Frame', 32, 48, 20),
  ('brook-frame', 'Brook Frame', 32, 48, 30)
on conflict (preset_key) do nothing;

insert into public.avatar_settings (game_key, fallback_body_preset_id)
select 'starville', id from public.avatar_body_presets where preset_key = 'meadow-frame'
on conflict (game_key) do nothing;

insert into public.player_avatar_profiles (
  player_profile_id, body_preset_id, legacy_fallback_preset, revision
)
select profile.id, body.id, profile.appearance_preset, 0
from public.player_profiles as profile
join public.avatar_body_presets as body on body.preset_key = case profile.appearance_preset
  when 'moss' then 'meadow-frame'
  when 'marigold' then 'willow-frame'
  when 'moonberry' then 'brook-frame'
  when 'river' then 'meadow-frame'
end
on conflict (player_profile_id) do nothing;

create or replace function private.create_player_avatar_profile_shell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  body_id uuid;
begin
  select id into body_id
  from public.avatar_body_presets
  where preset_key = case new.appearance_preset
    when 'moss' then 'meadow-frame'
    when 'marigold' then 'willow-frame'
    when 'moonberry' then 'brook-frame'
    when 'river' then 'meadow-frame'
  end and enabled
  for key share;
  if body_id is null then
    raise exception using errcode = '23514', message = 'AVATAR_FALLBACK_BODY_UNAVAILABLE';
  end if;
  insert into public.player_avatar_profiles (
    player_profile_id, body_preset_id, legacy_fallback_preset, revision
  ) values (new.id, body_id, new.appearance_preset, 0)
  on conflict (player_profile_id) do nothing;
  return new;
end;
$$;

create trigger player_profiles_create_avatar_shell
after insert on public.player_profiles
for each row execute function private.create_player_avatar_profile_shell();

create or replace function private.protect_avatar_published_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.lifecycle_status in ('approved', 'active', 'superseded', 'disabled') then
    raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_VERSION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' and old.lifecycle_status in ('approved', 'active', 'superseded', 'disabled') and (
    new.avatar_content_definition_id is distinct from old.avatar_content_definition_id
    or new.version_number is distinct from old.version_number
    or new.public_name is distinct from old.public_name
    or new.description is distinct from old.description
    or new.render_order is distinct from old.render_order
    or new.frame_width is distinct from old.frame_width
    or new.frame_height is distinct from old.frame_height
    or new.sheet_rows is distinct from old.sheet_rows
    or new.sheet_columns is distinct from old.sheet_columns
    or new.padding is distinct from old.padding
    or new.preview_scale is distinct from old.preview_scale
    or new.anchor_x is distinct from old.anchor_x
    or new.anchor_y is distinct from old.anchor_y
    or new.offset_x is distinct from old.offset_x
    or new.offset_y is distinct from old.offset_y
    or new.depth_behavior is distinct from old.depth_behavior
    or new.casts_shadow is distinct from old.casts_shadow
    or new.fallback_version_id is distinct from old.fallback_version_id
    or new.preview_metadata is distinct from old.preview_metadata
    or new.configuration is distinct from old.configuration
    or new.created_by_admin_id is distinct from old.created_by_admin_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_VERSION_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE'
     and old.lifecycle_status = 'active'
     and new.lifecycle_status not in ('active', 'superseded', 'disabled') then
    raise exception using errcode = '42501', message = 'AVATAR_ACTIVE_VERSION_TRANSITION_FORBIDDEN';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger avatar_content_versions_protect_published
before update or delete on public.avatar_content_versions
for each row execute function private.protect_avatar_published_version();

create or replace function private.protect_avatar_version_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_id uuid;
  old_version_id uuid;
  parent_status text;
  old_parent_status text;
begin
  if tg_op = 'DELETE' then
    version_id := old.avatar_content_version_id;
  else
    version_id := new.avatar_content_version_id;
  end if;
  select lifecycle_status into parent_status
  from public.avatar_content_versions where id = version_id;
  if tg_op = 'UPDATE' then
    old_version_id := old.avatar_content_version_id;
    select lifecycle_status into old_parent_status
    from public.avatar_content_versions where id = old_version_id;
  end if;
  if parent_status in ('approved', 'active', 'superseded', 'disabled')
     or old_parent_status in ('approved', 'active', 'superseded', 'disabled') then
    raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_CHILD_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger avatar_content_assets_protect_published
before insert or update or delete on public.avatar_content_assets
for each row execute function private.protect_avatar_version_child();
create trigger avatar_content_compatibility_protect_published
before insert or update or delete on public.avatar_content_compatibility
for each row execute function private.protect_avatar_version_child();
create trigger avatar_animation_definitions_protect_published
before insert or update or delete on public.avatar_animation_definitions
for each row execute function private.protect_avatar_version_child();

create or replace function private.protect_avatar_versioned_catalog_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.lifecycle_status in ('approved', 'active', 'superseded', 'disabled') then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_CATALOG_IMMUTABLE';
    end if;
    if to_jsonb(new) - array['lifecycle_status','activated_at']::text[]
       is distinct from to_jsonb(old) - array['lifecycle_status','activated_at']::text[] then
      raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_CATALOG_IMMUTABLE';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger avatar_palette_definitions_protect_published
before update or delete on public.avatar_palette_definitions
for each row execute function private.protect_avatar_versioned_catalog_row();
create trigger avatar_presets_protect_published
before update or delete on public.avatar_presets
for each row execute function private.protect_avatar_versioned_catalog_row();

create or replace function private.protect_avatar_preset_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_status text;
  old_parent_status text;
begin
  select lifecycle_status into parent_status
  from public.avatar_presets
  where id = case when tg_op = 'DELETE' then old.avatar_preset_id else new.avatar_preset_id end;
  if tg_op = 'UPDATE' then
    select lifecycle_status into old_parent_status
    from public.avatar_presets where id = old.avatar_preset_id;
  end if;
  if parent_status in ('approved', 'active', 'superseded', 'disabled')
     or old_parent_status in ('approved', 'active', 'superseded', 'disabled') then
    raise exception using errcode = '42501', message = 'AVATAR_PUBLISHED_PRESET_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger avatar_preset_selections_protect_published
before insert or update or delete on public.avatar_preset_selections
for each row execute function private.protect_avatar_preset_selection();

create or replace function private.reject_avatar_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'AVATAR_APPEND_ONLY_RECORD_IMMUTABLE';
end;
$$;

create trigger player_avatar_profile_history_append_only
before update or delete on public.player_avatar_profile_history
for each row execute function private.reject_avatar_append_only_mutation();
create trigger avatar_content_reviews_append_only
before update or delete on public.avatar_content_reviews
for each row execute function private.reject_avatar_append_only_mutation();
create trigger avatar_content_validation_append_only
before update or delete on public.avatar_content_validation_results
for each row execute function private.reject_avatar_append_only_mutation();

create trigger avatar_body_presets_set_updated_at
before update on public.avatar_body_presets
for each row execute function private.set_updated_at();
create trigger avatar_content_definitions_set_updated_at
before update on public.avatar_content_definitions
for each row execute function private.set_updated_at();
create trigger avatar_content_versions_set_updated_at
before update on public.avatar_content_versions
for each row execute function private.set_updated_at();
create trigger avatar_palette_definitions_set_updated_at
before update on public.avatar_palette_definitions
for each row execute function private.set_updated_at();
create trigger avatar_presets_set_updated_at
before update on public.avatar_presets
for each row execute function private.set_updated_at();
create trigger player_avatar_profiles_set_updated_at
before update on public.player_avatar_profiles
for each row execute function private.set_updated_at();
create trigger avatar_settings_set_updated_at
before update on public.avatar_settings
for each row execute function private.set_updated_at();

alter table public.avatar_body_presets enable row level security;
alter table public.avatar_body_presets force row level security;
alter table public.avatar_content_definitions enable row level security;
alter table public.avatar_content_definitions force row level security;
alter table public.avatar_content_versions enable row level security;
alter table public.avatar_content_versions force row level security;
alter table public.avatar_content_assets enable row level security;
alter table public.avatar_content_assets force row level security;
alter table public.avatar_content_compatibility enable row level security;
alter table public.avatar_content_compatibility force row level security;
alter table public.avatar_animation_definitions enable row level security;
alter table public.avatar_animation_definitions force row level security;
alter table public.avatar_palette_definitions enable row level security;
alter table public.avatar_palette_definitions force row level security;
alter table public.avatar_presets enable row level security;
alter table public.avatar_presets force row level security;
alter table public.avatar_preset_selections enable row level security;
alter table public.avatar_preset_selections force row level security;
alter table public.player_avatar_profiles enable row level security;
alter table public.player_avatar_profiles force row level security;
alter table public.player_avatar_profile_accessories enable row level security;
alter table public.player_avatar_profile_accessories force row level security;
alter table public.player_avatar_profile_history enable row level security;
alter table public.player_avatar_profile_history force row level security;
alter table public.avatar_content_reviews enable row level security;
alter table public.avatar_content_reviews force row level security;
alter table public.avatar_content_validation_results enable row level security;
alter table public.avatar_content_validation_results force row level security;
alter table public.avatar_idempotency enable row level security;
alter table public.avatar_idempotency force row level security;
alter table public.avatar_rate_limits enable row level security;
alter table public.avatar_rate_limits force row level security;
alter table public.avatar_settings enable row level security;
alter table public.avatar_settings force row level security;

revoke all on table public.avatar_body_presets from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_definitions from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_versions from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_assets from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_compatibility from public, anon, authenticated, service_role;
revoke all on table public.avatar_animation_definitions from public, anon, authenticated, service_role;
revoke all on table public.avatar_palette_definitions from public, anon, authenticated, service_role;
revoke all on table public.avatar_presets from public, anon, authenticated, service_role;
revoke all on table public.avatar_preset_selections from public, anon, authenticated, service_role;
revoke all on table public.player_avatar_profiles from public, anon, authenticated, service_role;
revoke all on table public.player_avatar_profile_accessories from public, anon, authenticated, service_role;
revoke all on table public.player_avatar_profile_history from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_reviews from public, anon, authenticated, service_role;
revoke all on table public.avatar_content_validation_results from public, anon, authenticated, service_role;
revoke all on table public.avatar_idempotency from public, anon, authenticated, service_role;
revoke all on table public.avatar_rate_limits from public, anon, authenticated, service_role;
revoke all on table public.avatar_settings from public, anon, authenticated, service_role;

revoke all on function private.create_player_avatar_profile_shell() from public, anon, authenticated, service_role;
revoke all on function private.avatar_unique_smallint_array(smallint[]) from public, anon, authenticated, service_role;
revoke all on function private.avatar_unique_text_array(text[]) from public, anon, authenticated, service_role;
revoke all on function private.avatar_valid_color_tokens(text[]) from public, anon, authenticated, service_role;
revoke all on function private.protect_avatar_published_version() from public, anon, authenticated, service_role;
revoke all on function private.protect_avatar_version_child() from public, anon, authenticated, service_role;
revoke all on function private.protect_avatar_versioned_catalog_row() from public, anon, authenticated, service_role;
revoke all on function private.protect_avatar_preset_selection() from public, anon, authenticated, service_role;
revoke all on function private.reject_avatar_append_only_mutation() from public, anon, authenticated, service_role;
