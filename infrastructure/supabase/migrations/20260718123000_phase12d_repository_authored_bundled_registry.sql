-- Starville Phase 12D: additive repository-authored bundled-version registry.
-- This migration records immutable identities only. It does not activate or
-- repoint an asset, mutate an uploaded override, or rewrite any world pin.

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
      source_type = 'repository_authored'
      and repository_owned
      and media_type = 'image/webp'
      and width is not null and height is not null and file_size_bytes is not null
    )
    or (
      source_type = 'storage_raster'
      and media_type in ('image/png', 'image/webp', 'image/avif')
      and width is not null and height is not null and file_size_bytes is not null
    )
  );

alter table public.world_asset_versions
  drop constraint world_asset_versions_source_kind_check,
  add constraint world_asset_versions_source_kind_check check (source_kind in (
    'repository_procedural', 'repository_authored',
    'legacy_storage_raster', 'storage_raster'
  )),
  drop constraint world_asset_versions_file_state_check,
  add constraint world_asset_versions_file_state_check check (
    source_kind in (
      'repository_procedural', 'repository_authored', 'legacy_storage_raster'
    )
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
  drop constraint world_asset_versions_activation_check,
  add constraint world_asset_versions_activation_check check (
    lifecycle_status <> 'active'
    or source_kind in (
      'repository_procedural', 'repository_authored', 'legacy_storage_raster'
    )
    or delivery_source_path is not null
  ),
  add constraint world_asset_versions_repository_authored_state_check check (
    source_kind <> 'repository_authored'
    or lifecycle_status in ('draft', 'processing', 'validation_failed', 'archived')
    or (
      checksum_sha256 is not null
      and detected_mime_type = 'image/webp'
      and source_width is not null
      and source_height is not null
      and source_size_bytes is not null
      and automated_validation_status = 'valid'
      and validation_results ->> 'valid' = 'true'
    )
  );

create table public.world_asset_bundled_manifests (
  manifest_version text primary key check (
    char_length(manifest_version) between 1 and 32
    and manifest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  manifest_checksum_sha256 text not null unique check (
    manifest_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  source_kind text not null check (
    source_kind in ('repository_procedural', 'repository_authored')
  ),
  readiness_status text not null check (
    readiness_status in ('technical_baseline', 'production_candidate', 'final')
  ),
  registered_by_admin_id uuid
    references public.admin_users(user_id) on delete restrict,
  owner_accepted_by_admin_id uuid
    references public.admin_users(user_id) on delete restrict,
  owner_accepted_at timestamptz,
  acceptance_evidence jsonb check (
    acceptance_evidence is null
    or (
      jsonb_typeof(acceptance_evidence) = 'object'
      and pg_column_size(acceptance_evidence) <= 32768
    )
  ),
  created_at timestamptz not null default now(),
  constraint world_asset_bundled_manifests_final_readiness_check check (
    (
      readiness_status <> 'final'
      and owner_accepted_by_admin_id is null
      and owner_accepted_at is null
      and acceptance_evidence is null
    )
    or (
      readiness_status = 'final'
      and source_kind = 'repository_authored'
      and owner_accepted_by_admin_id is not null
      and owner_accepted_at is not null
      and acceptance_evidence is not null
      and acceptance_evidence <> '{}'::jsonb
    )
  )
);

create table public.world_asset_bundled_manifest_registry (
  asset_key text not null check (
    char_length(asset_key) between 3 and 96
    and asset_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  manifest_version text not null
    references public.world_asset_bundled_manifests(manifest_version) on delete restrict,
  world_asset_id uuid not null
    references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null,
  source_kind text not null check (
    source_kind in ('repository_procedural', 'repository_authored')
  ),
  quality_status text not null check (
    quality_status in (
      'technical_baseline', 'production_candidate', 'final',
      'needs_refinement', 'needs_owner_replacement', 'blocking'
    )
  ),
  asset_checksum_sha256 text not null check (
    asset_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  source_path text not null check (
    source_path ~ '^assets/source(?:-v[1-9][0-9]*)?/[a-z0-9_./-]+\.(svg|png|webp)$'
    and source_path !~ '(^|/)\.\.(/|$)'
  ),
  runtime_path text not null check (
    runtime_path ~ '^/assets/starville/bundled/v[1-9][0-9]*/[a-z0-9_./-]+\.webp$'
    and runtime_path !~ '(^|/)\.\.(/|$)'
  ),
  thumbnail_path text not null check (
    thumbnail_path ~ '^/assets/starville/bundled/v[1-9][0-9]*/thumbnails/[a-z0-9_./-]+\.webp$'
    and thumbnail_path !~ '(^|/)\.\.(/|$)'
  ),
  replacement_allowed boolean not null,
  safe_fallback_key text not null check (
    char_length(safe_fallback_key) between 3 and 96
    and safe_fallback_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  metadata jsonb not null check (
    jsonb_typeof(metadata) = 'object'
    and pg_column_size(metadata) <= 65536
  ),
  created_at timestamptz not null default now(),
  primary key (asset_key, manifest_version),
  unique (world_asset_id, world_asset_version_id),
  foreign key (world_asset_id, world_asset_version_id)
    references public.world_asset_versions(world_asset_id, id) on delete restrict,
  foreign key (safe_fallback_key, manifest_version)
    references public.world_asset_bundled_manifest_registry(asset_key, manifest_version)
    on delete restrict deferrable initially deferred
);

create index world_asset_bundled_manifest_registry_version_idx
  on public.world_asset_bundled_manifest_registry(manifest_version, asset_key);
create index world_asset_bundled_manifest_registry_asset_idx
  on public.world_asset_bundled_manifest_registry(world_asset_id, manifest_version);

create or replace function private.reject_world_asset_bundled_manifest_registry_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_IMMUTABLE';
end;
$$;

create trigger world_asset_bundled_manifests_immutable
before update or delete on public.world_asset_bundled_manifests
for each row execute function private.reject_world_asset_bundled_manifest_registry_mutation();

create trigger world_asset_bundled_manifest_registry_immutable
before update or delete on public.world_asset_bundled_manifest_registry
for each row execute function private.reject_world_asset_bundled_manifest_registry_mutation();

create or replace function private.validate_world_asset_bundled_manifest_registry_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  manifest_record public.world_asset_bundled_manifests%rowtype;
  asset_record public.world_assets%rowtype;
  version_record public.world_asset_versions%rowtype;
  manifest_major text;
  expected_source_prefix text;
  expected_runtime_prefix text;
begin
  select * into strict manifest_record
  from public.world_asset_bundled_manifests
  where manifest_version = new.manifest_version;

  select * into strict asset_record
  from public.world_assets
  where id = new.world_asset_id;

  select * into strict version_record
  from public.world_asset_versions
  where world_asset_id = new.world_asset_id
    and id = new.world_asset_version_id;

  if asset_record.game_key <> 'starville'
     or asset_record.asset_key <> new.asset_key
     or version_record.source_kind <> new.source_kind
     or manifest_record.source_kind <> new.source_kind
     or version_record.checksum_sha256 is distinct from new.asset_checksum_sha256
     or version_record.automated_validation_status <> 'valid'
     or version_record.validation_results ->> 'valid' <> 'true'
  then
    raise exception using
      errcode = '23514',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_IDENTITY_INVALID';
  end if;

  if manifest_record.readiness_status = 'technical_baseline'
     and new.quality_status <> 'technical_baseline'
  then
    raise exception using
      errcode = '23514',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_READINESS_INVALID';
  end if;
  if manifest_record.readiness_status = 'production_candidate'
     and new.quality_status = 'final'
  then
    raise exception using
      errcode = '23514',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_READINESS_INVALID';
  end if;
  if manifest_record.readiness_status = 'final'
     and new.quality_status <> 'final'
  then
    raise exception using
      errcode = '23514',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_READINESS_INVALID';
  end if;

  manifest_major := split_part(new.manifest_version, '.', 1);
  expected_source_prefix := case manifest_major
    when '1' then 'assets/source/'
    else 'assets/source-v' || manifest_major || '/'
  end;
  expected_runtime_prefix := '/assets/starville/bundled/v' || manifest_major || '/';

  if left(new.source_path, char_length(expected_source_prefix)) <> expected_source_prefix
     or left(new.runtime_path, char_length(expected_runtime_prefix)) <> expected_runtime_prefix
     or left(
       new.thumbnail_path,
       char_length(expected_runtime_prefix || 'thumbnails/')
     ) <> (expected_runtime_prefix || 'thumbnails/')
  then
    raise exception using
      errcode = '23514',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_PATH_INVALID';
  end if;

  return new;
exception
  when no_data_found then
    raise exception using
      errcode = '23503',
      message = 'ASSET_BUNDLED_MANIFEST_REGISTRY_REFERENCE_MISSING';
end;
$$;

create trigger world_asset_bundled_manifest_registry_validate_insert
before insert on public.world_asset_bundled_manifest_registry
for each row execute function private.validate_world_asset_bundled_manifest_registry_insert();

insert into public.world_asset_bundled_manifests (
  manifest_version, manifest_checksum_sha256, source_kind, readiness_status
) values (
  '1.0.0',
  'e86663780a9f890f97bcb436d1c7bfab5ab84b742b022f62757e357291c395df',
  'repository_procedural',
  'technical_baseline'
);

insert into public.world_asset_bundled_manifest_registry (
  asset_key, manifest_version, world_asset_id, world_asset_version_id,
  source_kind, quality_status, asset_checksum_sha256,
  source_path, runtime_path, thumbnail_path,
  replacement_allowed, safe_fallback_key, metadata
)
select
  catalog.asset_key,
  catalog.manifest_version,
  catalog.world_asset_id,
  catalog.world_asset_version_id,
  'repository_procedural',
  'technical_baseline',
  version.checksum_sha256,
  catalog.source_path,
  catalog.runtime_path,
  catalog.thumbnail_path,
  catalog.replacement_allowed,
  catalog.safe_fallback_key,
  catalog.metadata
from public.world_asset_bundled_catalog as catalog
join public.world_asset_versions as version
  on version.world_asset_id = catalog.world_asset_id
 and version.id = catalog.world_asset_version_id;

set constraints all immediate;

create or replace function private.protect_repository_authored_world_asset_activation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_kind = 'repository_authored'
     and new.lifecycle_status = 'active'
     and not exists (
       select 1
       from public.world_asset_bundled_manifest_registry as registry
       join public.world_asset_bundled_manifests as manifest
         on manifest.manifest_version = registry.manifest_version
       where registry.world_asset_id = new.world_asset_id
         and registry.world_asset_version_id = new.id
         and registry.quality_status = 'final'
         and manifest.readiness_status = 'final'
     )
  then
    raise exception using
      errcode = '42501',
      message = 'REPOSITORY_AUTHORED_ASSET_NOT_OWNER_ACCEPTED';
  end if;
  return new;
end;
$$;

create trigger world_asset_versions_protect_repository_authored_activation
before insert or update on public.world_asset_versions
for each row execute function private.protect_repository_authored_world_asset_activation();

-- Exact v1 projections remain byte-for-byte compatible at the JSON shape.
-- A future exact repository-authored pin gains the explicit candidate class;
-- no existing v1 response receives an unexpected database field.
create or replace function private.world_asset_deliveries_for_version(
  p_world_map_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg((
    jsonb_build_object(
      'assetKey', asset.asset_key,
      'versionId', version.id,
      'checksumSha256', version.checksum_sha256,
      'bundledManifestVersion', registry.manifest_version,
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
      'fallback', case registry.source_kind
        when 'repository_procedural' then 'repository_procedural'
        when 'repository_authored' then 'repository_authored'
        else null
      end
    )
    || case
      when registry.source_kind = 'repository_authored' then
        jsonb_build_object('materialClass', 'bundled_candidate')
      else '{}'::jsonb
    end
  ) order by asset.asset_key), '[]'::jsonb)
  from public.world_map_version_assets as reference
  join public.world_assets as asset on asset.id = reference.world_asset_id
  join public.world_asset_versions as version
    on version.id = reference.world_asset_version_id
   and version.world_asset_id = reference.world_asset_id
  left join public.world_asset_bundled_manifest_registry as registry
    on registry.world_asset_id = asset.id
   and registry.world_asset_version_id = version.id
  where reference.world_map_version_id = p_world_map_version_id
    and version.lifecycle_status in ('active', 'deprecated')
    and version.checksum_sha256 is not null;
$$;

alter table public.world_asset_bundled_manifests enable row level security;
alter table public.world_asset_bundled_manifests force row level security;
alter table public.world_asset_bundled_manifest_registry enable row level security;
alter table public.world_asset_bundled_manifest_registry force row level security;

revoke all on table public.world_asset_bundled_manifests
  from public, anon, authenticated, service_role;
revoke all on table public.world_asset_bundled_manifest_registry
  from public, anon, authenticated, service_role;
revoke all on function private.reject_world_asset_bundled_manifest_registry_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_world_asset_bundled_manifest_registry_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_repository_authored_world_asset_activation()
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_deliveries_for_version(uuid)
  from public, anon, authenticated, service_role;

comment on table public.world_asset_bundled_manifests is
  'Immutable bundled manifest identities and review readiness; no row activates or publishes art.';
comment on table public.world_asset_bundled_manifest_registry is
  'Immutable stable-key and manifest-version bindings for exact checked-in repository material.';
comment on column public.world_asset_bundled_manifests.readiness_status is
  'Technical, candidate, or evidence-backed final readiness; candidate is never production approval.';
