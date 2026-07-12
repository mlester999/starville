-- Starville Phase 6: trusted world validation, publication, loading, and transition RPCs.

create or replace function private.world_manifest_checksum(p_manifest jsonb)
returns text
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select encode(sha256(convert_to(p_manifest::text, 'UTF8')), 'hex');
$$;

create or replace function private.valid_world_reason(p_reason text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_reason is not null
    and char_length(p_reason) between 12 and 500
    and p_reason = btrim(p_reason)
    and p_reason !~ '[[:cntrl:]<>]';
$$;

create or replace function private.claim_world_rate_limit(
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
declare
  claimed boolean;
begin
  if p_scope not in (
       'player_manifest_read', 'player_transition', 'admin_world_read',
       'admin_draft_write', 'admin_validate', 'admin_preview', 'admin_publish',
       'admin_derive', 'admin_asset_read', 'admin_audit_read'
     )
     or p_subject_key is null
     or char_length(p_subject_key) not between 1 and 128
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_RATE_LIMIT_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-rate:' || p_scope || ':' || p_subject_key, 0)
  );

  insert into public.world_operation_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (scope, subject_key) do update
  set attempt_count = case
        when world_operation_rate_limits.window_expires_at <= now() then 1
        else world_operation_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when world_operation_rate_limits.window_expires_at <= now() then now()
        else world_operation_rate_limits.window_started_at
      end,
      window_expires_at = case
        when world_operation_rate_limits.window_expires_at <= now()
          then now() + make_interval(secs => p_window_seconds)
        else world_operation_rate_limits.window_expires_at
      end,
      updated_at = now()
  where world_operation_rate_limits.window_expires_at <= now()
     or world_operation_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function private.world_map_json(p_map public.world_maps)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_map.id,
    'slug', p_map.slug,
    'displayName', p_map.display_name,
    'description', p_map.description,
    'status', p_map.status,
    'defaultSpawnId', p_map.default_spawn_id,
    'activePublishedVersionId', p_map.active_published_version_id,
    'recordVersion', p_map.record_version,
    'createdAt', p_map.created_at,
    'updatedAt', p_map.updated_at
  );
$$;

create or replace function private.world_version_json(p_version public.world_map_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_version.id,
    'worldMapId', p_version.world_map_id,
    'versionNumber', p_version.version_number,
    'lifecycleStatus', p_version.lifecycle_status,
    'editVersion', p_version.edit_version,
    'checksum', p_version.checksum,
    'validationStatus', p_version.validation_status,
    'validationResult', p_version.validation_result,
    'createdByAdminId', p_version.created_by_admin_id,
    'createdAt', p_version.created_at,
    'updatedAt', p_version.updated_at,
    'validatedAt', p_version.validated_at,
    'validatedByAdminId', p_version.validated_by_admin_id,
    'publishedAt', p_version.published_at,
    'publishedByAdminId', p_version.published_by_admin_id,
    'publicationReason', p_version.publication_reason,
    'supersedesVersionId', p_version.supersedes_version_id,
    'derivedFromVersionId', p_version.derived_from_version_id
  );
$$;

create or replace function private.world_player_state_json(p_profile public.player_profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mapId', p_profile.current_map_id,
    'mapVersionId', p_profile.current_map_version_id,
    'x', p_profile.safe_position_x,
    'y', p_profile.safe_position_y,
    'facingDirection', p_profile.facing_direction,
    'gameStateVersion', p_profile.game_state_version,
    'stateVersion', p_profile.game_state_version,
    'lastTransitionAt', p_profile.last_successful_transition_at,
    'updatedAt', p_profile.updated_at
  );
$$;

create or replace function private.point_inside_world_bounds(
  p_bounds jsonb,
  p_x numeric,
  p_y numeric
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_typeof(p_bounds) = 'object'
    and jsonb_typeof(p_bounds -> 'minX') = 'number'
    and jsonb_typeof(p_bounds -> 'minY') = 'number'
    and jsonb_typeof(p_bounds -> 'maxX') = 'number'
    and jsonb_typeof(p_bounds -> 'maxY') = 'number'
    and p_x >= (p_bounds ->> 'minX')::numeric
    and p_x <= (p_bounds ->> 'maxX')::numeric
    and p_y >= (p_bounds ->> 'minY')::numeric
    and p_y <= (p_bounds ->> 'maxY')::numeric;
$$;

create or replace function private.point_blocked_by_world_manifest(
  p_manifest jsonb,
  p_x numeric,
  p_y numeric,
  p_radius numeric default 0.24
)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  collision jsonb;
  closest_x numeric;
  closest_y numeric;
  segment_dx numeric;
  segment_dy numeric;
  segment_length_squared numeric;
  projection numeric;
begin
  if jsonb_typeof(p_manifest -> 'collisions') <> 'array' then
    return true;
  end if;

  for collision in select value from jsonb_array_elements(p_manifest -> 'collisions') loop
    if coalesce((collision ->> 'blocking')::boolean, false) = false then
      continue;
    end if;

    if collision ->> 'shape' = 'rectangle' then
      closest_x := greatest((collision ->> 'x')::numeric,
        least(p_x, (collision ->> 'x')::numeric + (collision ->> 'width')::numeric));
      closest_y := greatest((collision ->> 'y')::numeric,
        least(p_y, (collision ->> 'y')::numeric + (collision ->> 'height')::numeric));
      if power(p_x - closest_x, 2) + power(p_y - closest_y, 2) < power(p_radius, 2) then
        return true;
      end if;
    elsif collision ->> 'shape' = 'circle' then
      if power(p_x - (collision ->> 'x')::numeric, 2)
         + power(p_y - (collision ->> 'y')::numeric, 2)
         < power(p_radius + (collision ->> 'radius')::numeric, 2) then
        return true;
      end if;
    elsif collision ->> 'shape' = 'capsule' then
      segment_dx := (collision ->> 'endX')::numeric - (collision ->> 'startX')::numeric;
      segment_dy := (collision ->> 'endY')::numeric - (collision ->> 'startY')::numeric;
      segment_length_squared := power(segment_dx, 2) + power(segment_dy, 2);
      if segment_length_squared <= 0 then
        return true;
      end if;
      projection := greatest(0, least(1,
        ((p_x - (collision ->> 'startX')::numeric) * segment_dx
          + (p_y - (collision ->> 'startY')::numeric) * segment_dy)
        / segment_length_squared
      ));
      closest_x := (collision ->> 'startX')::numeric + projection * segment_dx;
      closest_y := (collision ->> 'startY')::numeric + projection * segment_dy;
      if power(p_x - closest_x, 2) + power(p_y - closest_y, 2)
         < power(p_radius + (collision ->> 'radius')::numeric, 2) then
        return true;
      end if;
    else
      return true;
    end if;
  end loop;

  return false;
exception when others then
  return true;
end;
$$;

create or replace function private.world_validation_issue(
  p_code text,
  p_path text,
  p_message text
)
returns jsonb
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', p_code,
    'path', p_path,
    'message', p_message,
    'severity', 'error'
  );
