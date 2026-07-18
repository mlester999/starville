-- Starville Phase 10C: immutable composer revisions, reviewed publication,
-- and copy-on-publish rollback. This migration is forward-only.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values (
  'maps.rollback',
  'Roll back published worlds',
  'Create a reviewed publication from a previously published immutable world revision.',
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
  and permission.key = 'maps.rollback'
on conflict (role_id, permission_id) do nothing;

with mapping(role_key, permission_key) as (
  values ('live_operations_manager', 'maps.rollback')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

alter table public.world_audit_events
  drop constraint world_audit_events_event_key_check;
alter table public.world_audit_events
  add constraint world_audit_events_event_key_check check (event_key in (
    'world.map_created',
    'world.draft_created',
    'world.draft_updated',
    'world.draft_revision_saved',
    'world.validation_passed',
    'world.validation_failed',
    'world.preview_opened',
    'world.revision_inspected',
    'world.version_published',
    'world.version_superseded',
    'world.version_derived',
    'world.version_restored_as_draft',
    'world.version_rolled_back',
    'world.publish_impact_reviewed',
    'world.rollback_impact_reviewed',
    'world.asset_registered',
    'world.asset_approved',
    'world.asset_deprecated',
    'world.publication_rejected'
  ));

-- A draft head is mutable routing metadata. The revision it points at is not
-- overwritten: every explicit save inserts a new world_map_versions row.
create table public.world_draft_heads (
  world_map_id uuid primary key references public.world_maps(id) on delete restrict,
  world_map_version_id uuid not null unique,
  updated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (world_map_id, world_map_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict
);

comment on table public.world_draft_heads is
  'Server-authoritative pointer to the one editable world revision. Saved revisions remain immutable history.';

insert into public.world_draft_heads (
  world_map_id, world_map_version_id, updated_by_admin_id, updated_at
)
select distinct on (version.world_map_id)
  version.world_map_id,
  version.id,
  version.created_by_admin_id,
  version.updated_at
from public.world_map_versions as version
where version.lifecycle_status in ('draft', 'validated')
order by version.world_map_id, version.version_number desc, version.id desc;

drop index public.world_map_versions_one_open_draft_idx;

create table public.world_revision_metadata (
  world_map_version_id uuid primary key,
  world_map_id uuid not null,
  parent_revision_id uuid references public.world_map_versions(id) on delete restrict,
  revision_kind text not null check (
    revision_kind in ('legacy', 'draft_created', 'draft_saved', 'restored', 'published', 'rollback')
  ),
  change_summary jsonb not null check (
    jsonb_typeof(change_summary) = 'object'
    and pg_column_size(change_summary) <= 32768
  ),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text check (request_id is null or char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  foreign key (world_map_id, world_map_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict
);

comment on table public.world_revision_metadata is
  'Append-only safe summaries and lineage for immutable world revisions.';

insert into public.world_revision_metadata (
  world_map_version_id, world_map_id, parent_revision_id, revision_kind,
  change_summary, created_by_admin_id, created_at
)
select version.id, version.world_map_id, version.derived_from_version_id, 'legacy',
  jsonb_build_object(
    'objectsAdded', 0,
    'objectsRemoved', 0,
    'objectsMoved', 0,
    'objectsModified', 0,
    'assetBindingsChanged', 0,
    'collisionsChanged', 0,
    'interactionsChanged', 0,
    'exitsChanged', 0,
    'spawnsChanged', 0,
    'terrainChanged', false,
    'legacyBackfill', true
  ),
  version.created_by_admin_id,
  version.created_at
from public.world_map_versions as version;

create table public.world_publication_reviews (
  id uuid primary key default gen_random_uuid(),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  target_revision_id uuid not null,
  expected_active_version_id uuid,
  operation text not null check (operation in ('publish', 'rollback')),
  change_summary jsonb not null check (
    jsonb_typeof(change_summary) = 'object'
    and pg_column_size(change_summary) <= 32768
  ),
  game_test_evidence_id uuid references public.world_game_test_evidence(id) on delete restrict,
  actor_admin_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  acknowledged_at timestamptz not null,
  expires_at timestamptz not null,
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  foreign key (world_map_id, target_revision_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  unique (actor_admin_user_id, request_id),
  constraint world_publication_reviews_ttl_check check (
    expires_at > acknowledged_at
    and expires_at <= acknowledged_at + interval '30 minutes'
  )
);

comment on table public.world_publication_reviews is
  'Short-lived, actor-bound acknowledgment of exact publication or rollback impact.';

create table public.world_publication_records (
  id uuid primary key default gen_random_uuid(),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  source_revision_id uuid not null,
  published_version_id uuid not null unique,
  previous_published_version_id uuid,
  operation text not null check (operation in ('publish', 'rollback')),
  actor_admin_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  review_id uuid not null unique references public.world_publication_reviews(id) on delete restrict,
  reason text not null check (
    char_length(reason) between 12 and 500
    and reason = btrim(reason)
    and reason !~ '[[:cntrl:]<>]'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  foreign key (world_map_id, source_revision_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  foreign key (world_map_id, published_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  foreign key (world_map_id, previous_published_version_id)
    references public.world_map_versions(world_map_id, id) on delete restrict,
  unique (actor_admin_user_id, request_id)
);

comment on table public.world_publication_records is
  'Append-only publication ledger. Rollback creates a new immutable publication from historical content.';

create index world_revision_metadata_map_idx
  on public.world_revision_metadata(world_map_id, created_at desc, world_map_version_id);
create unique index world_revision_metadata_request_idx
  on public.world_revision_metadata(created_by_admin_id, request_id)
  where created_by_admin_id is not null and request_id is not null;
create index world_publication_reviews_expiry_idx
  on public.world_publication_reviews(expires_at);
create index world_publication_records_map_idx
  on public.world_publication_records(world_map_id, created_at desc, id desc);
create index world_publication_records_source_idx
  on public.world_publication_records(source_revision_id, created_at desc);

create or replace function private.protect_world_revision_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'WORLD_REVISION_EVIDENCE_APPEND_ONLY';
end;
$$;

create trigger world_revision_metadata_append_only
before update or delete on public.world_revision_metadata
for each row execute function private.protect_world_revision_evidence();

create trigger world_publication_reviews_append_only
before update or delete on public.world_publication_reviews
for each row execute function private.protect_world_revision_evidence();

create trigger world_publication_records_append_only
before update or delete on public.world_publication_records
for each row execute function private.protect_world_revision_evidence();

-- A draft revision's manifest is immutable after insertion. Validation may
-- attach evidence to the exact current head, but it cannot rewrite content.
-- Validated sources are never converted in place by the Phase 10C publisher.
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

  if old.lifecycle_status = 'draft' then
    if exists (
         select 1 from public.world_draft_heads as head
         where head.world_map_id = old.world_map_id
           and head.world_map_version_id = old.id
       )
       and new.lifecycle_status in ('draft', 'validated')
       and (to_jsonb(new) - array[
         'lifecycle_status', 'validation_status', 'validation_result',
         'validated_at', 'validated_by_admin_id', 'updated_at'
       ]) is not distinct from
       (to_jsonb(old) - array[
         'lifecycle_status', 'validation_status', 'validation_result',
         'validated_at', 'validated_by_admin_id', 'updated_at'
       ]) then
      return new;
    end if;
    raise exception using errcode = '42501', message = 'WORLD_DRAFT_REVISION_IMMUTABLE';
  end if;

  if old.lifecycle_status = 'validated' then
    raise exception using errcode = '42501', message = 'VALIDATED_WORLD_VERSION_IMMUTABLE';
  end if;

  if old.lifecycle_status in ('published', 'superseded', 'archived') then
    if coalesce(current_setting('starville.world_publication_transition', true), '') = 'true'
       and old.lifecycle_status = 'published'
       and new.lifecycle_status = 'superseded'
       and (to_jsonb(new) - array['lifecycle_status', 'updated_at'])
         is not distinct from
         (to_jsonb(old) - array['lifecycle_status', 'updated_at']) then
      return new;
    end if;
    raise exception using errcode = '42501', message = 'PUBLISHED_WORLD_VERSION_IMMUTABLE';
  end if;

  raise exception using errcode = '42501', message = 'WORLD_VERSION_HISTORY_RETAINED';
end;
$$;

alter table public.world_draft_heads enable row level security;
alter table public.world_draft_heads force row level security;
alter table public.world_revision_metadata enable row level security;
alter table public.world_revision_metadata force row level security;
alter table public.world_publication_reviews enable row level security;
alter table public.world_publication_reviews force row level security;
alter table public.world_publication_records enable row level security;
alter table public.world_publication_records force row level security;

revoke all on table public.world_draft_heads
  from public, anon, authenticated, service_role;
revoke all on table public.world_revision_metadata
  from public, anon, authenticated, service_role;
revoke all on table public.world_publication_reviews
  from public, anon, authenticated, service_role;
revoke all on table public.world_publication_records
  from public, anon, authenticated, service_role;

create or replace function private.world_manifest_change_summary(
  p_before jsonb,
  p_after jsonb
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  with before_objects as (
    select value ->> 'id' as id, value
    from jsonb_array_elements(coalesce(p_before -> 'objects', '[]'::jsonb)) as item(value)
  ), after_objects as (
    select value ->> 'id' as id, value
    from jsonb_array_elements(coalesce(p_after -> 'objects', '[]'::jsonb)) as item(value)
  ), joined as (
    select before_object.id as before_id, after_object.id as after_id,
      before_object.value as before_value, after_object.value as after_value
    from before_objects as before_object
    full join after_objects as after_object using (id)
  )
  select jsonb_build_object(
    'objectsAdded', count(*) filter (where before_id is null),
    'objectsRemoved', count(*) filter (where after_id is null),
    'objectsMoved', count(*) filter (
      where before_id is not null and after_id is not null
        and (
          before_value -> 'x' is distinct from after_value -> 'x'
          or before_value -> 'y' is distinct from after_value -> 'y'
        )
    ),
    'objectsModified', count(*) filter (
      where before_id is not null and after_id is not null
        and before_value is distinct from after_value
    ),
    'assetBindingsChanged', count(*) filter (
      where before_id is not null and after_id is not null
        and before_value -> 'assetId' is distinct from after_value -> 'assetId'
    ),
    'collisionsChanged', case
      when coalesce(p_before -> 'collisions', '[]'::jsonb)
        is distinct from coalesce(p_after -> 'collisions', '[]'::jsonb)
      then 1 else 0 end,
    'interactionsChanged', case
      when coalesce(p_before -> 'interactions', '[]'::jsonb)
        is distinct from coalesce(p_after -> 'interactions', '[]'::jsonb)
      then 1 else 0 end,
    'exitsChanged', case
      when coalesce(p_before -> 'exits', '[]'::jsonb)
        is distinct from coalesce(p_after -> 'exits', '[]'::jsonb)
      then 1 else 0 end,
    'spawnsChanged', case
      when coalesce(p_before -> 'spawns', '[]'::jsonb)
        is distinct from coalesce(p_after -> 'spawns', '[]'::jsonb)
      then 1 else 0 end,
    'terrainChanged', coalesce(p_before -> 'terrain', '[]'::jsonb)
      is distinct from coalesce(p_after -> 'terrain', '[]'::jsonb),
    'metadataChanged', jsonb_build_object(
      'name', p_before -> 'name' is distinct from p_after -> 'name',
      'description', p_before -> 'description' is distinct from p_after -> 'description',
      'bounds', p_before -> 'safeSaveBounds' is distinct from p_after -> 'safeSaveBounds'
    )
  )
  from joined;
$$;

create or replace function private.world_manifest_rotations_compatible(
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
  if p_manifest is null
     or jsonb_typeof(p_manifest) <> 'object'
     or jsonb_typeof(p_manifest -> 'objects') <> 'array' then
    return true;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(p_manifest -> 'objects') as object(value)
    left join public.world_assets as asset
      on asset.asset_key = object.value ->> 'assetId'
    left join public.world_map_version_assets as reference
      on reference.world_map_version_id = p_world_map_version_id
     and reference.world_asset_id = asset.id
    left join public.world_asset_versions as asset_version
      on asset_version.id = reference.world_asset_version_id
     and asset_version.world_asset_id = reference.world_asset_id
    where jsonb_typeof(object.value) <> 'object'
       or asset_version.id is null
       or (
         object.value ? 'rotation'
         and (
           jsonb_typeof(object.value -> 'rotation') <> 'number'
           or (object.value ->> 'rotation')::numeric
             <> trunc((object.value ->> 'rotation')::numeric)
           or not (
             ((object.value ->> 'rotation')::numeric)::smallint
               = any(asset_version.supported_rotations)
           )
         )
       )
  );
exception when others then
  return false;
end;
$$;

create or replace function private.world_revision_assets_runtime_ready(
  p_world_map_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.world_manifest_rotations_compatible(
    p_world_map_version_id,
    (select version.manifest
     from public.world_map_versions as version
     where version.id = p_world_map_version_id)
  ) and exists (
    select 1 from public.world_map_versions as version
    where version.id = p_world_map_version_id
  ) and not exists (
    select 1
    from public.world_map_versions as version
    cross join lateral jsonb_array_elements_text(version.manifest -> 'assets') as requested(asset_key)
    left join public.world_assets as asset on asset.asset_key = requested.asset_key
    left join public.world_map_version_assets as reference
      on reference.world_map_version_id = version.id
     and reference.world_asset_id = asset.id
    left join public.world_asset_versions as asset_version
      on asset_version.id = reference.world_asset_version_id
     and asset_version.world_asset_id = reference.world_asset_id
    where version.id = p_world_map_version_id
      and (
        asset.id is null
        or reference.world_asset_version_id is null
        or asset_version.lifecycle_status not in ('active', 'deprecated')
        or asset_version.automated_validation_status <> 'valid'
        or (
          asset_version.source_kind = 'storage_raster'
          and asset_version.processed_source_path is null
        )
      )
  );
$$;

create or replace function private.clone_world_revision_asset_pins(
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
  ) then
    raise exception using errcode = '23514', message = 'WORLD_REVISION_PIN_SOURCE_MISMATCH';
  end if;
  insert into public.world_map_version_assets (
    world_map_version_id, world_asset_id, world_asset_version_id
  )
  select p_target_world_map_version_id, source.world_asset_id, source.world_asset_version_id
  from public.world_map_version_assets as source
  where source.world_map_version_id = p_source_world_map_version_id
  order by source.world_asset_id
  on conflict do nothing;
end;
$$;

create or replace function private.admin_world_version_json(
  p_version public.world_map_versions
)
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
    'validationResult', case
      when p_version.validation_status = 'pending' then null
      else p_version.validation_result
    end,
    'createdAt', p_version.created_at,
    'updatedAt', p_version.updated_at,
    'validatedAt', p_version.validated_at,
    'publishedAt', p_version.published_at,
    'publicationReason', p_version.publication_reason,
    'supersedesVersionId', p_version.supersedes_version_id,
    'derivedFromVersionId', p_version.derived_from_version_id
  );
$$;

create or replace function public.get_admin_world_map(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
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
  versions jsonb;
  metadata jsonb;
  publications jsonb;
  draft_head_id uuid;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select world_map_version_id into draft_head_id
  from public.world_draft_heads where world_map_id = selected_map.id;
  select coalesce(
    jsonb_agg(private.admin_world_version_json(version) order by version.version_number desc),
    '[]'::jsonb
  ) into versions
  from public.world_map_versions as version
  where version.world_map_id = selected_map.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', revision.world_map_version_id,
    'parentRevisionId', revision.parent_revision_id,
    'revisionKind', revision.revision_kind,
    'changeSummary', revision.change_summary,
    'createdAt', revision.created_at
  ) order by revision.created_at desc, revision.world_map_version_id), '[]'::jsonb)
  into metadata
  from public.world_revision_metadata as revision
  where revision.world_map_id = selected_map.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', publication.id,
    'operation', publication.operation,
    'sourceRevisionId', publication.source_revision_id,
    'publishedVersionId', publication.published_version_id,
    'previousPublishedVersionId', publication.previous_published_version_id,
    'reason', publication.reason,
    'createdAt', publication.created_at
  ) order by publication.created_at desc, publication.id desc), '[]'::jsonb)
  into publications
  from public.world_publication_records as publication
  where publication.world_map_id = selected_map.id;
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'versions', versions,
    'draftHeadVersionId', draft_head_id,
    'revisionMetadata', metadata,
    'publicationHistory', publications
  );
end;
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
  select version.* into selected_version
  from public.world_draft_heads as head
  join public.world_map_versions as version
    on version.id = head.world_map_version_id
   and version.world_map_id = head.world_map_id
  where head.world_map_id = p_world_map_id
    and head.world_map_version_id = p_version_id
    and version.lifecycle_status in ('draft', 'validated');
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

create or replace function public.get_admin_world_revision(
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
  revision_metadata public.world_revision_metadata%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id;
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into revision_metadata from public.world_revision_metadata
  where world_map_version_id = selected_version.id;
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest,
    'isDraftHead', exists (
      select 1 from public.world_draft_heads
      where world_map_id = p_world_map_id and world_map_version_id = p_version_id
    ),
    'revisionMetadata', jsonb_build_object(
      'parentRevisionId', revision_metadata.parent_revision_id,
      'revisionKind', revision_metadata.revision_kind,
      'changeSummary', revision_metadata.change_summary,
      'createdAt', revision_metadata.created_at
    )
  );
end;
$$;

create or replace function public.compare_admin_world_revisions(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_from_version_id uuid,
  p_to_version_id uuid,
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
  from_version public.world_map_versions%rowtype;
  to_version public.world_map_versions%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into from_version from public.world_map_versions
  where id = p_from_version_id and world_map_id = p_world_map_id;
  select * into to_version from public.world_map_versions
  where id = p_to_version_id and world_map_id = p_world_map_id;
  if from_version.id is null or to_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'loaded',
    'fromVersion', private.admin_world_version_json(from_version),
    'toVersion', private.admin_world_version_json(to_version),
    'changeSummary', private.world_manifest_change_summary(
      from_version.manifest, to_version.manifest
    )
  );
end;
$$;

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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  new_version public.world_map_versions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_draft_write', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if selected_map.record_version <> p_expected_record_version then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if exists (select 1 from public.world_draft_heads where world_map_id = selected_map.id) then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  select * into source_version from public.world_map_versions
  where id = selected_map.active_published_version_id
    and world_map_id = selected_map.id
    and lifecycle_status = 'published';
  if not found then return jsonb_build_object('status', 'state_conflict'); end if;

  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    validation_status, validation_result, created_by_admin_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1
     from public.world_map_versions where world_map_id = selected_map.id),
    'draft', source_version.manifest, source_version.checksum, 'pending',
    jsonb_build_object(
      'valid', false, 'checkedAt', now(),
      'errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ),
    p_user_id, source_version.id
  ) returning * into new_version;
  perform private.clone_world_revision_asset_pins(source_version.id, new_version.id);
  insert into public.world_draft_heads (
    world_map_id, world_map_version_id, updated_by_admin_id
  ) values (selected_map.id, new_version.id, p_user_id);
  insert into public.world_revision_metadata (
    world_map_version_id, world_map_id, parent_revision_id, revision_kind,
    change_summary, created_by_admin_id, request_id
  ) values (
    new_version.id, selected_map.id, source_version.id, 'draft_created',
    private.world_manifest_change_summary(source_version.manifest, new_version.manifest),
    p_user_id, p_request_id
  );
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome,
    before_state, after_state, metadata
  ) values (
    'world.draft_created', 'admin', p_user_id, trusted_session,
    selected_map.id, new_version.id, p_request_id, 'success',
    jsonb_build_object('sourceVersionId', source_version.id),
    jsonb_build_object('draftHeadVersionId', new_version.id),
    jsonb_build_object('versionNumber', new_version.version_number, 'immutableRevision', true)
  );
  return jsonb_build_object(
    'status', 'created',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(new_version),
    'manifest', new_version.manifest
  );
end;
$$;

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
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  replay_version public.world_map_versions%rowtype;
  new_version public.world_map_versions%rowtype;
  validation jsonb;
  next_checksum text;
  summary jsonb;
  replacement_count integer;
  replacement_summary jsonb;
  first_replacement_asset_key text;
  target_asset_id uuid;
  target_asset_version_id uuid;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_valid_request_id(p_request_id);
  if p_manifest is null or pg_column_size(p_manifest) > 262144 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_DRAFT';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_draft_write', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select version.* into replay_version
  from public.world_revision_metadata as metadata
  join public.world_map_versions as version on version.id = metadata.world_map_version_id
  where metadata.created_by_admin_id = p_user_id
    and metadata.request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'status', 'updated',
      'map', private.admin_world_map_json(
        (select map from public.world_maps as map where map.id = replay_version.world_map_id)
      ),
      'version', private.admin_world_version_json(replay_version),
      'manifest', replay_version.manifest,
      'idempotentReplay', true
    );
  end if;

  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select version.* into selected_version
  from public.world_draft_heads as head
  join public.world_map_versions as version
    on version.id = head.world_map_version_id
   and version.world_map_id = head.world_map_id
  where head.world_map_id = p_world_map_id
  for update of head, version;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if selected_version.id <> p_version_id
     or selected_version.lifecycle_status <> 'draft'
     or selected_version.edit_version <> p_expected_edit_version
     or (
       p_expected_checksum is not null
       and selected_version.checksum <> p_expected_checksum
     ) then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if selected_version.manifest = p_manifest then
    return jsonb_build_object(
      'status', 'unchanged',
      'map', private.admin_world_map_json(selected_map),
      'version', private.admin_world_version_json(selected_version),
      'manifest', selected_version.manifest
    );
  end if;
  if not private.world_manifest_assets_compatible(selected_version.id, p_manifest) then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  validation := private.validate_world_manifest(selected_map.id, p_manifest);
  next_checksum := private.world_manifest_checksum(p_manifest);
  summary := private.world_manifest_change_summary(selected_version.manifest, p_manifest);
  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    edit_version, validation_status, validation_result,
    created_by_admin_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1
     from public.world_map_versions where world_map_id = selected_map.id),
    'draft', p_manifest, next_checksum, selected_version.edit_version + 1,
    case when (validation ->> 'valid')::boolean then 'pending' else 'invalid' end,
    validation, p_user_id, selected_version.id
  ) returning * into new_version;
  perform private.clone_world_revision_asset_pins(selected_version.id, new_version.id);
  perform private.sync_world_version_assets(new_version.id, new_version.manifest);
  if not private.world_manifest_assets_compatible(new_version.id, new_version.manifest) then
    raise exception using errcode = '23514', message = 'WORLD_REVISION_ASSET_BINDING_INVALID';
  end if;
  if not private.world_manifest_rotations_compatible(new_version.id, new_version.manifest) then
    raise exception using errcode = '23514', message = 'WORLD_REVISION_ROTATION_INVALID';
  end if;
  update public.world_draft_heads
  set world_map_version_id = new_version.id,
      updated_by_admin_id = p_user_id,
      updated_at = now()
  where world_map_id = selected_map.id
    and world_map_version_id = selected_version.id;
  if not found then return jsonb_build_object('status', 'version_conflict'); end if;
  insert into public.world_revision_metadata (
    world_map_version_id, world_map_id, parent_revision_id, revision_kind,
    change_summary, created_by_admin_id, request_id
  ) values (
    new_version.id, selected_map.id, selected_version.id, 'draft_saved',
    summary, p_user_id, p_request_id
  );
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome,
    before_state, after_state, metadata
  ) values (
    'world.draft_revision_saved', 'admin', p_user_id, trusted_session,
    selected_map.id, new_version.id, p_request_id, 'success',
    jsonb_build_object(
      'draftHeadVersionId', selected_version.id,
      'checksum', selected_version.checksum
    ),
    jsonb_build_object(
      'draftHeadVersionId', new_version.id,
      'checksum', new_version.checksum
    ),
    jsonb_build_object('changeSummary', summary, 'immutableRevision', true)
  );

  with before_objects as (
    select value ->> 'id' as object_id, value ->> 'assetId' as asset_key
    from jsonb_array_elements(selected_version.manifest -> 'objects') as item(value)
  ), after_objects as (
    select value ->> 'id' as object_id, value ->> 'assetId' as asset_key
    from jsonb_array_elements(new_version.manifest -> 'objects') as item(value)
  ), replacements as (
    select before_object.object_id,
      before_object.asset_key as before_asset_key,
      after_object.asset_key as after_asset_key
    from before_objects as before_object
    join after_objects as after_object using (object_id)
    where before_object.asset_key is distinct from after_object.asset_key
    order by before_object.object_id
  )
  select count(*)::integer,
    min(after_asset_key),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'objectId', bounded.object_id,
            'beforeAssetKey', bounded.before_asset_key,
            'afterAssetKey', bounded.after_asset_key
          ) order by bounded.object_id
        )
        from (
          select * from replacements order by object_id limit 100
        ) as bounded
      ),
      '[]'::jsonb
    )
  into replacement_count, first_replacement_asset_key, replacement_summary
  from replacements;
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
      selected_map.id, new_version.id, p_request_id, 'success',
      jsonb_build_object('manifestChecksum', selected_version.checksum),
      jsonb_build_object('manifestChecksum', new_version.checksum),
      jsonb_build_object(
        'replacementCount', replacement_count,
        'replacements', replacement_summary,
        'truncated', replacement_count > 100,
        'revisionId', new_version.id
      )
    );
  end if;
  return jsonb_build_object(
    'status', 'updated',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(new_version),
    'manifest', new_version.manifest,
    'changeSummary', summary
  );
