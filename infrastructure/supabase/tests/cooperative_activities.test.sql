begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','cooperative_activity_settings','bounded activity settings exist');
select has_table('public','cooperative_activity_definitions','stable activity definitions exist');
select has_table('public','cooperative_activity_versions','immutable versioned activity content exists');
select has_table('public','cooperative_activity_active_versions','exact active version mapping exists');
select has_table('public','cooperative_activity_objects','closed interaction objects exist');
select has_table('public','cooperative_activity_entry_preparations','party entry preparations exist');
select has_table('public','cooperative_activity_instances','durable isolated instances exist');
select has_table('public','cooperative_activity_participants','locked participant rosters exist');
select has_table('public','cooperative_activity_objectives','durable shared objective state exists');
select has_table('public','cooperative_activity_progress_events','deduplicated contribution events exist');
select has_table('public','cooperative_activity_temporary_items','isolated temporary items exist');
select has_table('public','cooperative_activity_completions','completion records exist');
select has_table('public','cooperative_activity_reward_receipts','immutable reward receipts exist');
select has_table('public','cooperative_activity_reward_items','exact receipt items exist');
select has_table('public','cooperative_activity_pending_rewards','protected pending item rewards exist');
select has_table('public','cooperative_activity_cooldowns','durable daily limits and cooldowns exist');
select has_table('public','cooperative_activity_audit','append-only activity audit exists');
select has_table('public','cooperative_activity_idempotency','durable activity replay exists');
select has_table('public','cooperative_activity_rate_limits','bounded abuse controls exist');

select has_function('public','get_realtime_cooperative_activity_bootstrap','reconnect bootstrap exists');
select has_function('public','prepare_realtime_cooperative_activity_entry','authoritative party preparation exists');
select has_function('public','enter_realtime_cooperative_activity','locked roster entry exists');
select has_function('public','interact_realtime_cooperative_activity','intent-only objective authority exists');
select has_function('public','leave_realtime_cooperative_activity','server-authoritative leave exists');
select has_function('public','handle_realtime_cooperative_activity_disconnect','disconnect reconciliation exists');
select has_function('public','cleanup_cooperative_activities','bounded worker cleanup exists');
select has_function('public','get_admin_cooperative_activities','bounded admin operations list exists');
select has_function('public','get_admin_cooperative_activity_instance','safe admin instance detail exists');
select has_function('public','get_admin_cooperative_activity_settings','admin settings read exists');
select has_function('public','update_admin_cooperative_activity_settings','reviewed settings mutation exists');
select has_function('public','create_admin_cooperative_activity_draft','structured draft creation exists');
select has_function('public','update_admin_cooperative_activity_draft','revisioned draft updates exist');
select has_function('public','transition_admin_cooperative_activity_version','closed lifecycle workflow exists');
select has_function('public','preview_admin_cooperative_activity','non-persistent staff preview exists');

select is((select count(*)::integer from public.admin_permissions where key like 'cooperative_activities.%'),9,'exactly nine narrow activity permissions exist');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='game_administrator' and permission.key like 'cooperative_activities.%'),9,'Game Administrator retains all reviewed activity permissions');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='content_manager' and permission.key like 'cooperative_activities.%'),4,'Content Manager receives read edit validate and preview only');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='read_only_analyst' and permission.key like 'cooperative_activities.%'),1,'Read-only Analyst receives one safe activity read permission');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='read_only_analyst' and permission.key like 'cooperative_activities.%' and permission.key not like '%.read'),'Read-only Analyst has zero non-read activity permissions');
select ok(not exists(select 1 from public.admin_role_permissions mapping join public.admin_roles role on role.id=mapping.role_id join public.admin_permissions permission on permission.id=mapping.permission_id where role.key='blockchain_operator' and permission.key like 'cooperative_activities.%'),'Blockchain Operator has no activity or reward authority');

