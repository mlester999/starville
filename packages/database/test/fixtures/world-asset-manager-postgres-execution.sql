-- Executes the Phase 7.5A asset authority against the isolated PostgreSQL
-- cluster after every migration has been applied. All fixture writes roll back.

begin;

create or replace function pg_temp.assert_asset_true(
  condition boolean,
  assertion_message text
)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'WORLD_ASSET_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

create or replace function pg_temp.assert_asset_status(
  result jsonb,
  expected_status text,
  assertion_message text
)
returns void
language plpgsql
as $$
begin
  perform pg_temp.assert_asset_true(
    result ->> 'status' = expected_status,
    assertion_message || ' (expected ' || expected_status || ', received '
      || coalesce(result ->> 'status', 'null') || ')'
  );
end;
$$;

do $$
declare
  super_user_id constant uuid := 'a5000000-0000-4000-8000-000000000001';
  super_auth_session_id constant uuid := 'a5000000-0000-4000-8000-000000000002';
  super_admin_session_id constant uuid := 'a5000000-0000-4000-8000-000000000003';
  designer_user_id constant uuid := 'a5000000-0000-4000-8000-000000000011';
  designer_auth_session_id constant uuid := 'a5000000-0000-4000-8000-000000000012';
  designer_admin_session_id constant uuid := 'a5000000-0000-4000-8000-000000000013';
  super_role_id uuid;
  designer_role_id uuid;
begin
  select id into strict super_role_id from public.admin_roles where key = 'super_admin';
  select id into strict designer_role_id from public.admin_roles where key = 'world_designer';

  insert into auth.users (id, email) values
    (super_user_id, 'asset-super@example.invalid'),
    (designer_user_id, 'asset-designer@example.invalid');
  insert into auth.sessions (id, user_id) values
    (super_auth_session_id, super_user_id),
    (designer_auth_session_id, designer_user_id);
  insert into public.admin_users (user_id, role_id, status, display_name, mfa_required) values
    (super_user_id, super_role_id, 'active', 'Asset Super Admin', false),
    (designer_user_id, designer_role_id, 'active', 'Asset Designer', false);
  insert into public.admin_sessions (
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  )
  select super_admin_session_id, super_user_id, super_auth_session_id, 'active',
    now() + interval '1 hour', permission_version, session_version
  from public.admin_users where user_id = super_user_id;
  insert into public.admin_sessions (
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  )
  select designer_admin_session_id, designer_user_id, designer_auth_session_id, 'active',
    now() + interval '1 hour', permission_version, session_version
  from public.admin_users where user_id = designer_user_id;

  -- Exercise the supported custom-role boundary: trusted upload processing is
  -- a continuation of assets.upload, while explicit revalidation is separate.
  delete from public.admin_role_permissions as mapping
  using public.admin_roles as role, public.admin_permissions as permission
  where mapping.role_id = role.id
    and mapping.permission_id = permission.id
    and role.key = 'world_designer'
    and permission.key = 'assets.validate';
  update public.admin_sessions as session
  set permission_version_snapshot = administrator.permission_version
  from public.admin_users as administrator
  where session.user_id = administrator.user_id
    and session.id = designer_admin_session_id;

  perform pg_temp.assert_asset_true(
    not has_table_privilege('anon', 'public.world_asset_versions', 'SELECT')
      and not has_table_privilege('authenticated', 'public.world_asset_versions', 'INSERT')
      and not has_table_privilege('service_role', 'public.world_asset_versions', 'UPDATE'),
    'browser and service roles receive no direct version-table privileges'
  );
  perform pg_temp.assert_asset_true(
    (select relrowsecurity and relforcerowsecurity from pg_class
      where oid = 'public.world_asset_versions'::regclass)
      and (select relrowsecurity and relforcerowsecurity from pg_class
        where oid = 'public.world_asset_audit_events'::regclass),
    'asset state and audit tables enforce RLS'
  );
  perform pg_temp.assert_asset_true(
    (select not public and file_size_limit = 10485760
      and allowed_mime_types = array['image/png', 'image/webp']::text[]
      from storage.buckets where id = 'asset-intake')
      and (select public and file_size_limit = 10485760
        and allowed_mime_types = array['image/webp']::text[]
        from storage.buckets where id = 'game-assets'),
    'private intake and public sanitized delivery buckets use exact bounded configuration'
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.admin_role_permissions mapping
      join public.admin_roles role on role.id = mapping.role_id
      join public.admin_permissions permission on permission.id = mapping.permission_id
      where role.key = 'world_designer' and permission.key = 'assets.upload'
    ) and not exists (
      select 1 from public.admin_role_permissions mapping
      join public.admin_roles role on role.id = mapping.role_id
      join public.admin_permissions permission on permission.id = mapping.permission_id
      where role.key = 'world_designer'
        and permission.key in (
          'assets.validate', 'assets.review', 'assets.approve', 'assets.activate'
        )
    ),
    'an upload-only custom role cannot validate, review, approve, or activate'
  );
  perform pg_temp.assert_asset_true(
    (select count(*) = 4 and bool_and(permissive = 'RESTRICTIVE')
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname like 'starville_asset_%_guard'),
    'restrictive Storage guards protect intake reads and both managed write namespaces'
  );
  perform pg_temp.assert_asset_true(
    not exists (
      select 1 from public.world_assets as asset
      where not private.world_asset_category_allowed(asset.asset_type, asset.category)
    ),
    'every backfilled development marker satisfies the authoritative type/category matrix'
  );