end;
$$;

create or replace function public.validate_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
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
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  validation jsonb;
  valid boolean;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_validate', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select version.* into selected_version
  from public.world_draft_heads as head
  join public.world_map_versions as version
    on version.id = head.world_map_version_id
   and version.world_map_id = head.world_map_id
  where head.world_map_id = p_world_map_id
    and head.world_map_version_id = p_version_id
    and version.lifecycle_status = 'draft'
  for update of version;
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_version.edit_version <> p_expected_edit_version
     or (
       p_expected_checksum is not null
       and selected_version.checksum <> p_expected_checksum
     ) then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  validation := private.validate_world_manifest(selected_map.id, selected_version.manifest);
  valid := (validation ->> 'valid')::boolean
    and private.world_revision_assets_runtime_ready(selected_version.id);
  if not private.world_revision_assets_runtime_ready(selected_version.id) then
    validation := jsonb_set(
      validation,
      '{errors}',
      coalesce(validation -> 'errors', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'code', 'WORLD_ASSET_RUNTIME_UNAVAILABLE',
          'path', '$.assets',
          'message', 'One or more pinned World Asset versions cannot be delivered safely.',
          'severity', 'error'
        )
      )
    );
    validation := jsonb_set(validation, '{valid}', 'false'::jsonb);
  end if;
  update public.world_map_versions
  set lifecycle_status = case when valid then 'validated' else 'draft' end,
      validation_status = case when valid then 'valid' else 'invalid' end,
      validation_result = validation,
      validated_at = case when valid then now() else null end,
      validated_by_admin_id = case when valid then p_user_id else null end
  where id = selected_version.id
  returning * into selected_version;
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    case when valid then 'world.validation_passed' else 'world.validation_failed' end,
    'admin', p_user_id, trusted_session, selected_map.id, selected_version.id,
    p_request_id, case when valid then 'success' else 'denied' end,
    jsonb_build_object(
      'checksum', selected_version.checksum,
      'errorCount', jsonb_array_length(validation -> 'errors'),
      'immutableRevision', true
    )
  );
  return jsonb_build_object(
    'status', case when valid then 'validated' else 'validation_failed' end,
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'validationResult', validation
  );
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  new_version public.world_map_versions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.valid_world_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_DERIVATION_REASON';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_derive', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  select * into source_version from public.world_map_versions
  where id = p_source_version_id and world_map_id = p_world_map_id;
  if selected_map.id is null or source_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_map.record_version <> p_expected_record_version then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if exists (select 1 from public.world_draft_heads where world_map_id = selected_map.id) then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    validation_status, validation_result, created_by_admin_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1
     from public.world_map_versions where world_map_id = selected_map.id),
    'draft', source_version.manifest, source_version.checksum, 'pending',
    jsonb_build_object(
      'valid', false, 'checkedAt', now(),
      'errors', '[]'::jsonb, 'warnings', '[]'::jsonb
    ),
    p_user_id, source_version.id
  ) returning * into new_version;
  perform private.clone_world_revision_asset_pins(source_version.id, new_version.id);
  insert into public.world_draft_heads (
    world_map_id, world_map_version_id, updated_by_admin_id
  ) values (selected_map.id, new_version.id, p_user_id);
  insert into public.world_revision_metadata (
    world_map_version_id, world_map_id, parent_revision_id, revision_kind,
    change_summary, created_by_admin_id, request_id
  ) values (
    new_version.id, selected_map.id, source_version.id, 'restored',
    private.world_manifest_change_summary(source_version.manifest, new_version.manifest),
    p_user_id, p_request_id
  );
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id,
    outcome, reason, metadata
  ) values (
    'world.version_restored_as_draft', 'admin', p_user_id, trusted_session,
    selected_map.id, new_version.id, p_request_id, 'success', p_reason,
    jsonb_build_object(
      'sourceVersionId', source_version.id,
      'immutableSourcePreserved', true,
      'draftHeadVersionId', new_version.id
    )
  );
  return jsonb_build_object(
    'status', 'created',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(new_version),
    'manifest', new_version.manifest
  );
