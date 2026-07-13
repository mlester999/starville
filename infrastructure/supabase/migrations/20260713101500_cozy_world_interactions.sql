-- Starville Phase 7B: strict cozy interaction manifests and local draft content.
-- This migration never publishes a map or changes an active published-version pointer.

alter function private.validate_world_manifest(uuid, jsonb)
  rename to validate_world_manifest_phase6;

revoke all on function private.validate_world_manifest_phase6(uuid, jsonb)
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
  base_manifest jsonb;
  base_validation jsonb;
  errors jsonb := '[]'::jsonb;
  map_object jsonb;
  interaction_definition jsonb;
  interaction_type text;
  actual_keys text[];
  expected_keys text[];
  object_kind text;
  transformed_objects jsonb;
  transformed_interactions jsonb;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    return private.validate_world_manifest_phase6(p_world_map_id, p_manifest);
  end if;

  if jsonb_typeof(p_manifest -> 'objects') = 'array' then
    select coalesce(jsonb_agg(
      case
        when value ->> 'kind' in (
          'farm_plot', 'shop', 'cooking_station', 'crafting_station', 'home_entrance'
        ) then jsonb_set(value, '{kind}', '"sign"'::jsonb)
        else value
      end order by ordinal
    ), '[]'::jsonb)
    into transformed_objects
    from jsonb_array_elements(p_manifest -> 'objects') with ordinality as object(value, ordinal);
  else
    transformed_objects := p_manifest -> 'objects';
  end if;

  if jsonb_typeof(p_manifest -> 'interactions') = 'array' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', value -> 'id',
        'type', 'notice',
        'x', value -> 'x',
        'y', value -> 'y',
        'range', value -> 'range',
        'title', value -> 'title',
        'content', value -> 'content'
      ) order by ordinal
    ), '[]'::jsonb)
    into transformed_interactions
    from jsonb_array_elements(p_manifest -> 'interactions') with ordinality
      as interaction(value, ordinal);
  else
    transformed_interactions := p_manifest -> 'interactions';
  end if;

  base_manifest := jsonb_set(
    jsonb_set(p_manifest, '{objects}', transformed_objects, false),
    '{interactions}', transformed_interactions, false
  );
  base_validation := private.validate_world_manifest_phase6(p_world_map_id, base_manifest);

  if jsonb_typeof(p_manifest -> 'objects') = 'array' then
    for map_object in select value from jsonb_array_elements(p_manifest -> 'objects') loop
      select array_agg(key order by key) into actual_keys
      from jsonb_object_keys(map_object) as key;
      expected_keys := array['assetId', 'id', 'kind', 'scale', 'x', 'y']::text[];
      object_kind := map_object ->> 'kind';
      if actual_keys is distinct from expected_keys
         or object_kind not in (
           'building', 'tree', 'rock', 'fence', 'lamp', 'sign', 'flowers', 'bush',
           'farm_plot', 'shop', 'cooking_station', 'crafting_station', 'home_entrance'
         ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_PHASE7_MAP_OBJECT',
          '$.objects',
          'Map objects must use an exact approved data-only shape and object kind.'
        ));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_manifest -> 'interactions') = 'array' then
    for interaction_definition in
      select value from jsonb_array_elements(p_manifest -> 'interactions')
    loop
      interaction_type := interaction_definition ->> 'type';
      select array_agg(key order by key) into actual_keys
      from jsonb_object_keys(interaction_definition) as key;
      expected_keys := case interaction_type
        when 'notice' then
          array['content', 'id', 'range', 'title', 'type', 'x', 'y']::text[]
        when 'farm_plot' then
          array['content', 'farmPlotKey', 'id', 'range', 'slot', 'title', 'type', 'x', 'y']::text[]
        when 'shop' then
          array['content', 'id', 'range', 'shopSlug', 'title', 'type', 'x', 'y']::text[]
        when 'cooking_station' then
          array['content', 'id', 'range', 'stationType', 'title', 'type', 'x', 'y']::text[]
        when 'crafting_station' then
          array['content', 'id', 'range', 'stationType', 'title', 'type', 'x', 'y']::text[]
        when 'home_entrance' then
          array['content', 'homeTemplateSlug', 'id', 'range', 'title', 'type', 'x', 'y']::text[]
        else null
      end;

      if expected_keys is null or actual_keys is distinct from expected_keys then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_PHASE7_INTERACTION_SHAPE',
          '$.interactions',
          'Interactions must use the exact approved fields for their interaction type.'
        ));
        continue;
      end if;

      if coalesce(interaction_definition ->> 'id', '') !~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
         or char_length(interaction_definition ->> 'id') not between 1 and 64
         or jsonb_typeof(interaction_definition -> 'x') <> 'number'
         or jsonb_typeof(interaction_definition -> 'y') <> 'number'
         or jsonb_typeof(interaction_definition -> 'range') <> 'number'
         or char_length(coalesce(interaction_definition ->> 'title', '')) not between 1 and 80
         or interaction_definition ->> 'title' <> btrim(interaction_definition ->> 'title')
         or interaction_definition ->> 'title' ~ '[[:cntrl:]<>]'
         or char_length(coalesce(interaction_definition ->> 'content', '')) not between 1 and 280
         or interaction_definition ->> 'content' <> btrim(interaction_definition ->> 'content')
         or interaction_definition ->> 'content' ~ '[[:cntrl:]<>]' then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'INVALID_PHASE7_INTERACTION_COMMON_FIELDS',
          '$.interactions',
          'Interaction identifiers, coordinates, range, title, and content must be safe data.'
        ));
        continue;
      end if;

      if (interaction_definition ->> 'range')::numeric <= 0
         or (interaction_definition ->> 'range')::numeric > 4
         or private.point_blocked_by_world_manifest(
           p_manifest,
           (interaction_definition ->> 'x')::numeric,
           (interaction_definition ->> 'y')::numeric,
           0.24
         ) then
        errors := errors || jsonb_build_array(private.world_validation_issue(
          'UNREACHABLE_PHASE7_INTERACTION',
          '$.interactions',
          'Interaction anchors must be in range and outside blocking collision.'
        ));
      end if;

      if interaction_type = 'farm_plot' then
        if coalesce(interaction_definition ->> 'farmPlotKey', '') !~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
           or char_length(interaction_definition ->> 'farmPlotKey') not between 1 and 64
           or jsonb_typeof(interaction_definition -> 'slot') <> 'number' then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_FARM_PLOT_INTERACTION', '$.interactions',
            'Farm-plot interactions require a stable plot key and bounded integer slot.'
          ));
        elsif (interaction_definition ->> 'slot')::numeric
                <> trunc((interaction_definition ->> 'slot')::numeric)
           or (interaction_definition ->> 'slot')::integer not between 1 and 64 then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_FARM_PLOT_INTERACTION', '$.interactions',
            'Farm-plot interactions require a stable plot key and bounded integer slot.'
          ));
        end if;
      elsif interaction_type = 'shop' then
        if coalesce(interaction_definition ->> 'shopSlug', '') !~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
           or char_length(interaction_definition ->> 'shopSlug') not between 1 and 64 then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_SHOP_INTERACTION', '$.interactions',
            'Shop interactions require one stable trusted shop slug.'
          ));
        end if;
      elsif interaction_type = 'cooking_station' then
        if interaction_definition ->> 'stationType' <> 'cooking_hearth' then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_COOKING_INTERACTION', '$.interactions',
            'Cooking interactions require the approved cooking-hearth station type.'
          ));
        end if;
      elsif interaction_type = 'crafting_station' then
        if interaction_definition ->> 'stationType' <> 'crafting_workbench' then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_CRAFTING_INTERACTION', '$.interactions',
            'Crafting interactions require the approved crafting-workbench station type.'
          ));
        end if;
      elsif interaction_type = 'home_entrance' then
        if coalesce(interaction_definition ->> 'homeTemplateSlug', '') !~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
           or char_length(interaction_definition ->> 'homeTemplateSlug') not between 1 and 64 then
          errors := errors || jsonb_build_array(private.world_validation_issue(
            'INVALID_HOME_ENTRANCE_INTERACTION', '$.interactions',
            'Home entrances require one stable trusted template slug.'
          ));
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'valid', coalesce((base_validation ->> 'valid')::boolean, false)
      and jsonb_array_length(errors) = 0,
    'checkedAt', now(),
    'errors', coalesce(base_validation -> 'errors', '[]'::jsonb) || errors,
    'warnings', coalesce(base_validation -> 'warnings', '[]'::jsonb)
  );
