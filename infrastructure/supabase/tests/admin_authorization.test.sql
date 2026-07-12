begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(38);

create temporary table expected_phase6_admin_permissions (
  key text primary key
) on commit drop;

insert into expected_phase6_admin_permissions (key)
values
  ('overview.read'),
  ('players.read'),
  ('players.suspend'),
  ('players.ban'),
  ('players.manage_sessions'),
  ('wallets.read'),
  ('wallets.force_reverify'),
  ('inventories.read'),
  ('inventories.adjust'),
  ('items.read'),
  ('items.create'),
  ('items.update'),
  ('items.publish'),
  ('maps.read'),
  ('maps.edit'),
  ('maps.preview'),
  ('maps.publish'),
  ('maps.audit_read'),
  ('assets.read'),
  ('assets.upload'),
  ('assets.publish'),
  ('economy.read'),
  ('economy.adjust_stardust'),
  ('economy.configure_rewards'),
  ('rewards.read'),
  ('rewards.simulate'),
  ('rewards.approve'),
  ('claims.read'),
  ('claims.open'),
  ('claims.pause'),
  ('claims.reconcile'),
  ('blockchain.read'),
  ('blockchain.configure'),
  ('token_gate.read'),
  ('token_gate.configure'),
  ('moderation.read'),
  ('moderation.act'),
  ('roles.read'),
  ('roles.manage'),
  ('audit_logs.read'),
  ('system_settings.read'),
  ('system_settings.manage'),
  ('operations.read'),
  ('players.reset_position'),
  ('players.require_rename'),
  ('player_audit.read');

select has_table('public', 'admin_roles', 'admin_roles exists');
select has_table('public', 'admin_permissions', 'admin_permissions exists');
select has_table('public', 'admin_role_permissions', 'admin_role_permissions exists');
select has_table('public', 'admin_users', 'admin_users exists');
select has_table('public', 'admin_sessions', 'admin_sessions exists');
select has_table('public', 'admin_audit_logs', 'admin_audit_logs exists');

select is(
  (select count(*)::integer from public.admin_roles where is_system),
  12,
  'exactly twelve system roles are seeded'
);
select is(
  (select count(*)::integer from public.admin_permissions where is_system),
  (select count(*)::integer from expected_phase6_admin_permissions),
  'the system-permission count matches the explicit Phase 1-6 catalog'
);
select is(
  (
    select count(*)::integer from expected_phase6_admin_permissions as expected
    where not exists (
      select 1 from public.admin_permissions as permission
      where permission.key = expected.key and permission.is_system
    )
  ),
  0,
  'every explicit Phase 1-6 permission key is seeded as system metadata'
);
select is(
  (
    select count(*)::integer from public.admin_permissions as permission
    where permission.is_system
      and not exists (
        select 1 from expected_phase6_admin_permissions as expected
        where expected.key = permission.key
      )
  ),
  0,
  'the system catalog contains no unexpected permission key'
);
select is(
  (select count(distinct key)::integer from public.admin_permissions where is_system),
  (select count(*)::integer from expected_phase6_admin_permissions),
  'the explicit system permission catalog contains no duplicate key'
);
select is(
  (
    select count(*)::integer from expected_phase6_admin_permissions as expected
    where not exists (
      select 1
      from public.admin_role_permissions as mapping
      join public.admin_roles as role on role.id = mapping.role_id
      join public.admin_permissions as permission on permission.id = mapping.permission_id
      where role.key = 'super_admin' and permission.key = expected.key
    )
  ),
  0,
  'Super Admin receives every explicit Phase 1-6 permission'
);
select is(
  (
    select count(*)::integer
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'super_admin' and permission.is_system
  ),
  (select count(*)::integer from expected_phase6_admin_permissions),
  'Super Admin has exactly one mapping for each seeded system permission'
);
select is(
  (
    select count(*)::integer
    from public.admin_role_permissions as mapping
    join public.admin_roles as role on role.id = mapping.role_id
    join public.admin_permissions as permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst' and permission.key not like '%.read'
  ),
  0,
  'Read-only Analyst has no write permission'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_roles'::regclass),
  'admin_roles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_permissions'::regclass),
  'admin_permissions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_role_permissions'::regclass),
  'admin_role_permissions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass),
  'admin_users has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_sessions'::regclass),
  'admin_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_audit_logs'::regclass),
  'admin_audit_logs has RLS enabled'
);

select has_trigger(
  'public',
  'admin_users',
  'admin_users_protect_last_super_admin',
  'admin_users protects the final active Super Admin below the API layer'
);
select ok(
  position(
    'pg_advisory_xact_lock' in
    pg_get_functiondef('private.protect_last_active_super_admin()'::regprocedure)
  ) > 0,
  'final-Super-Admin protection serializes competing changes with an advisory transaction lock'
);
select has_trigger(
  'auth',
  'users',
  'starville_admin_password_changed',
  'authoritative Auth password changes invalidate trusted administrator sessions'
);

select ok(not has_table_privilege('anon', 'public.admin_users', 'SELECT'), 'anon cannot read administrators');
select ok(not has_table_privilege('anon', 'public.admin_sessions', 'INSERT'), 'anon cannot create sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'INSERT'), 'users cannot create administrators');
select ok(not has_table_privilege('authenticated', 'public.admin_roles', 'UPDATE'), 'users cannot change roles');
select ok(not has_table_privilege('authenticated', 'public.admin_permissions', 'UPDATE'), 'users cannot change permissions');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'INSERT'), 'users cannot create fake sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'INSERT'), 'users cannot create audit events');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'DELETE'), 'users cannot delete audit logs');

insert into public.admin_audit_logs (event_key, outcome)
values ('admin.test.created', 'success');

select throws_ok(
  $$update public.admin_audit_logs set outcome = 'error' where event_key = 'admin.test.created'$$,
  'P0001',
  'Administrator audit logs are append-only',
  'audit logs reject UPDATE below the API layer'
);
select throws_ok(
  $$delete from public.admin_audit_logs where event_key = 'admin.test.created'$$,
  'P0001',
  'Administrator audit logs are append-only',
  'audit logs reject DELETE below the API layer'
);
select throws_ok(
  $$delete from public.admin_roles where key = 'super_admin'$$,
  'P0001',
  'System authorization metadata cannot be deleted',
  'the system Super Admin role cannot be deleted'
);
select throws_ok(
  $$delete from public.admin_role_permissions where role_id = (select id from public.admin_roles where key = 'super_admin')$$,
  'P0001',
  'Super Admin system permissions cannot be removed or reassigned',
  'Super Admin permission mappings cannot be removed'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.bootstrap_first_super_admin(uuid,text,boolean,boolean,text,text,text)',
    'EXECUTE'
  ),
  'authenticated users cannot execute bootstrap'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_admin_session(uuid,uuid,timestamp with time zone,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute trusted session creation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.preview_first_super_admin_bootstrap(uuid,boolean,boolean,text,text)',
    'EXECUTE'
  ),
  'authenticated users cannot inspect bootstrap state'
);

select * from finish();
rollback;