end;
$$;

create or replace function public.review_admin_world_publication(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_target_version_id uuid,
  p_expected_active_version_id uuid,
  p_operation text,
  p_acknowledged boolean,
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
  selected_map public.world_maps%rowtype;
  current_version public.world_map_versions%rowtype;
  target_version public.world_map_versions%rowtype;
  evidence public.world_game_test_evidence%rowtype;
  existing_review public.world_publication_reviews%rowtype;
  review public.world_publication_reviews%rowtype;
  summary jsonb;
begin
  if p_operation = 'publish' then
    trusted_session := private.assert_verified_admin_permission(
      p_user_id, p_auth_session_id, p_assurance_level, 'maps.publish'
    );
  elsif p_operation = 'rollback' then
    trusted_session := private.assert_verified_admin_permission(
      p_user_id, p_auth_session_id, p_assurance_level, 'maps.rollback'
    );
  else
    raise exception using errcode = '22023', message = 'INVALID_WORLD_PUBLICATION_REVIEW';
  end if;
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if not p_acknowledged then
    return jsonb_build_object('status', 'acknowledgment_required');
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_publish', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into existing_review from public.world_publication_reviews
  where actor_admin_user_id = p_user_id and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'status', 'reviewed',
      'reviewId', existing_review.id,
      'operation', existing_review.operation,
      'targetRevisionId', existing_review.target_revision_id,
      'expectedActiveVersionId', existing_review.expected_active_version_id,
      'changeSummary', existing_review.change_summary,
      'expiresAt', existing_review.expires_at,
      'idempotentReplay', true
    );
  end if;
  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if selected_map.active_published_version_id is distinct from p_expected_active_version_id then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  select * into current_version from public.world_map_versions
  where id = selected_map.active_published_version_id
    and world_map_id = selected_map.id
    and lifecycle_status = 'published';
  select * into target_version from public.world_map_versions
  where id = p_target_version_id and world_map_id = selected_map.id;
  if target_version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if p_operation = 'publish' then
    if target_version.lifecycle_status <> 'validated'
       or not exists (
         select 1 from public.world_draft_heads
         where world_map_id = selected_map.id
           and world_map_version_id = target_version.id
       ) then
      return jsonb_build_object('status', 'state_conflict');
    end if;
    select * into evidence from public.world_game_test_evidence
    where world_map_id = selected_map.id
      and world_map_version_id = target_version.id
      and result = 'passed'
    order by recorded_at desc, id desc
    limit 1;
    if not found then return jsonb_build_object('status', 'test_required'); end if;
  else
    if target_version.lifecycle_status not in ('published', 'superseded')
       or target_version.published_at is null
       or target_version.id = selected_map.active_published_version_id then
      return jsonb_build_object('status', 'state_conflict');
    end if;
    select * into evidence from public.world_game_test_evidence
    where world_map_id = selected_map.id
      and world_map_version_id = target_version.id
    order by recorded_at desc, id desc
    limit 1;
  end if;
  if target_version.validation_status <> 'valid'
     or private.world_manifest_checksum(target_version.manifest) <> target_version.checksum
     or not (private.validate_world_manifest(selected_map.id, target_version.manifest) ->> 'valid')::boolean
     or not private.world_revision_assets_runtime_ready(target_version.id) then
    return jsonb_build_object('status', 'validation_failed');
  end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  summary := private.world_manifest_change_summary(
    current_version.manifest, target_version.manifest
  );
  insert into public.world_publication_reviews (
    world_map_id, target_revision_id, expected_active_version_id, operation,
    change_summary, game_test_evidence_id, actor_admin_user_id,
    admin_session_id, acknowledged_at, expires_at, request_id
  ) values (
    selected_map.id, target_version.id, selected_map.active_published_version_id,
    p_operation, summary, evidence.id, p_user_id, trusted_session,
    now(), now() + interval '15 minutes', p_request_id
  ) returning * into review;
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    case when p_operation = 'publish'
      then 'world.publish_impact_reviewed'
      else 'world.rollback_impact_reviewed' end,
    'admin', p_user_id, trusted_session, selected_map.id, target_version.id,
    p_request_id, 'success', jsonb_build_object(
      'reviewId', review.id,
      'expectedActiveVersionId', review.expected_active_version_id,
      'changeSummary', review.change_summary,
      'gameTestEvidenceId', review.game_test_evidence_id
    )
  );
  return jsonb_build_object(
    'status', 'reviewed',
    'reviewId', review.id,
    'operation', review.operation,
    'targetRevisionId', review.target_revision_id,
    'expectedActiveVersionId', review.expected_active_version_id,
    'changeSummary', review.change_summary,
    'gameTestEvidenceId', review.game_test_evidence_id,
    'expiresAt', review.expires_at
  );