end;
$$;

do $$
declare
  super_user_id constant uuid := 'a5000000-0000-4000-8000-000000000001';
  super_auth_session_id constant uuid := 'a5000000-0000-4000-8000-000000000002';
  super_admin_session_id constant uuid := 'a5000000-0000-4000-8000-000000000003';
  designer_user_id constant uuid := 'a5000000-0000-4000-8000-000000000011';
  designer_auth_session_id constant uuid := 'a5000000-0000-4000-8000-000000000012';
  asset_id uuid;
  version_id uuid;
  upload_id uuid;
  asset_revision integer;
  version_edit_version integer;
  upload_revision integer;
  pre_activation_asset_revision integer;
  pre_activation_edit_version integer;
  archive_asset_id uuid;
  archive_version_id uuid;
  archived_active_asset_id uuid := gen_random_uuid();
  archived_active_version_id uuid := gen_random_uuid();
  version_two_reservation jsonb;
  draft_version public.world_map_versions%rowtype;
  published_manifest_before jsonb;
  replacement_manifest jsonb;
  incompatible_manifest jsonb;
  incompatible_object_index integer;
  accepted_edit_version integer;
  accepted_checksum text;
  result jsonb;
  denied boolean := false;
  unsafe_rejected boolean := false;
  immutable_rejected boolean := false;
  wallet constant text := 'A7777777777777777777777777777777';
