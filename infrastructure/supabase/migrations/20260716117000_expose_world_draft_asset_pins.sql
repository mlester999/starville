-- Expose exact immutable draft asset pins to the authorized world editor.
-- This is read-only metadata; it does not rebind a world or mutate an asset version.

create or replace function private.world_editor_asset_pins_for_version(
  p_world_map_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'assetId', asset.id,
    'assetKey', asset.asset_key,
    'friendlyName', asset.friendly_name,
    'assetType', asset.asset_type,
    'productionStatus', asset.production_status,
    'activeVersionId', asset.active_version_id,
    'referenceCount', (
      private.world_asset_reference_summary(asset.id) ->> 'total'
    )::integer,
    'pinnedVersion', jsonb_build_object(
      'id', pinned.id,
      'versionNumber', pinned.version_number,
      'lifecycleStatus', pinned.lifecycle_status,
      'processingStatus', case
        when pinned.checksum_sha256 is not null
          or pinned.source_kind <> 'storage_raster' then 'completed'
        else 'pending'
      end,
      'validationStatus', pinned.automated_validation_status,
      'sourceWidth', pinned.source_width,
      'sourceHeight', pinned.source_height,
      'sourceKind', pinned.source_kind,
      'processedSourceAvailable',
        pinned.processed_source_path is not null
        and pinned.automated_validation_status = 'valid'
        and pinned.lifecycle_status in ('active', 'deprecated'),
      'processedWidth', pinned.processed_source_width,
      'processedHeight', pinned.processed_source_height,
      'render', jsonb_build_object(
        'renderWidth', pinned.render_width,
        'renderHeight', pinned.render_height,
        'scale', pinned.render_scale,
        'anchor', jsonb_build_object('x', pinned.anchor_x, 'y', pinned.anchor_y),
        'footAnchor', jsonb_build_object(
          'x', pinned.foot_anchor_x, 'y', pinned.foot_anchor_y
        ),
        'depthAnchor', jsonb_build_object(
          'x', pinned.depth_anchor_x, 'y', pinned.depth_anchor_y
        ),
        'supportedRotations', to_jsonb(pinned.supported_rotations),
        'defaultRotation', pinned.default_rotation
      ),
      'collision', pinned.collision_profile
    ),
    'latestVersion', case when latest.id is null then null else jsonb_build_object(
      'id', latest.id,
      'versionNumber', latest.version_number,
      'lifecycleStatus', latest.lifecycle_status,
      'processingStatus', case
        when latest.checksum_sha256 is not null
          or latest.source_kind <> 'storage_raster' then 'completed'
        else 'pending'
      end,
      'validationStatus', latest.automated_validation_status,
      'sourceWidth', latest.source_width,
      'sourceHeight', latest.source_height
    ) end
  ) order by asset.asset_key), '[]'::jsonb)
  from public.world_map_version_assets as reference
  join public.world_assets as asset
    on asset.id = reference.world_asset_id
  join public.world_asset_versions as pinned
    on pinned.id = reference.world_asset_version_id
   and pinned.world_asset_id = reference.world_asset_id
  left join lateral (
    select candidate.*
    from public.world_asset_versions as candidate
    where candidate.world_asset_id = asset.id
    order by candidate.version_number desc, candidate.id desc
    limit 1
  ) as latest on true
  where reference.world_map_version_id = p_world_map_version_id;
$$;

create or replace function public.get_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
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
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id
    and lifecycle_status in ('draft', 'validated');
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest,
    'assetPins', private.world_editor_asset_pins_for_version(selected_version.id)
  );
end;
$$;

revoke all on function private.world_editor_asset_pins_for_version(uuid)
  from public, anon, authenticated, service_role;