end;
$$;

create or replace function private.world_publication_result(
  p_record public.world_publication_records
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case when p_record.operation = 'publish' then 'published' else 'rolled_back' end,
    'map', private.admin_world_map_json(map),
    'version', private.admin_world_version_json(version),
    'sourceRevisionId', p_record.source_revision_id,
    'previousVersionId', p_record.previous_published_version_id,
    'publicationId', p_record.id,
    'operation', p_record.operation
  )
  from public.world_maps as map
  join public.world_map_versions as version
    on version.id = p_record.published_version_id
   and version.world_map_id = map.id
  where map.id = p_record.world_map_id;
$$;

create or replace function public.publish_admin_world_revision(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_source_version_id uuid,
  p_expected_edit_version integer,
  p_expected_active_version_id uuid,
  p_expected_checksum text,
  p_review_id uuid,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  previous_version public.world_map_versions%rowtype;
  published_version public.world_map_versions%rowtype;
  review public.world_publication_reviews%rowtype;
  evidence public.world_game_test_evidence%rowtype;
  existing_record public.world_publication_records%rowtype;
  publication public.world_publication_records%rowtype;
  validation jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.publish'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if not private.valid_world_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_PUBLICATION_REASON';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_publish', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into existing_record from public.world_publication_records
  where actor_admin_user_id = p_user_id and request_id = p_request_id;
  if found then return private.world_publication_result(existing_record); end if;
  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  select * into source_version from public.world_map_versions
  where id = p_source_version_id
    and world_map_id = p_world_map_id
    and lifecycle_status = 'validated';
  if selected_map.id is null or source_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_map.active_published_version_id is distinct from p_expected_active_version_id
     or source_version.edit_version <> p_expected_edit_version
     or source_version.checksum <> p_expected_checksum
     or not exists (
       select 1 from public.world_draft_heads
       where world_map_id = selected_map.id
         and world_map_version_id = source_version.id
     ) then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  select * into review from public.world_publication_reviews
  where id = p_review_id
    and world_map_id = selected_map.id
    and target_revision_id = source_version.id
    and expected_active_version_id is not distinct from selected_map.active_published_version_id
    and operation = 'publish'
    and actor_admin_user_id = p_user_id
    and admin_session_id = trusted_session
    and acknowledged_at is not null
    and expires_at > now();
  if not found then return jsonb_build_object('status', 'review_required'); end if;
  select * into evidence from public.world_game_test_evidence
  where id = review.game_test_evidence_id
    and world_map_id = selected_map.id
    and world_map_version_id = source_version.id
    and result = 'passed';
  if not found then return jsonb_build_object('status', 'test_required'); end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  validation := private.validate_world_manifest(selected_map.id, source_version.manifest);
  if not (validation ->> 'valid')::boolean
     or private.world_manifest_checksum(source_version.manifest) <> source_version.checksum
     or not private.world_revision_assets_runtime_ready(source_version.id) then
    return jsonb_build_object('status', 'validation_failed');
  end if;
  select * into previous_version from public.world_map_versions
  where id = selected_map.active_published_version_id
    and world_map_id = selected_map.id
    and lifecycle_status = 'published'
  for update;
  perform set_config('starville.world_publication_transition', 'true', true);
  if previous_version.id is not null then
    update public.world_map_versions set lifecycle_status = 'superseded'
    where id = previous_version.id;
  end if;
  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    edit_version, validation_status, validation_result,
    created_by_admin_id, validated_at, validated_by_admin_id,
    published_at, published_by_admin_id, publication_reason,
    supersedes_version_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1
     from public.world_map_versions where world_map_id = selected_map.id),
    'published', source_version.manifest, source_version.checksum,
    source_version.edit_version, 'valid', validation,
    source_version.created_by_admin_id, source_version.validated_at,
    source_version.validated_by_admin_id, now(), p_user_id, p_reason,
    previous_version.id, source_version.id
  ) returning * into published_version;
  perform private.clone_world_revision_asset_pins(source_version.id, published_version.id);
  update public.world_maps
  set active_published_version_id = published_version.id,
      record_version = record_version + 1
  where id = selected_map.id
  returning * into selected_map;
  perform set_config('starville.world_publication_transition', 'false', true);
  delete from public.world_draft_heads
  where world_map_id = selected_map.id
    and world_map_version_id = source_version.id;
  insert into public.world_publication_records (
    world_map_id, source_revision_id, published_version_id,
    previous_published_version_id, operation, actor_admin_user_id,
    admin_session_id, review_id, reason, request_id
  ) values (
    selected_map.id, source_version.id, published_version.id,
    previous_version.id, 'publish', p_user_id, trusted_session,
    review.id, p_reason, p_request_id
  ) returning * into publication;
  insert into public.world_revision_metadata (
    world_map_version_id, world_map_id, parent_revision_id, revision_kind,
    change_summary, created_by_admin_id, request_id
  ) values (
    published_version.id, selected_map.id, source_version.id, 'published',
    review.change_summary, p_user_id, 'publication:' || publication.id::text
  );
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id,
    outcome, reason, before_state, after_state, metadata
  ) values (
    'world.version_published', 'admin', p_user_id, trusted_session,
    selected_map.id, published_version.id, p_request_id, 'success', p_reason,
    jsonb_build_object('activeVersionId', previous_version.id),
    jsonb_build_object('activeVersionId', published_version.id),
    jsonb_build_object(
      'sourceRevisionId', source_version.id,
      'reviewId', review.id,
      'gameTestEvidenceId', evidence.id,
      'changeSummary', review.change_summary,
      'copyOnPublish', true
    )
  );
  return private.world_publication_result(publication);