$$;

create or replace function private.validate_world_manifest(
  p_world_map_id uuid,
  p_manifest jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_map public.world_maps%rowtype;
  errors jsonb := '[]'::jsonb;
  spawn jsonb;
  exit_definition jsonb;
  collision jsonb;
  terrain_area jsonb;
  map_object jsonb;
  interaction_definition jsonb;
  destination_map public.world_maps%rowtype;
  destination_manifest jsonb;
  destination_spawn jsonb;
  requested_asset_key text;
  width_value numeric;
  height_value numeric;
  camera_bounds jsonb;
  safe_bounds jsonb;
begin
  select * into target_map from public.world_maps where id = p_world_map_id;
  if not found then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(private.world_validation_issue(
        'WORLD_MAP_NOT_FOUND', '$', 'The target world map does not exist.'
      )),
      'warnings', '[]'::jsonb,
      'checkedAt', now()
    );
  end if;

  if p_manifest is null
     or jsonb_typeof(p_manifest) <> 'object'
     or pg_column_size(p_manifest) > 262144 then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(private.world_validation_issue(
        'INVALID_MANIFEST_PAYLOAD', '$', 'The manifest must be a bounded JSON object.'
      )),
      'warnings', '[]'::jsonb,
      'checkedAt', now()
    );
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_manifest) as key
    where key not in (
      'schemaVersion', 'id', 'slug', 'name', 'description', 'version', 'developmentArt',
      'background', 'width', 'height', 'tileWidth', 'tileHeight', 'projectionOrigin',
      'cameraBounds', 'safeSaveBounds', 'defaultSpawnId', 'spawns', 'assets', 'terrain',
      'collisions', 'objects', 'interactions', 'exits'
    )
  ) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'UNSUPPORTED_MANIFEST_FIELD', '$', 'The manifest contains an unsupported top-level field.'
    ));
  end if;

  if jsonb_typeof(p_manifest -> 'schemaVersion') <> 'number'
     or (p_manifest ->> 'schemaVersion')::numeric <> 1 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'UNSUPPORTED_SCHEMA_VERSION', '$.schemaVersion', 'Only world manifest schema version 1 is supported.'
    ));
  end if;
  if p_manifest ->> 'id' <> target_map.slug
     or p_manifest ->> 'slug' <> target_map.slug
     or p_manifest ->> 'id' <> p_manifest ->> 'slug' then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'MAP_IDENTITY_MISMATCH', '$.id', 'Manifest identity must match the stable world map slug.'
    ));
  end if;
  if p_manifest ->> 'name' <> target_map.display_name then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'MAP_NAME_MISMATCH', '$.name', 'Manifest name must match the stable world map name.'
    ));
  end if;
  if jsonb_typeof(p_manifest -> 'description') <> 'string'
     or char_length(p_manifest ->> 'description') not between 1 and 240
     or p_manifest ->> 'description' <> btrim(p_manifest ->> 'description') then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_MAP_DESCRIPTION', '$.description', 'Map description is missing or outside its safe bounds.'
    ));
  end if;
  if jsonb_typeof(p_manifest -> 'version') <> 'number'
     or (p_manifest ->> 'version')::numeric < 1
     or (p_manifest ->> 'version')::numeric <> trunc((p_manifest ->> 'version')::numeric) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_MANIFEST_VERSION', '$.version', 'Manifest version must be a positive integer.'
    ));
  end if;
  if jsonb_typeof(p_manifest -> 'developmentArt') <> 'object'
     or jsonb_typeof(p_manifest -> 'developmentArt' -> 'temporary') <> 'boolean'
     or coalesce(p_manifest -> 'developmentArt' ->> 'label', '') = '' then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_DEVELOPMENT_ART_METADATA', '$.developmentArt', 'Development-art metadata is invalid.'
    ));
  end if;
  if jsonb_typeof(p_manifest -> 'background') <> 'object'
     or p_manifest -> 'background' ->> 'palette' not in (
    'village', 'meadow', 'brook', 'hearth', 'forest'
  ) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_BACKGROUND_PALETTE', '$.background.palette', 'Background palette is unsupported.'
    ));
  end if;

  if jsonb_typeof(p_manifest -> 'width') <> 'number'
     or jsonb_typeof(p_manifest -> 'height') <> 'number' then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_MAP_DIMENSIONS', '$', 'Map width and height must be numeric.'
    ));
    width_value := 0;
    height_value := 0;
  else
    width_value := (p_manifest ->> 'width')::numeric;
    height_value := (p_manifest ->> 'height')::numeric;
    if width_value not between 8 and 128
       or height_value not between 8 and 128
       or width_value <> trunc(width_value)
       or height_value <> trunc(height_value) then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'INVALID_MAP_DIMENSIONS', '$', 'Map dimensions must be whole numbers between 8 and 128.'
      ));
    end if;
  end if;

  if jsonb_typeof(p_manifest -> 'tileWidth') <> 'number'
     or jsonb_typeof(p_manifest -> 'tileHeight') <> 'number'
     or (p_manifest ->> 'tileWidth')::numeric not between 32 and 256
     or (p_manifest ->> 'tileHeight')::numeric not between 16 and 128
     or (p_manifest ->> 'tileWidth')::numeric <> trunc((p_manifest ->> 'tileWidth')::numeric)
     or (p_manifest ->> 'tileHeight')::numeric <> trunc((p_manifest ->> 'tileHeight')::numeric) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_TILE_DIMENSIONS', '$.tileWidth', 'Tile dimensions are outside the supported range.'
    ));
  end if;
  if jsonb_typeof(p_manifest -> 'projectionOrigin') <> 'object'
     or jsonb_typeof(p_manifest -> 'projectionOrigin' -> 'x') <> 'number'
     or jsonb_typeof(p_manifest -> 'projectionOrigin' -> 'y') <> 'number' then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_PROJECTION_ORIGIN', '$.projectionOrigin', 'Projection origin must contain finite numeric coordinates.'
    ));
  end if;

  camera_bounds := p_manifest -> 'cameraBounds';
  safe_bounds := p_manifest -> 'safeSaveBounds';
  if jsonb_typeof(camera_bounds) <> 'object'
     or jsonb_typeof(camera_bounds -> 'minX') <> 'number'
     or jsonb_typeof(camera_bounds -> 'minY') <> 'number'
     or jsonb_typeof(camera_bounds -> 'maxX') <> 'number'
     or jsonb_typeof(camera_bounds -> 'maxY') <> 'number'
     or (camera_bounds ->> 'minX')::numeric >= (camera_bounds ->> 'maxX')::numeric
     or (camera_bounds ->> 'minY')::numeric >= (camera_bounds ->> 'maxY')::numeric then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_CAMERA_BOUNDS', '$.cameraBounds', 'Camera bounds are malformed or empty.'
    ));
  end if;
  if jsonb_typeof(safe_bounds) <> 'object'
     or jsonb_typeof(safe_bounds -> 'minX') <> 'number'
     or jsonb_typeof(safe_bounds -> 'minY') <> 'number'
     or jsonb_typeof(safe_bounds -> 'maxX') <> 'number'
     or jsonb_typeof(safe_bounds -> 'maxY') <> 'number'
     or (safe_bounds ->> 'minX')::numeric < 0
     or (safe_bounds ->> 'minY')::numeric < 0
     or (safe_bounds ->> 'maxX')::numeric > width_value
     or (safe_bounds ->> 'maxY')::numeric > height_value
     or (safe_bounds ->> 'minX')::numeric >= (safe_bounds ->> 'maxX')::numeric
     or (safe_bounds ->> 'minY')::numeric >= (safe_bounds ->> 'maxY')::numeric then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_SAFE_BOUNDS', '$.safeSaveBounds', 'Safe-save bounds must be non-empty and contained by the map.'
    ));
  end if;

  if jsonb_typeof(p_manifest -> 'assets') <> 'array'
     or jsonb_array_length(p_manifest -> 'assets') = 0
     or jsonb_array_length(p_manifest -> 'assets') > 128
     or exists (
       select 1 from jsonb_array_elements(p_manifest -> 'assets') as item
       where jsonb_typeof(item) <> 'string'
     ) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_ASSET_REFERENCES', '$.assets', 'Asset references must be a bounded string array.'
    ));
  else
    if (select count(*) from jsonb_array_elements_text(p_manifest -> 'assets')) <>
       (select count(distinct value) from jsonb_array_elements_text(p_manifest -> 'assets')) then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'DUPLICATE_ASSET_REFERENCE', '$.assets', 'Asset references must be unique.'
      ));
    end if;
    for requested_asset_key in
      select value from jsonb_array_elements_text(p_manifest -> 'assets')
    loop
      if not exists (
        select 1 from public.world_assets as asset
        where asset.asset_key = requested_asset_key and asset.approval_status = 'approved'
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'UNAPPROVED_ASSET', '$.assets',
          'Asset ' || requested_asset_key || ' is missing or not approved.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'terrain') <> 'array'
     or jsonb_array_length(p_manifest -> 'terrain') = 0
     or jsonb_array_length(p_manifest -> 'terrain') > 512 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_TERRAIN', '$.terrain', 'Terrain must be a non-empty bounded array.'
    ));
  else
    for terrain_area in select value from jsonb_array_elements(p_manifest -> 'terrain') loop
      if jsonb_typeof(terrain_area) <> 'object'
         or coalesce(terrain_area ->> 'id', '') = ''
         or terrain_area ->> 'terrain' not in ('grass', 'plaza', 'path', 'water', 'bridge')
         or jsonb_typeof(terrain_area -> 'x') <> 'number'
         or jsonb_typeof(terrain_area -> 'y') <> 'number'
         or jsonb_typeof(terrain_area -> 'width') <> 'number'
         or jsonb_typeof(terrain_area -> 'height') <> 'number'
         or jsonb_typeof(terrain_area -> 'order') <> 'number'
         or (terrain_area ->> 'x')::numeric < 0
         or (terrain_area ->> 'y')::numeric < 0
         or (terrain_area ->> 'width')::numeric <= 0
         or (terrain_area ->> 'height')::numeric <= 0
         or (terrain_area ->> 'x')::numeric + (terrain_area ->> 'width')::numeric > width_value
         or (terrain_area ->> 'y')::numeric + (terrain_area ->> 'height')::numeric > height_value then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_TERRAIN_AREA', '$.terrain', 'A terrain area is malformed or outside map bounds.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'spawns') <> 'array'
     or jsonb_array_length(p_manifest -> 'spawns') = 0
     or jsonb_array_length(p_manifest -> 'spawns') > 32 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'MISSING_SPAWNS', '$.spawns', 'At least one bounded spawn definition is required.'
    ));
  else
    if (select count(*) from jsonb_array_elements(p_manifest -> 'spawns')) <>
       (select count(distinct value ->> 'id') from jsonb_array_elements(p_manifest -> 'spawns')) then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'DUPLICATE_SPAWN_ID', '$.spawns', 'Spawn identifiers must be unique.'
      ));
    end if;
    for spawn in select value from jsonb_array_elements(p_manifest -> 'spawns') loop
      if jsonb_typeof(spawn) <> 'object'
         or coalesce(spawn ->> 'id', '') = ''
         or jsonb_typeof(spawn -> 'x') <> 'number'
         or jsonb_typeof(spawn -> 'y') <> 'number'
         or spawn ->> 'facingDirection' not in (
           'north', 'northeast', 'east', 'southeast',
           'south', 'southwest', 'west', 'northwest'
         )
         or spawn ->> 'purpose' not in ('default', 'transition-entry')
         or jsonb_typeof(spawn -> 'enabled') <> 'boolean' then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_SPAWN', '$.spawns', 'A spawn definition is malformed.'
        ));
      elsif not private.point_inside_world_bounds(
        p_manifest -> 'safeSaveBounds', (spawn ->> 'x')::numeric, (spawn ->> 'y')::numeric
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'SPAWN_OUTSIDE_SAFE_BOUNDS', '$.spawns', 'Spawn ' || (spawn ->> 'id') || ' lies outside safe bounds.'
        ));
      elsif private.point_blocked_by_world_manifest(
        p_manifest, (spawn ->> 'x')::numeric, (spawn ->> 'y')::numeric, 0.24
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'SPAWN_INSIDE_COLLISION', '$.spawns', 'Spawn ' || (spawn ->> 'id') || ' intersects blocking collision.'
        ));
      end if;
    end loop;
    if not exists (
      select 1 from jsonb_array_elements(p_manifest -> 'spawns') as item
      where item ->> 'id' = p_manifest ->> 'defaultSpawnId'
        and item ->> 'purpose' = 'default'
        and (item ->> 'enabled')::boolean
    ) or p_manifest ->> 'defaultSpawnId' <> target_map.default_spawn_id then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'INVALID_DEFAULT_SPAWN', '$.defaultSpawnId', 'Exactly one enabled default spawn must match the map default.'
      ));
    elsif (
      select count(*) from jsonb_array_elements(p_manifest -> 'spawns') as item
      where item ->> 'purpose' = 'default'
    ) <> 1 then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'INVALID_DEFAULT_SPAWN_COUNT', '$.spawns', 'A map must define exactly one default spawn.'
      ));
    end if;
  end if;

  if jsonb_typeof(p_manifest -> 'collisions') <> 'array'
     or jsonb_array_length(p_manifest -> 'collisions') > 512 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_COLLISIONS', '$.collisions', 'Collisions must be a bounded array.'
    ));
  else
    for collision in select value from jsonb_array_elements(p_manifest -> 'collisions') loop
      if jsonb_typeof(collision) <> 'object'
         or coalesce(collision ->> 'id', '') = ''
         or collision ->> 'shape' not in ('rectangle', 'circle', 'capsule')
         or jsonb_typeof(collision -> 'blocking') <> 'boolean' then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'UNSUPPORTED_COLLISION', '$.collisions', 'A collision definition is malformed or unsupported.'
        ));
      elsif collision ->> 'shape' = 'rectangle' and (
        jsonb_typeof(collision -> 'x') <> 'number'
        or jsonb_typeof(collision -> 'y') <> 'number'
        or jsonb_typeof(collision -> 'width') <> 'number'
        or jsonb_typeof(collision -> 'height') <> 'number'
        or (collision ->> 'x')::numeric < 0
        or (collision ->> 'y')::numeric < 0
        or (collision ->> 'width')::numeric <= 0
        or (collision ->> 'height')::numeric <= 0
        or (collision ->> 'x')::numeric + (collision ->> 'width')::numeric > width_value
        or (collision ->> 'y')::numeric + (collision ->> 'height')::numeric > height_value
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_RECTANGLE_COLLISION', '$.collisions', 'A rectangle collision lies outside map bounds.'
        ));
      elsif collision ->> 'shape' = 'circle' and (
        jsonb_typeof(collision -> 'x') <> 'number'
        or jsonb_typeof(collision -> 'y') <> 'number'
        or jsonb_typeof(collision -> 'radius') <> 'number'
        or (collision ->> 'radius')::numeric <= 0
        or (collision ->> 'x')::numeric - (collision ->> 'radius')::numeric < 0
        or (collision ->> 'y')::numeric - (collision ->> 'radius')::numeric < 0
        or (collision ->> 'x')::numeric + (collision ->> 'radius')::numeric > width_value
        or (collision ->> 'y')::numeric + (collision ->> 'radius')::numeric > height_value
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_CIRCLE_COLLISION', '$.collisions', 'A circle collision lies outside map bounds.'
        ));
      elsif collision ->> 'shape' = 'capsule' and (
        jsonb_typeof(collision -> 'startX') <> 'number'
        or jsonb_typeof(collision -> 'startY') <> 'number'
        or jsonb_typeof(collision -> 'endX') <> 'number'
        or jsonb_typeof(collision -> 'endY') <> 'number'
        or jsonb_typeof(collision -> 'radius') <> 'number'
        or (collision ->> 'radius')::numeric <= 0
        or (
          (collision ->> 'startX')::numeric = (collision ->> 'endX')::numeric
          and (collision ->> 'startY')::numeric = (collision ->> 'endY')::numeric
        )
        or least((collision ->> 'startX')::numeric, (collision ->> 'endX')::numeric)
             - (collision ->> 'radius')::numeric < 0
        or least((collision ->> 'startY')::numeric, (collision ->> 'endY')::numeric)
             - (collision ->> 'radius')::numeric < 0
        or greatest((collision ->> 'startX')::numeric, (collision ->> 'endX')::numeric)
             + (collision ->> 'radius')::numeric > width_value
        or greatest((collision ->> 'startY')::numeric, (collision ->> 'endY')::numeric)
             + (collision ->> 'radius')::numeric > height_value
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_CAPSULE_COLLISION', '$.collisions', 'A capsule collision is degenerate or outside map bounds.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'objects') <> 'array'
     or jsonb_array_length(p_manifest -> 'objects') > 512 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_OBJECTS', '$.objects', 'Map objects must be a bounded array.'
    ));
  else
    for map_object in select value from jsonb_array_elements(p_manifest -> 'objects') loop
      if jsonb_typeof(map_object) <> 'object'
         or coalesce(map_object ->> 'id', '') = ''
         or coalesce(map_object ->> 'assetId', '') = ''
         or map_object ->> 'kind' not in ('building', 'tree', 'rock', 'fence', 'lamp', 'sign', 'flowers', 'bush')
         or jsonb_typeof(map_object -> 'x') <> 'number'
         or jsonb_typeof(map_object -> 'y') <> 'number'
         or jsonb_typeof(map_object -> 'scale') <> 'number'
         or (map_object ->> 'scale')::numeric <= 0
         or (map_object ->> 'scale')::numeric > 4
         or not private.point_inside_world_bounds(
           safe_bounds, (map_object ->> 'x')::numeric, (map_object ->> 'y')::numeric
         )
         or not ((p_manifest -> 'assets') ? (map_object ->> 'assetId')) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_MAP_OBJECT', '$.objects', 'A map object is malformed, outside safe bounds, or uses an undeclared asset.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'interactions') <> 'array'
     or jsonb_array_length(p_manifest -> 'interactions') > 64 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'INVALID_INTERACTIONS', '$.interactions', 'Interactions must be a bounded array.'
    ));
  else
    for interaction_definition in
      select value from jsonb_array_elements(p_manifest -> 'interactions')
    loop
      if jsonb_typeof(interaction_definition) <> 'object'
         or coalesce(interaction_definition ->> 'id', '') = ''
         or interaction_definition ->> 'type' <> 'notice'
         or jsonb_typeof(interaction_definition -> 'x') <> 'number'
         or jsonb_typeof(interaction_definition -> 'y') <> 'number'
         or jsonb_typeof(interaction_definition -> 'range') <> 'number'
         or (interaction_definition ->> 'range')::numeric <= 0
         or (interaction_definition ->> 'range')::numeric > 4
         or char_length(coalesce(interaction_definition ->> 'title', '')) not between 1 and 80
         or char_length(coalesce(interaction_definition ->> 'content', '')) not between 1 and 280
         or not private.point_inside_world_bounds(
           safe_bounds,
           (interaction_definition ->> 'x')::numeric,
           (interaction_definition ->> 'y')::numeric
         ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_INTERACTION', '$.interactions', 'An interaction is malformed, unsupported, or outside safe bounds.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'terrain') = 'array'
     and jsonb_typeof(p_manifest -> 'collisions') = 'array'
     and jsonb_typeof(p_manifest -> 'objects') = 'array'
     and jsonb_typeof(p_manifest -> 'interactions') = 'array'
     and jsonb_typeof(p_manifest -> 'spawns') = 'array'
     and jsonb_typeof(p_manifest -> 'exits') = 'array'
     and (
       select count(*) <> count(distinct identifier)
       from (
         select value ->> 'id' as identifier from jsonb_array_elements(p_manifest -> 'terrain')
         union all
         select value ->> 'id' from jsonb_array_elements(p_manifest -> 'collisions')
         union all
         select value ->> 'id' from jsonb_array_elements(p_manifest -> 'objects')
         union all
         select value ->> 'id' from jsonb_array_elements(p_manifest -> 'interactions')
         union all
         select value ->> 'id' from jsonb_array_elements(p_manifest -> 'spawns')
         union all
         select value ->> 'id' from jsonb_array_elements(p_manifest -> 'exits')
       ) as identifiers
     ) then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'DUPLICATE_OBJECT_ID', '$', 'All map object identifiers must be unique across manifest collections.'
    ));
  end if;

  if jsonb_typeof(p_manifest -> 'exits') <> 'array'
     or jsonb_array_length(p_manifest -> 'exits') <> 4 then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'FOUR_DIRECTIONAL_EXITS_REQUIRED', '$.exits', 'Exactly four directional exit slots are required.'
    ));
  else
    if (select count(distinct value ->> 'id') from jsonb_array_elements(p_manifest -> 'exits')) <> 4
       or (select count(distinct value ->> 'direction') from jsonb_array_elements(p_manifest -> 'exits')) <> 4
       or exists (
         select 1 from unnest(array['north', 'east', 'south', 'west']) as direction
         where not exists (
           select 1 from jsonb_array_elements(p_manifest -> 'exits') as candidate
           where candidate ->> 'direction' = direction
         )
       ) then
      errors := errors || jsonb_build_array(private.world_validation_issue(
        'INVALID_DIRECTIONAL_EXIT_SET', '$.exits', 'Exit identifiers and directions must be unique and complete.'
      ));
    end if;

    for exit_definition in select value from jsonb_array_elements(p_manifest -> 'exits') loop
      if jsonb_typeof(exit_definition -> 'trigger') <> 'object'
         or jsonb_typeof(exit_definition -> 'trigger' -> 'x') <> 'number'
         or jsonb_typeof(exit_definition -> 'trigger' -> 'y') <> 'number'
         or jsonb_typeof(exit_definition -> 'trigger' -> 'width') <> 'number'
         or jsonb_typeof(exit_definition -> 'trigger' -> 'height') <> 'number'
         or (exit_definition -> 'trigger' ->> 'width')::numeric <= 0
         or (exit_definition -> 'trigger' ->> 'height')::numeric <= 0
         or (exit_definition -> 'trigger' ->> 'x')::numeric < 0
         or (exit_definition -> 'trigger' ->> 'y')::numeric < 0
         or (exit_definition -> 'trigger' ->> 'x')::numeric
            + (exit_definition -> 'trigger' ->> 'width')::numeric > width_value
         or (exit_definition -> 'trigger' ->> 'y')::numeric
            + (exit_definition -> 'trigger' ->> 'height')::numeric > height_value then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_EXIT_TRIGGER', '$.exits', 'An exit trigger is malformed or outside map bounds.'
        ));
        continue;
      end if;

      if exists (
        select 1 from jsonb_array_elements(p_manifest -> 'exits') as other_exit
        where other_exit ->> 'id' <> exit_definition ->> 'id'
          and (exit_definition -> 'trigger' ->> 'x')::numeric
              < (other_exit -> 'trigger' ->> 'x')::numeric
                + (other_exit -> 'trigger' ->> 'width')::numeric
          and (exit_definition -> 'trigger' ->> 'x')::numeric
                + (exit_definition -> 'trigger' ->> 'width')::numeric
              > (other_exit -> 'trigger' ->> 'x')::numeric
          and (exit_definition -> 'trigger' ->> 'y')::numeric
              < (other_exit -> 'trigger' ->> 'y')::numeric
                + (other_exit -> 'trigger' ->> 'height')::numeric
          and (exit_definition -> 'trigger' ->> 'y')::numeric
                + (exit_definition -> 'trigger' ->> 'height')::numeric
              > (other_exit -> 'trigger' ->> 'y')::numeric
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'OVERLAPPING_EXITS', '$.exits', 'Exit trigger regions must not overlap.'
        ));
      end if;

      if coalesce((exit_definition ->> 'enabled')::boolean, false) = false then
        if (exit_definition -> 'destinationMapId') is distinct from 'null'::jsonb
           or (exit_definition -> 'destinationSpawnId') is distinct from 'null'::jsonb
           or (exit_definition -> 'transitionLabel') is distinct from 'null'::jsonb then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'DISABLED_EXIT_HAS_DESTINATION', '$.exits', 'Disabled exits cannot expose destination data.'
          ));
        end if;
        continue;
      end if;

      if coalesce(exit_definition ->> 'destinationMapId', '') = ''
         or coalesce(exit_definition ->> 'destinationSpawnId', '') = ''
         or char_length(coalesce(exit_definition ->> 'transitionLabel', '')) not between 1 and 80 then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'ENABLED_EXIT_MISSING_DESTINATION', '$.exits', 'Enabled exits require a destination, spawn, and transition label.'
        ));
        continue;
      end if;

      if private.point_blocked_by_world_manifest(
        p_manifest,
        (exit_definition -> 'trigger' ->> 'x')::numeric
          + (exit_definition -> 'trigger' ->> 'width')::numeric / 2,
        (exit_definition -> 'trigger' ->> 'y')::numeric
          + (exit_definition -> 'trigger' ->> 'height')::numeric / 2,
        0.24
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'EXIT_TRIGGER_BLOCKED', '$.exits', 'An enabled exit has no walkable trigger center.'
        ));
      end if;

      select * into destination_map
      from public.world_maps
      where slug = exit_definition ->> 'destinationMapId' and status = 'active';
      if not found then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'DESTINATION_MAP_NOT_FOUND', '$.exits', 'An enabled exit references a missing destination map.'
        ));
        continue;
      end if;

      select version.manifest into destination_manifest
      from public.world_map_versions as version
      where version.world_map_id = destination_map.id
        and version.lifecycle_status = 'published'
      order by (version.id = destination_map.active_published_version_id) desc,
        version.version_number desc
      limit 1;
      if not found then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'DESTINATION_VERSION_NOT_AVAILABLE', '$.exits', 'Destination map has no active published version.'
        ));
        continue;
      end if;

      select value into destination_spawn
      from jsonb_array_elements(destination_manifest -> 'spawns')
      where value ->> 'id' = exit_definition ->> 'destinationSpawnId'
        and coalesce((value ->> 'enabled')::boolean, false)
      limit 1;
      if destination_spawn is null then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'DESTINATION_SPAWN_NOT_FOUND', '$.exits', 'Destination spawn is missing or disabled.'
        ));
        continue;
      end if;
      if exists (
        select 1 from jsonb_array_elements(destination_manifest -> 'exits') as destination_exit
        where coalesce((destination_exit ->> 'enabled')::boolean, false)
          and (destination_spawn ->> 'x')::numeric >=
              (destination_exit -> 'trigger' ->> 'x')::numeric
          and (destination_spawn ->> 'x')::numeric <=
              (destination_exit -> 'trigger' ->> 'x')::numeric
                + (destination_exit -> 'trigger' ->> 'width')::numeric
          and (destination_spawn ->> 'y')::numeric >=
              (destination_exit -> 'trigger' ->> 'y')::numeric
          and (destination_spawn ->> 'y')::numeric <=
              (destination_exit -> 'trigger' ->> 'y')::numeric
                + (destination_exit -> 'trigger' ->> 'height')::numeric
      ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'DESTINATION_SPAWN_INSIDE_EXIT', '$.exits', 'Destination spawn would immediately retrigger travel.'
        ));
      end if;
    end loop;
  end if;

  if p_manifest::text ~* '(<script|javascript:|data:text/html|on[a-z]+\s*=|\bselect\b.+\bfrom\b|\binsert\b.+\binto\b)' then
    errors := errors || jsonb_build_array(private.world_validation_issue(
      'EXECUTABLE_CONTENT_REJECTED', '$', 'World manifests must remain data-only.'
    ));
  end if;

  return jsonb_build_object(
    'valid', jsonb_array_length(errors) = 0,
    'errors', errors,
    'warnings', '[]'::jsonb,
    'checkedAt', now()
  );
