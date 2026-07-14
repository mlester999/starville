begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(60);

select has_table('public', 'world_asset_versions', 'asset versions exist');
select has_table('public', 'world_asset_uploads', 'private upload reservations exist');
select has_table('public', 'world_asset_processing_jobs', 'processing jobs exist');
select has_table('public', 'world_asset_tags', 'asset tags exist');
select has_table('public', 'world_asset_version_tags', 'version tag mappings exist');
select has_table('public', 'world_asset_validation_checks', 'validation evidence exists');
select has_table('public', 'world_asset_reviews', 'review history exists');
select has_table('public', 'world_asset_references', 'content references exist');
select has_table('public', 'world_asset_audit_events', 'asset audit history exists');
select has_table('public', 'world_asset_operation_idempotency', 'idempotency records exist');
select has_table('public', 'world_asset_operation_rate_limits', 'durable rate limits exist');

select has_column(
  'public', 'world_map_version_assets', 'world_asset_version_id',
  'world manifests pin immutable asset-version identifiers'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'world_asset_versions', 'world_asset_uploads', 'world_asset_processing_jobs',
      'world_asset_tags', 'world_asset_version_tags', 'world_asset_validation_checks',
      'world_asset_reviews', 'world_asset_references', 'world_asset_audit_events',
      'world_asset_operation_idempotency', 'world_asset_operation_rate_limits'
    ]) as expected(table_name)
    left join pg_class relation
      on relation.relname = expected.table_name
     and relation.relnamespace = 'public'::regnamespace
    where relation.oid is null
       or not relation.relrowsecurity
       or not relation.relforcerowsecurity
  ),
  'every new asset table has forced RLS'
);

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.world_assets'::regclass)
  and (select relrowsecurity and relforcerowsecurity
       from pg_class where oid = 'public.world_map_version_assets'::regclass),
  'evolved catalog and map pivots also have forced RLS'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public' and tablename like 'world_asset%'),
  0,
  'asset tables expose no direct RLS policy surface'
);

select ok(
  not has_table_privilege('anon', 'public.world_asset_versions', 'SELECT')
  and not has_table_privilege('anon', 'public.world_asset_versions', 'INSERT')
  and not has_table_privilege('anon', 'public.world_asset_audit_events', 'SELECT'),
  'anonymous clients have no direct asset-table privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.world_asset_versions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.world_asset_uploads', 'INSERT')
  and not has_table_privilege('authenticated', 'public.world_asset_audit_events', 'SELECT'),
  'authenticated clients have no direct asset-table privileges'
);

select ok(
  not has_table_privilege('service_role', 'public.world_asset_versions', 'SELECT')
  and not has_table_privilege('service_role', 'public.world_asset_versions', 'UPDATE')
  and not has_table_privilege('service_role', 'public.world_asset_audit_events', 'INSERT'),
  'service role is constrained to narrow RPC execution'
);

select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.world_asset_validation_checks'::regclass
    and tgname = 'world_asset_validation_checks_append_only' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'public.world_asset_reviews'::regclass
    and tgname = 'world_asset_reviews_append_only' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid = 'public.world_asset_audit_events'::regclass
    and tgname = 'world_asset_audit_events_append_only' and not tgisinternal),
  'validation, review, and audit evidence is append-only'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.world_asset_versions'::regclass
      and tgname = 'world_asset_versions_protect_history'
      and not tgisinternal
  ),
  'reviewed asset versions have an immutability guard'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_asset_audit_events'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%request_id, event_key%'
  )
  and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_asset_audit_events'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (request_id)'
  ),
  'correlated requests may append multiple uniquely keyed audit events'
);

select is(
  (select count(*)::integer from public.admin_permissions
   where key in (
     'assets.edit', 'assets.validate', 'assets.review', 'assets.approve',
     'assets.activate', 'assets.deprecate', 'assets.audit.read'
   ) and is_system),
  7,
  'the full asset lifecycle permission catalog is seeded'
);

