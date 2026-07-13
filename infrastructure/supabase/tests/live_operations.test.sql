begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(24);

select has_table('public', 'live_operations_maintenance', 'maintenance singleton exists');
select has_table('public', 'game_announcements', 'announcement records exist');
select has_table('public', 'live_operations_audit_logs', 'live-operations audit exists');
select is((select count(*)::integer from public.live_operations_maintenance), 1, 'exactly one maintenance configuration exists');

select ok((select relrowsecurity from pg_class where oid='public.live_operations_maintenance'::regclass), 'maintenance has RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.live_operations_maintenance'::regclass), 'maintenance forces RLS');
select ok((select relrowsecurity from pg_class where oid='public.game_announcements'::regclass), 'announcements have RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.game_announcements'::regclass), 'announcements force RLS');
select ok((select relrowsecurity from pg_class where oid='public.live_operations_audit_logs'::regclass), 'audit has RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.live_operations_audit_logs'::regclass), 'audit forces RLS');

select ok(not has_table_privilege('anon','public.live_operations_maintenance','SELECT'), 'anon cannot read maintenance table');
select ok(not has_table_privilege('authenticated','public.game_announcements','SELECT'), 'users cannot enumerate announcements');
select ok(not has_table_privilege('service_role','public.live_operations_audit_logs','SELECT'), 'service role cannot bypass audit RPC');
select ok(not has_table_privilege('service_role','public.game_announcements','UPDATE'), 'service role cannot directly mutate announcements');

select ok(has_function_privilege('service_role','public.get_public_live_operations()','EXECUTE'), 'service role can load public snapshot');
select ok(not has_function_privilege('anon','public.get_public_live_operations()','EXECUTE'), 'anon cannot call public snapshot RPC directly');
select ok(not has_function_privilege('authenticated','public.get_public_live_operations()','EXECUTE'), 'authenticated cannot call snapshot RPC directly');
select ok(has_function_privilege('service_role','public.update_admin_maintenance(uuid,uuid,text,jsonb,text)','EXECUTE'), 'service role can call maintenance RPC');
select ok(not has_function_privilege('authenticated','public.update_admin_maintenance(uuid,uuid,text,jsonb,text)','EXECUTE'), 'users cannot call maintenance RPC');
select ok(has_function_privilege('service_role','public.save_admin_announcement(uuid,uuid,text,jsonb,text)','EXECUTE'), 'service role can call announcement RPC');

select ok(exists(select 1 from public.admin_permissions where key='live_operations.manage' and is_sensitive), 'maintenance manage permission exists');
select ok(exists(select 1 from public.admin_permissions where key='announcements.manage' and is_sensitive), 'announcement manage permission exists');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='read_only_analyst' and permission.key in ('live_operations.manage','announcements.manage')), 'read-only role has no mutation permission');
select ok(exists(select 1 from pg_trigger where tgrelid='public.live_operations_audit_logs'::regclass and tgname='live_operations_audit_immutable' and not tgisinternal), 'audit immutability trigger exists');

rollback;
