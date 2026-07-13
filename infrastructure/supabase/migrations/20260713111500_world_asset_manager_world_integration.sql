-- Starville Phase 7.5A: pin immutable asset versions into world drafts and
-- append safe delivery descriptors to the existing player world RPCs.

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
  -- Retain exact immutable pins for asset keys that remain in the draft. A
  -- no-op save must not silently rebind historical art to a newer active
  -- version. Only removed keys are deleted and only newly introduced keys are
  -- resolved through the current active-version discovery pointer.
  delete from public.world_map_version_assets as reference
  where reference.world_map_version_id = p_world_map_version_id
    and not exists (
      select 1
      from jsonb_array_elements_text(p_manifest -> 'assets') as requested(asset_key)
      join public.world_assets as retained on retained.asset_key = requested.asset_key
      where retained.id = reference.world_asset_id
    );

  insert into public.world_map_version_assets (
    world_map_version_id, world_asset_id, world_asset_version_id
  )
  select p_world_map_version_id, asset.id, asset.active_version_id
  from jsonb_array_elements_text(p_manifest -> 'assets') as requested(asset_key)
  join public.world_assets as asset on asset.asset_key = requested.asset_key
  join public.world_asset_versions as version on version.id = asset.active_version_id
  where asset.approval_status = 'approved'
    and asset.lifecycle_status = 'active'
    and version.lifecycle_status = 'active'
  on conflict do nothing;
end;
$$;

create or replace function private.clone_world_version_asset_pins(
  p_source_world_map_version_id uuid,
  p_target_world_map_version_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.world_map_versions as target
    join public.world_map_versions as source
      on source.id = p_source_world_map_version_id
     and source.world_map_id = target.world_map_id
    where target.id = p_target_world_map_version_id
      and target.derived_from_version_id = source.id
      and target.lifecycle_status in ('draft', 'validated')
  ) then
    raise exception using errcode = '23514', message = 'WORLD_ASSET_PIN_SOURCE_MISMATCH';
  end if;

  delete from public.world_map_version_assets
  where world_map_version_id = p_target_world_map_version_id;

  insert into public.world_map_version_assets (
    world_map_version_id, world_asset_id, world_asset_version_id
  )
  select p_target_world_map_version_id,
    source.world_asset_id, source.world_asset_version_id
  from public.world_map_version_assets as source
  where source.world_map_version_id = p_source_world_map_version_id
  order by source.world_asset_id;
end;
$$;

-- Repair only unchanged derived drafts. Edited drafts retain the pins produced
-- by their accepted manifest save; unchanged clones inherit their source pins
-- byte-for-byte, including drafts created before this migration was applied.
do $$
declare
  draft record;
begin
  for draft in
    select target.id as target_id, source.id as source_id
    from public.world_map_versions as target
    join public.world_map_versions as source
      on source.id = target.derived_from_version_id
     and source.world_map_id = target.world_map_id
    where target.lifecycle_status in ('draft', 'validated')
      and target.manifest = source.manifest
  loop
    perform private.clone_world_version_asset_pins(draft.source_id, draft.target_id);
  end loop;
end;
$$;

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
    else false
  end;
$$;