exception
  when others then
    return jsonb_build_object(
      'valid', false,
      'checkedAt', now(),
      'errors', jsonb_build_array(private.world_validation_issue(
        'MALFORMED_PHASE7_MANIFEST', '$', 'The Phase 7 manifest could not be validated safely.'
      )),
      'warnings', '[]'::jsonb
    );
end;
$$;

revoke all on function private.validate_world_manifest(uuid, jsonb)
  from public, anon, authenticated, service_role;

with asset_seed(asset_key) as (
  values
    ('phase7-farm-plot-marker'),
    ('phase7-general-store-marker'),
    ('phase7-cooking-hearth-marker'),
    ('phase7-crafting-workbench-marker'),
    ('phase7-home-entrance-marker')
)
insert into public.world_assets (
  asset_key,
  content_hash,
  storage_path,
  source_type,
  media_type,
  width,
  height,
  file_size_bytes,
  approval_status,
  repository_owned,
  approved_at
)
select
  asset_key,
  encode(extensions.digest(
    convert_to('starville-procedural:v1:' || asset_key, 'UTF8'), 'sha256'
  ), 'hex'),
  'repository/procedural/' || asset_key,
  'repository_procedural',
  'application/x-starville-procedural',
  null,
  null,
  null,
  'approved',
  true,
  now()
