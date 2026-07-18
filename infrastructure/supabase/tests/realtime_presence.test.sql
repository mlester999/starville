begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(28);
select has_table('public', 'realtime_channels', 'durable channel definitions exist');
select has_table('public', 'realtime_connection_tickets', 'one-use admission tickets exist');
select has_table('public', 'realtime_sessions', 'bounded realtime lifecycle sessions exist');
select has_table('public', 'realtime_connection_audit', 'append-only connection summaries exist');
select has_column('public', 'player_profiles', 'public_presence_id', 'safe public presence identity exists');
select has_column('public', 'player_profiles', 'public_level', 'safe public level exists');
select has_function('public', 'issue_player_realtime_ticket', 'trusted ticket issuer exists');
select has_function('public', 'admit_player_realtime_ticket', 'one-use admission authority exists');
select has_function('public', 'checkpoint_realtime_session', 'bounded checkpoint authority exists');
select has_function('public', 'switch_realtime_channel', 'server-controlled channel switching exists');
select has_function('public', 'revalidate_realtime_session', 'revocation reconciliation exists');
select has_function('public', 'close_realtime_session', 'safe disconnect finalization exists');
select has_function('public', 'get_admin_realtime_overview', 'read-only multiplayer operations visibility exists');
select is((select count(*)::integer from public.admin_permissions where key = 'realtime.read'), 1, 'one narrow read permission is seeded');
select is((select count(*)::integer from public.admin_permissions where key like 'realtime.%' and key not like '%.read'), 0, 'realtime permission catalog contains no mutation permission');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'read_only_analyst' and permission.key = 'realtime.read'), 1, 'Read-only Analyst receives safe visibility');
select is((select count(*)::integer from public.realtime_channels channel join public.world_maps map on map.id = channel.world_map_id where map.status = 'active'), (select count(*)::integer * 3 from public.world_maps where status = 'active'), 'three initial channels are seeded for every active world');
select ok((select bool_and(capacity = 40) from public.realtime_channels), 'initial channel capacity is forty');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.realtime_channels'::regclass), 'channels force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.realtime_connection_tickets'::regclass), 'tickets force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.realtime_sessions'::regclass), 'sessions force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.realtime_connection_audit'::regclass), 'audit forces RLS');
select ok(not has_table_privilege('anon', 'public.realtime_sessions', 'select') and not has_table_privilege('authenticated', 'public.realtime_sessions', 'insert') and not has_table_privilege('service_role', 'public.realtime_sessions', 'update'), 'no browser or service direct session-table access exists');
select ok(not has_table_privilege('anon', 'public.realtime_connection_tickets', 'select') and not has_table_privilege('service_role', 'public.realtime_connection_tickets', 'insert'), 'ticket hashes are RPC-only');
select ok(not has_function_privilege('anon', 'public.issue_player_realtime_ticket(text,text,uuid,text)', 'execute') and has_function_privilege('service_role', 'public.issue_player_realtime_ticket(text,text,uuid,text)', 'execute'), 'only service role may issue tickets');
select ok(not has_function_privilege('authenticated', 'public.admit_player_realtime_ticket(text,text,text)', 'execute') and has_function_privilege('service_role', 'public.admit_player_realtime_ticket(text,text,text)', 'execute'), 'only realtime service may admit tickets');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('realtime_sessions','realtime_connection_audit') and column_name in ('wallet_address','email','token_balance','ip_address','administrator_status')), 'durable visibility tables exclude private presence fields');
select is((select count(*)::integer from public.realtime_connection_audit), 0, 'migration seeds no fake connection activity');

select * from finish();
rollback;