create or replace function private.world_manifest_assets_compatible(
  p_world_map_version_id uuid,
  p_manifest jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object'
     or jsonb_typeof(p_manifest -> 'objects') <> 'array'
     or jsonb_typeof(p_manifest -> 'interactions') <> 'array' then
    return true;
  end if;
  if jsonb_array_length(p_manifest -> 'objects') > 512
     or jsonb_array_length(p_manifest -> 'interactions') > 64 then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'objects') as object(value)
    join public.world_assets as asset on asset.asset_key = object.value ->> 'assetId'
    left join public.world_map_version_assets as retained
      on retained.world_map_version_id = p_world_map_version_id
     and retained.world_asset_id = asset.id
    join public.world_asset_versions as version
      on version.id = coalesce(retained.world_asset_version_id, asset.active_version_id)
     and version.world_asset_id = asset.id
    where not private.world_asset_object_kind_allowed(
      asset.asset_type, object.value ->> 'kind'
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'interactions') as interaction(value)
    cross join lateral (
      select case interaction.value ->> 'type'
        when 'notice' then 'sign'
        when 'shop' then 'shop'
        when 'cooking_station' then 'cooking_station'
        when 'crafting_station' then 'crafting_station'
        when 'home_entrance' then 'home_entrance'
        when 'farm_plot' then 'farm_plot'
        else null
      end as compatibility
    ) as expected
    join lateral (
      select candidate.value
      from jsonb_array_elements(p_manifest -> 'objects') as candidate(value)
      where candidate.value ->> 'kind' = expected.compatibility
        and power(
          (candidate.value ->> 'x')::numeric - (interaction.value ->> 'x')::numeric,
          2
        ) + power(
          (candidate.value ->> 'y')::numeric - (interaction.value ->> 'y')::numeric,
          2
        ) <= power((interaction.value ->> 'range')::numeric, 2)
      order by
        power(
          (candidate.value ->> 'x')::numeric - (interaction.value ->> 'x')::numeric,
          2
        ) + power(
          (candidate.value ->> 'y')::numeric - (interaction.value ->> 'y')::numeric,
          2
        ),
        candidate.value ->> 'id'
      limit 1
    ) as object on true
    join public.world_assets as asset on asset.asset_key = object.value ->> 'assetId'
    left join public.world_map_version_assets as retained
      on retained.world_map_version_id = p_world_map_version_id
     and retained.world_asset_id = asset.id
    join public.world_asset_versions as version
      on version.id = coalesce(retained.world_asset_version_id, asset.active_version_id)
     and version.world_asset_id = asset.id
    where expected.compatibility is not null
      and not expected.compatibility = any(version.interaction_compatibility)
  ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.sync_world_asset_content_reference(
  p_reference_type text,
  p_reference_key text,
  p_asset_key text,
  p_reference_lifecycle text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.world_asset_references
  where reference_type = p_reference_type and reference_key = p_reference_key;

  if p_asset_key is null then return; end if;

  insert into public.world_asset_references (
    world_asset_id, world_asset_version_id, reference_type,
    reference_key, reference_lifecycle
  )
  select asset.id, asset.active_version_id, p_reference_type,
    p_reference_key, p_reference_lifecycle
  from public.world_assets as asset
  join public.world_asset_versions as version on version.id = asset.active_version_id
  where asset.asset_key = p_asset_key
    and asset.lifecycle_status in ('active', 'deprecated')
    and version.lifecycle_status in ('active', 'deprecated')
  on conflict (reference_type, reference_key, world_asset_version_id)
  do update set reference_lifecycle = excluded.reference_lifecycle;
end;
$$;

create or replace function private.sync_world_asset_content_reference_trigger()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  source_reference_type text;
begin
  source_reference_type := case tg_table_name
    when 'cozy_item_definitions' then 'item_definition'
    when 'cozy_crop_definitions' then 'crop_definition'
    when 'cozy_furniture_definitions' then 'furniture_definition'
    else null
  end;
  if source_reference_type is null then
    raise exception using errcode = '23514', message = 'WORLD_ASSET_REFERENCE_SOURCE_UNSUPPORTED';
  end if;

  if tg_op = 'DELETE' then
    delete from public.world_asset_references
    where world_asset_references.reference_type = source_reference_type
      and world_asset_references.reference_key = old.slug;
    return old;
  end if;

  perform private.sync_world_asset_content_reference(
    source_reference_type, new.slug, new.asset_ref,
    case when new.active then 'active' else 'draft' end
  );
  if tg_op = 'UPDATE' and old.slug is distinct from new.slug then
    delete from public.world_asset_references
    where world_asset_references.reference_type = source_reference_type
      and world_asset_references.reference_key = old.slug;
  end if;
  return new;
end;
$$;

create or replace function private.sync_world_asset_content_references_for_asset(
  p_world_asset_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  asset_key text;
  content record;
begin
  select asset.asset_key into asset_key
  from public.world_assets as asset where asset.id = p_world_asset_id;
  if asset_key is null then return; end if;

  for content in
    select 'item_definition'::text as reference_type, item.slug,
      item.asset_ref, item.active
    from public.cozy_item_definitions as item where item.asset_ref = asset_key
    union all
    select 'crop_definition', crop.slug, crop.asset_ref, crop.active
    from public.cozy_crop_definitions as crop where crop.asset_ref = asset_key
    union all
    select 'furniture_definition', furniture.slug,
      furniture.asset_ref, furniture.active
    from public.cozy_furniture_definitions as furniture
    where furniture.asset_ref = asset_key
  loop
    perform private.sync_world_asset_content_reference(
      content.reference_type, content.slug, content.asset_ref,
      case when content.active then 'active' else 'draft' end
    );
  end loop;
end;
$$;

create or replace function private.sync_world_asset_content_references_after_asset_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.sync_world_asset_content_references_for_asset(new.id);
  return new;
end;
$$;

create trigger cozy_item_definitions_sync_world_asset_reference
after insert or update or delete on public.cozy_item_definitions
for each row execute function private.sync_world_asset_content_reference_trigger();
create trigger cozy_crop_definitions_sync_world_asset_reference
after insert or update or delete on public.cozy_crop_definitions
for each row execute function private.sync_world_asset_content_reference_trigger();
create trigger cozy_furniture_definitions_sync_world_asset_reference
after insert or update or delete on public.cozy_furniture_definitions
for each row execute function private.sync_world_asset_content_reference_trigger();
create trigger world_assets_sync_content_references
after update of active_version_id, lifecycle_status on public.world_assets
for each row execute function private.sync_world_asset_content_references_after_asset_change();

do $$
declare content record;
begin
  for content in
    select 'item_definition'::text as reference_type, item.slug,
      item.asset_ref, item.active
    from public.cozy_item_definitions as item where item.asset_ref is not null
    union all
    select 'crop_definition', crop.slug, crop.asset_ref, crop.active
    from public.cozy_crop_definitions as crop where crop.asset_ref is not null
    union all
    select 'furniture_definition', furniture.slug,
      furniture.asset_ref, furniture.active
    from public.cozy_furniture_definitions as furniture
    where furniture.asset_ref is not null
  loop
    perform private.sync_world_asset_content_reference(
      content.reference_type, content.slug, content.asset_ref,
      case when content.active then 'active' else 'draft' end
    );
  end loop;
end;
$$;

create or replace function private.world_asset_deliveries_for_version(
  p_world_map_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'assetKey', asset.asset_key,
    'versionId', version.id,
    'checksumSha256', version.checksum_sha256,
    'mediaType', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then 'image/webp'
      else null
    end,
    'width', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.processed_source_width
      else null
    end,
    'height', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.processed_source_height
      else null
    end,
    'renderWidth', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.render_width
      else null
    end,
    'renderHeight', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.render_height
      else null
    end,
    'scale', version.render_scale,
    'anchorX', version.anchor_x,
    'anchorY', version.anchor_y,
    'footAnchorX', version.foot_anchor_x,
    'footAnchorY', version.foot_anchor_y,
    'depthAnchorX', version.depth_anchor_x,
    'depthAnchorY', version.depth_anchor_y,
    'collisionProfile', version.collision_profile,
    'supportedRotations', to_jsonb(version.supported_rotations),
    'defaultRotation', version.default_rotation,
    'developmentMarker', version.source_kind <> 'storage_raster'
      or version.delivery_source_path is null,
    'delivery', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then jsonb_build_object(
          'bucket', 'game-assets', 'objectPath', version.delivery_source_path
        )
      else null
    end,
    'fallback', case
      when asset.repository_owned then 'repository_procedural'
      else null
    end
  ) order by asset.asset_key), '[]'::jsonb)
  from public.world_map_version_assets as reference
  join public.world_assets as asset on asset.id = reference.world_asset_id
  join public.world_asset_versions as version
    on version.id = reference.world_asset_version_id
   and version.world_asset_id = reference.world_asset_id
  where reference.world_map_version_id = p_world_map_version_id
    and version.lifecycle_status in ('active', 'deprecated')
    and version.checksum_sha256 is not null;