begin
  begin
    perform public.create_admin_game_asset_upload(
      designer_user_id, designer_auth_session_id, 'aal2',
      'Oversized Store', 'oversized-store', 'shop', 'shop',
      'phase7-general-store-marker', 'store.png', 'image/png', 5242881,
      'asset-fixture-oversized', 1000
    );
  exception when invalid_parameter_value then
    unsafe_rejected := true;
  end;
  perform pg_temp.assert_asset_true(
    unsafe_rejected,
    'type-specific upload size limits are rechecked in PostgreSQL'
  );

  result := public.create_admin_game_asset_upload(
    designer_user_id, designer_auth_session_id, 'aal2',
    'Upload Failure Fixture', 'upload-failure-fixture', 'decoration', 'nature',
    null, 'failure.png', 'image/png', 1024,
    'asset-fixture-upload-failure', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'created', 'an upload-only role can reserve a trusted intake upload'
  );
  archive_asset_id := (result ->> 'assetId')::uuid;
  archive_version_id := (result ->> 'versionId')::uuid;
  result := public.fail_admin_game_asset_processing(
    designer_user_id, designer_auth_session_id, 'aal2',
    (result ->> 'assetId')::uuid, (result ->> 'versionId')::uuid,
    (result ->> 'uploadId')::uuid, (result ->> 'uploadRevision')::integer,
    'MALFORMED_IMAGE', jsonb_build_object(
      'valid', false, 'checkedAt', '2026-07-13T11:55:00.000Z', 'issues', '[]'::jsonb
    ), 'asset-fixture-upload-failure', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'validation_failed',
    'an upload-only role can record the trusted processing failure'
  );
  perform pg_temp.assert_asset_true(
    (select count(*) = 2 from public.world_asset_audit_events
      where request_id = 'asset-fixture-upload-failure'
        and event_key in ('asset.upload.created', 'asset.processing.failed')),
    'one correlated upload request can append creation and failure audit events'
  );

  result := public.create_admin_game_asset_upload(
    designer_user_id, designer_auth_session_id, 'aal2',
    'Moonlit General Store', 'phase7-general-store-production', 'shop', 'shop',
    'phase7-general-store-marker', 'moonlit-store.png', 'image/png', 2048,
    'asset-fixture-upload', 1000
  );
  perform pg_temp.assert_asset_status(result, 'created', 'a production replacement upload is reserved');
  asset_id := (result ->> 'assetId')::uuid;
  version_id := (result ->> 'versionId')::uuid;
  upload_id := (result ->> 'uploadId')::uuid;
  asset_revision := (result ->> 'assetRevision')::integer;
  version_edit_version := (result ->> 'versionEditVersion')::integer;
  upload_revision := (result ->> 'uploadRevision')::integer;
  perform pg_temp.assert_asset_true(
    result ->> 'intakePath' = 'starville/' || asset_id::text || '/'
      || upload_id::text || '/original.png',
    'original filenames cannot influence the private storage namespace'
  );

  result := public.create_admin_game_asset_upload(
    designer_user_id, designer_auth_session_id, 'aal2',
    'Moonlit General Store', 'phase7-general-store-production', 'shop', 'shop',
    'phase7-general-store-marker', 'changed-store.webp', 'image/webp', 4096,
    'asset-fixture-upload', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'state_conflict',
    'a reused upload request cannot change its target or binary reservation fingerprint'
  );
  result := public.create_admin_game_asset_upload(
    designer_user_id, designer_auth_session_id, 'aal2',
    'Moonlit General Store', 'phase7-general-store-production', 'shop', 'shop',
    'phase7-general-store-marker', 'moonlit-store.png', 'image/png', 2048,
    'asset-fixture-upload', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'replayed'
      and (result ->> 'assetId')::uuid = asset_id
      and (result ->> 'versionId')::uuid = version_id
      and (result ->> 'uploadId')::uuid = upload_id,
    'an exact upload reservation retry returns the original bounded reservation'
  );

  result := public.complete_admin_game_asset_processing(
    designer_user_id, designer_auth_session_id, 'aal2',
    asset_id, version_id, upload_id, upload_revision,
    repeat('a', 64), repeat('b', 64), 'image/png',
    1024, 1024, 2048,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/source.webp',
    1024, 1024, 4096,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/preview.webp',
    768, 768, 2048,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/thumbnail.webp',
    256, 256, 1024,
    'partial',
    jsonb_build_object(
      'valid', true,
      'checkedAt', '2026-07-13T12:00:00.000Z',
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'IMAGE_PROCESSING_VALID', 'level', 'passed', 'path', 'source',
        'message', 'The normalized image and derivatives passed validation.'
      ))
    ),
    'asset-fixture-upload', 1000
  );
  perform pg_temp.assert_asset_status(result, 'validated', 'trusted processing validates the upload');
  perform pg_temp.assert_asset_true(
    (select count(*) = 2 from public.world_asset_audit_events
      where request_id = 'asset-fixture-upload'
        and event_key in ('asset.upload.created', 'asset.processing.validated')),
    'one correlated upload request can append creation and completion audit events'
  );
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.complete_admin_game_asset_processing(
    designer_user_id, designer_auth_session_id, 'aal2',
    asset_id, version_id, upload_id, upload_revision,
    repeat('a', 64), repeat('b', 64), 'image/png',
    1024, 1024, 2048,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/source.webp',
    1024, 1024, 4096,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/preview.webp',
    768, 768, 2048,
    'starville/' || asset_id::text || '/' || version_id::text || '/processed/thumbnail.webp',
    256, 256, 1024,
    'partial',
    jsonb_build_object(
      'valid', true,
      'checkedAt', '2026-07-13T12:00:00.000Z',
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'IMAGE_PROCESSING_VALID', 'level', 'passed', 'path', 'source',
        'message', 'The normalized image and derivatives passed validation.'
      ))
    ),
    'asset-fixture-upload', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'replayed', 'a lost successful processing response is safely replayed'
  );

  result := public.update_admin_game_asset_version_draft(
    super_user_id, super_auth_session_id, 'aal2',
    asset_id, version_id, version_edit_version,
    'Moonlit General Store', 'shop', array['phase7', 'shop']::text[],
    'Production replacement for the procedural general-store marker.',
    512, 512, 1, 0.5, 1, 0.5, 1, 0.5, 1,
    '{"shape":"rectangle","blocking":true,"offsetX":0,"offsetY":0,"width":2,"height":1}'::jsonb,
    array[0, 90, 180, 270]::smallint[], 0::smallint, array['shop']::text[],
    'asset-fixture-edit-one', 1000
  );
  perform pg_temp.assert_asset_status(result, 'updated', 'bounded draft metadata is saved');
  asset_revision := (result #>> '{asset,recordVersion}')::integer;
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.validate_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'asset-fixture-validate-one', 1000
  );
  perform pg_temp.assert_asset_status(result, 'validated', 'file and configuration validation passes');
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.submit_admin_game_asset_review(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'Submit the validated production store for human review.',
    'asset-fixture-submit-one', 1000
  );
  perform pg_temp.assert_asset_status(result, 'submitted', 'a validated version enters review');
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.list_admin_game_asset_review_queue(
    super_user_id, super_auth_session_id, 'aal2', 1, 100, 'Moonlit',
    'shop', 'shop', 'production_candidate', 'friendly_name', 'asc',
    'asset-fixture-review-queue', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'loaded' and jsonb_array_length(result -> 'items') = 1,
    'review queue filtering returns the submitted production version'
  );

  begin
    perform public.review_admin_game_asset_version(
      designer_user_id, designer_auth_session_id, 'aal2', asset_id, version_id,
      version_edit_version, 'approve', 'A designer must not approve their uploaded asset.',
      'asset-fixture-denied-approval', 1000
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert_asset_true(denied, 'an uploader without review authority cannot approve');

  result := public.review_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'request_changes',
    'Align the foot anchor before this asset can be approved.',
    'asset-fixture-request-changes', 1000
  );
  perform pg_temp.assert_asset_status(result, 'changes_requested', 'review can request changes');
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.update_admin_game_asset_version_draft(
    super_user_id, super_auth_session_id, 'aal2',
    asset_id, version_id, version_edit_version,
    'Moonlit General Store', 'shop', array['phase7', 'shop']::text[],
    'Adjusted foot anchor for the production general-store replacement.',
    512, 512, 1, 0.5, 1, 0.5, 0.96, 0.5, 1,
    '{"shape":"rectangle","blocking":true,"offsetX":0,"offsetY":0,"width":2,"height":1}'::jsonb,
    array[0, 90, 180, 270]::smallint[], 0::smallint, array['shop']::text[],
    'asset-fixture-edit-two', 1000
  );
  perform pg_temp.assert_asset_status(result, 'updated', 'requested changes return to a draft');
  asset_revision := (result #>> '{asset,recordVersion}')::integer;
  version_edit_version := (result #>> '{version,editVersion}')::integer;

  result := public.validate_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'asset-fixture-validate-two', 1000
  );
  version_edit_version := (result #>> '{version,editVersion}')::integer;
  result := public.submit_admin_game_asset_review(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'Resubmit the corrected production store for human review.',
    'asset-fixture-submit-two', 1000
  );
  version_edit_version := (result #>> '{version,editVersion}')::integer;
  result := public.review_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    version_edit_version, 'approve',
    'Approve the validated and corrected production store version.',
    'asset-fixture-approve', 1000
  );
  perform pg_temp.assert_asset_status(result, 'approved', 'authorized approval is separate from review');
  version_edit_version := (result #>> '{version,editVersion}')::integer;
  pre_activation_asset_revision := asset_revision;
  pre_activation_edit_version := version_edit_version;

  result := public.get_admin_game_asset_activation_material(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    pre_activation_asset_revision - 1, pre_activation_edit_version,
    'asset-fixture-stale-activation-material', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'asset_version_conflict',
    'stale approved activation preflight is rejected before storage side effects'
  );
  result := public.get_admin_game_asset_activation_material(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    pre_activation_asset_revision, pre_activation_edit_version,
    'asset-fixture-activate', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'loaded', 'exact approved activation material is available before immutable copy'
  );

  denied := false;
  begin
    perform public.activate_admin_game_asset_version(
      designer_user_id, designer_auth_session_id, 'aal2', asset_id, version_id,
      asset_revision, version_edit_version,
      'starville/phase7-general-store-production/v1/source.webp',
      'starville/phase7-general-store-production/v1/preview.webp',
      'starville/phase7-general-store-production/v1/thumbnail.webp',
      'A designer must not activate an approved production asset.',
      'asset-fixture-denied-activation', 1000
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  perform pg_temp.assert_asset_true(denied, 'an uploader without activation authority is denied');

  result := public.activate_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    asset_revision, version_edit_version,
    'starville/phase7-general-store-production/v1/source.webp',
    'starville/phase7-general-store-production/v1/preview.webp',
    'starville/phase7-general-store-production/v1/thumbnail.webp',
    'Activate the reviewed immutable production store version.',
    'asset-fixture-activate', 1000
  );
  perform pg_temp.assert_asset_status(result, 'activated', 'authorized activation exposes immutable delivery');
  asset_revision := (result #>> '{asset,recordVersion}')::integer;

  result := public.get_admin_game_asset_activation_material(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    pre_activation_asset_revision, pre_activation_edit_version,
    'asset-fixture-activate', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'loaded', 'only the exact active request remains available for immutable storage replay'
  );
  result := public.get_admin_game_asset_activation_material(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    pre_activation_asset_revision, pre_activation_edit_version,
    'asset-fixture-unrelated-active-material', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'not_found', 'an unrelated request cannot preflight an already-active immutable version'
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_asset_audit_events as event
      where event.request_id = 'asset-fixture-activate'
        and event.event_key = 'asset.version.activated'
        and (event.before_state ->> 'assetRevision')::integer = pre_activation_asset_revision
        and event.before_state -> 'activeVersionId' = 'null'::jsonb
        and (event.after_state ->> 'assetRevision')::integer = asset_revision
    ),
    'activation audit retains the true pre-activation asset state'
  );
  result := public.activate_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    pre_activation_asset_revision, pre_activation_edit_version,
    'starville/phase7-general-store-production/v1/source.webp',
    'starville/phase7-general-store-production/v1/preview.webp',
    'starville/phase7-general-store-production/v1/thumbnail.webp',
    'Activate the reviewed immutable production store version.',
    'asset-fixture-activate', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'replayed', 'a lost successful activation response is safely replayed'
  );

  result := public.list_admin_world_editor_asset_candidates(
    super_user_id, super_auth_session_id, 'aal2', 1, 100, '',
    'all', 'all', 'all', 'asset-fixture-candidates', 1000
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from jsonb_array_elements(result -> 'items') item
      where item #>> '{asset,assetKey}' = 'phase7-general-store-production'
        and item #>> '{version,lifecycleStatus}' = 'active'
    ) and exists (
      select 1 from jsonb_array_elements(result -> 'items') item
      where item #>> '{asset,assetKey}' = 'phase7-general-store-marker'
        and item #>> '{version,sourceKind}' = 'repository_procedural'
    ),
    'the editor candidate authority includes active production and explicit development markers'
  );

  result := public.create_player_profile(
    wallet, 'Asset Delivery', 'moss', 'asset-fixture-player', 30
  );
  perform pg_temp.assert_asset_status(result, 'loaded', 'player fixture is created');
  result := public.get_current_published_world(wallet, 'asset-fixture-world', 600);
  perform pg_temp.assert_asset_true(
    jsonb_array_length(result -> 'assetDeliveries') = jsonb_array_length(result #> '{manifest,assets}')
      and exists (
        select 1 from jsonb_array_elements(result -> 'assetDeliveries') delivery
        where delivery ->> 'assetKey' = 'cottage-amber'
          and (delivery ->> 'developmentMarker')::boolean
          and delivery ->> 'fallback' = 'repository_procedural'
          and delivery -> 'delivery' = 'null'::jsonb
      ),
    format(
      'published worlds return one pinned safe delivery descriptor per manifest asset (deliveries=%s, assets=%s, payload=%s)',
      coalesce(jsonb_array_length(result -> 'assetDeliveries')::text, 'null'),
      coalesce(jsonb_array_length(result #> '{manifest,assets}')::text, 'null'),
      coalesce((result -> 'assetDeliveries')::text, 'null')
    )
  );

  select * into strict draft_version from public.world_map_versions
  where id = '79000000-0000-4000-8000-000000000001';
  select published.manifest into strict published_manifest_before
  from public.world_maps as map
  join public.world_map_versions as published on published.id = map.active_published_version_id
  where map.id = draft_version.world_map_id;
  replacement_manifest := replace(
    draft_version.manifest::text,
    'phase7-general-store-marker',
    'phase7-general-store-production'
  )::jsonb;
  result := public.save_admin_world_draft(
    super_user_id, super_auth_session_id, 'aal2', draft_version.world_map_id,
    draft_version.id, draft_version.edit_version, draft_version.checksum,
    replacement_manifest, 'asset-fixture-world-replacement', 1000
  );
  perform pg_temp.assert_asset_status(result, 'updated', 'a draft explicitly replaces the visual key');
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_map_version_assets reference
      where reference.world_map_version_id = draft_version.id
        and reference.world_asset_id = asset_id
        and reference.world_asset_version_id = version_id
    ) and not exists (
      select 1 from public.world_map_version_assets reference
      join public.world_assets marker on marker.id = reference.world_asset_id
      where reference.world_map_version_id = draft_version.id
        and marker.asset_key = 'phase7-general-store-marker'
    ) and exists (
      select 1 from public.world_map_versions published
      where published.world_map_id = draft_version.world_map_id
        and published.lifecycle_status = 'published'
        and published.manifest = published_manifest_before
        and not published.manifest -> 'assets' ? 'phase7-general-store-production'
    ),
    'draft replacement pins the production version without mutating published history'
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_asset_audit_events as event
      where event.request_id = 'asset-fixture-world-replacement'
        and event.event_key = 'asset.world.replacement_performed'
        and event.permission_key = 'maps.edit'
        and event.target_world_map_id = draft_version.world_map_id
        and event.target_world_map_version_id = draft_version.id
        and event.target_world_asset_id = asset_id
        and event.metadata #>> '{replacements,0,beforeAssetKey}' = 'phase7-general-store-marker'
        and event.metadata #>> '{replacements,0,afterAssetKey}' = 'phase7-general-store-production'
    ),
    'world replacement audit is derived from the accepted before and after manifests'
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_asset_audit_events as event
      where event.request_id = 'asset-fixture-world-replacement'
        and event.event_key = 'asset.world.replacement_performed'
        and event.before_state ->> 'manifestChecksum' = draft_version.checksum
        and event.after_state ->> 'manifestChecksum' = result #>> '{version,checksum}'
    ),
    'replacement audit preserves the exact pre-save manifest checksum'
  );

  accepted_edit_version := (result #>> '{version,editVersion}')::integer;
  accepted_checksum := result #>> '{version,checksum}';
  select ordinality::integer - 1 into strict incompatible_object_index
  from jsonb_array_elements(replacement_manifest -> 'objects') with ordinality as object(value, ordinality)
  where object.value ->> 'id' = 'phase7-general-store-object';
  incompatible_manifest := jsonb_set(
    replacement_manifest,
    array['objects', incompatible_object_index::text, 'kind'],
    '"cooking_station"'::jsonb
  );
  result := public.save_admin_world_draft(
    super_user_id, super_auth_session_id, 'aal2', draft_version.world_map_id,
    draft_version.id, accepted_edit_version, accepted_checksum,
    incompatible_manifest, 'asset-fixture-world-incompatible', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'state_conflict',
    'server-side asset compatibility rejects an object kind that does not match its managed asset'
  );
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_map_versions as version
      where version.id = draft_version.id
        and version.edit_version = accepted_edit_version
        and version.checksum = accepted_checksum
        and version.manifest = replacement_manifest
    ) and not exists (
      select 1 from public.world_asset_audit_events
      where request_id = 'asset-fixture-world-incompatible'
    ),
    'an incompatible replacement fails without mutating the draft or appending success audit'
  );

  update public.cozy_item_definitions
  set asset_ref = 'phase7-general-store-production', asset_readiness = 'approved'
  where slug = 'willow-timber';
  perform pg_temp.assert_asset_true(
    exists (
      select 1 from public.world_asset_references as reference
      where reference.world_asset_id = asset_id
        and reference.world_asset_version_id = version_id
        and reference.reference_type = 'item_definition'
        and reference.reference_key = 'willow-timber'
        and reference.reference_lifecycle = 'active'
    ),
    'trusted Phase 7 item art references synchronize to the exact active managed version'
  );

  result := public.deprecate_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'Deprecate the production store while retaining immutable draft references.',
    'asset-fixture-deprecate', 1000
  );
  perform pg_temp.assert_asset_status(result, 'deprecated', 'active assets can be safely deprecated');
  asset_revision := (result #>> '{asset,recordVersion}')::integer;

  result := public.archive_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'Attempt archival while a versioned world draft still pins this asset.',
    'asset-fixture-archive-blocked', 1000
  );
  perform pg_temp.assert_asset_status(result, 'referenced', 'referenced asset archival is blocked');

  delete from public.world_map_version_assets
  where world_map_version_id = draft_version.id and world_asset_id = asset_id;
  result := public.archive_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'Attempt archival while active item content still pins this asset.',
    'asset-fixture-archive-content-blocked', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'referenced',
    'active content reference synchronization independently prevents archival'
  );

  perform set_config('starville.asset_lifecycle_transition', 'false', true);
  begin
    update public.world_asset_versions set render_width = 640 where id = version_id;
  exception when insufficient_privilege then
    immutable_rejected := true;
  end;
  perform pg_temp.assert_asset_true(
    immutable_rejected,
    'approved, active, and deprecated version metadata remains immutable'
  );

  result := public.create_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'Create version two instead of overwriting the immutable first version.',
    'moonlit-store-v2.png', 'image/png', 2048,
    'asset-fixture-version-two', 1000
  );
  perform pg_temp.assert_asset_status(result, 'created', 'editing immutable art creates version N plus one');
  version_two_reservation := result;
  perform pg_temp.assert_asset_true(
    (select foot_anchor_x = 0.5 and foot_anchor_y = 0.96
      from public.world_asset_versions where id = (result ->> 'versionId')::uuid),
    'a new draft carries forward reviewed render anchors'
  );

  result := public.create_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'A changed reason must not reuse the original version reservation.',
    'changed-store-v2.webp', 'image/webp', 4096,
    'asset-fixture-version-two', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'state_conflict',
    'a reused version-upload request cannot change target, reason, or binary fingerprint'
  );
  result := public.create_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, asset_revision,
    'Create version two instead of overwriting the immutable first version.',
    'moonlit-store-v2.png', 'image/png', 2048,
    'asset-fixture-version-two', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'replayed'
      and (result - 'status') = (version_two_reservation - 'status'),
    'an exact version-upload retry returns the original bounded reservation'
  );

  unsafe_rejected := false;
  begin
    perform public.complete_admin_game_asset_processing(
      super_user_id, super_auth_session_id, 'aal2', asset_id,
      (result ->> 'versionId')::uuid, (result ->> 'uploadId')::uuid,
      (result ->> 'uploadRevision')::integer,
      repeat('a', 64), repeat('c', 64), 'image/png', 1024, 1024, 2048,
      'starville/injected/processed/source.webp', 1024, 1024, 4096,
      'starville/injected/processed/preview.webp', 768, 768, 2048,
      'starville/injected/processed/thumbnail.webp', 256, 256, 1024,
      'partial', jsonb_build_object(
        'valid', true, 'checkedAt', '2026-07-13T12:30:00.000Z',
        'issues', jsonb_build_array(jsonb_build_object(
          'code', 'IMAGE_PROCESSING_VALID', 'level', 'passed', 'path', 'source',
          'message', 'The image passed processing validation.'
        ))
      ), 'asset-fixture-version-two', 1000
    );
  exception when invalid_parameter_value then
    unsafe_rejected := true;
  end;
  perform pg_temp.assert_asset_true(unsafe_rejected, 'processed storage paths cannot be injected');

  result := public.complete_admin_game_asset_processing(
    super_user_id, super_auth_session_id, 'aal2', asset_id,
    (result ->> 'versionId')::uuid, (result ->> 'uploadId')::uuid,
    (result ->> 'uploadRevision')::integer,
    repeat('a', 64), repeat('c', 64), 'image/png', 1024, 1024, 2048,
    'starville/' || asset_id::text || '/' || (result ->> 'versionId') || '/processed/source.webp',
    1024, 1024, 4096,
    'starville/' || asset_id::text || '/' || (result ->> 'versionId') || '/processed/preview.webp',
    768, 768, 2048,
    'starville/' || asset_id::text || '/' || (result ->> 'versionId') || '/processed/thumbnail.webp',
    256, 256, 1024,
    'partial', jsonb_build_object(
      'valid', true, 'checkedAt', '2026-07-13T12:30:00.000Z',
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'IMAGE_PROCESSING_VALID', 'level', 'passed', 'path', 'source',
        'message', 'The image passed processing validation.'
      ))
    ), 'asset-fixture-version-two', 1000
  );
  perform pg_temp.assert_asset_status(
    result, 'validation_failed', 'duplicate original content is rejected without exposing another asset'
  );

  result := public.get_admin_game_asset_preview_material(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    'asset-fixture-preview-material', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'loaded'
      and result ->> 'originalPath' = 'starville/' || asset_id::text || '/'
        || upload_id::text || '/original.png',
    'administrator preview material exposes only the exact private original path for the bound upload'
  );

  result := public.archive_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', archive_asset_id, 1,
    'Archive the unreferenced failed upload fixture after review.',
    'asset-fixture-archive-success', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'archived'
      and result #>> '{asset,lifecycleStatus}' = 'archived'
      and result -> 'version' = 'null'::jsonb
      and (select lifecycle_status = 'archived'
        from public.world_asset_versions where id = archive_version_id),
    'a truly unreferenced non-active asset archives with an explicit null active version'
  );

  insert into public.world_assets (
    id, asset_key, content_hash, storage_path, source_type, media_type,
    approval_status, repository_owned, game_key, friendly_name, asset_type,
    category, lifecycle_status, production_status, created_by_admin_id,
    approved_by_admin_id, approved_at
  ) values (
    archived_active_asset_id, 'archive-response-fixture', repeat('e', 64),
    'repository/procedural/archive-response-fixture', 'repository_procedural',
    'application/x-starville-procedural', 'approved', true, 'starville',
    'Archive Response Fixture', 'decoration', 'nature', 'draft', 'development_marker',
    super_user_id, super_user_id, now()
  );
  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    checksum_sha256, detected_mime_type, render_width, render_height,
    automated_validation_status, interaction_compatibility, created_by_admin_id
  ) values (
    archived_active_version_id, archived_active_asset_id, 1, 'deprecated',
    'repository_procedural', repeat('e', 64),
    'application/x-starville-procedural', 128, 128, 'valid',
    array['decorative']::text[], super_user_id
  );
  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  update public.world_assets
  set active_version_id = archived_active_version_id,
      lifecycle_status = 'deprecated', production_status = 'deprecated'
  where id = archived_active_asset_id;
  result := public.archive_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', archived_active_asset_id, 1,
    'Archive a deprecated unreferenced fixture and return its final version state.',
    'asset-fixture-archive-active-success', 1000
  );
  perform pg_temp.assert_asset_true(
    result ->> 'status' = 'archived'
      and result #>> '{version,id}' = archived_active_version_id::text
      and result #>> '{version,lifecycleStatus}' = 'archived',
    'archive response re-reads an active deprecated version after its archived transition'
  );

  insert into public.world_asset_versions (
    world_asset_id, version_number, lifecycle_status, source_kind,
    created_by_admin_id
  )
  select asset_id, generated.version_number, 'draft', 'storage_raster', super_user_id
  from generate_series(3, 105) as generated(version_number);
  insert into public.world_asset_validation_checks (
    world_asset_version_id, validation_run_id, check_code, level, message, created_at
  )
  select version_id, gen_random_uuid(),
    'BOUND_' || lpad(generated.ordinal::text, 3, '0'), 'passed',
    'Bounded validation evidence ' || generated.ordinal::text || '.',
    clock_timestamp() + generated.ordinal * interval '1 millisecond'
  from generate_series(1, 105) as generated(ordinal);
  insert into public.world_asset_reviews (
    world_asset_id, world_asset_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id, created_at
  )
  select asset_id, version_id, 'approved', super_user_id, super_admin_session_id,
    'Bounded review evidence ' || generated.ordinal::text || '.',
    'asset-bound-review-' || generated.ordinal::text,
    clock_timestamp() + generated.ordinal * interval '1 millisecond'
  from generate_series(1, 105) as generated(ordinal);

  result := public.get_admin_game_asset_version(
    super_user_id, super_auth_session_id, 'aal2', asset_id, version_id,
    'asset-fixture-bounded-version-detail', 1000
  );
  perform pg_temp.assert_asset_true(
    jsonb_array_length(result -> 'validationResults') = 100
      and jsonb_array_length(result -> 'reviews') = 100
      and result #>> '{validationResults,0,code}' = 'BOUND_105'
      and result #>> '{reviews,0,reason}' = 'Bounded review evidence 105.',
    'version detail bounds validation and review aggregates to deterministic newest-first pages'
  );
  result := public.get_admin_game_asset(
    super_user_id, super_auth_session_id, 'aal2', asset_id,
    'asset-fixture-bounded-asset-detail', 1000
  );
  perform pg_temp.assert_asset_true(
    jsonb_array_length(result -> 'versions') = 100
      and (result #>> '{versions,0,versionNumber}')::integer = 105,
    'asset detail bounds immutable version history to the deterministic latest 100 rows'
  );

  perform pg_temp.assert_asset_true(
    (select count(*) >= 11 from public.world_asset_audit_events where target_world_asset_id = asset_id)
      and not exists (
        select 1 from public.world_asset_audit_events
        where before_state::text ~* '(binary|service.role|storage.secret)'
          or after_state::text ~* '(binary|service.role|storage.secret)'
      ),
    'the lifecycle writes bounded append-only audit events without binary or credential material'
  );
end;
$$;

do $$
declare
  notice_asset_id uuid;
  notice_version_one_id uuid;
  notice_version_two_id uuid := gen_random_uuid();
  lantern_version_id uuid;
  moonpetal_version_id uuid;
  moonpetal_manifest jsonb;
  candidate_manifest jsonb;
begin
  select asset.id, asset.active_version_id
    into strict notice_asset_id, notice_version_one_id
  from public.world_assets as asset where asset.asset_key = 'notice-board';
  select map.active_published_version_id into strict lantern_version_id
  from public.world_maps as map where map.slug = 'lantern-square';
  select map.active_published_version_id, version.manifest
    into strict moonpetal_version_id, moonpetal_manifest
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = 'moonpetal-meadow';

  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  update public.world_asset_versions
  set lifecycle_status = 'deprecated'
  where id = notice_version_one_id;
  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    checksum_sha256, detected_mime_type, render_width, render_height,
    automated_validation_status, interaction_compatibility
  )
  select notice_version_two_id, notice_asset_id, 2, 'active',
    'repository_procedural', repeat('d', 64),
    'application/x-starville-procedural', 128, 128, 'valid',
    array['decorative']::text[];
  update public.world_assets
  set active_version_id = notice_version_two_id, record_version = record_version + 1
  where id = notice_asset_id;

  perform pg_temp.assert_asset_true(
    private.world_manifest_assets_compatible(
      lantern_version_id,
      (select manifest from public.world_map_versions where id = lantern_version_id)
    ),
    'compatibility validation uses the retained N pin after N plus one becomes active'
  );

  candidate_manifest := jsonb_set(
    jsonb_set(
      moonpetal_manifest,
      '{assets}',
      (moonpetal_manifest -> 'assets') || jsonb_build_array('notice-board')
    ),
    '{objects}',
    (moonpetal_manifest -> 'objects') || jsonb_build_array(jsonb_build_object(
      'id', 'new-notice-board', 'assetId', 'notice-board', 'kind', 'sign',
      'x', 13.5, 'y', 8.9, 'scale', 1
    ))
  );
  perform pg_temp.assert_asset_true(
    not private.world_manifest_assets_compatible(moonpetal_version_id, candidate_manifest),
    'newly introduced keys validate against active N plus one compatibility metadata'
  );
end;
$$;

select 'world-asset-manager postgres execution assertions passed' as result;

rollback;