from asset_seed
on conflict (asset_key) do nothing;

do $$
declare
  invalid_asset_count integer;
begin
  select count(*) into invalid_asset_count
  from (values
    ('phase7-farm-plot-marker'),
    ('phase7-general-store-marker'),
    ('phase7-cooking-hearth-marker'),
    ('phase7-crafting-workbench-marker'),
    ('phase7-home-entrance-marker')
  ) expected(asset_key)
  left join public.world_assets asset on asset.asset_key = expected.asset_key
  where asset.id is null
     or asset.approval_status <> 'approved'
     or asset.source_type <> 'repository_procedural'
     or asset.storage_path <> 'repository/procedural/' || expected.asset_key
     or asset.media_type <> 'application/x-starville-procedural'
     or not asset.repository_owned
     or asset.content_hash <> encode(extensions.digest(
       convert_to('starville-procedural:v1:' || expected.asset_key, 'UTF8'), 'sha256'
     ), 'hex');
  if invalid_asset_count <> 0 then
    raise exception using errcode = '23514', message = 'PHASE7_WORLD_ASSET_CONFLICT';
  end if;
end;
$$;

insert into public.world_audit_events (
  event_key,
  actor_type,
  target_world_asset_id,
  outcome,
  reason,
  metadata
)
select
  'world.asset_registered',
  'system',
  asset.id,
  'success',
  'Phase 7 repository-owned procedural interaction marker registered.',
  jsonb_build_object(
    'assetKey', asset.asset_key,
    'sourceType', asset.source_type,
    'contentHash', asset.content_hash,
    'phase', 7
  )
from public.world_assets as asset
where asset.asset_key in (
    'phase7-farm-plot-marker',
    'phase7-general-store-marker',
    'phase7-cooking-hearth-marker',
    'phase7-crafting-workbench-marker',
    'phase7-home-entrance-marker'
  )
  and not exists (
    select 1
    from public.world_audit_events as existing
    where existing.event_key = 'world.asset_registered'
      and existing.actor_type = 'system'
      and existing.target_world_asset_id = asset.id
      and existing.metadata ->> 'assetKey' = asset.asset_key
  );