exception when others then
  return jsonb_build_object(
    'valid', false,
    'errors', jsonb_build_array(private.world_validation_issue(
      'MALFORMED_MANIFEST', '$', 'The manifest could not be validated safely.'
    )),
    'warnings', '[]'::jsonb,
    'checkedAt', now()
  );
end;
$$;

create or replace function private.sync_world_version_assets(
  p_world_map_version_id uuid,
  p_manifest jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.world_map_version_assets
  where world_map_version_id = p_world_map_version_id;

  insert into public.world_map_version_assets (world_map_version_id, world_asset_id)
  select p_world_map_version_id, asset.id
  from jsonb_array_elements_text(p_manifest -> 'assets') as requested(asset_key)
  join public.world_assets as asset on asset.asset_key = requested.asset_key
  where asset.approval_status = 'approved'
  on conflict do nothing;
end;
$$;

create or replace function private.player_profile_json(profile public.player_profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'loaded',
    'id', profile.id,
    'displayName', profile.display_name,
    'appearancePreset', profile.appearance_preset,
    'mapId', profile.current_map_id,
    'mapVersionId', profile.current_map_version_id,
    'x', profile.safe_position_x,
    'y', profile.safe_position_y,
    'facingDirection', profile.facing_direction,
    'gameStateVersion', profile.game_state_version,
    'stateVersion', profile.game_state_version,
    'lastTransitionAt', profile.last_successful_transition_at,
    'createdAt', profile.created_at,
    'updatedAt', profile.updated_at,
    'lastEnteredAt', profile.last_entered_at
  );
$$;

create or replace function private.set_player_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.wallet_address is distinct from old.wallet_address
     or new.display_name is distinct from old.display_name
     or new.appearance_preset is distinct from old.appearance_preset
     or new.current_map_id is distinct from old.current_map_id
     or new.current_map_version_id is distinct from old.current_map_version_id
     or new.safe_position_x is distinct from old.safe_position_x
     or new.safe_position_y is distinct from old.safe_position_y
     or new.facing_direction is distinct from old.facing_direction
     or new.game_state_version is distinct from old.game_state_version
     or new.last_successful_transition_at is distinct from old.last_successful_transition_at
     or new.last_transition_exit_id is distinct from old.last_transition_exit_id
     or new.last_transition_request_id is distinct from old.last_transition_request_id then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create or replace function public.get_current_published_world(
  p_wallet_address text,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_world record;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  selected_spawn jsonb;
  needs_reconciliation boolean := false;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_LOAD_REQUEST';
  end if;

  if not private.claim_world_rate_limit(
    'player_manifest_read', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = profile.current_map_id
    and map.status = 'active'
    and version.lifecycle_status = 'published';

  if not found then
    select map as map_row, version as version_row
    into selected_world
    from public.world_maps as map
    join public.world_map_versions as version on version.id = map.active_published_version_id
    where map.slug = 'lantern-square'
      and map.status = 'active'
      and version.lifecycle_status = 'published';
    if not found then
      return jsonb_build_object('status', 'world_unavailable');
    end if;
    needs_reconciliation := true;
  end if;

  selected_map := selected_world.map_row;
  selected_version := selected_world.version_row;

  if profile.current_map_version_id is distinct from selected_version.id then
    needs_reconciliation := true;
  end if;

  if needs_reconciliation and (
    profile.current_map_id <> selected_map.slug
    or not private.point_inside_world_bounds(
      selected_version.manifest -> 'safeSaveBounds',
      profile.safe_position_x,
      profile.safe_position_y
    )
    or private.point_blocked_by_world_manifest(
      selected_version.manifest,
      profile.safe_position_x,
      profile.safe_position_y,
      0.24
    )
  ) then
    select value into selected_spawn
    from jsonb_array_elements(selected_version.manifest -> 'spawns')
    where value ->> 'id' = selected_map.default_spawn_id
      and coalesce((value ->> 'enabled')::boolean, false)
    limit 1;
    if selected_spawn is null then
      return jsonb_build_object('status', 'world_unavailable');
    end if;
    profile.safe_position_x := (selected_spawn ->> 'x')::numeric;
    profile.safe_position_y := (selected_spawn ->> 'y')::numeric;
    profile.facing_direction := selected_spawn ->> 'facingDirection';
  end if;

  if needs_reconciliation then
    update public.player_profiles
    set current_map_id = selected_map.slug,
        current_map_version_id = selected_version.id,
        safe_position_x = profile.safe_position_x,
        safe_position_y = profile.safe_position_y,
        facing_direction = profile.facing_direction,
        game_state_version = game_state_version + 1
    where id = profile.id
    returning * into profile;
  end if;

  return jsonb_build_object(
    'status', 'loaded',
    'map', private.world_map_json(selected_map),
    'version', private.world_version_json(selected_version),
    'manifest', selected_version.manifest,
    'playerState', private.world_player_state_json(profile)
  );
end;
$$;

create or replace function public.get_published_world_manifest(
  p_wallet_address text,
  p_map_slug text,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_world record;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_map_slug is null
     or char_length(p_map_slug) not between 3 and 64
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_LOAD_REQUEST';
  end if;

  if not private.claim_world_rate_limit(
    'player_manifest_read', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = p_map_slug
    and map.status = 'active'
    and version.lifecycle_status = 'published';
  if not found then
    return jsonb_build_object('status', 'map_not_found');
  end if;

  selected_map := selected_world.map_row;
  selected_version := selected_world.version_row;

  return jsonb_build_object(
    'status', 'loaded',
    'map', private.world_map_json(selected_map),
    'version', private.world_version_json(selected_version),
    'manifest', selected_version.manifest
  );
end;
$$;

create or replace function public.transition_player_world(
  p_wallet_address text,
  p_exit_id text,
  p_expected_game_state_version integer,
  p_expected_map_version_id uuid,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_world record;
  source_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  exit_definition jsonb;
  destination_map public.world_maps%rowtype;
  destination_version public.world_map_versions%rowtype;
  destination_spawn jsonb;
  replayed_spawn jsonb;
  completed_at timestamptz;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_exit_id is null
     or p_exit_id !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or p_expected_game_state_version is null
     or p_expected_game_state_version < 1
     or p_expected_map_version_id is null
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_TRANSITION_REQUEST';
  end if;

  if not private.claim_world_rate_limit(
    'player_transition', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  if profile.last_transition_request_id = p_request_id then
    select map as map_row, version as version_row
    into selected_world
    from public.world_maps as map
    join public.world_map_versions as version on version.id = profile.current_map_version_id
    where map.slug = profile.current_map_id and version.world_map_id = map.id;
    if not found then
      return jsonb_build_object('status', 'destination_unavailable');
    end if;
    destination_map := selected_world.map_row;
    destination_version := selected_world.version_row;
    select value into replayed_spawn
    from jsonb_array_elements(destination_version.manifest -> 'spawns')
    where coalesce((value ->> 'enabled')::boolean, false)
      and round((value ->> 'x')::numeric, 4) = profile.safe_position_x
      and round((value ->> 'y')::numeric, 4) = profile.safe_position_y
    limit 1;
    return jsonb_build_object(
      'status', 'replayed',
      'map', private.world_map_json(destination_map),
      'version', private.world_version_json(destination_version),
      'manifest', destination_version.manifest,
      'playerState', private.world_player_state_json(profile),
      'transition', jsonb_build_object(
        'exitId', profile.last_transition_exit_id,
        'fromMapId', null,
        'toMapId', profile.current_map_id,
        'destinationSpawnId', coalesce(replayed_spawn ->> 'id', destination_map.default_spawn_id),
        'completedAt', profile.last_successful_transition_at
      )
    );
  end if;

  if profile.game_state_version <> p_expected_game_state_version
     or profile.current_map_version_id is distinct from p_expected_map_version_id then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if profile.last_successful_transition_at is not null
     and profile.last_successful_transition_at > now() - interval '1 second' then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = profile.current_map_version_id
  where map.slug = profile.current_map_id
    and version.world_map_id = map.id
    and version.lifecycle_status in ('published', 'superseded');
  if not found then
    return jsonb_build_object('status', 'destination_unavailable');
  end if;
  source_map := selected_world.map_row;
  source_version := selected_world.version_row;

  select value into exit_definition
  from jsonb_array_elements(source_version.manifest -> 'exits')
  where value ->> 'id' = p_exit_id
    and coalesce((value ->> 'enabled')::boolean, false)
  limit 1;
  if exit_definition is null then
    return jsonb_build_object('status', 'invalid_exit');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = exit_definition ->> 'destinationMapId'
    and map.status = 'active'
    and version.lifecycle_status = 'published';
  if not found then
    return jsonb_build_object('status', 'destination_unavailable');
  end if;
  destination_map := selected_world.map_row;
  destination_version := selected_world.version_row;

  select value into destination_spawn
  from jsonb_array_elements(destination_version.manifest -> 'spawns')
  where value ->> 'id' = exit_definition ->> 'destinationSpawnId'
    and coalesce((value ->> 'enabled')::boolean, false)
  limit 1;
  if destination_spawn is null
     or not private.point_inside_world_bounds(
       destination_version.manifest -> 'safeSaveBounds',
       (destination_spawn ->> 'x')::numeric,
       (destination_spawn ->> 'y')::numeric
     )
     or private.point_blocked_by_world_manifest(
       destination_version.manifest,
       (destination_spawn ->> 'x')::numeric,
       (destination_spawn ->> 'y')::numeric,
       0.24
     )
     or exists (
       select 1 from jsonb_array_elements(destination_version.manifest -> 'exits') as destination_exit
       where coalesce((destination_exit ->> 'enabled')::boolean, false)
         and (destination_spawn ->> 'x')::numeric >=
             (destination_exit -> 'trigger' ->> 'x')::numeric
         and (destination_spawn ->> 'x')::numeric <=
             (destination_exit -> 'trigger' ->> 'x')::numeric
               + (destination_exit -> 'trigger' ->> 'width')::numeric
         and (destination_spawn ->> 'y')::numeric >=
             (destination_exit -> 'trigger' ->> 'y')::numeric
         and (destination_spawn ->> 'y')::numeric <=
             (destination_exit -> 'trigger' ->> 'y')::numeric
               + (destination_exit -> 'trigger' ->> 'height')::numeric
     ) then
    return jsonb_build_object('status', 'destination_unavailable');
  end if;

  completed_at := now();
  update public.player_profiles
  set current_map_id = destination_map.slug,
      current_map_version_id = destination_version.id,
      safe_position_x = round((destination_spawn ->> 'x')::numeric, 4),
      safe_position_y = round((destination_spawn ->> 'y')::numeric, 4),
      facing_direction = destination_spawn ->> 'facingDirection',
      game_state_version = game_state_version + 1,
      last_successful_transition_at = completed_at,
      last_transition_exit_id = p_exit_id,
      last_transition_request_id = p_request_id
  where id = profile.id
  returning * into profile;

  return jsonb_build_object(
    'status', 'transitioned',
    'map', private.world_map_json(destination_map),
    'version', private.world_version_json(destination_version),
    'manifest', destination_version.manifest,
    'playerState', private.world_player_state_json(profile),
    'transition', jsonb_build_object(
      'exitId', p_exit_id,
      'fromMapId', source_map.slug,
      'toMapId', destination_map.slug,
      'destinationSpawnId', destination_spawn ->> 'id',
      'completedAt', completed_at
    )
  );
end;
$$;

create or replace function public.save_player_game_state(
  p_wallet_address text,
  p_map_id text,
  p_position_x numeric,
  p_position_y numeric,
  p_facing_direction text,
  p_expected_game_state_version integer,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_version public.world_map_versions%rowtype;
begin
  if p_wallet_address is null
     or p_map_id is null
     or p_facing_direction is null
     or p_expected_game_state_version is null
     or p_expected_game_state_version < 1
     or p_request_id is null
     or p_rate_limit is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_position_x is null or p_position_x::text = 'NaN'
     or p_position_y is null or p_position_y::text = 'NaN'
     or p_facing_direction not in (
       'north', 'northeast', 'east', 'southeast',
       'south', 'southwest', 'west', 'northwest'
     )
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_STATE_INPUT';
  end if;

  if not private.claim_player_rate_limit(
    'state_write', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select p as profile_row, m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address
  for update of p, m;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  profile := selected_rows.profile_row;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;
  if profile.game_state_version <> p_expected_game_state_version then
    return jsonb_build_object('status', 'game_state_version_conflict');
  end if;
  if profile.current_map_id <> p_map_id or profile.current_map_version_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_STATE_INPUT';
  end if;

  select * into selected_version
  from public.world_map_versions
  where id = profile.current_map_version_id
    and lifecycle_status in ('published', 'superseded');
  if not found
     or not private.point_inside_world_bounds(
       selected_version.manifest -> 'safeSaveBounds', p_position_x, p_position_y
     )
     or private.point_blocked_by_world_manifest(
       selected_version.manifest, p_position_x, p_position_y, 0.24
     ) then
    raise exception using errcode = '22023', message = 'UNSAFE_PLAYER_POSITION';
  end if;

  update public.player_profiles
  set safe_position_x = round(p_position_x, 4),
      safe_position_y = round(p_position_y, 4),
      facing_direction = p_facing_direction,
      game_state_version = game_state_version + 1
  where id = profile.id
  returning * into profile;

  return private.player_entry_json(profile, moderation);
end;
$$;

-- Phase 2 grants authenticated administrators schema usage for narrowly granted
-- helpers. PostgreSQL grants EXECUTE on newly created functions to PUBLIC by
-- default, so every Phase 6 private helper must be closed explicitly before a
-- later migration grants only the reviewed public RPCs.
revoke all on function private.world_manifest_checksum(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_world_reason(text)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_world_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.world_map_json(public.world_maps)
  from public, anon, authenticated, service_role;
revoke all on function private.world_version_json(public.world_map_versions)
  from public, anon, authenticated, service_role;
revoke all on function private.world_player_state_json(public.player_profiles)
  from public, anon, authenticated, service_role;
revoke all on function private.point_inside_world_bounds(jsonb, numeric, numeric)
  from public, anon, authenticated, service_role;
revoke all on function private.point_blocked_by_world_manifest(jsonb, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;
revoke all on function private.world_validation_issue(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.validate_world_manifest(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_world_version_assets(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.player_profile_json(public.player_profiles)
  from public, anon, authenticated, service_role;
revoke all on function private.set_player_profile_updated_at()
  from public, anon, authenticated, service_role;

-- Keep browser roles outside every player-facing SECURITY DEFINER function
-- throughout the migration sequence. New world RPC service-role grants are
-- applied by the later admin migration; the existing save RPC retains its
-- previously reviewed service-role grant.
revoke all on function public.get_current_published_world(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_published_world_manifest(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.transition_player_world(text, text, integer, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.save_player_game_state(text, text, numeric, numeric, text, integer, text, integer)
  from public, anon, authenticated;
