-- Starville Phase 10A: narrow avatar functions, lifecycle controls, and RPCs.

-- Extend all closed World Asset Manager helpers used by intake and validation.
create or replace function private.world_asset_transparency_required(p_asset_type text)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select p_asset_type not in (
    'terrain_tile', 'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon',
    'furniture_icon', 'shop_icon', 'avatar_palette'
  );
$$;

create or replace function private.world_asset_max_source_bytes(p_asset_type text)
returns integer
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case
    when p_asset_type in (
      'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon',
      'shop_icon', 'avatar_preview', 'avatar_thumbnail', 'avatar_palette'
    ) then 2097152
    when p_asset_type in (
      'avatar_sprite_sheet', 'avatar_layer_sheet', 'avatar_accessory_sheet'
    ) then 8388608
    else 5242880
  end;
$$;

create or replace function private.world_asset_category_allowed(
  p_asset_type text,
  p_category text
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'building' then p_category in ('structure', 'shop')
    when 'shop' then p_category = 'shop'
    when 'cooking_station' then p_category in ('structure', 'interior')
    when 'crafting_station' then p_category in ('structure', 'interior')
    when 'home_entrance' then p_category = 'structure'
    when 'decoration' then p_category in ('structure', 'nature', 'boundary', 'lighting', 'signage')
    when 'tree' then p_category = 'nature'
    when 'rock' then p_category = 'nature'
    when 'fence' then p_category = 'boundary'
    when 'lamp' then p_category = 'lighting'
    when 'sign' then p_category = 'signage'
    when 'terrain_tile' then p_category = 'terrain'
    when 'bridge' then p_category = 'structure'
    when 'farm_plot' then p_category = 'farming'
    when 'crop_stage' then p_category = 'crop'
    when 'furniture' then p_category in ('furniture', 'interior')
    when 'home_interior_object' then p_category in ('interior', 'furniture')
    when 'interaction_marker' then p_category = 'interaction'
    when 'recipe_icon' then p_category = 'recipe'
    when 'shop_icon' then p_category = 'shop'
    when 'item_icon' then p_category = 'inventory'
    when 'seed_icon' then p_category = 'inventory'
    when 'crop_icon' then p_category = 'inventory'
    when 'furniture_icon' then p_category = 'inventory'
    when 'brand_logo' then p_category = 'branding'
    when 'brand_mark' then p_category = 'branding'
    when 'favicon' then p_category = 'branding'
    when 'admin_login_background' then p_category = 'branding'
    when 'landing_hero_background' then p_category = 'branding'
    when 'social_share_image' then p_category = 'branding'
    when 'avatar_sprite_sheet' then p_category = 'avatar'
    when 'avatar_layer_sheet' then p_category = 'avatar'
    when 'avatar_preview' then p_category = 'avatar'
    when 'avatar_thumbnail' then p_category = 'avatar'
    when 'avatar_palette' then p_category = 'avatar'
    when 'avatar_accessory_sheet' then p_category = 'avatar'
    else false
  end;
$$;

create or replace function private.world_asset_default_interactions(p_asset_type text)
returns text[]
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'shop' then array['shop']::text[]
    when 'cooking_station' then array['cooking_station']::text[]
    when 'crafting_station' then array['crafting_station']::text[]
    when 'home_entrance' then array['home_entrance']::text[]
    when 'farm_plot' then array['farm_plot']::text[]
    when 'sign' then array['sign']::text[]
    else array['decorative']::text[]
  end;
$$;

create or replace function private.world_asset_interactions_allowed(
  p_asset_type text,
  p_interactions text[]
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_interactions) between 1 and 7
    and private.avatar_unique_text_array(p_interactions)
    and p_interactions <@ case p_asset_type
      when 'building' then array['decorative', 'home_entrance']::text[]
      when 'shop' then array['shop']::text[]
      when 'cooking_station' then array['cooking_station']::text[]
      when 'crafting_station' then array['crafting_station']::text[]
      when 'home_entrance' then array['home_entrance']::text[]
      when 'farm_plot' then array['farm_plot']::text[]
      when 'sign' then array['sign']::text[]
      when 'home_interior_object' then array[
        'decorative', 'cooking_station', 'crafting_station'
      ]::text[]
      when 'interaction_marker' then array[
        'decorative', 'shop', 'cooking_station', 'crafting_station',
        'home_entrance', 'farm_plot', 'sign'
      ]::text[]
      else array['decorative']::text[]
    end;
$$;

create or replace function private.validate_avatar_world_asset_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset public.world_assets%rowtype;
  version public.world_asset_versions%rowtype;
  expected_type text;
begin
  select * into asset from public.world_assets where id = new.world_asset_id for key share;
  select * into version from public.world_asset_versions
  where id = new.world_asset_version_id and world_asset_id = new.world_asset_id
  for key share;
  expected_type := case new.asset_role
    when 'sprite_sheet' then 'avatar_sprite_sheet'
    when 'layer_sheet' then 'avatar_layer_sheet'
    when 'preview' then 'avatar_preview'
    when 'thumbnail' then 'avatar_thumbnail'
    when 'palette' then 'avatar_palette'
    when 'accessory_sheet' then 'avatar_accessory_sheet'
  end;
  if asset.id is null or version.id is null
     or asset.asset_type <> expected_type
     or asset.category <> 'avatar'
     or asset.lifecycle_status <> 'active'
     or asset.production_status <> 'approved_production'
     or version.lifecycle_status not in ('approved', 'active')
     or version.automated_validation_status <> 'valid'
     or version.delivery_source_path is null
     or version.collision_profile <> '{"shape":"none","blocking":false}'::jsonb
     or version.interaction_compatibility <> array['decorative']::text[] then
    raise exception using errcode = '23514', message = 'AVATAR_ASSET_NOT_APPROVED';
  end if;
  return new;
end;
$$;

create trigger avatar_content_assets_validate_world_asset
before insert or update of asset_role, world_asset_id, world_asset_version_id
on public.avatar_content_assets
for each row execute function private.validate_avatar_world_asset_reference();

create or replace function private.sync_avatar_world_asset_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_key text;
  version_number integer;
  lifecycle text;
  role_key text;
  reference_key_value text;
begin
  if tg_op = 'DELETE' then
    select definition.content_key, version.version_number, version.lifecycle_status
    into definition_key, version_number, lifecycle
    from public.avatar_content_versions version
    join public.avatar_content_definitions definition
      on definition.id = version.avatar_content_definition_id
    where version.id = old.avatar_content_version_id;
    role_key := old.asset_role;
    reference_key_value := 'avatar:' || definition_key || ':v' || version_number::text || ':' || role_key;
    delete from public.world_asset_references
    where reference_type = 'game_content_definition'
      and reference_key = reference_key_value
      and world_asset_version_id = old.world_asset_version_id
      and reference_lifecycle = 'draft';
    return old;
  end if;

  select definition.content_key, version.version_number, version.lifecycle_status
  into definition_key, version_number, lifecycle
  from public.avatar_content_versions version
  join public.avatar_content_definitions definition
    on definition.id = version.avatar_content_definition_id
  where version.id = new.avatar_content_version_id;
  role_key := new.asset_role;
  reference_key_value := 'avatar:' || definition_key || ':v' || version_number::text || ':' || role_key;
  insert into public.world_asset_references (
    world_asset_id, world_asset_version_id, reference_type,
    reference_key, reference_lifecycle
  ) values (
    new.world_asset_id, new.world_asset_version_id, 'game_content_definition',
    reference_key_value,
    case when lifecycle = 'active' then 'active'
         when lifecycle in ('approved', 'superseded', 'disabled') then 'published'
         else 'draft' end
  )
  on conflict (reference_type, reference_key, world_asset_version_id) do update
  set reference_lifecycle = excluded.reference_lifecycle;
  return new;
end;
$$;

create trigger avatar_content_assets_sync_world_reference
after insert or update or delete on public.avatar_content_assets
for each row execute function private.sync_avatar_world_asset_reference();

create or replace function private.sync_avatar_version_asset_reference_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare definition_key text;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then return new; end if;
  select content_key into strict definition_key
  from public.avatar_content_definitions where id = new.avatar_content_definition_id;
  update public.world_asset_references reference set
    reference_lifecycle = case
      when new.lifecycle_status = 'active' then 'active'
      when new.lifecycle_status in ('approved', 'superseded', 'disabled') then 'published'
      else 'draft'
    end
  from public.avatar_content_assets mapping
  where mapping.avatar_content_version_id = new.id
    and reference.world_asset_id = mapping.world_asset_id
    and reference.world_asset_version_id = mapping.world_asset_version_id
    and reference.reference_type = 'game_content_definition'
    and reference.reference_key =
      'avatar:' || definition_key || ':v' || new.version_number::text || ':' || mapping.asset_role;
  return new;
end;
$$;

create trigger avatar_content_versions_sync_world_references
after update of lifecycle_status on public.avatar_content_versions
for each row execute function private.sync_avatar_version_asset_reference_lifecycle();

create or replace function private.avatar_module_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select module ->> 'enabled' = 'true'
    from public.game_platform_active_configuration active
    join public.game_platforms platform on platform.id = active.game_platform_id
    join public.game_platform_configuration_versions version
      on version.id = active.configuration_version_id
     and version.game_platform_id = active.game_platform_id
    cross join lateral jsonb_array_elements(version.configuration -> 'modules') module
    where platform.key = 'starville' and platform.status = 'active'
      and module ->> 'key' = 'avatar_customization'
    limit 1
  ), false);
$$;

create or replace function private.avatar_module_enabled_locked()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  active_record public.game_platform_active_configuration%rowtype;
  enabled boolean;
begin
  select active.* into active_record
  from public.game_platform_active_configuration active
  join public.game_platforms platform on platform.id = active.game_platform_id
  where platform.key = 'starville'
  for share of active;
  if active_record.game_platform_id is null then return false; end if;
  select coalesce(bool_or(module ->> 'enabled' = 'true'), false) into enabled
  from public.game_platform_configuration_versions version
  cross join lateral jsonb_array_elements(version.configuration -> 'modules') module
  where version.id = active_record.configuration_version_id
    and module ->> 'key' = 'avatar_customization';
  return coalesce(enabled, false);
end;
$$;

create or replace function private.claim_avatar_rate_limit(
  p_scope text,
  p_subject_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_scope not in (
       'player_catalog_read', 'player_profile_read', 'player_preview', 'player_create',
       'player_update', 'public_profile_read', 'admin_read', 'admin_mutation',
       'admin_validation', 'admin_activation', 'settings'
     )
     or char_length(coalesce(p_subject_key, '')) not between 1 and 128
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_RATE_LIMIT_INPUT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avatar-rate:' || p_scope || ':' || p_subject_key, 0)
  );
  insert into public.avatar_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (scope, subject_key) do update set
    attempt_count = case when avatar_rate_limits.window_expires_at <= now()
                         then 1 else avatar_rate_limits.attempt_count + 1 end,
    window_started_at = case when avatar_rate_limits.window_expires_at <= now()
                             then now() else avatar_rate_limits.window_started_at end,
    window_expires_at = case when avatar_rate_limits.window_expires_at <= now()
                             then now() + make_interval(secs => p_window_seconds)
                             else avatar_rate_limits.window_expires_at end,
    updated_at = now()
  where avatar_rate_limits.window_expires_at <= now()
     or avatar_rate_limits.attempt_count < p_limit
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function private.avatar_player_denial(
  p_access_session public.wallet_access_sessions,
  p_profile public.player_profiles
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare denial text;
declare settings public.avatar_settings%rowtype;
begin
  denial := private.realtime_access_denial(p_access_session, p_profile);
  if denial = 'player_suspended' then return 'suspended'; end if;
  if denial is not null then return denial; end if;
  select * into settings from public.avatar_settings where game_key = 'starville';
  if settings.maintenance_mode then return 'maintenance'; end if;
  return null;
end;
$$;

create or replace function private.avatar_asset_descriptors(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'role', mapping.asset_role,
    'assetId', mapping.world_asset_id,
    'assetVersionId', mapping.world_asset_version_id,
    'bucket', 'game-assets',
    'objectPath', version.delivery_source_path,
    'previewObjectPath', version.delivery_preview_path,
    'thumbnailObjectPath', version.delivery_thumbnail_path,
    'width', version.processed_source_width,
    'height', version.processed_source_height
  ) order by mapping.asset_role), '[]'::jsonb)
  from public.avatar_content_assets mapping
  join public.world_assets asset on asset.id = mapping.world_asset_id
  join public.world_asset_versions version
    on version.id = mapping.world_asset_version_id
   and version.world_asset_id = mapping.world_asset_id
  where mapping.avatar_content_version_id = p_version_id
    and asset.lifecycle_status = 'active'
    and asset.production_status = 'approved_production'
    and version.lifecycle_status in ('approved', 'active')
    and version.delivery_source_path is not null;