$$;

-- Move the reviewed Phase 6 implementations behind private wrappers without
-- changing their signatures or transactional behavior.
alter function public.create_admin_world_draft(
  uuid, uuid, text, uuid, integer, text, integer
)
  set schema private;
alter function private.create_admin_world_draft(
  uuid, uuid, text, uuid, integer, text, integer
)
  rename to phase6_create_admin_world_draft;

alter function public.derive_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
)
  set schema private;
alter function private.derive_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
)
  rename to phase6_derive_admin_world_version;

alter function public.save_admin_world_draft(
  uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer
)
  set schema private;
alter function private.save_admin_world_draft(
  uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer
)
  rename to phase6_save_admin_world_draft;

alter function public.get_current_published_world(text, text, integer)
  set schema private;
alter function private.get_current_published_world(text, text, integer)
  rename to phase6_get_current_published_world;

alter function public.get_published_world_manifest(text, text, text, integer)
  set schema private;
alter function private.get_published_world_manifest(text, text, text, integer)
  rename to phase6_get_published_world_manifest;

alter function public.transition_player_world(text, text, integer, uuid, text, integer)
  set schema private;
alter function private.transition_player_world(text, text, integer, uuid, text, integer)
  rename to phase6_transition_player_world;

create or replace function public.create_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_expected_record_version integer,
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
  result jsonb;
  target_version_id uuid;
  source_version_id uuid;