select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
  'public.cooperative_activity_settings'::regclass,
  'public.cooperative_activity_definitions'::regclass,
  'public.cooperative_activity_versions'::regclass,
  'public.cooperative_activity_active_versions'::regclass,
  'public.cooperative_activity_objects'::regclass,
  'public.cooperative_activity_entry_preparations'::regclass,
  'public.cooperative_activity_instances'::regclass,
  'public.cooperative_activity_participants'::regclass,
  'public.cooperative_activity_objectives'::regclass,
  'public.cooperative_activity_progress_events'::regclass,
  'public.cooperative_activity_temporary_items'::regclass,
  'public.cooperative_activity_completions'::regclass,
  'public.cooperative_activity_reward_receipts'::regclass,
  'public.cooperative_activity_reward_items'::regclass,
  'public.cooperative_activity_pending_rewards'::regclass,
  'public.cooperative_activity_cooldowns'::regclass,
  'public.cooperative_activity_audit'::regclass,
  'public.cooperative_activity_idempotency'::regclass,
  'public.cooperative_activity_rate_limits'::regclass
)),'all cooperative activity tables force RLS');
select ok(not exists(select 1 from pg_policies where schemaname='public' and tablename like 'cooperative_activity_%'),'activity tables expose no direct browser policies');
select ok(not has_table_privilege('anon','public.cooperative_activity_versions','select'),'anonymous cannot read draft activity versions');
select ok(not has_table_privilege('authenticated','public.cooperative_activity_instances','select'),'authenticated browser cannot read instances directly');
select ok(not has_table_privilege('service_role','public.cooperative_activity_progress_events','insert'),'service role cannot insert progress directly');
select ok(not has_table_privilege('service_role','public.cooperative_activity_reward_receipts','update'),'service role cannot edit reward receipts directly');
select ok(not has_table_privilege('service_role','public.cooperative_activity_audit','delete'),'service role cannot delete activity audit directly');
select ok(has_function_privilege('service_role','public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text)','execute'),'realtime service may submit validated interaction intent');
select ok(not has_function_privilege('authenticated','public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text)','execute'),'browser cannot call objective authority directly');
select ok(has_function_privilege('service_role','public.cleanup_cooperative_activities(integer,text)','execute'),'worker may run bounded activity cleanup');
select ok(not has_function_privilege('anon','public.transition_admin_cooperative_activity_version(uuid,uuid,text,uuid,integer,text,text)','execute'),'anonymous cannot transition content lifecycle');

select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='cooperative_activity_one_active_party_idx' and indexdef ilike '%unique%'),'one active instance exists per party');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='cooperative_activity_one_active_participation_idx' and indexdef ilike '%unique%'),'one active participation exists per player');
select ok(exists(select 1 from pg_constraint where conrelid='public.cooperative_activity_progress_events'::regclass and contype='u' and pg_get_constraintdef(oid) like '%instance_id, objective_key, object_key%'),'one contribution exists per objective object');
select ok(exists(select 1 from pg_constraint where conrelid='public.cooperative_activity_reward_receipts'::regclass and contype='u' and pg_get_constraintdef(oid) like '%completion_id, player_profile_id%'),'one reward receipt exists per player completion');
select ok(exists(select 1 from pg_trigger where tgrelid='public.cooperative_activity_versions'::regclass and tgname='cooperative_activity_version_immutable' and not tgisinternal),'published activity versions are immutable');
select ok(exists(select 1 from pg_trigger where tgrelid='public.cooperative_activity_reward_receipts'::regclass and tgname='cooperative_activity_receipt_immutable' and not tgisinternal),'reward receipts are immutable');
select ok(exists(select 1 from pg_trigger where tgrelid='public.cooperative_activity_audit'::regclass and tgname='cooperative_activity_audit_immutable' and not tgisinternal),'activity audit is append-only');
select ok(exists(select 1 from pg_trigger where tgrelid='public.player_party_members'::regclass and tgname='cooperative_activity_party_member_reconcile' and not tgisinternal),'party removal immediately reconciles activity access');

select ok(position('for update' in lower(pg_get_functiondef('public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text)'::regprocedure)))>0,'objective authority locks durable state');
select ok(position('p_position_x' in pg_get_functiondef('public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text)'::regprocedure))>0,'objective authority validates trusted realtime proximity');
select ok(position('cooperative_activity_store_replay' in pg_get_functiondef('public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text)'::regprocedure))>0,'objective intent is idempotent');
select ok(position('cozy_apply_dust_delta' in pg_get_functiondef('private.cooperative_activity_settle(uuid,text)'::regprocedure))>0,'settlement uses the canonical DUST ledger helper');
select ok(position('cozy_add_item' in pg_get_functiondef('private.cooperative_activity_settle(uuid,text)'::regprocedure))>0,'settlement uses canonical item stacking and capacity authority');
select ok(position('rewarded_completions' in pg_get_functiondef('private.cooperative_activity_settle(uuid,text)'::regprocedure))>0,'settlement owns durable daily reward limits');
select ok(position('allow_existing_instances_to_finish' in pg_get_functiondef('private.cooperative_activity_active_session(uuid)'::regprocedure))>0,'maintenance policy blocks new entry while optionally allowing existing runs to finish');
select ok(position('public_queue_enabled = false' in pg_get_functiondef('public.update_admin_cooperative_activity_settings(uuid,uuid,text,integer,boolean,boolean,integer,integer,integer,text)'::regprocedure))>0,'admin settings cannot enable public matchmaking');