$$;

create or replace function private.avatar_animation_json(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'direction', direction,
    'state', animation_state,
    'frames', to_jsonb(frame_order),
    'frameDurationMs', frame_duration_ms,
    'loop', loop_animation,
    'offsetX', offset_x,
    'offsetY', offset_y
  ) order by animation_state, direction), '[]'::jsonb)
  from public.avatar_animation_definitions
  where avatar_content_version_id = p_version_id;
$$;

create or replace function private.avatar_catalog_item_json(
  p_definition public.avatar_content_definitions,
  p_version public.avatar_content_versions,
  p_reveal_protected_key boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'key', case when p_definition.access_level = 'protected_administrator'
                     and not p_reveal_protected_key then null else p_definition.content_key end,
    'type', p_definition.content_type,
    'category', p_definition.category,
    'layer', p_definition.content_layer,
    'label', p_version.public_name,
    'description', p_version.description,
    'accessLevel', p_definition.access_level,
    'versionId', p_version.id,
    'versionNumber', p_version.version_number,
    'renderOrder', p_version.render_order,
    'frameWidth', p_version.frame_width,
    'frameHeight', p_version.frame_height,
    'sheetRows', p_version.sheet_rows,
    'sheetColumns', p_version.sheet_columns,
    'padding', p_version.padding,
    'previewScale', p_version.preview_scale,
    'anchorX', p_version.anchor_x,
    'anchorY', p_version.anchor_y,
    'offsetX', p_version.offset_x,
    'offsetY', p_version.offset_y,
    'depthBehavior', p_version.depth_behavior,
    'castsShadow', p_version.casts_shadow,
    'assets', private.avatar_asset_descriptors(p_version.id),
    'animations', private.avatar_animation_json(p_version.id),
    'compatibleBodyPresetKeys', (
      select coalesce(jsonb_agg(body.preset_key order by body.sort_order), '[]'::jsonb)
      from public.avatar_content_compatibility compatibility
      join public.avatar_body_presets body on body.id = compatibility.body_preset_id
      where compatibility.avatar_content_version_id = p_version.id
        and compatibility.compatibility_type = 'body_preset'
    )
  );
$$;