select ok(
  (select pg_get_functiondef(function.oid) like '%assets.audit.read%'
     and pg_get_functiondef(function.oid) not like '%assets.audit_read%'
   from pg_proc as function
   where function.pronamespace = 'public'::regnamespace
     and function.proname = 'list_admin_game_asset_audit'),
  'asset audit RPC checks only the corrected read permission'
);

select is(
  (select count(*)::integer
   from public.admin_role_permissions mapping
   join public.admin_roles role on role.id = mapping.role_id
   join public.admin_permissions permission on permission.id = mapping.permission_id
   where role.key = 'super_admin'
     and permission.key like 'assets.%'),
  10,
  'Super Admin retains every asset permission'
);

select is(
  (select count(*)::integer
   from public.admin_role_permissions mapping
   join public.admin_roles role on role.id = mapping.role_id
   join public.admin_permissions permission on permission.id = mapping.permission_id
   where role.key = 'world_designer'
     and permission.key in ('assets.review', 'assets.approve', 'assets.activate')),
  0,
  'World Designer cannot review, approve, or activate assets'
);

select ok(
  exists (
    select 1
    from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'world_designer' and permission.key = 'assets.upload'
  ),
  'World Designer can submit bounded asset uploads'
);

select is(
  (select count(*)::integer
   from pg_proc function
   where function.pronamespace = 'public'::regnamespace
     and function.proname in (
       'list_admin_game_assets', 'get_admin_game_asset', 'get_admin_game_asset_version',
       'list_admin_game_asset_review_queue', 'list_admin_game_asset_audit',
       'list_admin_game_asset_references', 'create_admin_game_asset_upload',
       'create_admin_game_asset_version', 'complete_admin_game_asset_processing',
       'fail_admin_game_asset_processing', 'get_admin_game_asset_preview_material',
       'get_admin_game_asset_activation_material', 'update_admin_game_asset_version_draft',
       'validate_admin_game_asset_version', 'submit_admin_game_asset_review',
       'review_admin_game_asset_version', 'activate_admin_game_asset_version',
       'deprecate_admin_game_asset', 'archive_admin_game_asset',
       'list_admin_world_editor_asset_candidates'
     )),
  20,
  'the reviewed asset RPC surface exists exactly once per operation'
);

select ok(
  not exists (
    select 1 from pg_proc function
    where function.pronamespace = 'public'::regnamespace
      and function.proname like '%admin%asset%'
      and function.proname in (
        'list_admin_game_assets', 'get_admin_game_asset', 'get_admin_game_asset_version',
        'list_admin_game_asset_review_queue', 'list_admin_game_asset_audit',
        'list_admin_game_asset_references', 'create_admin_game_asset_upload',
        'create_admin_game_asset_version', 'complete_admin_game_asset_processing',
        'fail_admin_game_asset_processing', 'get_admin_game_asset_preview_material',
        'get_admin_game_asset_activation_material', 'update_admin_game_asset_version_draft',
        'validate_admin_game_asset_version', 'submit_admin_game_asset_review',
        'review_admin_game_asset_version', 'activate_admin_game_asset_version',
        'deprecate_admin_game_asset', 'archive_admin_game_asset',
        'list_admin_world_editor_asset_candidates'
      )
      and not has_function_privilege('service_role', function.oid, 'EXECUTE')
  ),
  'service role can execute every reviewed administrator asset RPC'
);

select ok(
  not exists (
    select 1 from pg_proc function
    where function.pronamespace = 'public'::regnamespace
      and function.proname like '%admin%asset%'
      and has_function_privilege('anon', function.oid, 'EXECUTE')
  ),
  'anonymous clients cannot execute administrator asset RPCs'
);

select ok(
  not exists (
    select 1 from pg_proc function
    where function.pronamespace = 'public'::regnamespace
      and function.proname like '%admin%asset%'
      and has_function_privilege('authenticated', function.oid, 'EXECUTE')
  ),
  'authenticated clients cannot execute administrator asset RPCs directly'
);

select ok(
  not exists (
    select 1 from pg_proc function
    where function.pronamespace = 'private'::regnamespace
      and function.proname in (
        'world_asset_json', 'world_asset_version_json', 'world_asset_replay',
        'store_world_asset_replay', 'world_asset_deliveries_for_version'
      )
      and has_function_privilege('service_role', function.oid, 'EXECUTE')
  ),
  'private asset helpers remain closed to the service role'
);