end;
$$;

create or replace function public.rollback_admin_world_revision(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_target_version_id uuid,
  p_expected_active_version_id uuid,
  p_review_id uuid,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  target_version public.world_map_versions%rowtype;
  previous_version public.world_map_versions%rowtype;
  published_version public.world_map_versions%rowtype;
  review public.world_publication_reviews%rowtype;
  existing_record public.world_publication_records%rowtype;
  publication public.world_publication_records%rowtype;
  validation jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.rollback'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if not private.valid_world_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_ROLLBACK_REASON';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_publish', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into existing_record from public.world_publication_records
  where actor_admin_user_id = p_user_id and request_id = p_request_id;
  if found then return private.world_publication_result(existing_record); end if;
  select * into selected_map from public.world_maps
  where id = p_world_map_id for update;
  select * into target_version from public.world_map_versions
  where id = p_target_version_id
    and world_map_id = p_world_map_id
    and lifecycle_status in ('published', 'superseded')
    and published_at is not null;
  if selected_map.id is null or target_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_map.active_published_version_id is distinct from p_expected_active_version_id
     or target_version.id = selected_map.active_published_version_id then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  select * into review from public.world_publication_reviews
  where id = p_review_id
    and world_map_id = selected_map.id
    and target_revision_id = target_version.id
    and expected_active_version_id is not distinct from selected_map.active_published_version_id
    and operation = 'rollback'
    and actor_admin_user_id = p_user_id
    and admin_session_id = trusted_session
    and acknowledged_at is not null
    and expires_at > now();
  if not found then return jsonb_build_object('status', 'review_required'); end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  validation := private.validate_world_manifest(selected_map.id, target_version.manifest);
  if not (validation ->> 'valid')::boolean
     or private.world_manifest_checksum(target_version.manifest) <> target_version.checksum
     or not private.world_revision_assets_runtime_ready(target_version.id) then
    return jsonb_build_object('status', 'validation_failed');
  end if;
  select * into previous_version from public.world_map_versions
  where id = selected_map.active_published_version_id
    and world_map_id = selected_map.id
    and lifecycle_status = 'published'
  for update;
  perform set_config('starville.world_publication_transition', 'true', true);
  update public.world_map_versions set lifecycle_status = 'superseded'
  where id = previous_version.id;
  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    edit_version, validation_status, validation_result,
    created_by_admin_id, validated_at, validated_by_admin_id,
    published_at, published_by_admin_id, publication_reason,
    supersedes_version_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1
     from public.world_map_versions where world_map_id = selected_map.id),
    'published', target_version.manifest, target_version.checksum,
    target_version.edit_version, 'valid', validation,
    target_version.created_by_admin_id, target_version.validated_at,
    target_version.validated_by_admin_id, now(), p_user_id, p_reason,
    previous_version.id, target_version.id
  ) returning * into published_version;
  perform private.clone_world_revision_asset_pins(target_version.id, published_version.id);
  update public.world_maps
  set active_published_version_id = published_version.id,
      record_version = record_version + 1
  where id = selected_map.id
  returning * into selected_map;
  perform set_config('starville.world_publication_transition', 'false', true);
  insert into public.world_publication_records (
    world_map_id, source_revision_id, published_version_id,
    previous_published_version_id, operation, actor_admin_user_id,
    admin_session_id, review_id, reason, request_id
  ) values (
    selected_map.id, target_version.id, published_version.id,
    previous_version.id, 'rollback', p_user_id, trusted_session,
    review.id, p_reason, p_request_id
  ) returning * into publication;
  insert into public.world_revision_metadata (
    world_map_version_id, world_map_id, parent_revision_id, revision_kind,
    change_summary, created_by_admin_id, request_id
  ) values (
    published_version.id, selected_map.id, target_version.id, 'rollback',
    review.change_summary, p_user_id, 'rollback:' || publication.id::text
  );
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id,
    outcome, reason, before_state, after_state, metadata
  ) values (
    'world.version_rolled_back', 'admin', p_user_id, trusted_session,
    selected_map.id, published_version.id, p_request_id, 'success', p_reason,
    jsonb_build_object('activeVersionId', previous_version.id),
    jsonb_build_object('activeVersionId', published_version.id),
    jsonb_build_object(
      'rollbackSourceVersionId', target_version.id,
      'reviewId', review.id,
      'changeSummary', review.change_summary,
      'copyOnRollback', true
    )
  );
  return private.world_publication_result(publication);