create or replace function private.avatar_preset_selection_json(
  p_preset public.avatar_presets
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected as (
    select selection.layer_type, definition.content_key, selection.sort_order
    from public.avatar_preset_selections selection
    join public.avatar_content_versions version
      on version.id = selection.avatar_content_version_id
     and version.lifecycle_status = 'active'
    join public.avatar_content_definitions definition
      on definition.id = version.avatar_content_definition_id
     and definition.active_version_id = version.id
     and definition.enabled
    where selection.avatar_preset_id = p_preset.id
  )
  select jsonb_build_object(
    'bodyPresetKey', body.preset_key,
    'skinPaletteKey', skin.palette_key,
    'faceKey', (select content_key from selected where layer_type = 'face' limit 1),
    'eyesKey', (select content_key from selected where layer_type = 'eyes' limit 1),
    'eyebrowsKey', (select content_key from selected where layer_type = 'eyebrows' limit 1),
    'hairKey', (select content_key from selected where layer_type = 'hair' limit 1),
    'hairPaletteKey', hair.palette_key,
    'topKey', (select content_key from selected where layer_type = 'top' limit 1),
    'bottomKey', (select content_key from selected where layer_type = 'bottom' limit 1),
    'footwearKey', (select content_key from selected where layer_type = 'footwear' limit 1),
    'accessoryKeys', (select coalesce(jsonb_agg(content_key order by sort_order), '[]'::jsonb)
                      from selected where layer_type = 'accessory'),
    'presetKey', p_preset.preset_key
  )
  from public.avatar_body_presets body
  left join public.avatar_palette_definitions skin on skin.id = p_preset.skin_palette_id
  left join public.avatar_palette_definitions hair on hair.id = p_preset.hair_palette_id
  where body.id = p_preset.body_preset_id;
$$;

create or replace function private.valid_avatar_public_key(p_value text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_value is not null
    and char_length(p_value) between 3 and 80
    and p_value ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$';
$$;

create or replace function private.avatar_content_selection_json(
  p_version_id uuid,
  p_include_assets boolean,
  p_reveal_protected_key boolean
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when definition.id is null then null else jsonb_build_object(
    'key', case when definition.access_level = 'protected_administrator'
                     and not p_reveal_protected_key then null else definition.content_key end,
    'type', definition.content_type,
    'versionId', version.id,
    'versionNumber', version.version_number,
    'renderOrder', version.render_order,
    'assets', case when p_include_assets
                   then private.avatar_asset_descriptors(version.id) else '[]'::jsonb end
  ) end
  from public.avatar_content_versions version
  join public.avatar_content_definitions definition
    on definition.id = version.avatar_content_definition_id
  where version.id = p_version_id
    and version.lifecycle_status = 'active'
    and definition.enabled
    and definition.active_version_id = version.id;
$$;

create or replace function private.avatar_profile_json(
  p_profile public.player_avatar_profiles,
  p_include_assets boolean default true,
  p_reveal_protected_key boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'appearanceId', p_profile.appearance_id,
    'revision', p_profile.revision,
    'creatorCompleted', p_profile.creator_completed_at is not null,
    'moduleEnabled', private.avatar_module_enabled(),
    'legacyFallbackPreset', p_profile.legacy_fallback_preset,
    'bodyPresetKey', body.preset_key,
    'skinPaletteKey', skin.palette_key,
    'selections', jsonb_build_object(
      'face', private.avatar_content_selection_json(p_profile.face_version_id, p_include_assets, p_reveal_protected_key),
      'eyes', private.avatar_content_selection_json(p_profile.eyes_version_id, p_include_assets, p_reveal_protected_key),
      'eyebrows', private.avatar_content_selection_json(p_profile.eyebrows_version_id, p_include_assets, p_reveal_protected_key),
      'hair', private.avatar_content_selection_json(p_profile.hair_version_id, p_include_assets, p_reveal_protected_key),
      'top', private.avatar_content_selection_json(p_profile.top_version_id, p_include_assets, p_reveal_protected_key),
      'bottom', private.avatar_content_selection_json(p_profile.bottom_version_id, p_include_assets, p_reveal_protected_key),
      'footwear', private.avatar_content_selection_json(p_profile.footwear_version_id, p_include_assets, p_reveal_protected_key)
    ),
    'hairPaletteKey', hair.palette_key,
    'accessories', (
      select coalesce(jsonb_agg(
        private.avatar_content_selection_json(
          accessory.avatar_content_version_id,
          p_include_assets,
          p_reveal_protected_key
        ) order by accessory.sort_order
      ) filter (where private.avatar_content_selection_json(
          accessory.avatar_content_version_id,
          p_include_assets,
          p_reveal_protected_key
        ) is not null), '[]'::jsonb)
      from public.player_avatar_profile_accessories accessory
      where accessory.player_avatar_profile_id = p_profile.id
    ),
    'presetKey', preset.preset_key,
    'updatedAt', p_profile.updated_at
  )
  from public.avatar_body_presets body
  left join public.avatar_palette_definitions skin
    on skin.id = p_profile.skin_palette_id and skin.lifecycle_status = 'active'
  left join public.avatar_palette_definitions hair
    on hair.id = p_profile.hair_palette_id and hair.lifecycle_status = 'active'
  left join public.avatar_presets preset
    on preset.id = p_profile.preset_version_id and preset.lifecycle_status = 'active'
  where body.id = p_profile.body_preset_id;
$$;

create or replace function private.resolve_active_avatar_content(
  p_content_key text,
  p_content_type text,
  p_allow_protected boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select version.id
  from public.avatar_content_definitions definition
  join public.avatar_content_versions version
    on version.id = definition.active_version_id
   and version.avatar_content_definition_id = definition.id
  where definition.content_key = p_content_key
    and definition.content_type = p_content_type
    and definition.enabled
    and version.lifecycle_status = 'active'
    and (p_allow_protected or definition.access_level <> 'protected_administrator');
$$;

create or replace function private.resolve_avatar_selection(
  p_selection jsonb,
  p_allow_protected boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key_name text;
  key_value text;
  body_id uuid;
  skin_id uuid;
  face_id uuid;
  eyes_id uuid;
  eyebrows_id uuid;
  hair_id uuid;
  hair_palette_id uuid;
  top_id uuid;
  bottom_id uuid;
  footwear_id uuid;
  preset_id uuid;
  accessory_ids uuid[] := array[]::uuid[];
  selected_ids uuid[];
  max_accessories integer;
begin
  if jsonb_typeof(p_selection) is distinct from 'object'
     or pg_column_size(p_selection) > 32768
     or p_selection::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
     or exists (
       select 1 from jsonb_object_keys(p_selection) item(key)
       where item.key not in (
         'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
         'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey',
         'accessoryKeys', 'presetKey'
       )
     )
     or jsonb_typeof(p_selection -> 'accessoryKeys') is distinct from 'array'
     or jsonb_array_length(p_selection -> 'accessoryKeys') > 4 then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  foreach key_name in array array[
    'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
    'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey', 'presetKey'
  ] loop
    if p_selection ? key_name
       and jsonb_typeof(p_selection -> key_name) not in ('string', 'null') then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    key_value := p_selection ->> key_name;
    if key_value is not null and not private.valid_avatar_public_key(key_value) then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
  end loop;
  if p_selection ->> 'bodyPresetKey' is null
     or exists (
       select 1 from jsonb_array_elements(p_selection -> 'accessoryKeys') item
       where jsonb_typeof(item) <> 'string'
          or not private.valid_avatar_public_key(item #>> '{}')
     )
     or (select count(*) from jsonb_array_elements_text(p_selection -> 'accessoryKeys')) <>
        (select count(distinct item) from jsonb_array_elements_text(p_selection -> 'accessoryKeys') item) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  select id into body_id from public.avatar_body_presets
  where preset_key = p_selection ->> 'bodyPresetKey' and enabled;
  if body_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;

  if p_selection ->> 'skinPaletteKey' is not null then
    select id into skin_id from public.avatar_palette_definitions
    where palette_key = p_selection ->> 'skinPaletteKey'
      and palette_type = 'skin' and lifecycle_status = 'active'
      and (p_allow_protected or access_level <> 'protected_administrator');
    if skin_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;
  if p_selection ->> 'hairPaletteKey' is not null then
    select id into hair_palette_id from public.avatar_palette_definitions
    where palette_key = p_selection ->> 'hairPaletteKey'
      and palette_type = 'hair' and lifecycle_status = 'active'
      and (p_allow_protected or access_level <> 'protected_administrator');
    if hair_palette_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;
  if p_selection ->> 'presetKey' is not null then
    select id into preset_id from public.avatar_presets
    where preset_key = p_selection ->> 'presetKey' and lifecycle_status = 'active';
    if preset_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;

  face_id := private.resolve_active_avatar_content(p_selection ->> 'faceKey', 'face', p_allow_protected);
  eyes_id := private.resolve_active_avatar_content(p_selection ->> 'eyesKey', 'eyes', p_allow_protected);
  eyebrows_id := private.resolve_active_avatar_content(p_selection ->> 'eyebrowsKey', 'eyebrows', p_allow_protected);
  hair_id := private.resolve_active_avatar_content(p_selection ->> 'hairKey', 'hair', p_allow_protected);
  top_id := private.resolve_active_avatar_content(p_selection ->> 'topKey', 'top', p_allow_protected);
  bottom_id := private.resolve_active_avatar_content(p_selection ->> 'bottomKey', 'bottom', p_allow_protected);
  footwear_id := private.resolve_active_avatar_content(p_selection ->> 'footwearKey', 'footwear', p_allow_protected);
  if (p_selection ->> 'faceKey' is not null and face_id is null)
     or (p_selection ->> 'eyesKey' is not null and eyes_id is null)
     or (p_selection ->> 'eyebrowsKey' is not null and eyebrows_id is null)
     or (p_selection ->> 'hairKey' is not null and hair_id is null)
     or (p_selection ->> 'topKey' is not null and top_id is null)
     or (p_selection ->> 'bottomKey' is not null and bottom_id is null)
     or (p_selection ->> 'footwearKey' is not null and footwear_id is null) then
    return jsonb_build_object('status', 'content_unavailable');
  end if;

  select coalesce(array_agg(version.id order by requested.ordinality), array[]::uuid[])
  into accessory_ids
  from jsonb_array_elements_text(p_selection -> 'accessoryKeys')
       with ordinality requested(content_key, ordinality)
  join public.avatar_content_definitions definition
    on definition.content_key = requested.content_key
   and definition.content_type = 'accessory'
   and definition.enabled
   and (p_allow_protected or definition.access_level <> 'protected_administrator')
  join public.avatar_content_versions version
    on version.id = definition.active_version_id
   and version.lifecycle_status = 'active';
  if cardinality(accessory_ids) <> jsonb_array_length(p_selection -> 'accessoryKeys') then
    return jsonb_build_object('status', 'content_unavailable');
  end if;
  select max_accessories into max_accessories from public.avatar_settings where game_key = 'starville';
  if cardinality(accessory_ids) > coalesce(max_accessories, 0) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  selected_ids := array_remove(array[
    face_id, eyes_id, eyebrows_id, hair_id, top_id, bottom_id, footwear_id
  ]::uuid[], null) || accessory_ids;
  if exists (
    select 1
    from unnest(selected_ids) selected(version_id)
    where exists (
      select 1 from public.avatar_content_compatibility compatibility
      where compatibility.avatar_content_version_id = selected.version_id
        and compatibility.compatibility_type = 'body_preset'
    ) and not exists (
      select 1 from public.avatar_content_compatibility compatibility
      where compatibility.avatar_content_version_id = selected.version_id
        and compatibility.compatibility_type = 'body_preset'
        and compatibility.body_preset_id = body_id
    )
  ) or exists (
    select 1 from public.avatar_content_compatibility compatibility
    where compatibility.compatibility_type = 'incompatible_content'
      and compatibility.avatar_content_version_id = any(selected_ids)
      and compatibility.other_avatar_content_version_id = any(selected_ids)
  ) then
    return jsonb_build_object('status', 'incompatible_selection');
  end if;

  return jsonb_build_object(
    'status', 'resolved',
    'bodyPresetId', body_id,
    'skinPaletteId', skin_id,
    'faceVersionId', face_id,
    'eyesVersionId', eyes_id,
    'eyebrowsVersionId', eyebrows_id,
    'hairVersionId', hair_id,
    'hairPaletteId', hair_palette_id,
    'topVersionId', top_id,
    'bottomVersionId', bottom_id,
    'footwearVersionId', footwear_id,
    'accessoryVersionIds', to_jsonb(accessory_ids),
    'presetVersionId', preset_id
  );
exception when others then
  return jsonb_build_object('status', 'invalid_selection');
end;
$$;

create or replace function private.avatar_player_context(
  p_wallet_address text,
  p_access_session_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access_session public.wallet_access_sessions%rowtype;
  player public.player_profiles%rowtype;
  denial text;
begin
  if p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'access_revoked');
  end if;
  select * into access_session from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash
    and wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;
  select * into player from public.player_profiles
  where wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  denial := private.avatar_player_denial(access_session, player);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  return jsonb_build_object(
    'status', 'authorized', 'accessSessionId', access_session.id, 'playerProfileId', player.id
  );
end;
$$;

create or replace function public.get_player_avatar_catalog(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare items jsonb;
declare palettes jsonb;
declare presets jsonb;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  if not private.claim_avatar_rate_limit('player_catalog_read', p_wallet_address, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not private.avatar_module_enabled() then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  select coalesce(jsonb_agg(private.avatar_catalog_item_json(definition, version, false)
                    order by definition.content_type, definition.display_name), '[]'::jsonb)
  into items
  from public.avatar_content_definitions definition
  join public.avatar_content_versions version on version.id = definition.active_version_id
  where definition.enabled and version.lifecycle_status = 'active'
    and definition.access_level = 'starter';
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', palette.palette_key, 'type', palette.palette_type,
    'label', palette.display_name, 'colors', to_jsonb(palette.color_tokens),
    'versionId', palette.id, 'versionNumber', palette.version_number
  ) order by palette.palette_type, palette.display_name), '[]'::jsonb)
  into palettes
  from public.avatar_palette_definitions palette
  where palette.lifecycle_status = 'active' and palette.access_level = 'starter';
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', preset.preset_key, 'label', preset.display_name,
    'versionId', preset.id, 'versionNumber', preset.version_number,
    'selection', private.avatar_preset_selection_json(preset)
  ) order by preset.display_name), '[]'::jsonb)
  into presets from public.avatar_presets preset where preset.lifecycle_status = 'active';
  return jsonb_build_object(
    'status', 'loaded', 'catalog', jsonb_build_object(
    'bodyPresets', (select coalesce(jsonb_agg(jsonb_build_object(
      'key', body.preset_key, 'label', body.display_name,
      'frameWidth', body.frame_width, 'frameHeight', body.frame_height,
      'anchorX', body.anchor_x, 'anchorY', body.anchor_y
    ) order by body.sort_order), '[]'::jsonb) from public.avatar_body_presets body where body.enabled),
    'items', items,
    'palettes', palettes,
    'presets', presets,
    'limits', (select jsonb_build_object('maxAccessories', settings.max_accessories)
               from public.avatar_settings settings where settings.game_key = 'starville'))
  );
end;
$$;

create or replace function public.get_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare profile public.player_avatar_profiles%rowtype;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  if not private.claim_avatar_rate_limit('player_profile_read', p_wallet_address, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into profile from public.player_avatar_profiles
  where player_profile_id = (context ->> 'playerProfileId')::uuid;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'loaded', 'profile', private.avatar_profile_json(profile, true, true));
end;
$$;

create or replace function public.preview_player_avatar(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare resolved jsonb;
declare version_id uuid;
declare items jsonb := '[]'::jsonb;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  if not private.claim_avatar_rate_limit('player_preview', p_wallet_address, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not private.avatar_module_enabled() then return jsonb_build_object('status', 'module_disabled'); end if;
  resolved := private.resolve_avatar_selection(p_selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  for version_id in
    select value::text::uuid from jsonb_array_elements(
      jsonb_build_array(
        resolved -> 'faceVersionId', resolved -> 'eyesVersionId',
        resolved -> 'eyebrowsVersionId', resolved -> 'hairVersionId',
        resolved -> 'topVersionId', resolved -> 'bottomVersionId',
        resolved -> 'footwearVersionId'
      ) || coalesce(resolved -> 'accessoryVersionIds', '[]'::jsonb)
    ) value where jsonb_typeof(value) = 'string'
  loop
    items := items || jsonb_build_array(private.avatar_content_selection_json(version_id, true, false));
  end loop;
  return jsonb_build_object('status', 'previewed', 'preview', jsonb_build_object(
    'selection', p_selection, 'resolvedVersionIds', resolved, 'items', items
  ));
end;
$$;

create or replace function private.mutate_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text,
  p_operation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  access_session public.wallet_access_sessions%rowtype;
  player public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  avatar public.player_avatar_profiles%rowtype;
  settings public.avatar_settings%rowtype;
  denial text;
  resolved jsonb;
  request_hash_value text;
  replay_hash text;
  replay_response jsonb;
  before_profile jsonb;
  after_profile jsonb;
  result jsonb;
  accessory jsonb;
  accessory_order integer := 0;
  selected_ids uuid[];
begin
  if p_operation not in ('create', 'update')
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or p_expected_revision is null or p_expected_revision < 0
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PROFILE_MUTATION';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_operation || ':' || p_expected_revision::text || ':' || p_selection::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-idempotency:' || p_wallet_address || ':' || p_operation || ':' || p_request_id, 0
  ));

  select * into access_session from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash
    and wallet_address = p_wallet_address
  for share;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;
  select * into player from public.player_profiles
  where wallet_address = p_wallet_address
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  denial := private.avatar_player_denial(access_session, player);
  if denial is not null then return jsonb_build_object('status', denial); end if;

  select request_hash, response_body into replay_hash, replay_response
  from public.avatar_idempotency
  where subject_key = p_wallet_address and operation = 'player_' || p_operation
    and request_id = p_request_id and expires_at > now();
  if replay_response is not null then
    if replay_hash = request_hash_value then return replay_response; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;

  if not private.avatar_module_enabled_locked() then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  select * into settings from public.avatar_settings
  where game_key = 'starville' for share;
  if settings.maintenance_mode then return jsonb_build_object('status', 'maintenance'); end if;
  if not settings.customization_enabled then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  if not private.claim_avatar_rate_limit(
    case p_operation when 'create' then 'player_create' else 'player_update' end,
    p_wallet_address, 20, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;

  select * into moderation from public.player_moderation_states
  where player_profile_id = player.id for share;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  select * into avatar from public.player_avatar_profiles
  where player_profile_id = player.id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if (p_operation = 'create' and (avatar.revision <> 0 or avatar.creator_completed_at is not null))
     or (p_operation = 'update' and avatar.creator_completed_at is null)
     or avatar.revision <> p_expected_revision then
    return jsonb_build_object(
      'status', 'profile_changed',
      'profile', private.avatar_profile_json(avatar, true, true)
    );
  end if;

  resolved := private.resolve_avatar_selection(p_selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  selected_ids := array_remove(array[
    (resolved ->> 'faceVersionId')::uuid,
    (resolved ->> 'eyesVersionId')::uuid,
    (resolved ->> 'eyebrowsVersionId')::uuid,
    (resolved ->> 'hairVersionId')::uuid,
    (resolved ->> 'topVersionId')::uuid,
    (resolved ->> 'bottomVersionId')::uuid,
    (resolved ->> 'footwearVersionId')::uuid
  ]::uuid[], null) || coalesce(array(
    select value::text::uuid
    from jsonb_array_elements(resolved -> 'accessoryVersionIds') item(value)
  ), array[]::uuid[]);
  perform 1
  from public.avatar_content_versions version
  join public.avatar_content_definitions definition
    on definition.id = version.avatar_content_definition_id
  where version.id = any(selected_ids)
    and version.lifecycle_status = 'active'
    and definition.enabled and definition.active_version_id = version.id
  for share of version, definition;
  perform 1 from public.avatar_body_presets
  where id = (resolved ->> 'bodyPresetId')::uuid and enabled for share;
  if resolved ->> 'skinPaletteId' is not null then
    perform 1 from public.avatar_palette_definitions
    where id = (resolved ->> 'skinPaletteId')::uuid and lifecycle_status = 'active' for share;
  end if;
  if resolved ->> 'hairPaletteId' is not null then
    perform 1 from public.avatar_palette_definitions
    where id = (resolved ->> 'hairPaletteId')::uuid and lifecycle_status = 'active' for share;
  end if;
  if resolved ->> 'presetVersionId' is not null then
    perform 1 from public.avatar_presets
    where id = (resolved ->> 'presetVersionId')::uuid and lifecycle_status = 'active' for share;
  end if;

  before_profile := private.avatar_profile_json(avatar, true, true);
  delete from public.player_avatar_profile_accessories
  where player_avatar_profile_id = avatar.id;
  update public.player_avatar_profiles set
    body_preset_id = (resolved ->> 'bodyPresetId')::uuid,
    skin_palette_id = (resolved ->> 'skinPaletteId')::uuid,
    face_version_id = (resolved ->> 'faceVersionId')::uuid,
    eyes_version_id = (resolved ->> 'eyesVersionId')::uuid,
    eyebrows_version_id = (resolved ->> 'eyebrowsVersionId')::uuid,
    hair_version_id = (resolved ->> 'hairVersionId')::uuid,
    hair_palette_id = (resolved ->> 'hairPaletteId')::uuid,
    top_version_id = (resolved ->> 'topVersionId')::uuid,
    bottom_version_id = (resolved ->> 'bottomVersionId')::uuid,
    footwear_version_id = (resolved ->> 'footwearVersionId')::uuid,
    preset_version_id = (resolved ->> 'presetVersionId')::uuid,
    revision = revision + 1,
    creator_completed_at = coalesce(creator_completed_at, now())
  where id = avatar.id
  returning * into avatar;
  for accessory in select value from jsonb_array_elements(resolved -> 'accessoryVersionIds') loop
    insert into public.player_avatar_profile_accessories (
      player_avatar_profile_id, avatar_content_version_id, sort_order
    ) values (avatar.id, (accessory #>> '{}')::uuid, accessory_order);
    accessory_order := accessory_order + 1;
  end loop;
  after_profile := private.avatar_profile_json(avatar, true, true);
  insert into public.player_avatar_profile_history (
    player_avatar_profile_id, revision, actor_type, actor_player_profile_id,
    request_id, before_profile, after_profile
  ) values (
    avatar.id, avatar.revision, 'player', player.id,
    p_request_id, before_profile, after_profile
  );
  result := jsonb_build_object(
    'status', case p_operation when 'create' then 'created' else 'updated' end,
    'profile', after_profile
  );
  delete from public.avatar_idempotency
  where subject_key = p_wallet_address and operation = 'player_' || p_operation
    and request_id = p_request_id and expires_at <= now();
  insert into public.avatar_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (
    p_wallet_address, 'player_' || p_operation, p_request_id,
    request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.create_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.mutate_player_avatar_profile(
    p_wallet_address, p_access_session_token_hash, p_expected_revision,
    p_selection, p_request_id, 'create'
  );
$$;

create or replace function public.update_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.mutate_player_avatar_profile(
    p_wallet_address, p_access_session_token_hash, p_expected_revision,
    p_selection, p_request_id, 'update'
  );
$$;

create or replace function private.avatar_safe_fallback_json(
  p_profile public.player_avatar_profiles
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'appearanceId', p_profile.appearance_id,
    'revision', p_profile.revision,
    'creatorCompleted', p_profile.creator_completed_at is not null,
    'moduleEnabled', false,
    'renderMode', 'legacy_fallback',
    'legacyFallbackPreset', p_profile.legacy_fallback_preset,
    'bodyPresetKey', body.preset_key,
    'skinPaletteKey', null,
    'selections', jsonb_build_object(
      'face', null, 'eyes', null, 'eyebrows', null, 'hair', null,
      'top', null, 'bottom', null, 'footwear', null
    ),
    'hairPaletteKey', null,
    'accessories', '[]'::jsonb,
    'presetKey', null,
    'updatedAt', p_profile.updated_at
  )
  from public.avatar_body_presets body
  where body.id = p_profile.body_preset_id;
$$;

create or replace function public.get_resolved_public_avatar(
  p_appearance_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_avatar_profiles%rowtype;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  if not private.claim_avatar_rate_limit('public_profile_read', p_appearance_id::text, 240, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into profile from public.player_avatar_profiles
  where appearance_id = p_appearance_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not private.avatar_module_enabled() or profile.creator_completed_at is null then
    return jsonb_build_object('status', 'loaded', 'appearance', private.avatar_safe_fallback_json(profile));
  end if;
  return jsonb_build_object(
    'status', 'loaded', 'appearance', private.avatar_profile_json(profile, true, false) ||
      jsonb_build_object('renderMode', 'modular')
  );
end;
$$;

create or replace function public.get_realtime_avatar_profile(
  p_realtime_session_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare realtime_session public.realtime_sessions%rowtype;
declare profile public.player_avatar_profiles%rowtype;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  select * into realtime_session from public.realtime_sessions
  where id = p_realtime_session_id and status in ('active', 'stale');
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not private.claim_avatar_rate_limit(
    'public_profile_read', 'realtime:' || p_realtime_session_id::text, 240, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  select * into profile from public.player_avatar_profiles
  where player_profile_id = realtime_session.player_profile_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not private.avatar_module_enabled() or profile.creator_completed_at is null then
    return jsonb_build_object('status', 'loaded', 'appearance', private.avatar_safe_fallback_json(profile));
  end if;
  return jsonb_build_object(
    'status', 'loaded', 'appearance', private.avatar_profile_json(profile, true, false) ||
      jsonb_build_object('renderMode', 'modular')
  );
end;
$$;

create or replace function private.avatar_content_type_for_layer(p_layer text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_layer = 'base_body' then 'base_body'
    when p_layer = 'skin_tone' then 'skin_tone'
    when p_layer in ('face', 'eyes', 'eyebrows', 'top', 'bottom', 'footwear', 'activity_override', 'shadow')
      then p_layer
    when p_layer in ('hair_back', 'hair_front') then 'hair'
    when p_layer in ('head_accessory', 'face_accessory', 'back_accessory', 'handheld_visual')
      then 'accessory'
    else null
  end;
$$;

create or replace function private.avatar_category_for_layer(p_layer text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_layer = 'base_body' then 'body'
    when p_layer = 'skin_tone' then 'skin'
    when p_layer in ('face', 'eyes', 'eyebrows') then 'face'
    when p_layer in ('hair_back', 'hair_front') then 'hair'
    when p_layer in ('top', 'bottom') then 'outfit'
    when p_layer = 'footwear' then 'footwear'
    when p_layer in ('head_accessory', 'face_accessory', 'back_accessory', 'handheld_visual')
      then 'accessory'
    when p_layer = 'activity_override' then 'activity'
    when p_layer = 'shadow' then 'rendering'
    else null
  end;
$$;

create or replace function private.avatar_admin_replay(
  p_administrator_user_id uuid,
  p_operation text,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare stored_hash text;
declare stored_response jsonb;
begin
  select request_hash, response_body into stored_hash, stored_response
  from public.avatar_idempotency
  where subject_key = p_administrator_user_id::text
    and operation = p_operation and request_id = p_request_id and expires_at > now();
  if stored_response is null then return null; end if;
  if stored_hash <> p_request_hash then
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  return stored_response;
end;
$$;

create or replace function private.store_avatar_admin_replay(
  p_administrator_user_id uuid,
  p_operation text,
  p_request_id text,
  p_request_hash text,
  p_response jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.avatar_idempotency
  where subject_key = p_administrator_user_id::text
    and operation = p_operation and request_id = p_request_id and expires_at <= now();
  insert into public.avatar_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (
    p_administrator_user_id::text, p_operation, p_request_id, p_request_hash, p_response
  );
end;
$$;

create or replace function private.record_avatar_admin_audit(
  p_event_key text,
  p_actor_user_id uuid,
  p_admin_session_id uuid,
  p_request_id text,
  p_metadata jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id,
    outcome, reason_code, metadata
  ) values (
    p_event_key, p_actor_user_id, p_admin_session_id, p_request_id,
    'success', null, p_metadata
  );
$$;

create or replace function private.avatar_validation_preview(p_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version public.avatar_content_versions%rowtype;
  definition public.avatar_content_definitions%rowtype;
  findings jsonb := '[]'::jsonb;
  required_asset_role text;
  animation_count integer;
begin
  select * into version from public.avatar_content_versions where id = p_version_id;
  if not found then return jsonb_build_object(
    'valid', false,
    'findings', jsonb_build_array(jsonb_build_object(
      'level', 'blocking_error', 'code', 'VERSION_NOT_FOUND', 'path', '',
      'message', 'The avatar version does not exist.'
    ))
  ); end if;
  select * into strict definition from public.avatar_content_definitions
  where id = version.avatar_content_definition_id;
  required_asset_role := case
    when definition.content_type = 'base_body' then 'sprite_sheet'
    when definition.content_type = 'accessory' then 'accessory_sheet'
    else 'layer_sheet'
  end;
  if not exists (
    select 1 from public.avatar_content_assets
    where avatar_content_version_id = version.id and asset_role = required_asset_role
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'REQUIRED_ASSET_MISSING', 'path', 'assets',
    'message', 'The required approved avatar sheet is not linked.'
  )); end if;
  if not exists (
    select 1 from public.avatar_content_assets
    where avatar_content_version_id = version.id and asset_role = 'preview'
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'PREVIEW_ASSET_MISSING', 'path', 'assets.preview',
    'message', 'An approved avatar preview is required.'
  )); end if;
  if not exists (
    select 1 from public.avatar_content_assets
    where avatar_content_version_id = version.id and asset_role = 'thumbnail'
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'THUMBNAIL_ASSET_MISSING', 'path', 'assets.thumbnail',
    'message', 'An approved avatar thumbnail is required.'
  )); end if;

  select count(*)::integer into animation_count
  from public.avatar_animation_definitions where avatar_content_version_id = version.id;
  if animation_count <> 24
     or exists (
       select 1
       from unnest(array['idle','walk','jog']::text[]) state
       cross join unnest(array[
         'north','northeast','east','southeast','south','southwest','west','northwest'
       ]::text[]) direction
       where not exists (
         select 1 from public.avatar_animation_definitions animation
         where animation.avatar_content_version_id = version.id
           and animation.animation_state = state and animation.direction = direction
       )
     ) then findings := findings || jsonb_build_array(jsonb_build_object(
       'level', 'blocking_error', 'code', 'ANIMATION_SET_INCOMPLETE', 'path', 'animations',
       'message', 'Idle, walk, and jog mappings are required for all eight directions.'
     ));
  end if;
  if exists (
    select 1 from public.avatar_animation_definitions animation
    cross join lateral unnest(animation.frame_order) frame(frame_index)
    where animation.avatar_content_version_id = version.id
      and (frame.frame_index < 0
           or frame.frame_index >= version.sheet_rows * version.sheet_columns)
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'ANIMATION_FRAME_OUT_OF_RANGE', 'path', 'animations',
    'message', 'An animation frame lies outside the configured sheet grid.'
  )); end if;
  if not exists (
    select 1 from public.avatar_content_compatibility
    where avatar_content_version_id = version.id and compatibility_type = 'body_preset'
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'BODY_COMPATIBILITY_MISSING', 'path', 'compatibility',
    'message', 'At least one enabled body preset must be supported.'
  )); end if;
  if version.fallback_version_id is not null and not exists (
    select 1 from public.avatar_content_versions fallback_version
    join public.avatar_content_definitions fallback_definition
      on fallback_definition.id = fallback_version.avatar_content_definition_id
    where fallback_version.id = version.fallback_version_id
      and fallback_version.lifecycle_status = 'active'
      and fallback_definition.content_type = definition.content_type
  ) then findings := findings || jsonb_build_array(jsonb_build_object(
    'level', 'blocking_error', 'code', 'FALLBACK_UNAVAILABLE', 'path', 'fallback',
    'message', 'The configured fallback is not an active compatible avatar layer.'
  )); end if;
  if jsonb_array_length(findings) = 0 then
    findings := jsonb_build_array(jsonb_build_object(
      'level', 'passed', 'code', 'AVATAR_VERSION_VALID', 'path', '',
      'message', 'The avatar content version passed all activation checks.'
    ));
  end if;
  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(findings) finding
      where finding ->> 'level' = 'blocking_error'
    ),
    'findings', findings
  );
end;
$$;

create or replace function public.list_admin_avatar_catalog(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_search text,
  p_category text,
  p_layer text,
  p_lifecycle_status text,
  p_compatibility text,
  p_missing text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare normalized_search text := lower(btrim(coalesce(p_search, '')));
declare total_count integer;
declare items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (20, 50, 100)
     or char_length(normalized_search) > 100
     or coalesce(nullif(p_category, ''), 'all') not in (
       'all', 'body', 'skin', 'face', 'hair', 'outfit', 'footwear', 'accessory',
       'activity', 'rendering'
     )
     or coalesce(nullif(p_layer, ''), 'all') not in (
       'all', 'base_body', 'skin_tone', 'face', 'eyes', 'eyebrows', 'hair_back',
       'hair_front', 'top', 'bottom', 'footwear', 'head_accessory',
       'face_accessory', 'back_accessory', 'handheld_visual', 'activity_override', 'shadow'
     )
     or coalesce(p_lifecycle_status, 'all') not in (
       'all', 'draft', 'validating', 'invalid', 'in_review', 'changes_requested',
       'approved', 'active', 'superseded', 'disabled', 'rejected'
     )
     or coalesce(nullif(p_compatibility, ''), 'all') <> 'all'
        and not private.valid_avatar_public_key(p_compatibility)
     or coalesce(nullif(p_missing, ''), 'all') not in (
       'all', 'direction', 'animation_state', 'asset', 'compatibility'
     )
     or not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 240, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*)::integer into total_count
  from public.avatar_content_definitions definition
  left join lateral (
    select version.id, version.lifecycle_status, version.public_name
    from public.avatar_content_versions version
    where version.avatar_content_definition_id = definition.id
    order by version.version_number desc limit 1
  ) latest on true
  where (normalized_search = ''
      or position(normalized_search in lower(definition.content_key)) > 0
      or position(normalized_search in lower(coalesce(latest.public_name, definition.display_name))) > 0)
    and (coalesce(nullif(p_category, ''), 'all') = 'all' or definition.category = p_category)
    and (coalesce(nullif(p_layer, ''), 'all') = 'all' or definition.content_layer = p_layer)
    and (coalesce(p_lifecycle_status, 'all') = 'all'
      or coalesce(latest.lifecycle_status, 'draft') = p_lifecycle_status)
    and (coalesce(nullif(p_compatibility, ''), 'all') = 'all' or exists (
      select 1 from public.avatar_content_versions version
      join public.avatar_content_compatibility compatibility
        on compatibility.avatar_content_version_id = version.id
       and compatibility.compatibility_type = 'body_preset'
      join public.avatar_body_presets body on body.id = compatibility.body_preset_id
      where version.avatar_content_definition_id = definition.id
        and body.preset_key = p_compatibility
    ))
    and (coalesce(nullif(p_missing, ''), 'all') = 'all'
      or p_missing = 'direction' and (select count(distinct animation.direction)
        from public.avatar_animation_definitions animation
        where animation.avatar_content_version_id = latest.id) < 8
      or p_missing = 'animation_state' and (select count(distinct animation.animation_state)
        from public.avatar_animation_definitions animation
        where animation.avatar_content_version_id = latest.id) < 3
      or p_missing = 'asset' and not exists (
        select 1 from public.avatar_content_assets mapping
        where mapping.avatar_content_version_id = latest.id
      )
      or p_missing = 'compatibility' and not exists (
        select 1 from public.avatar_content_compatibility compatibility
        where compatibility.avatar_content_version_id = latest.id
          and compatibility.compatibility_type = 'body_preset'
      ));

  select coalesce(jsonb_agg(item), '[]'::jsonb) into items from (
    select jsonb_build_object(
      'definitionId', definition.id,
      'stableKey', definition.content_key,
      'publicName', coalesce(active_version.public_name, latest.public_name, definition.display_name),
      'description', coalesce(active_version.description, latest.description, definition.description),
      'category', definition.category,
      'layer', definition.content_layer,
      'enabled', definition.enabled,
      'publicationState', coalesce(active_version.lifecycle_status, latest.lifecycle_status, 'draft'),
      'activeVersionId', active_version.id,
      'activeVersionNumber', active_version.version_number,
      'compatibleBodyKeys', coalesce((
        select jsonb_agg(body.preset_key order by body.sort_order)
        from public.avatar_content_compatibility compatibility
        join public.avatar_body_presets body on body.id = compatibility.body_preset_id
        where compatibility.avatar_content_version_id = coalesce(active_version.id, latest.id)
          and compatibility.compatibility_type = 'body_preset'
      ), '[]'::jsonb),
      'directions', coalesce((
        select jsonb_agg(distinct animation.direction)
        from public.avatar_animation_definitions animation
        where animation.avatar_content_version_id = coalesce(active_version.id, latest.id)
      ), '[]'::jsonb),
      'animationStates', coalesce((
        select jsonb_agg(distinct animation.animation_state)
        from public.avatar_animation_definitions animation
        where animation.avatar_content_version_id = coalesce(active_version.id, latest.id)
      ), '[]'::jsonb),
      'assetStatus', case
        when not exists (select 1 from public.avatar_content_assets mapping
                         where mapping.avatar_content_version_id = coalesce(active_version.id, latest.id))
          then 'missing'
        when exists (select 1 from public.avatar_content_assets mapping
                     join public.world_asset_versions asset_version
                       on asset_version.id = mapping.world_asset_version_id
                     where mapping.avatar_content_version_id = coalesce(active_version.id, latest.id)
                       and asset_version.lifecycle_status = 'active') then 'active'
        else 'approved' end,
      'usageCount', (
        select count(*)::integer from public.player_avatar_profiles profile
        where coalesce(active_version.id, latest.id) in (
          profile.face_version_id, profile.eyes_version_id, profile.eyebrows_version_id,
          profile.hair_version_id, profile.top_version_id, profile.bottom_version_id,
          profile.footwear_version_id
        )
      ) + (
        select count(*)::integer from public.player_avatar_profile_accessories accessory
        where accessory.avatar_content_version_id = coalesce(active_version.id, latest.id)
      ),
      'validationState', case
        when validation.id is null then 'not_run'
        when validation.valid then 'valid' else 'invalid' end,
      'reviewerDisplayName', reviewer.display_name,
      'updatedAt', definition.updated_at
    ) as item
    from public.avatar_content_definitions definition
    left join public.avatar_content_versions active_version
      on active_version.id = definition.active_version_id
    left join lateral (
      select version.* from public.avatar_content_versions version
      where version.avatar_content_definition_id = definition.id
      order by version.version_number desc limit 1
    ) latest on true
    left join lateral (
      select result.* from public.avatar_content_validation_results result
      where result.avatar_content_version_id = coalesce(active_version.id, latest.id)
      order by result.created_at desc, result.id desc limit 1
    ) validation on true
    left join public.admin_users reviewer
      on reviewer.user_id = coalesce(active_version.reviewed_by_admin_id, latest.reviewed_by_admin_id)
    where (normalized_search = ''
        or position(normalized_search in lower(definition.content_key)) > 0
        or position(normalized_search in lower(coalesce(latest.public_name, definition.display_name))) > 0)
      and (coalesce(nullif(p_category, ''), 'all') = 'all' or definition.category = p_category)
      and (coalesce(nullif(p_layer, ''), 'all') = 'all' or definition.content_layer = p_layer)
      and (coalesce(p_lifecycle_status, 'all') = 'all'
        or coalesce(latest.lifecycle_status, 'draft') = p_lifecycle_status)
      and (coalesce(nullif(p_compatibility, ''), 'all') = 'all' or exists (
        select 1 from public.avatar_content_compatibility compatibility
        join public.avatar_body_presets body on body.id = compatibility.body_preset_id
        where compatibility.avatar_content_version_id = coalesce(active_version.id, latest.id)
          and compatibility.compatibility_type = 'body_preset'
          and body.preset_key = p_compatibility
      ))
      and (coalesce(nullif(p_missing, ''), 'all') = 'all'
        or p_missing = 'direction' and (select count(distinct animation.direction)
          from public.avatar_animation_definitions animation
          where animation.avatar_content_version_id = coalesce(active_version.id, latest.id)) < 8
        or p_missing = 'animation_state' and (select count(distinct animation.animation_state)
          from public.avatar_animation_definitions animation
          where animation.avatar_content_version_id = coalesce(active_version.id, latest.id)) < 3
        or p_missing = 'asset' and not exists (select 1 from public.avatar_content_assets mapping
          where mapping.avatar_content_version_id = coalesce(active_version.id, latest.id))
        or p_missing = 'compatibility' and not exists (
          select 1 from public.avatar_content_compatibility compatibility
          where compatibility.avatar_content_version_id = coalesce(active_version.id, latest.id)
            and compatibility.compatibility_type = 'body_preset'
        ))
    order by definition.updated_at desc, definition.id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) page_rows;
  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0
                       else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.get_admin_avatar_definition(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_definition_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare definition public.avatar_content_definitions%rowtype;
declare versions jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.read'
  );
  if char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 240, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into definition from public.avatar_content_definitions where id = p_definition_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', version.id,
    'versionNumber', version.version_number,
    'publicName', version.public_name,
    'description', version.description,
    'state', version.lifecycle_status,
    'revision', version.edit_revision,
    'renderOrder', version.render_order,
    'frameWidth', version.frame_width,
    'frameHeight', version.frame_height,
    'sheetRows', version.sheet_rows,
    'sheetColumns', version.sheet_columns,
    'padding', version.padding,
    'offsetX', version.offset_x,
    'offsetY', version.offset_y,
    'anchorX', version.anchor_x,
    'anchorY', version.anchor_y,
    'depthBehavior', version.depth_behavior,
    'castsShadow', version.casts_shadow,
    'fallbackVersionId', version.fallback_version_id,
    'fallbackKey', (select fallback_definition.content_key
      from public.avatar_content_versions fallback_version
      join public.avatar_content_definitions fallback_definition
        on fallback_definition.id = fallback_version.avatar_content_definition_id
      where fallback_version.id = version.fallback_version_id),
    'compatibleBodyKeys', coalesce((select jsonb_agg(body.preset_key order by body.sort_order)
      from public.avatar_content_compatibility compatibility
      join public.avatar_body_presets body on body.id = compatibility.body_preset_id
      where compatibility.avatar_content_version_id = version.id
        and compatibility.compatibility_type = 'body_preset'), '[]'::jsonb),
    'directions', coalesce((select jsonb_agg(distinct animation.direction)
      from public.avatar_animation_definitions animation
      where animation.avatar_content_version_id = version.id), '[]'::jsonb),
    'animationStates', coalesce((select jsonb_agg(distinct animation.animation_state)
      from public.avatar_animation_definitions animation
      where animation.avatar_content_version_id = version.id), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
      'role', mapping.asset_role, 'worldAssetId', mapping.world_asset_id,
      'worldAssetVersionId', mapping.world_asset_version_id,
      'assetKey', asset.asset_key, 'assetState', asset.lifecycle_status,
      'mediaType', asset_version.detected_mime_type,
      'width', asset_version.processed_source_width,
      'height', asset_version.processed_source_height
    ) order by mapping.asset_role)
      from public.avatar_content_assets mapping
      join public.world_assets asset on asset.id = mapping.world_asset_id
      join public.world_asset_versions asset_version on asset_version.id = mapping.world_asset_version_id
      where mapping.avatar_content_version_id = version.id), '[]'::jsonb),
    'animations', private.avatar_animation_json(version.id),
    'validation', coalesce((select jsonb_build_object('valid', result.valid, 'findings', result.findings)
      from public.avatar_content_validation_results result
      where result.avatar_content_version_id = version.id
      order by result.created_at desc, result.id desc limit 1),
      jsonb_build_object('valid', null, 'findings', '[]'::jsonb)),
    'submittedBy', submitter.display_name,
    'reviewedBy', reviewer.display_name,
    'createdAt', version.created_at,
    'updatedAt', version.updated_at
  ) order by version.version_number desc), '[]'::jsonb)
  into versions
  from public.avatar_content_versions version
  left join public.admin_users submitter on submitter.user_id = version.submitted_by_admin_id
  left join public.admin_users reviewer on reviewer.user_id = version.reviewed_by_admin_id
  where version.avatar_content_definition_id = definition.id;
  return jsonb_build_object(
    'status', 'loaded',
    'definition', jsonb_build_object(
      'definitionId', definition.id, 'stableKey', definition.content_key,
      'publicName', coalesce((select active.public_name from public.avatar_content_versions active
                              where active.id = definition.active_version_id), definition.display_name),
      'description', coalesce((select active.description from public.avatar_content_versions active
                               where active.id = definition.active_version_id), definition.description),
      'category', definition.category, 'layer', definition.content_layer,
      'enabled', definition.enabled, 'activeVersionId', definition.active_version_id,
      'recordRevision', definition.record_revision, 'updatedAt', definition.updated_at
    ),
    'versions', versions
  );
end;
$$;

create or replace function public.create_admin_avatar_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_stable_key text,
  p_public_name text,
  p_description text,
  p_category text,
  p_layer text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare definition_id uuid := gen_random_uuid();
declare version_id uuid := gen_random_uuid();
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
declare content_type_value text;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.edit'
  );
  content_type_value := private.avatar_content_type_for_layer(p_layer);
  if not private.valid_avatar_public_key(p_stable_key)
     or char_length(coalesce(p_public_name, '')) not between 1 and 100
     or p_public_name <> btrim(p_public_name) or p_public_name ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_description, '')) not between 0 and 500
     or p_description <> btrim(p_description) or p_description ~ '[[:cntrl:]<>]'
     or content_type_value is null
     or p_category is distinct from private.avatar_category_for_layer(p_layer)
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_mutation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_DRAFT_INPUT';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_stable_key || ':' || p_public_name || ':' || p_description || ':' || p_category || ':' || p_layer,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:create:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_create_draft', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avatar-definition:' || p_stable_key, 0)
  );
  if exists (select 1 from public.avatar_content_definitions where content_key = p_stable_key) then
    return jsonb_build_object('status', 'key_conflict');
  end if;
  insert into public.avatar_content_definitions (
    id, content_key, content_type, category, content_layer, display_name,
    description, created_by_admin_id
  ) values (
    definition_id, p_stable_key, content_type_value, p_category, p_layer,
    p_public_name, p_description, p_user_id
  );
  insert into public.avatar_content_versions (
    id, avatar_content_definition_id, version_number, public_name, description, render_order,
    frame_width, frame_height, sheet_rows, sheet_columns, created_by_admin_id
  ) values (
    version_id, definition_id, 1, p_public_name, p_description,
    case p_layer
      when 'hair_back' then 20 when 'base_body' then 30 when 'skin_tone' then 35
      when 'face' then 40 when 'eyes' then 45 when 'eyebrows' then 47
      when 'top' then 55 when 'bottom' then 56 when 'footwear' then 57
      when 'hair_front' then 60 when 'back_accessory' then 18
      when 'head_accessory' then 70 when 'face_accessory' then 72
      when 'handheld_visual' then 75 when 'activity_override' then 80
      when 'shadow' then 5 else 50 end,
    32, 48, 1, 1, p_user_id
  );
  result := jsonb_build_object(
    'status', 'created', 'definitionId', definition_id, 'versionId', version_id,
    'versionNumber', 1, 'revision', 1
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.draft_created', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', definition_id, 'versionId', version_id,
                       'stableKey', p_stable_key, 'layer', p_layer)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_create_draft', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.update_admin_avatar_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_configuration jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare definition public.avatar_content_definitions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