select ok(
  exists (
    select 1 from pg_proc function
    where function.pronamespace = 'private'::regnamespace
      and function.proname = 'phase6_save_admin_world_draft'
      and not has_function_privilege('service_role', function.oid, 'EXECUTE')
  ),
  'the reviewed Phase 6 draft implementation is callable only through its public wrapper'
);

select ok(
  (select not public and file_size_limit = 10485760
    and allowed_mime_types = array['image/png', 'image/webp']::text[]
   from storage.buckets where id = 'asset-intake'),
  'asset intake is private and bounded to reviewed raster media'
);

select ok(
  (select public and file_size_limit = 10485760
    and allowed_mime_types = array['image/webp']::text[]
   from storage.buckets where id = 'game-assets'),
  'sanitized immutable delivery is a bounded public WebP bucket'
);

select is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'starville_asset_%_guard'
     and permissive = 'RESTRICTIVE'),
  4,
  'four restrictive namespace guards survive unrelated permissive policies'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'starville_asset_intake_read_guard'
      and cmd = 'SELECT' and qual like '%asset-intake%'
  ),
  'private intake metadata is denied to browser roles'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in (
       'starville_asset_bucket_insert_guard',
       'starville_asset_bucket_update_guard',
       'starville_asset_bucket_delete_guard'
     )
     and coalesce(qual, with_check, '') like '%asset-intake%'
     and coalesce(with_check, qual, '') like '%game-assets%'),
  3,
  'browser writes are denied in both managed storage namespaces'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd = 'SELECT' and coalesce(qual, '') like '%game-assets%'),
  0,
  'no restrictive policy blocks public game-assets delivery reads'
);

select ok(
  exists (
    select 1 from public.world_assets asset
    join public.world_asset_versions version on version.id = asset.active_version_id
    where asset.production_status = 'development_marker'
      and asset.repository_owned
      and version.source_kind = 'repository_procedural'
      and version.lifecycle_status = 'active'
  ),
  'explicit procedural development markers remain truthful editor candidates'
);

select ok(
  not exists (
    select 1 from public.world_asset_versions
    where source_kind = 'repository_procedural'
      and (processed_source_path is not null
        or processed_preview_path is not null
        or processed_thumbnail_path is not null)
  ),
  'procedural markers never claim uploaded delivery derivatives'
);

select ok(
  not exists (
    select 1 from public.world_map_version_assets
    where world_asset_version_id is null
  ),
  'every world reference pins a concrete immutable asset version'
);

select ok(
  exists (
    select 1 from pg_proc function
    where function.pronamespace = 'public'::regnamespace
      and function.proname = 'save_admin_world_draft'
      and pg_get_functiondef(function.oid) like '%asset.world.replacement_performed%'
      and pg_get_functiondef(function.oid) like '%before_object.asset_key is distinct from after_object.asset_key%'
  ),
  'draft saves derive replacement audit from trusted before and after manifests'
);

select ok(
  (select count(*) from pg_proc function
   where function.pronamespace = 'public'::regnamespace
     and function.proname in (
       'get_current_published_world', 'get_published_world_manifest',
       'transition_player_world'
     )
     and pg_get_functiondef(function.oid) like '%assetDeliveries%') = 3,
  'all player world boundaries append safe asset-delivery descriptors'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_asset_audit_events'::regclass
      and pg_get_constraintdef(oid) like '%maps.edit%'
  ),
  'replacement audit records the exact maps.edit authority'
);

select ok(
  (select count(*) from pg_constraint
   where conrelid = 'public.world_asset_audit_events'::regclass
     and pg_get_constraintdef(oid) like '%pg_column_size%65536%') >= 3,
  'asset audit before, after, and metadata payloads are size bounded'
);

select ok(
  not exists (
    select 1 from public.world_assets as asset
    where not private.world_asset_category_allowed(asset.asset_type, asset.category)
  ),
  'every backfilled marker satisfies the authoritative type/category matrix'
);