end;
$$;

create or replace function public.preview_admin_world_version(
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  validation jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_preview', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id
    and lifecycle_status in ('validated', 'published', 'superseded')
    and validation_status = 'valid';
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  validation := private.validate_world_manifest(selected_map.id, selected_version.manifest);
  if not (validation ->> 'valid')::boolean
     or not private.world_revision_assets_runtime_ready(selected_version.id) then
    return jsonb_build_object('status', 'validation_failed');
  end if;
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    'world.revision_inspected', 'admin', p_user_id, trusted_session,
    selected_map.id, selected_version.id, p_request_id, 'success',
    jsonb_build_object(
      'checksum', selected_version.checksum,
      'lifecycleStatus', selected_version.lifecycle_status,
      'historical', selected_version.id <> selected_map.active_published_version_id
    )
  );
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest,
    'draftPreview', true
  );
end;
$$;

-- Game Test remains exact-revision and private, but historical published or
-- superseded revisions may now be tested before a rollback review.
create or replace function public.create_admin_world_game_test(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
  p_environment text,
  p_grant_token_hash text,
  p_return_path text,
  p_client_request_id uuid,
  p_request_id text,
  p_rate_limit integer,
  p_ttl_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  trusted_session uuid;
  selected_version public.world_map_versions%rowtype;
  created public.world_game_test_sessions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if p_assurance_level <> 'aal2' then
    return jsonb_build_object('status', 'mfa_required');
  end if;
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_preview', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if private.world_game_test_maintenance_blocked() then
    return jsonb_build_object('status', 'maintenance_blocked');
  end if;
  if p_environment not in ('development', 'test', 'production')
     or p_grant_token_hash is null
     or p_grant_token_hash !~ '^[0-9a-f]{64}$'
     or p_expected_checksum is null
     or p_expected_checksum !~ '^[0-9a-f]{64}$'
     or p_client_request_id is null
     or p_ttl_minutes not between 15 and 30
     or p_return_path is null
     or char_length(p_return_path) not between 1 and 500
     or p_return_path not like '/%'
     or p_return_path like '//%'
     or p_return_path ~ '[\\[:cntrl:]<>]'
     or p_return_path ~ '://' then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_GAME_TEST_INPUT';
  end if;
  select * into selected_version from public.world_map_versions
  where id = p_version_id
    and world_map_id = p_world_map_id
    and lifecycle_status in ('validated', 'published', 'superseded')
    and validation_status = 'valid';
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if selected_version.edit_version <> p_expected_edit_version
     or selected_version.checksum <> p_expected_checksum then
    return jsonb_build_object('status', 'stale_revision');
  end if;
  if not private.world_revision_assets_runtime_ready(selected_version.id) then
    return jsonb_build_object('status', 'revision_unavailable');
  end if;
  if (
    select count(*) from public.world_game_test_sessions
    where administrator_user_id = p_user_id
      and status in ('issued', 'active') and expires_at > now()
  ) >= 5 then
    return jsonb_build_object('status', 'active_limit');
  end if;
  insert into public.world_game_test_sessions (
    administrator_user_id, admin_session_id, world_map_id, world_map_version_id,
    environment, grant_token_hash, return_path, client_request_id, expires_at
  ) values (
    p_user_id, trusted_session, p_world_map_id, p_version_id,
    p_environment, p_grant_token_hash, p_return_path, p_client_request_id,
    now() + make_interval(mins => p_ttl_minutes)
  ) returning * into created;
  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'world.game_test.grant_issued', p_user_id, trusted_session, p_request_id, 'success',
    jsonb_build_object(
      'gameTestSessionId', created.id,
      'worldMapId', created.world_map_id,
      'worldMapVersionId', created.world_map_version_id,
      'environment', created.environment,
      'expiresAt', created.expires_at,
      'historicalRevision', selected_version.lifecycle_status in ('published', 'superseded')
    )
  );
  return jsonb_build_object(
    'status', 'issued',
    'sessionId', created.id,
    'worldMapId', created.world_map_id,
    'worldMapVersionId', created.world_map_version_id,
    'environment', created.environment,
    'expiresAt', created.expires_at,
    'returnPath', created.return_path
  );
