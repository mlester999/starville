begin;

create or replace function pg_temp.phase13b_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'PHASE13B_SECURITY_ASSERTION_FAILED: %', p_message;
  end if;
end;
$$;

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ),
  'every Starville public table must enable and force RLS; findings=' || coalesce((
    select pg_catalog.string_agg(
      pg_catalog.format('%I(rls=%s,force=%s)', relation.relname, relation.relrowsecurity, relation.relforcerowsecurity),
      ',' order by relation.relname
    )
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ), 'none')
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prosecdef
      and not coalesce(procedure.proconfig, '{}'::text[]) @> array['search_path=""']
  ),
  'every Starville SECURITY DEFINER function must use the established empty search_path'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
  ),
  'PUBLIC must not execute Starville public or private functions; findings=' || coalesce((
    select pg_catalog.string_agg(procedure.oid::pg_catalog.regprocedure::text, ',' order by procedure.oid::pg_catalog.regprocedure::text)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
  ), 'none')
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from information_schema.role_table_grants as privilege
    where privilege.table_schema = 'public'
      and privilege.grantee in ('PUBLIC', 'anon', 'service_role')
  ),
  'PUBLIC, anon, and service_role must not hold direct Starville table grants'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from information_schema.role_table_grants as privilege
    where privilege.table_schema = 'public'
      and privilege.grantee = 'authenticated'
      and (
        privilege.privilege_type <> 'SELECT'
        or privilege.table_name not in (
          'admin_roles',
          'admin_permissions',
          'admin_role_permissions',
          'admin_users',
          'admin_sessions',
          'admin_audit_logs'
        )
      )
  ),
  'authenticated table access must remain read-only and limited to protected admin catalog tables'
);

select pg_temp.phase13b_assert(
  (
    select count(*) = 6
    from information_schema.role_table_grants as privilege
    where privilege.table_schema = 'public'
      and privilege.grantee = 'authenticated'
      and privilege.privilege_type = 'SELECT'
  ),
  'the authenticated direct-table allowlist must contain exactly six protected admin reads'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and pg_catalog.pg_get_userbyid(procedure.proowner) not in ('postgres', 'supabase_admin')
  ),
  'Starville functions must retain a trusted database owner'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private')
      and relation.relkind in ('r', 'p', 'v', 'm', 'S')
      and pg_catalog.pg_get_userbyid(relation.relowner) not in ('postgres', 'supabase_admin')
  ),
  'Starville relations and sequences must retain a trusted database owner'
);

select pg_temp.phase13b_assert(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.confirm_realtime_social_trade(uuid,uuid,integer,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.review_admin_economy_correction(uuid,uuid,text,uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated browsers must not call economy, trade, or correction settlement RPCs directly'
);

select pg_temp.phase13b_assert(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.get_player_experience_workspace(text,bigint,integer,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.reconcile_phase12a_player_experience(integer,text)',
    'EXECUTE'
  ),
  'the narrow Player Experience API and worker RPCs must remain executable by service_role'
);

select pg_temp.phase13b_assert(
  (select count(*) = 12 from public.admin_roles where is_system)
  and (select count(*) = 186 from public.admin_permissions where is_system),
  'the trusted administrator role and permission catalog must be exact'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst'
      and permission.key !~ '\.(read|inspect)$'
  ),
  'Read-only Analyst must not receive a mutation permission; findings=' || coalesce((
    select pg_catalog.string_agg(permission.key, ',' order by permission.key)
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst'
      and permission.key !~ '\.(read|inspect)$'
  ), 'none')
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'customer_support'
      and permission.key in (
        'economy.adjust_stardust',
        'economy.correction.review',
        'economy.settings.edit',
        'economy.settings.publish'
      )
  ),
  'Customer Support must not approve or directly apply economy changes'
);

select pg_temp.phase13b_assert(
  not exists (
    select 1
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where (role.key = 'moderator' and permission.key in ('maps.publish', 'assets.activate'))
       or (role.key = 'live_operations_manager' and permission.key = 'roles.manage')
       or (role.key = 'blockchain_operator' and permission.key in ('inventories.read', 'player_audit.read'))
       or (role.key = 'game_administrator' and permission.key = 'roles.manage')
  ),
  'specialist administrator roles must not cross their high-risk boundaries'
);

select pg_temp.phase13b_assert(
  (select count(*) > 0 from pg_catalog.pg_trigger where not tgisinternal)
  and (select count(*) > 0 from pg_catalog.pg_policies where schemaname = 'public'),
  'the applied schema must retain triggers and explicit policies'
);

select 'PHASE13B_SECURITY_INVENTORY|' || pg_catalog.json_build_object(
  'schemas', (
    select count(*)
    from pg_catalog.pg_namespace
    where nspname in ('public', 'private', 'auth', 'storage')
  ),
  'tables', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private') and relation.relkind in ('r', 'p')
  ),
  'views', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private') and relation.relkind = 'v'
  ),
  'materializedViews', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private') and relation.relkind = 'm'
  ),
  'functions', (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private') and procedure.prokind = 'f'
  ),
  'procedures', (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private') and procedure.prokind = 'p'
  ),
  'securityDefinerFunctions', (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private') and procedure.prosecdef
  ),
  'triggers', (select count(*) from pg_catalog.pg_trigger where not tgisinternal),
  'policies', (select count(*) from pg_catalog.pg_policies where schemaname = 'public'),
  'sequences', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'private') and relation.relkind = 'S'
  ),
  'forcedRlsTables', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  'authenticatedTableGrants', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
  ),
  'serviceRoleTableGrants', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'service_role'
  ),
  'publicFunctionExecuteFindings', (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('public', procedure.oid, 'EXECUTE')
  ),
  'realtimePublicationRelations', (
    select count(*)
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
  ),
  'storageBuckets', (select count(*) from storage.buckets)
)::text;

rollback;