declare item jsonb;
declare body_id uuid;
declare other_version_id uuid;
declare fallback_id uuid;
declare frames smallint[];
declare frame_start integer;
declare frame_count integer;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.edit'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or jsonb_typeof(p_configuration) is distinct from 'object'
     or pg_column_size(p_configuration) > 65536
     or p_configuration::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
     or exists (
       select 1 from jsonb_object_keys(p_configuration) entry(key)
       where entry.key not in (
         'publicName', 'description', 'accessLevel', 'renderOrder', 'frameWidth',
         'frameHeight', 'sheetRows', 'sheetColumns', 'padding', 'previewScale',
         'anchorX', 'anchorY', 'offsetX', 'offsetY', 'depthBehavior', 'castsShadow',
         'fallbackKey', 'previewMetadata', 'assets', 'compatibleBodyKeys',
         'incompatibleVersionIds', 'animations', 'directions', 'animationStates'
       )
     )
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_mutation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_DRAFT_UPDATE';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_configuration::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:update:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_update_draft', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions
  where id = p_version_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into strict definition from public.avatar_content_definitions
  where id = version.avatar_content_definition_id for update;
  if version.lifecycle_status not in ('draft', 'invalid', 'changes_requested') then
    return jsonb_build_object('status', 'immutable_version');
  end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  if p_configuration ? 'publicName' and (
       jsonb_typeof(p_configuration -> 'publicName') <> 'string'
       or char_length(p_configuration ->> 'publicName') not between 1 and 100
       or p_configuration ->> 'publicName' <> btrim(p_configuration ->> 'publicName')
       or p_configuration ->> 'publicName' ~ '[[:cntrl:]<>]'
     ) or p_configuration ? 'description' and (
       jsonb_typeof(p_configuration -> 'description') <> 'string'
       or char_length(p_configuration ->> 'description') not between 0 and 500
       or p_configuration ->> 'description' <> btrim(p_configuration ->> 'description')
       or p_configuration ->> 'description' ~ '[[:cntrl:]<>]'
     ) or p_configuration ? 'accessLevel' and
       p_configuration ->> 'accessLevel' not in ('starter', 'standard', 'protected_administrator') then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_DRAFT_TEXT';
  end if;
  if p_configuration ? 'fallbackKey' and jsonb_typeof(p_configuration -> 'fallbackKey') <> 'null' then
    if jsonb_typeof(p_configuration -> 'fallbackKey') <> 'string'
       or not private.valid_avatar_public_key(p_configuration ->> 'fallbackKey') then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_FALLBACK';
    end if;
    select fallback_version.id into fallback_id
    from public.avatar_content_definitions fallback_definition
    join public.avatar_content_versions fallback_version
      on fallback_version.id = fallback_definition.active_version_id
    where fallback_definition.content_key = p_configuration ->> 'fallbackKey'
      and fallback_definition.content_type = definition.content_type
      and fallback_definition.enabled and fallback_version.lifecycle_status = 'active';
    if fallback_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;

  update public.avatar_content_definitions set
    access_level = coalesce(p_configuration ->> 'accessLevel', access_level),
    record_revision = record_revision + 1
  where id = definition.id;
  update public.avatar_content_versions set
    lifecycle_status = 'draft',
    public_name = coalesce(p_configuration ->> 'publicName', public_name),
    description = coalesce(p_configuration ->> 'description', description),
    render_order = coalesce((p_configuration ->> 'renderOrder')::integer, render_order),
    frame_width = coalesce((p_configuration ->> 'frameWidth')::integer, frame_width),
    frame_height = coalesce((p_configuration ->> 'frameHeight')::integer, frame_height),
    sheet_rows = coalesce((p_configuration ->> 'sheetRows')::integer, sheet_rows),
    sheet_columns = coalesce((p_configuration ->> 'sheetColumns')::integer, sheet_columns),
    padding = coalesce((p_configuration ->> 'padding')::integer, padding),
    preview_scale = coalesce((p_configuration ->> 'previewScale')::numeric, preview_scale),
    anchor_x = coalesce((p_configuration ->> 'anchorX')::numeric, anchor_x),
    anchor_y = coalesce((p_configuration ->> 'anchorY')::numeric, anchor_y),
    offset_x = coalesce((p_configuration ->> 'offsetX')::integer, offset_x),
    offset_y = coalesce((p_configuration ->> 'offsetY')::integer, offset_y),
    depth_behavior = coalesce(p_configuration ->> 'depthBehavior', depth_behavior),
    casts_shadow = coalesce((p_configuration ->> 'castsShadow')::boolean, casts_shadow),
    fallback_version_id = case when p_configuration ? 'fallbackKey' then fallback_id else fallback_version_id end,
    preview_metadata = coalesce(p_configuration -> 'previewMetadata', preview_metadata),
    configuration = p_configuration - array[
      'assets', 'compatibleBodyKeys', 'incompatibleVersionIds', 'animations'
    ]::text[],
    edit_revision = edit_revision + 1,
    submitted_by_admin_id = null, reviewed_by_admin_id = null,
    submitted_at = null, reviewed_at = null
  where id = version.id returning * into version;

  if p_configuration ? 'assets' then
    if jsonb_typeof(p_configuration -> 'assets') <> 'array'
       or jsonb_array_length(p_configuration -> 'assets') > 8 then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_ASSETS';
    end if;
    delete from public.avatar_content_assets where avatar_content_version_id = version.id;
    for item in select value from jsonb_array_elements(p_configuration -> 'assets') loop
      if jsonb_typeof(item) <> 'object'
         or (select count(*) from jsonb_object_keys(item)) <> 3
         or item ->> 'role' not in (
           'sprite_sheet', 'layer_sheet', 'preview', 'thumbnail', 'palette', 'accessory_sheet'
         ) then raise exception using errcode = '22023', message = 'INVALID_AVATAR_ASSET_REFERENCE'; end if;
      insert into public.avatar_content_assets (
        avatar_content_version_id, asset_role, world_asset_id, world_asset_version_id
      ) values (
        version.id, item ->> 'role', (item ->> 'worldAssetId')::uuid,
        (item ->> 'worldAssetVersionId')::uuid
      );
    end loop;
  end if;
  if p_configuration ? 'compatibleBodyKeys' then
    if jsonb_typeof(p_configuration -> 'compatibleBodyKeys') <> 'array'
       or jsonb_array_length(p_configuration -> 'compatibleBodyKeys') not between 1 and 20 then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_BODY_COMPATIBILITY';
    end if;
    delete from public.avatar_content_compatibility
    where avatar_content_version_id = version.id and compatibility_type = 'body_preset';
    for item in select value from jsonb_array_elements(p_configuration -> 'compatibleBodyKeys') loop
      select id into body_id from public.avatar_body_presets
      where preset_key = item #>> '{}' and enabled;
      if body_id is null then raise exception using errcode = '22023', message = 'INVALID_AVATAR_BODY_COMPATIBILITY'; end if;
      insert into public.avatar_content_compatibility (
        avatar_content_version_id, compatibility_type, body_preset_id
      ) values (version.id, 'body_preset', body_id);
    end loop;
  end if;
  if p_configuration ? 'incompatibleVersionIds' then
    if jsonb_typeof(p_configuration -> 'incompatibleVersionIds') <> 'array'
       or jsonb_array_length(p_configuration -> 'incompatibleVersionIds') > 50 then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_INCOMPATIBILITY';
    end if;
    delete from public.avatar_content_compatibility
    where avatar_content_version_id = version.id and compatibility_type = 'incompatible_content';
    for item in select value from jsonb_array_elements(p_configuration -> 'incompatibleVersionIds') loop
      other_version_id := (item #>> '{}')::uuid;
      if other_version_id = version.id or not exists (
        select 1 from public.avatar_content_versions where id = other_version_id
      ) then raise exception using errcode = '22023', message = 'INVALID_AVATAR_INCOMPATIBILITY'; end if;
      insert into public.avatar_content_compatibility (
        avatar_content_version_id, compatibility_type, other_avatar_content_version_id
      ) values (version.id, 'incompatible_content', other_version_id);
    end loop;
  end if;
  if p_configuration ? 'animations' then
    if jsonb_typeof(p_configuration -> 'animations') <> 'array'
       or jsonb_array_length(p_configuration -> 'animations') > 72 then
      raise exception using errcode = '22023', message = 'INVALID_AVATAR_ANIMATIONS';
    end if;
    delete from public.avatar_animation_definitions where avatar_content_version_id = version.id;
    for item in select value from jsonb_array_elements(p_configuration -> 'animations') loop
      if item ->> 'direction' not in (
           'north','northeast','east','southeast','south','southwest','west','northwest'
         ) or item ->> 'state' not in ('idle','walk','jog') then
        raise exception using errcode = '22023', message = 'INVALID_AVATAR_ANIMATION';
      end if;
      if jsonb_typeof(item -> 'frames') = 'array' then
        select array_agg((value #>> '{}')::smallint order by ordinality)
        into frames from jsonb_array_elements(item -> 'frames') with ordinality frame(value, ordinality);
      else
        frame_start := (item ->> 'row')::integer * version.sheet_columns
          + (item ->> 'startColumn')::integer;
        frame_count := (item ->> 'frameCount')::integer;
        select array_agg(value::smallint order by value) into frames
        from generate_series(frame_start, frame_start + frame_count - 1) value;
      end if;
      insert into public.avatar_animation_definitions (
        avatar_content_version_id, direction, animation_state, frame_order,
        frame_duration_ms, loop_animation, offset_x, offset_y
      ) values (
        version.id, item ->> 'direction', item ->> 'state', frames,
        (item ->> 'frameDurationMs')::integer,
        coalesce((item ->> 'loop')::boolean, true),
        coalesce((item ->> 'offsetX')::integer, 0),
        coalesce((item ->> 'offsetY')::integer, 0)
      );
    end loop;
  end if;
  result := jsonb_build_object(
    'status', 'updated', 'definitionId', definition.id, 'versionId', version.id,
    'revision', version.edit_revision
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.draft_updated', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', definition.id, 'versionId', version.id,
                       'revision', version.edit_revision)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_update_draft', p_request_id, request_hash_value, result
  );
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'INVALID_AVATAR_DRAFT_UPDATE';
end;
$$;

create or replace function public.validate_admin_avatar_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare validation jsonb;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.edit'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_validation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_VALIDATION_REQUEST';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:validate:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_validate', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if version.lifecycle_status not in ('draft', 'invalid', 'changes_requested') then
    return jsonb_build_object('status', 'immutable_version');
  end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  update public.avatar_content_versions set lifecycle_status = 'validating'
  where id = version.id;
  validation := private.avatar_validation_preview(version.id);
  insert into public.avatar_content_validation_results (
    avatar_content_version_id, valid, findings,
    administrator_user_id, admin_session_id, request_id
  ) values (
    version.id, (validation ->> 'valid')::boolean, validation -> 'findings',
    p_user_id, admin_session_id, p_request_id
  );
  update public.avatar_content_versions set
    lifecycle_status = case when (validation ->> 'valid')::boolean then 'draft' else 'invalid' end,
    edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  result := jsonb_build_object(
    'status', case when (validation ->> 'valid')::boolean then 'valid' else 'invalid' end,
    'versionId', version.id, 'revision', version.edit_revision,
    'validation', validation
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.validation_run', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', version.avatar_content_definition_id,
                       'versionId', version.id, 'valid', validation -> 'valid')
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_validate', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.preview_admin_avatar_validation(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.read'
  );
  if char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 240, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not exists (select 1 from public.avatar_content_versions where id = p_version_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'previewed', 'validation', private.avatar_validation_preview(p_version_id)
  );
end;
$$;

create or replace function public.submit_admin_avatar_review(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.edit'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_mutation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REVIEW_SUBMISSION';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_reason, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:submit:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_submit_review', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if version.lifecycle_status <> 'draft' then return jsonb_build_object('status', 'invalid_state'); end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  if not exists (
    select 1 from public.avatar_content_validation_results validation
    where validation.avatar_content_version_id = version.id and validation.valid
      and validation.created_at >= version.updated_at
  ) then return jsonb_build_object('status', 'validation_required'); end if;
  update public.avatar_content_versions set
    lifecycle_status = 'in_review', submitted_by_admin_id = p_user_id,
    submitted_at = now(), edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  insert into public.avatar_content_reviews (
    avatar_content_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (version.id, 'submitted', p_user_id, admin_session_id, p_reason, p_request_id);
  result := jsonb_build_object(
    'status', 'submitted', 'versionId', version.id, 'revision', version.edit_revision
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.review_submitted', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', version.avatar_content_definition_id, 'versionId', version.id)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_submit_review', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.review_admin_avatar_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
declare next_status text;
declare review_action text;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.review'
  );
  if p_decision not in ('accept', 'changes_requested', 'reject')
     or p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_mutation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REVIEW';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_decision || ':' || p_reason,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:review:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_review', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if version.lifecycle_status <> 'in_review' then return jsonb_build_object('status', 'invalid_state'); end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  if version.submitted_by_admin_id = p_user_id then
    return jsonb_build_object('status', 'separation_required');
  end if;
  next_status := case p_decision
    when 'accept' then 'in_review' when 'changes_requested' then 'changes_requested'
    else 'rejected' end;
  review_action := case p_decision
    when 'accept' then 'reviewed' when 'changes_requested' then 'changes_requested'
    else 'rejected' end;
  update public.avatar_content_versions set
    lifecycle_status = next_status, reviewed_by_admin_id = p_user_id,
    reviewed_at = now(), edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  insert into public.avatar_content_reviews (
    avatar_content_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (version.id, review_action, p_user_id, admin_session_id, p_reason, p_request_id);
  result := jsonb_build_object(
    'status', case p_decision when 'accept' then 'reviewed'
                   when 'changes_requested' then 'changes_requested' else 'rejected' end,
    'versionId', version.id, 'revision', version.edit_revision
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.reviewed', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', version.avatar_content_definition_id,
                       'versionId', version.id, 'decision', p_decision)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_review', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.approve_admin_avatar_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.approve'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_mutation', p_user_id::text, 60, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_APPROVAL';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_reason, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:approve:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_approve', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if version.lifecycle_status <> 'in_review' or version.reviewed_at is null then
    return jsonb_build_object('status', 'review_required');
  end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  if version.submitted_by_admin_id = p_user_id then
    return jsonb_build_object('status', 'separation_required');
  end if;
  if not exists (
    select 1 from public.avatar_content_validation_results validation
    where validation.avatar_content_version_id = version.id and validation.valid
      and validation.created_at >= version.updated_at - interval '1 second'
  ) then return jsonb_build_object('status', 'validation_required'); end if;
  update public.avatar_content_versions set
    lifecycle_status = 'approved', approved_by_admin_id = p_user_id,
    approved_at = now(), edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  insert into public.avatar_content_reviews (
    avatar_content_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (version.id, 'approved', p_user_id, admin_session_id, p_reason, p_request_id);
  result := jsonb_build_object(
    'status', 'approved', 'versionId', version.id, 'revision', version.edit_revision
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.approved', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', version.avatar_content_definition_id, 'versionId', version.id)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_approve', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.activate_admin_avatar_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare definition public.avatar_content_definitions%rowtype;
declare previous public.avatar_content_versions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.activate'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_activation', p_user_id::text, 30, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_ACTIVATION';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_reason, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:activate:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_activate', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-activate-definition:' || version.avatar_content_definition_id::text, 0
  ));
  select * into definition from public.avatar_content_definitions
  where id = version.avatar_content_definition_id for update;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if version.lifecycle_status not in ('approved', 'superseded') then
    return jsonb_build_object('status', 'approval_required');
  end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  if not (private.avatar_validation_preview(version.id) ->> 'valid')::boolean then
    return jsonb_build_object('status', 'validation_required');
  end if;
  if definition.active_version_id is not null and definition.active_version_id <> version.id then
    select * into previous from public.avatar_content_versions
    where id = definition.active_version_id for update;
    update public.avatar_content_versions set
      lifecycle_status = 'superseded', superseded_at = now(),
      edit_revision = edit_revision + 1
    where id = previous.id returning * into previous;
    update public.world_asset_references reference set reference_lifecycle = 'published'
    from public.avatar_content_assets mapping
    where mapping.avatar_content_version_id = previous.id
      and reference.world_asset_id = mapping.world_asset_id
      and reference.world_asset_version_id = mapping.world_asset_version_id
      and reference.reference_type = 'game_content_definition';
  end if;
  update public.avatar_content_versions set
    lifecycle_status = 'active', activated_by_admin_id = p_user_id,
    activated_at = coalesce(activated_at, now()), superseded_at = null,
    edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  update public.avatar_content_definitions set
    active_version_id = version.id, record_revision = record_revision + 1
  where id = definition.id;
  update public.world_asset_references reference set reference_lifecycle = 'active'
  from public.avatar_content_assets mapping
  where mapping.avatar_content_version_id = version.id
    and reference.world_asset_id = mapping.world_asset_id
    and reference.world_asset_version_id = mapping.world_asset_version_id
    and reference.reference_type = 'game_content_definition';
  insert into public.avatar_content_reviews (
    avatar_content_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (version.id, 'activated', p_user_id, admin_session_id, p_reason, p_request_id);
  result := jsonb_build_object(
    'status', 'active', 'definitionId', definition.id, 'versionId', version.id,
    'revision', version.edit_revision, 'supersededVersionId', previous.id
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.activated', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', definition.id, 'versionId', version.id,
                       'supersededVersionId', previous.id)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_activate', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.supersede_admin_avatar_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare version public.avatar_content_versions%rowtype;
declare definition public.avatar_content_definitions%rowtype;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.activate'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_activation', p_user_id::text, 30, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_SUPERSEDE';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_version_id::text || ':' || p_expected_revision::text || ':' || p_reason, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:supersede:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_supersede', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into version from public.avatar_content_versions where id = p_version_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-activate-definition:' || version.avatar_content_definition_id::text, 0
  ));
  select * into definition from public.avatar_content_definitions
  where id = version.avatar_content_definition_id for update;
  select * into version from public.avatar_content_versions where id = p_version_id for update;
  if version.lifecycle_status <> 'active' or definition.active_version_id <> version.id then
    return jsonb_build_object('status', 'invalid_state');
  end if;
  if version.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', version.edit_revision);
  end if;
  update public.avatar_content_versions set
    lifecycle_status = 'superseded', superseded_at = now(),
    edit_revision = edit_revision + 1
  where id = version.id returning * into version;
  update public.avatar_content_definitions set
    active_version_id = null, record_revision = record_revision + 1
  where id = definition.id;
  update public.world_asset_references reference set reference_lifecycle = 'published'
  from public.avatar_content_assets mapping
  where mapping.avatar_content_version_id = version.id
    and reference.world_asset_id = mapping.world_asset_id
    and reference.world_asset_version_id = mapping.world_asset_version_id
    and reference.reference_type = 'game_content_definition';
  insert into public.avatar_content_reviews (
    avatar_content_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (version.id, 'superseded', p_user_id, admin_session_id, p_reason, p_request_id);
  result := jsonb_build_object(
    'status', 'superseded', 'definitionId', definition.id,
    'versionId', version.id, 'revision', version.edit_revision
  );
  perform private.record_avatar_admin_audit(
    'avatar.content.superseded', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('definitionId', definition.id, 'versionId', version.id)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_supersede', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.get_admin_avatar_settings(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare settings public.avatar_settings%rowtype;
declare fallback_key text;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.settings.read'
  );
  if not private.claim_avatar_rate_limit('settings', p_user_id::text, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into strict settings from public.avatar_settings where game_key = 'starville';
  select preset_key into strict fallback_key from public.avatar_body_presets
  where id = settings.fallback_body_preset_id;
  return jsonb_build_object('status', 'loaded', 'settings', jsonb_build_object(
    'revision', settings.revision,
    'customizationEnabled', settings.customization_enabled,
    'creatorRequiredForNewPlayers', settings.creator_required_for_new_players,
    'maintenanceMode', settings.maintenance_mode,
    'maximumAccessories', settings.max_accessories,
    'fallbackPresetKey', fallback_key,
    'updatedAt', settings.updated_at
  ));
end;
$$;

create or replace function public.update_admin_avatar_settings(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_expected_revision integer,
  p_settings jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare settings public.avatar_settings%rowtype;
declare fallback_id uuid;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.settings.edit'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or jsonb_typeof(p_settings) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_settings)) <> 5
     or not (p_settings ?& array[
       'customizationEnabled', 'creatorRequiredForNewPlayers', 'maintenanceMode',
       'maximumAccessories', 'fallbackPresetKey'
     ])
     or jsonb_typeof(p_settings -> 'customizationEnabled') <> 'boolean'
     or jsonb_typeof(p_settings -> 'creatorRequiredForNewPlayers') <> 'boolean'
     or jsonb_typeof(p_settings -> 'maintenanceMode') <> 'boolean'
     or jsonb_typeof(p_settings -> 'maximumAccessories') <> 'number'
     or (p_settings ->> 'maximumAccessories')::integer not between 0 and 4
     or jsonb_typeof(p_settings -> 'fallbackPresetKey') <> 'string'
     or not private.valid_avatar_public_key(p_settings ->> 'fallbackPresetKey')
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('settings', p_user_id::text, 30, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_SETTINGS';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_expected_revision::text || ':' || p_settings::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:settings:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_update_settings', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into settings from public.avatar_settings where game_key = 'starville' for update;
  if settings.revision <> p_expected_revision then
    return jsonb_build_object('status', 'settings_changed', 'revision', settings.revision);
  end if;
  select id into fallback_id from public.avatar_body_presets
  where preset_key = p_settings ->> 'fallbackPresetKey' and enabled for share;
  if fallback_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  update public.avatar_settings set
    customization_enabled = (p_settings ->> 'customizationEnabled')::boolean,
    creator_required_for_new_players = (p_settings ->> 'creatorRequiredForNewPlayers')::boolean,
    maintenance_mode = (p_settings ->> 'maintenanceMode')::boolean,
    max_accessories = (p_settings ->> 'maximumAccessories')::integer,
    fallback_body_preset_id = fallback_id,
    revision = revision + 1,
    updated_by_admin_id = p_user_id
  where game_key = 'starville' returning * into settings;
  result := jsonb_build_object('status', 'updated', 'settings', jsonb_build_object(
    'revision', settings.revision,
    'customizationEnabled', settings.customization_enabled,
    'creatorRequiredForNewPlayers', settings.creator_required_for_new_players,
    'maintenanceMode', settings.maintenance_mode,
    'maximumAccessories', settings.max_accessories,
    'fallbackPresetKey', p_settings ->> 'fallbackPresetKey',
    'updatedAt', settings.updated_at
  ));
  perform private.record_avatar_admin_audit(
    'avatar.settings.updated', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('revision', settings.revision,
                       'customizationEnabled', settings.customization_enabled,
                       'maintenanceMode', settings.maintenance_mode)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_update_settings', p_request_id, request_hash_value, result
  );
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'INVALID_AVATAR_SETTINGS';
end;
$$;

create or replace function public.publish_admin_avatar_preset(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_preset_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare preset public.avatar_presets%rowtype;
declare previous public.avatar_presets%rowtype;
declare selection jsonb;
declare resolved jsonb;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.activate'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or char_length(coalesce(p_reason, '')) not between 12 and 500
     or p_reason <> btrim(p_reason) or p_reason ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_activation', p_user_id::text, 30, 60) then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PRESET_PUBLICATION';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_preset_id::text || ':' || p_expected_revision::text || ':' || p_reason, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-admin:preset:' || p_user_id::text || ':' || p_request_id, 0
  ));
  replay := private.avatar_admin_replay(p_user_id, 'admin_publish_preset', p_request_id, request_hash_value);
  if replay is not null then return replay; end if;
  select * into preset from public.avatar_presets where id = p_preset_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avatar-preset:' || preset.preset_key, 0)
  );
  select * into preset from public.avatar_presets where id = p_preset_id for update;
  if preset.lifecycle_status not in ('approved', 'superseded') then
    return jsonb_build_object('status', 'approval_required');
  end if;
  if preset.edit_revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_changed', 'revision', preset.edit_revision);
  end if;
  selection := private.avatar_preset_selection_json(preset) - 'presetKey';
  resolved := private.resolve_avatar_selection(selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  select * into previous from public.avatar_presets
  where preset_key = preset.preset_key and lifecycle_status = 'active' for update;
  if previous.id is not null and previous.id <> preset.id then
    update public.avatar_presets set lifecycle_status = 'superseded'
    where id = previous.id;
  end if;
  update public.avatar_presets set
    lifecycle_status = 'active', activated_at = coalesce(activated_at, now())
  where id = preset.id returning * into preset;
  result := jsonb_build_object(
    'status', 'published', 'presetId', preset.id, 'revision', preset.edit_revision,
    'supersededPresetId', previous.id
  );
  perform private.record_avatar_admin_audit(
    'avatar.preset.published', p_user_id, admin_session_id, p_request_id,
    jsonb_build_object('presetId', preset.id, 'stableKey', preset.preset_key,
                       'supersededPresetId', previous.id, 'reason', p_reason)
  );
  perform private.store_avatar_admin_replay(
    p_user_id, 'admin_publish_preset', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.get_admin_avatar_profile(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_player_profile_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_avatar_profiles%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_profile.support.read'
  );
  if char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into profile from public.player_avatar_profiles
  where player_profile_id = p_player_profile_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object(
    'status', 'loaded', 'profile', private.avatar_profile_json(profile, false, false)
  );
end;
$$;

create or replace function public.list_admin_avatar_audit(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare total_count integer;
declare items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.audit.read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (20, 50, 100)
     or not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*)::integer into total_count from public.admin_audit_logs
  where event_key like 'avatar.%';
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', audit.id, 'action', audit.event_key,
    'targetType', case when audit.event_key like 'avatar.preset.%' then 'avatar_preset'
                       when audit.event_key like 'avatar.settings.%' then 'avatar_settings'
                       else 'avatar_content' end,
    'targetId', case when audit.metadata ? 'versionId' then audit.metadata ->> 'versionId'
                     when audit.metadata ? 'presetId' then audit.metadata ->> 'presetId'
                     else null end,
    'actorDisplayName', coalesce(administrator.display_name, 'System'),
    'summary', replace(audit.event_key, '.', ' '),
    'createdAt', audit.created_at
  ) order by audit.created_at desc, audit.id desc), '[]'::jsonb)
  into items from (
    select * from public.admin_audit_logs
    where event_key like 'avatar.%'
    order by created_at desc, id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) audit
  left join public.admin_users administrator on administrator.user_id = audit.actor_user_id;
  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0
                       else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.get_admin_avatar_overview(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.read'
  );
  if not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  return jsonb_build_object(
    'status', 'loaded',
    'overview', jsonb_build_object(
      'definitions', (select count(*)::integer from public.avatar_content_definitions),
      'activeDefinitions', (select count(*)::integer from public.avatar_content_definitions
                            where active_version_id is not null and enabled),
      'reviewQueue', (select count(*)::integer from public.avatar_content_versions
                      where lifecycle_status = 'in_review'),
      'invalidVersions', (select count(*)::integer from public.avatar_content_versions
                          where lifecycle_status = 'invalid'),
      'publishedPresets', (select count(*)::integer from public.avatar_presets
                           where lifecycle_status = 'active'),
      'playerProfiles', (select count(*)::integer from public.player_avatar_profiles
                         where creator_completed_at is not null),
      'developmentFallbacks', (select count(*)::integer from public.player_avatar_profiles
                               where creator_completed_at is null),
      'missingDirections', (select count(*)::integer from public.avatar_content_versions version
        where version.lifecycle_status in ('draft', 'invalid', 'in_review', 'approved', 'active')
          and (select count(distinct animation.direction)
               from public.avatar_animation_definitions animation
               where animation.avatar_content_version_id = version.id) < 8)
    )
  );
end;
$$;

create or replace function public.list_admin_avatar_presets(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'avatar_content.read'
  );
  if not private.claim_avatar_rate_limit('admin_read', p_user_id::text, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'presetId', preset.id,
    'stableKey', preset.preset_key,
    'publicName', preset.display_name,
    'description', preset.description,
    'state', preset.lifecycle_status,
    'version', preset.version_number,
    'revision', preset.edit_revision,
    'selection', private.avatar_preset_selection_json(preset),
    'updatedAt', preset.updated_at
  ) order by preset.preset_key, preset.version_number desc), '[]'::jsonb)
  into items from public.avatar_presets preset;
  return jsonb_build_object('status', 'loaded', 'presets', jsonb_build_object('items', items));