exception when unique_violation then
  return jsonb_build_object('status', 'request_conflict');
end;
$$;

-- Retire the pre-10C publication RPC so every API publication must provide an
-- actor-bound review receipt and exact Passed Game Test evidence.
revoke all on function public.publish_admin_world_version(
  uuid, uuid, text, uuid, uuid, integer, uuid, text, text, text, integer
) from public, anon, authenticated, service_role;

revoke all on function private.protect_world_revision_evidence()
  from public, anon, authenticated, service_role;
revoke all on function private.world_manifest_change_summary(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.world_revision_assets_runtime_ready(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.world_manifest_rotations_compatible(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.clone_world_revision_asset_pins(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.world_publication_result(public.world_publication_records)
  from public, anon, authenticated, service_role;

revoke all on function public.get_admin_world_revision(
  uuid, uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.compare_admin_world_revisions(
  uuid, uuid, text, uuid, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.review_admin_world_publication(
  uuid, uuid, text, uuid, uuid, uuid, text, boolean, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.publish_admin_world_revision(
  uuid, uuid, text, uuid, uuid, integer, uuid, text, uuid, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.rollback_admin_world_revision(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_admin_world_revision(
  uuid, uuid, text, uuid, uuid, text, integer
) to service_role;
grant execute on function public.compare_admin_world_revisions(
  uuid, uuid, text, uuid, uuid, uuid, text, integer
) to service_role;
grant execute on function public.review_admin_world_publication(
  uuid, uuid, text, uuid, uuid, uuid, text, boolean, text, integer
) to service_role;
grant execute on function public.publish_admin_world_revision(
  uuid, uuid, text, uuid, uuid, integer, uuid, text, uuid, text, text, integer
) to service_role;
grant execute on function public.rollback_admin_world_revision(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, integer
) to service_role;

-- Existing public RPCs keep their prior narrow service-role grants after their
-- forward replacements above. No table grants are introduced.
