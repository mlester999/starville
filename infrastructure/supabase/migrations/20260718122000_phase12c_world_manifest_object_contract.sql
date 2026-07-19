-- Starville Phase 12C canonical world-manifest object contract.
-- This forward-only repair preserves all prior manifest validation, authority,
-- grants, and RLS while adding the canonical furniture kind and optional
-- quarter-turn rotation field already supported by the shared TypeScript schema.

alter function private.validate_world_manifest(uuid, jsonb)
  rename to validate_world_manifest_phase12b;

revoke all on function private.validate_world_manifest_phase12b(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.validate_world_manifest(
  p_world_map_id uuid,
  p_manifest jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prior_manifest jsonb;
  prior_validation jsonb;
  errors jsonb := '[]'::jsonb;
  map_object jsonb;
  actual_keys text[];
  base_keys constant text[] := array['assetId', 'id', 'kind', 'scale', 'x', 'y']::text[];
  rotated_keys constant text[] :=
    array['assetId', 'id', 'kind', 'rotation', 'scale', 'x', 'y']::text[];
  object_kind text;
  rotation_value numeric;
  transformed_objects jsonb;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    return private.validate_world_manifest_phase12b(p_world_map_id, p_manifest);
  end if;

  if jsonb_typeof(p_manifest -> 'objects') = 'array' then
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(object.value) <> 'object' then object.value
          when object.value ->> 'kind' = 'furniture' then
            jsonb_set(object.value - 'rotation', '{kind}', '"sign"'::jsonb, false)
          else object.value - 'rotation'
        end
        order by object.ordinal
      ),
      '[]'::jsonb
    )
    into transformed_objects
    from jsonb_array_elements(p_manifest -> 'objects') with ordinality
      as object(value, ordinal);

    prior_manifest := jsonb_set(p_manifest, '{objects}', transformed_objects, false);
  else
    prior_manifest := p_manifest;
  end if;

  prior_validation := private.validate_world_manifest_phase12b(
    p_world_map_id,
    prior_manifest
  );

  if jsonb_typeof(p_manifest -> 'objects') = 'array' then
    for map_object in select value from jsonb_array_elements(p_manifest -> 'objects') loop
      if jsonb_typeof(map_object) <> 'object' then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_PHASE12C_MAP_OBJECT',
          '$.objects',
          'Map objects must use the exact canonical data-only shape.'
        ));
        continue;
      end if;

      select array_agg(key order by key)
      into actual_keys
      from jsonb_object_keys(map_object) as key;

      object_kind := map_object ->> 'kind';
      if (actual_keys is distinct from base_keys and actual_keys is distinct from rotated_keys)
         or object_kind not in (
           'building', 'tree', 'rock', 'fence', 'lamp', 'sign', 'flowers', 'bush',
           'farm_plot', 'shop', 'cooking_station', 'crafting_station', 'home_entrance',
           'furniture'
         ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_PHASE12C_MAP_OBJECT',
          '$.objects',
          'Map objects must use the exact canonical data-only shape and object kind.'
        ));
        continue;
      end if;

      if map_object ? 'rotation' then
        if jsonb_typeof(map_object -> 'rotation') <> 'number' then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_PHASE12C_MAP_OBJECT_ROTATION',
            '$.objects',
            'Map-object rotation must be one supported quarter turn.'
          ));
          continue;
        end if;

        rotation_value := (map_object ->> 'rotation')::numeric;
        if rotation_value not in (0, 90, 180, 270) then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_PHASE12C_MAP_OBJECT_ROTATION',
            '$.objects',
            'Map-object rotation must be one supported quarter turn.'
          ));
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'valid', coalesce((prior_validation ->> 'valid')::boolean, false)
      and jsonb_array_length(errors) = 0,
    'checkedAt', now(),
    'errors', coalesce(prior_validation -> 'errors', '[]'::jsonb) || errors,
    'warnings', coalesce(prior_validation -> 'warnings', '[]'::jsonb)
  );
exception
  when others then
    return jsonb_build_object(
      'valid', false,
      'checkedAt', now(),
      'errors', jsonb_build_array(private.world_validation_issue(
        'MALFORMED_PHASE12C_MANIFEST',
        '$',
        'The Phase 12C manifest could not be validated safely.'
      )),
      'warnings', '[]'::jsonb
    );
end;
$$;

revoke all on function private.validate_world_manifest(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.world_asset_object_kind_allowed(
  p_asset_type text,
  p_object_kind text
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'building' then p_object_kind = 'building'
    when 'shop' then p_object_kind = 'shop'
    when 'cooking_station' then p_object_kind = 'cooking_station'
    when 'crafting_station' then p_object_kind = 'crafting_station'
    when 'home_entrance' then p_object_kind = 'home_entrance'
    when 'decoration' then p_object_kind in ('flowers', 'bush')
    when 'tree' then p_object_kind = 'tree'
    when 'rock' then p_object_kind = 'rock'
    when 'fence' then p_object_kind = 'fence'
    when 'lamp' then p_object_kind = 'lamp'
    when 'sign' then p_object_kind = 'sign'
    when 'farm_plot' then p_object_kind = 'farm_plot'
    when 'furniture' then p_object_kind = 'furniture'
    else false
  end;
$$;

revoke all on function private.world_asset_object_kind_allowed(text, text)
  from public, anon, authenticated, service_role;

comment on function private.validate_world_manifest(uuid, jsonb) is
  'Authoritative world-manifest validator with the exact Phase 12C MapObject furniture and optional quarter-turn rotation contract layered over all prior validation.';

comment on function private.world_asset_object_kind_allowed(text, text) is
  'Exact server-side world asset-type to map-object-kind compatibility, including canonical furniture assets.';