do $$
declare
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  existing_version public.world_map_versions%rowtype;
  target_version_id uuid;
  next_manifest jsonb;
  validation jsonb;
  next_checksum text;
  target_slug text;
begin
  foreach target_slug in array array['lantern-square', 'moonpetal-meadow'] loop
    select * into strict selected_map
    from public.world_maps
    where slug = target_slug
    for update;
    select * into strict source_version
    from public.world_map_versions
    where id = selected_map.active_published_version_id
      and world_map_id = selected_map.id
      and lifecycle_status = 'published';
    if source_version.version_number <> 1 then
      raise exception using errcode = '23514', message = 'PHASE7_WORLD_SOURCE_VERSION_CONFLICT';
    end if;

    if target_slug = 'lantern-square' then
      target_version_id := '79000000-0000-4000-8000-000000000001';
      next_manifest := jsonb_set(source_version.manifest, '{version}', '2'::jsonb);
      next_manifest := jsonb_set(next_manifest, '{developmentArt}', jsonb_build_object(
        'temporary', true,
        'label', 'Phase 7 local draft procedural interaction markers — not published'
      ));
      next_manifest := jsonb_set(next_manifest, '{assets}',
        next_manifest -> 'assets' || jsonb_build_array(
          'phase7-general-store-marker', 'phase7-cooking-hearth-marker',
          'phase7-crafting-workbench-marker', 'phase7-home-entrance-marker'
        )
      );
      next_manifest := jsonb_set(next_manifest, '{objects}',
        next_manifest -> 'objects' || jsonb_build_array(
          jsonb_build_object('id','phase7-general-store-object','assetId','phase7-general-store-marker','kind','shop','x',5,'y',5.7,'scale',1),
          jsonb_build_object('id','phase7-cooking-hearth-object','assetId','phase7-cooking-hearth-marker','kind','cooking_station','x',14.8,'y',6.1,'scale',1),
          jsonb_build_object('id','phase7-crafting-workbench-object','assetId','phase7-crafting-workbench-marker','kind','crafting_station','x',14.8,'y',7.8,'scale',1),
          jsonb_build_object('id','phase7-home-entrance-object','assetId','phase7-home-entrance-marker','kind','home_entrance','x',19,'y',8,'scale',1)
        )
      );
      next_manifest := jsonb_set(next_manifest, '{interactions}',
        next_manifest -> 'interactions' || jsonb_build_array(
          jsonb_build_object('id','phase7-general-store','type','shop','x',5,'y',5.7,'range',1.5,'title','Lantern General Store','content','Browse server-priced seeds, pantry goods, materials, and starter furnishings.','shopSlug','lantern-general-store'),
          jsonb_build_object('id','phase7-cooking-hearth','type','cooking_station','x',14.8,'y',6.1,'range',1.35,'title','Cooking Hearth','content','Prepare recipes defined by the trusted Starville cooking catalog.','stationType','cooking_hearth'),
          jsonb_build_object('id','phase7-crafting-workbench','type','crafting_station','x',14.8,'y',7.8,'range',1.35,'title','Crafting Workbench','content','Create simple materials and furnishings from trusted recipes.','stationType','crafting_workbench'),
          jsonb_build_object('id','phase7-home-entrance','type','home_entrance','x',19,'y',8,'range',1.5,'title','Starter Cottage','content','Enter the private starter home assigned by the Starville server.','homeTemplateSlug','starter-cottage-interior')
        )
      );
    else
      target_version_id := '79000000-0000-4000-8000-000000000002';
      next_manifest := jsonb_set(source_version.manifest, '{version}', '2'::jsonb);
      next_manifest := jsonb_set(next_manifest, '{developmentArt}', jsonb_build_object(
        'temporary', true,
        'label', 'Phase 7 local draft procedural interaction markers — not published'
      ));
      next_manifest := jsonb_set(next_manifest, '{assets}',
        next_manifest -> 'assets' || jsonb_build_array('phase7-farm-plot-marker')
      );
      next_manifest := jsonb_set(next_manifest, '{objects}',
        next_manifest -> 'objects' || jsonb_build_array(
          jsonb_build_object('id','phase7-farm-plot-1-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',12.25,'y',11.75,'scale',1),
          jsonb_build_object('id','phase7-farm-plot-2-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',13.5,'y',11.75,'scale',1),
          jsonb_build_object('id','phase7-farm-plot-3-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',14.75,'y',11.75,'scale',1),
          jsonb_build_object('id','phase7-farm-plot-4-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',12.25,'y',13.25,'scale',1),
          jsonb_build_object('id','phase7-farm-plot-5-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',13.5,'y',13.25,'scale',1),
          jsonb_build_object('id','phase7-farm-plot-6-object','assetId','phase7-farm-plot-marker','kind','farm_plot','x',14.75,'y',13.25,'scale',1)
        )
      );
      next_manifest := jsonb_set(next_manifest, '{interactions}',
        next_manifest -> 'interactions' || jsonb_build_array(
          jsonb_build_object('id','phase7-farm-plot-1','type','farm_plot','x',12.25,'y',11.75,'range',1.1,'title','Personal Farm Plot 1','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-1','slot',1),
          jsonb_build_object('id','phase7-farm-plot-2','type','farm_plot','x',13.5,'y',11.75,'range',1.1,'title','Personal Farm Plot 2','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-2','slot',2),
          jsonb_build_object('id','phase7-farm-plot-3','type','farm_plot','x',14.75,'y',11.75,'range',1.1,'title','Personal Farm Plot 3','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-3','slot',3),
          jsonb_build_object('id','phase7-farm-plot-4','type','farm_plot','x',12.25,'y',13.25,'range',1.1,'title','Personal Farm Plot 4','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-4','slot',4),
          jsonb_build_object('id','phase7-farm-plot-5','type','farm_plot','x',13.5,'y',13.25,'range',1.1,'title','Personal Farm Plot 5','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-5','slot',5),
          jsonb_build_object('id','phase7-farm-plot-6','type','farm_plot','x',14.75,'y',13.25,'range',1.1,'title','Personal Farm Plot 6','content','This anchor displays server-authoritative personal farming state.','farmPlotKey','moonpetal-starter-6','slot',6)
        )
      );
    end if;

    validation := private.validate_world_manifest(selected_map.id, next_manifest);
    if not coalesce((validation ->> 'valid')::boolean, false) then
      raise exception using errcode = '23514', message = 'PHASE7_DERIVED_WORLD_INVALID', detail = validation::text;
    end if;
    next_checksum := private.world_manifest_checksum(next_manifest);

    select * into existing_version
    from public.world_map_versions
    where world_map_id = selected_map.id and version_number = 2;
    if found then
      if existing_version.id <> target_version_id
         or existing_version.lifecycle_status <> 'draft'
         or existing_version.checksum <> next_checksum
         or existing_version.derived_from_version_id <> source_version.id then
        raise exception using errcode = '23514', message = 'PHASE7_DERIVED_WORLD_CONFLICT';
      end if;
    else
      insert into public.world_map_versions (
        id, world_map_id, version_number, lifecycle_status, manifest, checksum,
        validation_status, validation_result, validated_at, derived_from_version_id
      ) values (
        target_version_id, selected_map.id, 2, 'draft', next_manifest, next_checksum,
        'valid', validation, now(), source_version.id
      );
    end if;

    insert into public.world_map_version_assets (world_map_version_id, world_asset_id)
    select target_version_id, asset.id
    from jsonb_array_elements_text(next_manifest -> 'assets') requested(asset_key)
    join public.world_assets asset on asset.asset_key = requested.asset_key
    on conflict (world_map_version_id, world_asset_id) do nothing;

    if not exists (
      select 1 from public.world_audit_events
      where event_key = 'world.version_derived'
        and actor_type = 'system'
        and target_world_map_version_id = target_version_id
    ) then
      insert into public.world_audit_events (
        event_key, actor_type, target_world_map_id, target_world_map_version_id,
        outcome, reason, before_state, after_state, metadata
      ) values (
        'world.version_derived', 'system', selected_map.id, target_version_id,
        'success', 'Phase 7 local interaction draft derived without publication.',
        jsonb_build_object('sourceVersionId', source_version.id),
        jsonb_build_object('draftVersionId', target_version_id, 'lifecycleStatus', 'draft'),
        jsonb_build_object('phase', 7, 'published', false)
      );
    end if;

    if selected_map.active_published_version_id <> source_version.id then
      raise exception using errcode = '23514', message = 'PHASE7_ACTIVE_WORLD_POINTER_CHANGED';
    end if;
  end loop;
