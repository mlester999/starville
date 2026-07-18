begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(76);

select has_table('public', 'social_interaction_settings', 'bounded social settings exist');
select has_table('public', 'social_interaction_requests', 'gift and trade requests exist');
select has_table('public', 'player_gift_items', 'gift item snapshots exist');
select has_table('public', 'player_trade_offer_items', 'revisioned trade offers exist');
select has_table('public', 'player_inventory_reservations', 'trade inventory reservations exist');
select has_table('public', 'social_interaction_receipts', 'immutable settlement receipts exist');
select has_table('public', 'social_interaction_receipt_items', 'exact receipt items exist');
select has_table('public', 'social_interaction_audit', 'append-only social audit exists');
select has_table('public', 'social_interaction_idempotency', 'durable social idempotency exists');

select has_function('public', 'get_realtime_social_bootstrap', 'reconnect bootstrap exists');
select has_function('public', 'inspect_realtime_social_player', 'safe public inspect exists');
select has_function('public', 'create_realtime_social_gift', 'gift creation authority exists');
select has_function('public', 'respond_realtime_social_gift', 'recipient gift response exists');
select has_function('public', 'cancel_realtime_social_gift', 'sender gift cancellation exists');
select has_function('public', 'create_realtime_social_trade', 'trade request authority exists');
select has_function('public', 'respond_realtime_social_trade', 'trade response authority exists');
select has_function('public', 'update_realtime_social_trade_offer', 'revisioned offers exist');
select has_function('public', 'confirm_realtime_social_trade', 'atomic confirmation authority exists');
select has_function('public', 'cancel_realtime_social_trade', 'trade cancellation exists');
select has_function('public', 'resume_realtime_social_trade', 'bounded reconnect resume exists');
select has_function('public', 'handle_realtime_social_disconnect', 'disconnect reconciliation exists');
select has_function('public', 'invalidate_realtime_social_pair', 'block invalidation exists');
select has_function('public', 'cleanup_social_interactions', 'bounded worker cleanup exists');
select has_function('public', 'get_admin_social_interactions', 'admin summary list exists');
select has_function('public', 'get_admin_social_interaction', 'protected admin detail exists');

select is((select count(*)::integer from public.admin_permissions where key like 'social_interactions.%'), 4, 'exactly four narrow social permissions exist');
select is((select count(*)::integer from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='game_administrator' and p.key like 'social_interactions.%'), 4, 'Game Administrator has all reviewed social permissions');
select is((select count(*)::integer from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='super_admin' and p.key like 'social_interactions.%'), 4, 'Super Admin has all reviewed social permissions');
select is((select count(*)::integer from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='moderator' and p.key like 'social_interactions.%'), 1, 'Moderator receives read-only social summaries');
select is((select count(*)::integer from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='read_only_analyst' and p.key like 'social_interactions.%'), 1, 'Read-only Analyst receives one safe read permission');

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_settings'::regclass), 'settings force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_requests'::regclass), 'requests force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.player_gift_items'::regclass), 'gift items force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.player_trade_offer_items'::regclass), 'trade offers force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.player_inventory_reservations'::regclass), 'reservations force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_receipts'::regclass), 'receipts force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_receipt_items'::regclass), 'receipt items force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_audit'::regclass), 'audit forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.social_interaction_idempotency'::regclass), 'idempotency forces RLS');

select ok(not has_table_privilege('anon','public.social_interaction_requests','select'), 'anonymous cannot read interactions');
select ok(not has_table_privilege('authenticated','public.social_interaction_receipts','select'), 'browser sessions cannot read receipts');
select ok(not has_table_privilege('service_role','public.social_interaction_requests','insert'), 'service role cannot insert requests directly');
select ok(not has_table_privilege('service_role','public.player_inventory_reservations','update'), 'service role cannot mutate reservations directly');
select ok(not has_table_privilege('service_role','public.social_interaction_audit','delete'), 'service role cannot delete audit');
select ok(not exists(select 1 from pg_policies where schemaname='public' and (tablename like 'social_interaction_%' or tablename in ('player_gift_items','player_trade_offer_items','player_inventory_reservations'))), 'social tables expose no browser policies');

select ok(has_function_privilege('service_role','public.create_realtime_social_gift(uuid,uuid,text,integer,text)','execute'), 'realtime service can request gifts');
select ok(not has_function_privilege('authenticated','public.create_realtime_social_gift(uuid,uuid,text,integer,text)','execute'), 'browser cannot call gift authority');
select ok(has_function_privilege('service_role','public.confirm_realtime_social_trade(uuid,uuid,integer,text)','execute'), 'realtime service can confirm exact trades');
select ok(not has_function_privilege('anon','public.confirm_realtime_social_trade(uuid,uuid,integer,text)','execute'), 'anonymous cannot settle trades');
select ok(has_function_privilege('service_role','public.cleanup_social_interactions(integer,text)','execute'), 'worker can perform bounded cleanup');
select ok(not has_function_privilege('authenticated','public.get_admin_social_interaction(uuid,uuid,text,uuid)','execute'), 'browser cannot call protected audit detail');

