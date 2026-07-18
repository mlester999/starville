begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(50);

select has_table('public', 'multiplayer_chat_settings', 'bounded chat settings exist');
select has_table('public', 'multiplayer_chat_messages', 'durable recent messages exist');
select has_table('public', 'multiplayer_chat_player_preferences', 'player safety preferences exist');
select has_table('public', 'multiplayer_chat_reports', 'protected reports exist');
select has_table('public', 'multiplayer_chat_mutes', 'server-enforced chat mutes exist');
select has_table('public', 'multiplayer_chat_moderation_actions', 'append-only actions exist');
select has_function('public', 'accept_realtime_chat_message', 'trusted message acceptance exists');
select has_function('public', 'get_realtime_chat_bootstrap', 'bounded reconnect bootstrap exists');
select has_function('public', 'get_realtime_chat_history', 'bounded history exists');
select has_function('public', 'update_realtime_chat_preference', 'durable player safety exists');
select has_function('public', 'report_realtime_chat_message', 'immutable evidence reporting exists');
select has_function('public', 'list_admin_multiplayer_chat_reports', 'moderation queue exists');
select has_function('public', 'get_admin_multiplayer_chat_report', 'protected detail exists');
select has_function('public', 'admin_act_on_multiplayer_chat_report', 'audited action authority exists');
select has_function('public', 'cleanup_multiplayer_chat_retention', 'bounded cleanup exists');

select is(
  (select count(*)::integer from public.admin_permissions where key like 'multiplayer_chat.%'),
  6,
  'exactly six narrow chat permissions are seeded'
);
select is(
  (select count(*)::integer from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst' and permission.key like 'multiplayer_chat.%'),
  1,
  'Read-only Analyst receives only safe chat operations visibility'
);
select is(
  (select count(*)::integer from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'moderator' and permission.key in (
      'multiplayer_chat.read', 'multiplayer_chat.moderate', 'multiplayer_chat.reports.read'
    )),
  3,
  'Moderator receives the reviewed reports workflow'
);
select is(
  (select count(*)::integer from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'game_administrator' and permission.key like 'multiplayer_chat.%'),
  6,
  'Game Administrator receives all chat operations permissions'
);
select is(
  (select count(*)::integer from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'super_admin' and permission.key like 'multiplayer_chat.%'),
  6,
  'Super Admin receives all chat operations permissions'
);

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_settings'::regclass), 'settings force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_messages'::regclass), 'messages force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_player_preferences'::regclass), 'preferences force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_reports'::regclass), 'reports force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_mutes'::regclass), 'mutes force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.multiplayer_chat_moderation_actions'::regclass), 'moderation actions force RLS');
select ok(not has_table_privilege('anon', 'public.multiplayer_chat_messages', 'select'), 'anonymous users cannot read messages');
select ok(not has_table_privilege('authenticated', 'public.multiplayer_chat_reports', 'select'), 'browser sessions cannot read reports');
select ok(not has_table_privilege('service_role', 'public.multiplayer_chat_messages', 'insert'), 'service role cannot bypass acceptance RPC');
select ok(not has_sequence_privilege('service_role', 'public.multiplayer_chat_messages_sequence_seq', 'usage'), 'message sequence is not directly callable');
select ok(has_function_privilege('service_role', 'public.accept_realtime_chat_message(uuid,text,text,text,numeric,numeric)', 'execute'), 'realtime service may accept validated messages');
select ok(not has_function_privilege('anon', 'public.accept_realtime_chat_message(uuid,text,text,text,numeric,numeric)', 'execute'), 'anonymous callers cannot accept messages');
select ok(has_function_privilege('service_role', 'public.report_realtime_chat_message(uuid,uuid,text,text,text)', 'execute'), 'realtime service may attach report evidence');
select ok(not has_function_privilege('authenticated', 'public.report_realtime_chat_message(uuid,uuid,text,text,text)', 'execute'), 'browser callers cannot attach report evidence directly');
select ok(has_function_privilege('service_role', 'public.list_admin_multiplayer_chat_reports(uuid,uuid,text,integer,integer,text,text,text,uuid,text,date,date)', 'execute'), 'API may invoke the protected report queue');
select ok(not has_function_privilege('authenticated', 'public.list_admin_multiplayer_chat_reports(uuid,uuid,text,integer,integer,text,text,text,uuid,text,date,date)', 'execute'), 'browser callers cannot invoke the report queue');
select ok(has_function_privilege('service_role', 'public.cleanup_multiplayer_chat_retention(integer)', 'execute'), 'worker may run bounded cleanup');
select ok(not has_function_privilege('anon', 'public.cleanup_multiplayer_chat_retention(integer)', 'execute'), 'anonymous callers cannot run cleanup');
select ok(exists(select 1 from pg_trigger where tgrelid = 'public.multiplayer_chat_moderation_actions'::regclass and tgname = 'multiplayer_chat_actions_append_only' and not tgisinternal), 'moderation actions have append-only protection');
select ok(
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'multiplayer_chat_reports' and column_name = 'evidence_text' and is_nullable = 'NO')
    and exists(select 1 from pg_trigger where tgrelid = 'public.multiplayer_chat_reports'::regclass and tgname = 'multiplayer_chat_reports_protect_evidence' and not tgisinternal),
  'reports preserve trigger-protected immutable text evidence'
);
select ok(exists(select 1 from pg_constraint where conrelid = 'public.multiplayer_chat_messages'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%sender_profile_id, client_request_id%'), 'message retries have a durable idempotency key');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.multiplayer_chat_reports'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%reporter_profile_id, message_id%'), 'duplicate reports are durably deduplicated');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.multiplayer_chat_moderation_actions'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%actor_admin_user_id, request_id%'), 'moderation actions are idempotent');
select ok(not exists(select 1 from pg_policies where schemaname = 'public' and tablename like 'multiplayer_chat_%'), 'chat tables expose no browser RLS policy');
select ok(not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name like 'multiplayer_chat_%' and column_name in ('wallet_address','email','ip_address','session_token','authorization_header')), 'chat storage excludes private identity and credentials');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'read_only_analyst' and permission.key in ('multiplayer_chat.reports.read','multiplayer_chat.audit.read')), 'Read-only Analyst cannot read protected evidence or audit');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'moderator' and permission.key = 'multiplayer_chat.settings.edit'), 'Moderator cannot edit chat settings');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'world_designer' and permission.key in ('multiplayer_chat.moderate','multiplayer_chat.settings.edit')), 'World Designer has no chat mutation authority');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'blockchain_operator' and permission.key in ('multiplayer_chat.moderate','multiplayer_chat.settings.edit')), 'Blockchain Operator has no chat mutation authority');
select is((select count(*)::integer from public.multiplayer_chat_settings), 1, 'one bounded settings row is seeded');

select * from finish();
rollback;