end;
$$;

update public.cozy_farm_plot_anchors
set anchor_id = canonical.anchor_id,
    interaction_id = canonical.interaction_id,
    map_version_id = '79000000-0000-4000-8000-000000000002',
    position_x = canonical.position_x,
    position_y = canonical.position_y,
    interaction_range = 1.10
from (values
  ('77000000-0000-4000-8000-000000000001'::uuid, 'moonpetal-starter-1', 'phase7-farm-plot-1', 12.25::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000002'::uuid, 'moonpetal-starter-2', 'phase7-farm-plot-2', 13.5::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000003'::uuid, 'moonpetal-starter-3', 'phase7-farm-plot-3', 14.75::numeric, 11.75::numeric),
  ('77000000-0000-4000-8000-000000000004'::uuid, 'moonpetal-starter-4', 'phase7-farm-plot-4', 12.25::numeric, 13.25::numeric),
  ('77000000-0000-4000-8000-000000000005'::uuid, 'moonpetal-starter-5', 'phase7-farm-plot-5', 13.5::numeric, 13.25::numeric),
  ('77000000-0000-4000-8000-000000000006'::uuid, 'moonpetal-starter-6', 'phase7-farm-plot-6', 14.75::numeric, 13.25::numeric)
) canonical(id, anchor_id, interaction_id, position_x, position_y)
where cozy_farm_plot_anchors.id = canonical.id;