end;
$$;

revoke all on function private.validate_avatar_world_asset_reference() from public, anon, authenticated, service_role;
revoke all on function private.sync_avatar_world_asset_reference() from public, anon, authenticated, service_role;
revoke all on function private.sync_avatar_version_asset_reference_lifecycle() from public, anon, authenticated, service_role;
revoke all on function private.avatar_module_enabled() from public, anon, authenticated, service_role;
revoke all on function private.avatar_module_enabled_locked() from public, anon, authenticated, service_role;
revoke all on function private.claim_avatar_rate_limit(text,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function private.avatar_player_denial(public.wallet_access_sessions,public.player_profiles) from public, anon, authenticated, service_role;
revoke all on function private.avatar_asset_descriptors(uuid) from public, anon, authenticated, service_role;
revoke all on function private.avatar_animation_json(uuid) from public, anon, authenticated, service_role;
revoke all on function private.avatar_catalog_item_json(public.avatar_content_definitions,public.avatar_content_versions,boolean) from public, anon, authenticated, service_role;
revoke all on function private.avatar_preset_selection_json(public.avatar_presets) from public, anon, authenticated, service_role;
revoke all on function private.valid_avatar_public_key(text) from public, anon, authenticated, service_role;
revoke all on function private.avatar_content_selection_json(uuid,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function private.avatar_profile_json(public.player_avatar_profiles,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function private.resolve_active_avatar_content(text,text,boolean) from public, anon, authenticated, service_role;
revoke all on function private.resolve_avatar_selection(jsonb,boolean) from public, anon, authenticated, service_role;
revoke all on function private.avatar_player_context(text,text) from public, anon, authenticated, service_role;
revoke all on function private.mutate_player_avatar_profile(text,text,integer,jsonb,text,text) from public, anon, authenticated, service_role;
revoke all on function private.avatar_safe_fallback_json(public.player_avatar_profiles) from public, anon, authenticated, service_role;
revoke all on function private.avatar_content_type_for_layer(text) from public, anon, authenticated, service_role;
revoke all on function private.avatar_category_for_layer(text) from public, anon, authenticated, service_role;
revoke all on function private.avatar_admin_replay(uuid,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.store_avatar_admin_replay(uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.record_avatar_admin_audit(text,uuid,uuid,text,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.avatar_validation_preview(uuid) from public, anon, authenticated, service_role;

revoke all on function public.get_player_avatar_catalog(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_player_avatar_catalog(text,text,text) to service_role;
revoke all on function public.get_player_avatar_profile(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_player_avatar_profile(text,text,text) to service_role;
revoke all on function public.preview_player_avatar(text,text,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.preview_player_avatar(text,text,jsonb,text) to service_role;
revoke all on function public.create_player_avatar_profile(text,text,integer,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.create_player_avatar_profile(text,text,integer,jsonb,text) to service_role;
revoke all on function public.update_player_avatar_profile(text,text,integer,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.update_player_avatar_profile(text,text,integer,jsonb,text) to service_role;
revoke all on function public.get_resolved_public_avatar(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_resolved_public_avatar(uuid,text) to service_role;
revoke all on function public.get_realtime_avatar_profile(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_realtime_avatar_profile(uuid,text) to service_role;
revoke all on function public.list_admin_avatar_catalog(uuid,uuid,text,text,text,text,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.list_admin_avatar_catalog(uuid,uuid,text,text,text,text,text,text,text,integer,integer) to service_role;
revoke all on function public.get_admin_avatar_definition(uuid,uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_avatar_definition(uuid,uuid,text,uuid,text) to service_role;
revoke all on function public.create_admin_avatar_draft(uuid,uuid,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.create_admin_avatar_draft(uuid,uuid,text,text,text,text,text,text,text) to service_role;
revoke all on function public.update_admin_avatar_draft(uuid,uuid,text,uuid,integer,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.update_admin_avatar_draft(uuid,uuid,text,uuid,integer,jsonb,text) to service_role;
revoke all on function public.validate_admin_avatar_version(uuid,uuid,text,uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.validate_admin_avatar_version(uuid,uuid,text,uuid,integer,text) to service_role;
revoke all on function public.preview_admin_avatar_validation(uuid,uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.preview_admin_avatar_validation(uuid,uuid,text,uuid,text) to service_role;
revoke all on function public.submit_admin_avatar_review(uuid,uuid,text,uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.submit_admin_avatar_review(uuid,uuid,text,uuid,integer,text,text) to service_role;
revoke all on function public.review_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.review_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text,text) to service_role;
revoke all on function public.approve_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.approve_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) to service_role;
revoke all on function public.activate_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.activate_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) to service_role;
revoke all on function public.supersede_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.supersede_admin_avatar_version(uuid,uuid,text,uuid,integer,text,text) to service_role;
revoke all on function public.get_admin_avatar_settings(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_avatar_settings(uuid,uuid,text) to service_role;
revoke all on function public.update_admin_avatar_settings(uuid,uuid,text,integer,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.update_admin_avatar_settings(uuid,uuid,text,integer,jsonb,text) to service_role;
revoke all on function public.publish_admin_avatar_preset(uuid,uuid,text,uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.publish_admin_avatar_preset(uuid,uuid,text,uuid,integer,text,text) to service_role;
revoke all on function public.get_admin_avatar_profile(uuid,uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_avatar_profile(uuid,uuid,text,uuid,text) to service_role;
revoke all on function public.list_admin_avatar_audit(uuid,uuid,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.list_admin_avatar_audit(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.get_admin_avatar_overview(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_avatar_overview(uuid,uuid,text) to service_role;
revoke all on function public.list_admin_avatar_presets(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.list_admin_avatar_presets(uuid,uuid,text) to service_role;