select ok(
  (select provolatile = 'v' and prosecdef and not proisstrict and proparallel = 'u'
   from pg_proc where oid = 'public.enter_realtime_cooperative_activity(uuid,uuid,text)'::regprocedure),
  'activity entry preserves its volatile SECURITY DEFINER metadata'
);
select ok(
  not has_function_privilege('public','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
    and not has_function_privilege('anon','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
    and not has_function_privilege('authenticated','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute')
    and has_function_privilege('service_role','public.enter_realtime_cooperative_activity(uuid,uuid,text)','execute'),
  'only service_role may execute activity entry'
);
select ok(
  (select count(*) = 1 from pg_proc routine join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public' and routine.proname = 'enter_realtime_cooperative_activity')
    and position('member record' in lower(pg_get_functiondef('public.enter_realtime_cooperative_activity(uuid,uuid,text)'::regprocedure))) = 0,
  'activity entry has one signature and no obsolete member declaration'
);
select ok(
  (select provolatile = 'i' and prosecdef and proisstrict and proparallel = 'u'
   from pg_proc where oid = 'private.valid_cooperative_activity_objectives(jsonb)'::regprocedure)
    and not has_function_privilege('public','private.valid_cooperative_activity_objectives(jsonb)','execute')
    and not has_function_privilege('anon','private.valid_cooperative_activity_objectives(jsonb)','execute')
    and not has_function_privilege('authenticated','private.valid_cooperative_activity_objectives(jsonb)','execute')
    and not has_function_privilege('service_role','private.valid_cooperative_activity_objectives(jsonb)','execute'),
  'objective validation remains a private immutable strict helper'
);
select ok(
  position('index_number' in pg_get_functiondef('private.valid_cooperative_activity_objectives(jsonb)'::regprocedure)) = 0
    and position('objective_index' in pg_get_functiondef('private.valid_cooperative_activity_objectives(jsonb)'::regprocedure)) > 0,
  'objective validation uses one meaningful automatic loop variable'
);

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(private.valid_cooperative_activity_objectives(objectives),'reviewed objective sequence remains valid')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(not private.valid_cooperative_activity_objectives(
  jsonb_set(objectives,'{1,key}',objectives -> 0 -> 'key')
),'duplicate objective keys remain rejected')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(not private.valid_cooperative_activity_objectives(
  jsonb_set(objectives,'{0,type}','"unknown_objective"'::jsonb)
),'unknown objective types remain rejected')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(not private.valid_cooperative_activity_objectives(
  jsonb_set(objectives,'{0,nextObjectiveKey}','"community-harvest-complete"'::jsonb)
),'invalid objective sequencing remains rejected')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(not private.valid_cooperative_activity_objectives(
  jsonb_set(objectives,'{3,timeLimitSeconds}','901'::jsonb)
),'invalid objective timers remain rejected')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(not private.valid_cooperative_activity_objectives(
  jsonb_set(objectives,'{0,target}','101'::jsonb)
),'excessive objective targets remain rejected')
from source;

with source as (
  select objective_definitions as objectives
  from public.cooperative_activity_versions
  where id = '8d0b0000-0000-4000-8000-000000000001'
)
select ok(
  not private.valid_cooperative_activity_objectives(
    jsonb_set(objectives,'{0,script}','"alert(1)"'::jsonb)
  )
    and not private.valid_cooperative_activity_objectives(
      jsonb_set(objectives,'{0,label}','"<script>unsafe</script>"'::jsonb)
    ),
  'unsupported and executable objective fields remain rejected'
)
from source;

select is((select count(*)::integer from public.cooperative_activity_versions version join public.cooperative_activity_definitions definition on definition.id=version.activity_definition_id where definition.activity_key='moonpetal-harvest-help' and version.lifecycle_status='published'),1,'one published Moonpetal Harvest Help version exists');
select is((select count(*)::integer from public.cooperative_activity_objects where activity_version_id='8d0b0000-0000-4000-8000-000000000001'),31,'Moonpetal activity has the exact reviewed marker catalog');
select ok((select not public_queue_enabled from public.cooperative_activity_settings where singleton_key),'public queue is disabled by default');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name like 'cooperative_activity_%' and (column_name like '%wallet%' or column_name like '%token%' or column_name like '%sol%' or column_name like '%nft%')),'activity storage has no blockchain reward authority');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name like 'cooperative_activity_%' and column_name in ('email','session_token','authorization_header','private_key')),'activity storage excludes private credentials');

select * from finish();
rollback;