update public.cozy_gameplay_stations
set interaction_id = canonical.interaction_id,
    map_version_id = '79000000-0000-4000-8000-000000000001',
    position_x = canonical.position_x,
    position_y = canonical.position_y,
    interaction_range = canonical.interaction_range
from (values
  ('78000000-0000-4000-8000-000000000001'::uuid, 'phase7-cooking-hearth', 14.8::numeric, 6.1::numeric, 1.35::numeric),
  ('78000000-0000-4000-8000-000000000002'::uuid, 'phase7-crafting-workbench', 14.8::numeric, 7.8::numeric, 1.35::numeric)
) canonical(id, interaction_id, position_x, position_y, interaction_range)
where cozy_gameplay_stations.id = canonical.id;

update public.cozy_shop_interactions
set interaction_id = 'phase7-general-store',
    map_version_id = '79000000-0000-4000-8000-000000000001',
    position_x = 5,
    position_y = 5.7,
    interaction_range = 1.5
where id = '78000000-0000-4000-8000-000000000003';

do $$
begin
  if (select count(*) from public.cozy_farm_plot_anchors
      where map_version_id = '79000000-0000-4000-8000-000000000002'
        and anchor_id like 'moonpetal-starter-%'
        and interaction_id like 'phase7-farm-plot-%') <> 6
     or (select count(*) from public.cozy_gameplay_stations
         where map_version_id = '79000000-0000-4000-8000-000000000001'
           and interaction_id in ('phase7-cooking-hearth', 'phase7-crafting-workbench')) <> 2
     or (select count(*) from public.cozy_shop_interactions
         where map_version_id = '79000000-0000-4000-8000-000000000001'
           and interaction_id = 'phase7-general-store') <> 1 then
    raise exception using errcode = '23514', message = 'PHASE7_TRUSTED_INTERACTION_BINDING_FAILED';
  end if;
end;
$$;