select ok(exists(select 1 from pg_trigger where tgrelid='public.social_interaction_receipts'::regclass and tgname='social_receipts_immutable' and not tgisinternal), 'receipts are append-only');
select ok(exists(select 1 from pg_trigger where tgrelid='public.social_interaction_receipt_items'::regclass and tgname='social_receipt_items_immutable' and not tgisinternal), 'receipt items are append-only');
select ok(exists(select 1 from pg_trigger where tgrelid='public.social_interaction_audit'::regclass and tgname='social_audit_immutable' and not tgisinternal), 'audit is append-only');
select ok(exists(select 1 from pg_trigger where tgrelid='public.social_interaction_idempotency'::regclass and tgname='social_idempotency_immutable' and not tgisinternal), 'idempotency outcomes are immutable');

select ok(exists(select 1 from pg_constraint where conrelid='public.social_interaction_requests'::regclass and contype='u' and pg_get_constraintdef(oid) like '%sender_profile_id, client_request_id%'), 'request identity is durable across gift and trade operations');
select ok(exists(select 1 from pg_constraint where conrelid='public.social_interaction_receipts'::regclass and contype='u' and pg_get_constraintdef(oid) like '%interaction_id%'), 'one receipt exists per settlement');
select ok(exists(select 1 from pg_constraint where conrelid='public.player_inventory_reservations'::regclass and contype='u' and pg_get_constraintdef(oid) like '%interaction_id, player_profile_id, item_definition_id%'), 'reservations are unique per offer item');
select ok(position('for update' in lower(pg_get_functiondef('public.confirm_realtime_social_trade(uuid,uuid,integer,text)'::regprocedure))) > 0, 'settlement locks authoritative rows');
select ok(position('cozy_remove_item' in pg_get_functiondef('public.confirm_realtime_social_trade(uuid,uuid,integer,text)'::regprocedure)) > 0 and position('cozy_add_item' in pg_get_functiondef('public.confirm_realtime_social_trade(uuid,uuid,integer,text)'::regprocedure)) > 0, 'settlement uses canonical inventory mutation helpers');
select ok(position('confirmed_revision' in pg_get_functiondef('public.confirm_realtime_social_trade(uuid,uuid,integer,text)'::regprocedure)) > 0, 'confirmation binds to an exact revision');
select ok(position('social_pair_error' in pg_get_functiondef('public.respond_realtime_social_gift(uuid,uuid,text,text)'::regprocedure)) > 0, 'gift acceptance revalidates authoritative proximity and safety');
select ok(position('reconnect_deadline' in pg_get_functiondef('public.handle_realtime_social_disconnect(uuid,text,text)'::regprocedure)) > 0, 'disconnect uses bounded reconnect grace');
select ok(position('settings public.social_interaction_settings' in lower(pg_get_functiondef('public.cleanup_social_interactions(integer,text)'::regprocedure))) = 0, 'cleanup has no obsolete unread settings record');
select ok(position('limit p_batch_size for update skip locked' in lower(pg_get_functiondef('public.cleanup_social_interactions(integer,text)'::regprocedure))) > 0, 'cleanup retains its configured batch limit and lock discipline');
select ok(position('interval ''24 hours''' in lower(pg_get_functiondef('public.cleanup_social_interactions(integer,text)'::regprocedure))) > 0, 'cleanup retains durable idempotency retention');
select is((select count(*)::integer from pg_proc where oid = 'public.cleanup_social_interactions(integer,text)'::regprocedure), 1, 'cleanup retains one exact PostgREST signature');
select ok((select prosecdef and provolatile = 'v' from pg_proc where oid = 'public.cleanup_social_interactions(integer,text)'::regprocedure), 'cleanup remains a volatile security-definer mutation boundary');

select ok(not exists(select 1 from information_schema.columns where table_schema='public' and (table_name like 'social_interaction_%' or table_name in ('player_gift_items','player_trade_offer_items','player_inventory_reservations')) and column_name in ('wallet_address','email','ip_address','session_token','authorization_header')), 'social storage excludes private identity and credentials');
select ok(not exists(select 1 from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='read_only_analyst' and p.key like 'social_interactions.%' and p.key not like '%.read'), 'Read-only Analyst has no social write permission');
select ok(not exists(select 1 from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='read_only_analyst' and p.key='social_interactions.audit.read'), 'Read-only Analyst cannot read protected receipt audit');
select ok(not exists(select 1 from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='blockchain_operator' and p.key like 'social_interactions.%'), 'Blockchain Operator has no social visibility or mutation authority');
select ok(not exists(select 1 from public.admin_role_permissions m join public.admin_roles r on r.id=m.role_id join public.admin_permissions p on p.id=m.permission_id where r.key='world_designer' and p.key like 'social_interactions.%'), 'World Designer has no social authority');
select is((select count(*)::integer from public.social_interaction_settings), 1, 'one reviewed settings row exists');
select ok((select not dust_transfer_enabled from public.social_interaction_settings where singleton_key), 'DUST transfer remains disabled');
select ok((select not giftable and not tradable and account_bound and permanent_tool from public.cozy_item_definitions where slug='starter-watering-can'), 'permanent starter tool remains non-transferable');

select * from finish();
rollback;