select ok(
  not exists (
    select 1
    from public.world_assets as asset
    join public.world_asset_versions as version on version.id = asset.active_version_id
    where case asset.asset_type
      when 'shop' then not 'shop' = any(version.interaction_compatibility)
      when 'cooking_station' then not 'cooking_station' = any(version.interaction_compatibility)
      when 'crafting_station' then not 'crafting_station' = any(version.interaction_compatibility)
      when 'home_entrance' then not 'home_entrance' = any(version.interaction_compatibility)
      when 'farm_plot' then not 'farm_plot' = any(version.interaction_compatibility)
      when 'sign' then not 'sign' = any(version.interaction_compatibility)
      else false
    end
  ),
  'backfilled interactive versions advertise their actual interaction compatibility'
);

select ok(
  exists (
    select 1 from pg_proc as function
    where function.pronamespace = 'public'::regnamespace
      and function.proname = 'get_admin_game_asset_activation_material'
      and function.pronargs = 9
      and function.proargnames @> array[
        'p_expected_asset_revision', 'p_expected_edit_version'
      ]::text[]
  ),
  'activation material requires both optimistic-concurrency revisions'
);

select ok(
  (select pg_get_functiondef(oid) like '%limit 100%'
   from pg_proc where pronamespace = 'public'::regnamespace
     and proname = 'get_admin_game_asset')
  and (select pg_get_functiondef(oid) like '%limit 100%'
       from pg_proc where pronamespace = 'public'::regnamespace
         and proname = 'get_admin_game_asset_version'),
  'asset and version detail aggregates are capped at 100 rows in deterministic subqueries'
);

select ok(
  (select count(*) = 3 from pg_proc as function
   where function.pronamespace = 'private'::regnamespace
     and function.proname in (
       'phase6_create_admin_world_draft', 'phase6_derive_admin_world_version',
       'phase6_save_admin_world_draft'
     )
     and not has_function_privilege('service_role', function.oid, 'EXECUTE')),
  'Phase 6 draft mutations are callable only through the pin-preserving public wrappers'
);

select ok(
  not exists (
    select 1
    from public.world_map_versions as target
    join public.world_map_versions as source on source.id = target.derived_from_version_id
    where target.lifecycle_status in ('draft', 'validated')
      and target.manifest = source.manifest
      and (
        exists (
          (select world_asset_id, world_asset_version_id
           from public.world_map_version_assets where world_map_version_id = source.id)
          except
          (select world_asset_id, world_asset_version_id
           from public.world_map_version_assets where world_map_version_id = target.id)
        )
        or exists (
          (select world_asset_id, world_asset_version_id
           from public.world_map_version_assets where world_map_version_id = target.id)
          except
          (select world_asset_id, world_asset_version_id
           from public.world_map_version_assets where world_map_version_id = source.id)
        )
      )
  ),
  'unchanged existing derived drafts carry every exact source asset-version pin'
);

select ok(
  (select count(*) = 3 from information_schema.columns
   where table_schema = 'public' and column_name = 'asset_ref'
     and table_name in (
       'cozy_item_definitions', 'cozy_crop_definitions', 'cozy_furniture_definitions'
     ))
  and (select count(*) = 4 from pg_trigger
       where tgname in (
         'cozy_item_definitions_sync_world_asset_reference',
         'cozy_crop_definitions_sync_world_asset_reference',
         'cozy_furniture_definitions_sync_world_asset_reference',
         'world_assets_sync_content_references'
       ) and not tgisinternal),
  'every concrete Phase 7 asset_ref source and active-version change has a synchronization trigger'
);

select ok(
  exists (
    select 1 from pg_proc as function
    where function.pronamespace = 'private'::regnamespace
      and function.proname = 'world_manifest_assets_compatible'
      and function.pronargs = 2
      and pg_get_functiondef(function.oid) like
        '%coalesce(retained.world_asset_version_id, asset.active_version_id)%'
  ),
  'compatibility checks prefer a retained draft pin and use active discovery only for new keys'
);