begin
  result := private.phase6_create_admin_world_draft(
    p_user_id, p_auth_session_id, p_assurance_level, p_world_map_id,
    p_expected_record_version, p_request_id, p_rate_limit
  );
  if result ->> 'status' = 'created' then
    target_version_id := (result #>> '{version,id}')::uuid;
    select derived_from_version_id into strict source_version_id
    from public.world_map_versions where id = target_version_id;
    perform private.clone_world_version_asset_pins(source_version_id, target_version_id);
  end if;
  return result;
end;
$$;

create or replace function public.derive_admin_world_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_source_version_id uuid,
  p_expected_record_version integer,
  p_reason text,
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
  result jsonb;
  target_version_id uuid;
begin
  result := private.phase6_derive_admin_world_version(
    p_user_id, p_auth_session_id, p_assurance_level, p_world_map_id,
    p_source_version_id, p_expected_record_version, p_reason,
    p_request_id, p_rate_limit
  );
  if result ->> 'status' = 'created' then
    target_version_id := (result #>> '{version,id}')::uuid;
    perform private.clone_world_version_asset_pins(
      p_source_version_id, target_version_id
    );
  end if;
  return result;
end;
$$;

-- The world editor remains the authority for draft persistence. This wrapper
-- derives replacement audit data from the locked, trusted before-state and the
-- accepted after-state instead of accepting client-authored audit metadata.
create or replace function public.save_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
  p_manifest jsonb,
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
  trusted_session uuid;
  before_manifest jsonb;
  before_checksum text;
  result jsonb;
  replacement record;
  replacements jsonb := '[]'::jsonb;
  replacement_count integer := 0;
  first_replacement_asset_key text;
  target_asset_id uuid;
  target_asset_version_id uuid;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );

  select version.manifest, version.checksum into before_manifest, before_checksum
  from public.world_map_versions as version
  where version.id = p_version_id
    and version.world_map_id = p_world_map_id
    and version.lifecycle_status = 'draft'
  for update;

  if before_manifest is not null
     and not private.world_manifest_assets_compatible(p_version_id, p_manifest) then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  result := private.phase6_save_admin_world_draft(
    p_user_id, p_auth_session_id, p_assurance_level, p_world_map_id,
    p_version_id, p_expected_edit_version, p_expected_checksum, p_manifest,
    p_request_id, p_rate_limit
  );

  if result ->> 'status' <> 'updated' or before_manifest is null then
    return result;
  end if;

  for replacement in
    with before_objects as (
      select value ->> 'id' as object_id, value ->> 'assetId' as asset_key
      from jsonb_array_elements(before_manifest -> 'objects') as item(value)
      where jsonb_typeof(value) = 'object'
    ), after_objects as (
      select value ->> 'id' as object_id, value ->> 'assetId' as asset_key
      from jsonb_array_elements(p_manifest -> 'objects') as item(value)
      where jsonb_typeof(value) = 'object'
    )
    select
      before_object.object_id,
      before_object.asset_key as before_asset_key,
      after_object.asset_key as after_asset_key
    from before_objects as before_object
    join after_objects as after_object using (object_id)
    where before_object.asset_key is distinct from after_object.asset_key
    order by before_object.object_id
  loop
    replacement_count := replacement_count + 1;
    if replacement_count = 1 then
      first_replacement_asset_key := replacement.after_asset_key;
    end if;
    if replacement_count <= 100 then
      replacements := replacements || jsonb_build_array(jsonb_build_object(
        'objectId', replacement.object_id,
        'beforeAssetKey', replacement.before_asset_key,
        'afterAssetKey', replacement.after_asset_key
      ));
    end if;
  end loop;

  if replacement_count > 0 then
    select asset.id, asset.active_version_id
      into target_asset_id, target_asset_version_id
    from public.world_assets as asset
    where asset.asset_key = first_replacement_asset_key;

    insert into public.world_asset_audit_events (
      event_key, action, permission_key, actor_admin_user_id, admin_session_id,
      target_world_asset_id, target_world_asset_version_id,
      target_world_map_id, target_world_map_version_id,
      request_id, outcome, before_state, after_state, metadata
    ) values (
      'asset.world.replacement_performed', 'replacement_performed', 'maps.edit',
      p_user_id, trusted_session, target_asset_id, target_asset_version_id,
      p_world_map_id, p_version_id, p_request_id, 'success',
      jsonb_build_object('manifestChecksum', before_checksum),
      jsonb_build_object('manifestChecksum', result #>> '{version,checksum}'),
      jsonb_build_object(
        'replacementCount', replacement_count,
        'replacements', replacements,
        'truncated', replacement_count > 100
      )
    );
  end if;

  return result;
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
  result jsonb;
  version_id uuid;
begin
  result := private.phase6_get_current_published_world(
    p_wallet_address, p_request_id, p_rate_limit
  );
  if result ->> 'status' = 'loaded' then
    version_id := (result -> 'version' ->> 'id')::uuid;
    result := result || jsonb_build_object(
      'assetDeliveries', private.world_asset_deliveries_for_version(version_id)
    );
  end if;
  return result;
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
  result jsonb;
  version_id uuid;
begin
  result := private.phase6_get_published_world_manifest(
    p_wallet_address, p_map_slug, p_request_id, p_rate_limit
  );
  if result ->> 'status' = 'loaded' then
    version_id := (result -> 'version' ->> 'id')::uuid;
    result := result || jsonb_build_object(
      'assetDeliveries', private.world_asset_deliveries_for_version(version_id)
    );
  end if;
  return result;
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
  result jsonb;
  version_id uuid;
begin
  result := private.phase6_transition_player_world(
    p_wallet_address, p_exit_id, p_expected_game_state_version,
    p_expected_map_version_id, p_request_id, p_rate_limit
  );
  if result ->> 'status' in ('transitioned', 'replayed') then
    version_id := (result -> 'version' ->> 'id')::uuid;
    result := result || jsonb_build_object(
      'assetDeliveries', private.world_asset_deliveries_for_version(version_id)
    );
  end if;
  return result;
end;
$$;

revoke all on function private.sync_world_version_assets(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.clone_world_version_asset_pins(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_object_kind_allowed(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.world_manifest_assets_compatible(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_world_asset_content_reference(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_world_asset_content_reference_trigger()
  from public, anon, authenticated, service_role;
revoke all on function private.sync_world_asset_content_references_for_asset(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_world_asset_content_references_after_asset_change()
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_deliveries_for_version(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_create_admin_world_draft(
  uuid, uuid, text, uuid, integer, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_derive_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_save_admin_world_draft(
  uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_get_current_published_world(text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_get_published_world_manifest(text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.phase6_transition_player_world(text, text, integer, uuid, text, integer)
  from public, anon, authenticated, service_role;

revoke all on function public.get_current_published_world(text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.create_admin_world_draft(
  uuid, uuid, text, uuid, integer, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.derive_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.save_admin_world_draft(
  uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer
)
  from public, anon, authenticated, service_role;
revoke all on function public.get_published_world_manifest(text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.transition_player_world(text, text, integer, uuid, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.get_current_published_world(text, text, integer)
  to service_role;
grant execute on function public.create_admin_world_draft(
  uuid, uuid, text, uuid, integer, text, integer
)
  to service_role;
grant execute on function public.derive_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
)
  to service_role;
grant execute on function public.save_admin_world_draft(
  uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer
)
  to service_role;
grant execute on function public.get_published_world_manifest(text, text, text, integer)
  to service_role;
grant execute on function public.transition_player_world(text, text, integer, uuid, text, integer)
  to service_role;