select ok(
  exists (
    select 1 from pg_proc as function
    where function.pronamespace = 'public'::regnamespace
      and function.proname = 'get_admin_game_asset_preview_material'
      and pg_get_functiondef(function.oid) like '%originalPath%'
      and pg_get_functiondef(function.oid) like '%upload.world_asset_version_id = p_version_id%'
      and pg_get_functiondef(function.oid) like '%order by upload.created_at desc, upload.id desc%'
  ),
  'administrator original previews resolve only the latest upload bound to the exact asset version'
);

select ok(
  (select count(*) = 11
     and bool_and(
       position(
         'private.assert_valid_request_id(p_request_id)'
         in pg_get_functiondef(function.oid)
       ) > 0
     )
   from pg_proc as function
   where function.pronamespace = 'public'::regnamespace
     and function.proname = any (array[
       'get_admin_game_asset_version',
       'list_admin_game_asset_review_queue',
       'get_admin_world_draft',
       'list_admin_world_audit',
       'list_admin_world_assets',
       'list_admin_game_assets',
       'get_admin_game_asset',
       'list_admin_game_asset_audit',
       'list_admin_game_asset_references',
       'get_admin_game_asset_preview_material',
       'list_admin_world_editor_asset_candidates'
     ])),
  'all eleven retained administrator read RPCs validate their request ID without overloads'
);

select ok(
  (select prosecdef and provolatile = 'i'
   from pg_proc
   where oid = 'private.assert_valid_request_id(text)'::regprocedure)
  and not has_function_privilege(
    'anon', 'private.assert_valid_request_id(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'private.assert_valid_request_id(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'private.assert_valid_request_id(text)', 'EXECUTE'
  ),
  'request-ID validation remains private, immutable, and unavailable to client roles'
);

select lives_ok(
  $$ select private.assert_valid_request_id('asset:valid-request_1.2') $$,
  'the canonical request-ID alphabet and bound accept a valid correlation ID'
);

select throws_ok(
  $$ select private.assert_valid_request_id(null) $$,
  '22023',
  'INVALID_REQUEST_ID',
  'a missing request ID is rejected consistently'
);

select ok(
  (select provolatile = 'i'
   from pg_proc
   where oid = 'private.valid_world_asset_validation_results(jsonb)'::regprocedure)
  and private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2026-07-14T01:02:03Z","issues":[]}'::jsonb
  )
  and private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2024-02-29T23:59:59+14:00","issues":[]}'::jsonb
  )
  and not private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2026-02-30T01:02:03Z","issues":[]}'::jsonb
  )
  and not private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2025-02-29T01:02:03Z","issues":[]}'::jsonb
  )
  and not private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2026-07-14T01:02:03+14:01","issues":[]}'::jsonb
  )
  and not private.valid_world_asset_validation_results('{}'::jsonb)
  and not private.valid_world_asset_validation_results(
    '{"valid":true,"checkedAt":"2026-07-14T01:02:03Z","issues":{}}'::jsonb
  )
  and position(
    'pg_column_size'
    in pg_get_functiondef(
      'private.valid_world_asset_validation_results(jsonb)'::regprocedure
    )
  ) = 0
  and position(
    'octet_length(p_value::text)'
    in pg_get_functiondef(
      'private.valid_world_asset_validation_results(jsonb)'::regprocedure
    )
  ) > 0,
  'validation-result checks use immutable sizing and enforce dates and bounded offsets'
);

select ok(
  position(
    'state public.player_inventory_state'
    in pg_get_functiondef(
      'private.cozy_remove_item(uuid,uuid,integer,text,text,text,text)'::regprocedure
    )
  ) = 0
  and position(
    'stack public.player_inventory_stacks'
    in pg_get_functiondef(
      'private.cozy_furniture_mutation(text,text,uuid,uuid,uuid,text,integer,integer,integer,integer,integer,text,text)'::regprocedure
    )
  ) = 0
  and position(
    'profile public.player_profiles'
    in pg_get_functiondef(
      'private.phase6_get_published_world_manifest(text,text,text,integer)'::regprocedure
    )
  ) = 0,
  'the three obsolete row variables are absent from deployed routine definitions'
);

select * from finish();
rollback;
