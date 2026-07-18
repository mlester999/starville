\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11b_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11B_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

do $$
declare
  admin_user_id constant uuid:='fb110000-0000-4000-8000-000000000401';
  auth_session_id constant uuid:='fb110000-0000-4000-8000-000000000402';
  admin_session_id constant uuid:='fb110000-0000-4000-8000-000000000403';
  role_id uuid; permission_version integer; session_version integer;
  active_version public.cozy_recipe_versions%rowtype;
  recipe_definition jsonb; output_item_id uuid; result jsonb;
begin
  select id into strict role_id from public.admin_roles where key='super_admin';
  insert into auth.users(id,email)
  values(admin_user_id,'phase11b-lint-admin@example.invalid');
  insert into auth.sessions(id,user_id) values(auth_session_id,admin_user_id);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_user_id,role_id,'active','Phase 11B Lint Admin',false)
  returning admin_users.permission_version,admin_users.session_version
  into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,
    permission_version_snapshot,session_version_snapshot
  ) values(
    admin_session_id,admin_user_id,auth_session_id,'active',now()+interval '1 hour',
    permission_version,session_version
  );

  select version.* into strict active_version
  from public.cozy_active_recipe_versions as active
  join public.cozy_recipe_definitions as definition
    on definition.id=active.recipe_definition_id
  join public.cozy_recipe_versions as version on version.id=active.recipe_version_id
  where definition.slug='garden-soup';
  recipe_definition:=jsonb_build_object(
    'description',active_version.public_description,
    'discoveryPolicy',active_version.discovery_policy,
    'dustFee',active_version.dust_fee,
    'enabled',active_version.enabled,
    'ingredients',(select jsonb_agg(jsonb_build_object(
      'itemId',ingredient.item_definition_id,'quantity',ingredient.quantity
    ) order by ingredient.display_order)
      from public.cozy_recipe_version_ingredients as ingredient
      where ingredient.recipe_version_id=active_version.id),
    'localDurationSeconds',active_version.local_duration_seconds,
    'maximumBatchQuantity',active_version.maximum_batch_quantity,
    'name',active_version.public_name,
    'outputItemId',active_version.output_item_definition_id,
    'outputQuantity',active_version.output_quantity,
    'productionDurationSeconds',active_version.production_duration_seconds,
    'repeatable',active_version.repeatable,
    'tutorialEligible',active_version.tutorial_eligible,
    'unlockRule',active_version.unlock_rule,
    'workstationType',active_version.workstation_type
  );
  result:=public.create_admin_recipe_successor(
    admin_user_id,auth_session_id,'aal2',active_version.recipe_definition_id,
    active_version.id,active_version.configuration_revision,recipe_definition,
    'Verify the active output item path after lint repair.',
    'phase11b-lint-recipe-active-output'
  );
  perform pg_temp.phase11b_assert(
    result->>'status'='updated',
    'recipe successor accepts a valid explicitly qualified active output item'
  );

  select version.* into strict active_version
  from public.cozy_active_recipe_versions as active
  join public.cozy_recipe_versions as version on version.id=active.recipe_version_id
  where active.recipe_definition_id=active_version.recipe_definition_id;
  output_item_id:=active_version.output_item_definition_id;
  update public.cozy_item_definitions as item_definition
  set active=false where item_definition.id=output_item_id;
  recipe_definition:=jsonb_set(recipe_definition,'{outputItemId}',to_jsonb(output_item_id));
  result:=public.create_admin_recipe_successor(
    admin_user_id,auth_session_id,'aal2',active_version.recipe_definition_id,
    active_version.id,active_version.configuration_revision,recipe_definition,
    'Reject an inactive output item after lint repair.',
    'phase11b-lint-recipe-inactive-output'
  );
  perform pg_temp.phase11b_assert(
    result->>'status'='reference_conflict',
    'recipe successor safely rejects an inactive explicitly qualified output item'
  );
end;
$$;

select pg_temp.phase11b_assert(
  exists(select 1 from public.cozy_workstation_definitions definition
    where definition.workstation_type='cooking_hearth'
      and definition.simultaneous_job_policy='bounded_owner_queue' and definition.queue_capacity=2
      and exists(select 1 from public.cozy_home_workstation_templates placement
        where placement.workstation_definition_id=definition.id
          and placement.access_policy='owner_only'))
  and exists(select 1 from public.cozy_workstation_definitions definition
    where definition.workstation_type='crafting_workbench'
      and exists(select 1 from public.cozy_home_workstation_templates placement
        where placement.workstation_definition_id=definition.id
          and placement.access_policy='owner_only')),
  'canonical owner-only workstations use bounded queues'
);

select pg_temp.phase11b_assert(
  exists(select 1 from public.cozy_recipe_versions version
    join public.cozy_recipe_definitions definition on definition.id=version.recipe_definition_id
    where definition.slug='garden-soup' and version.lifecycle_status='active'
      and version.unlock_rule='phase11b_tutorial_accepted'
      and version.cancellation_policy='disabled'),
  'Garden Soup is an immutable versioned tutorial recipe with cancellation disabled'
);

select pg_temp.phase11b_assert(
  exists(select 1 from public.economy_source_versions source
    join public.economy_active_source_versions active
      on active.source_key=source.source_key and active.source_version_id=source.id
    where source.source_key='starter-workstation-tutorial'
      and source.operation_key='starter_workstation_quest_reward'
      and source.minimum_amount=20 and source.maximum_amount=20 and not source.repeatable),
  'the workstation tutorial uses one exact non-repeatable 20 DUST source'
);

select pg_temp.phase11b_assert(
  (select bool_and(procedure.provolatile='s')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='private' and procedure.proname in (
      'cozy_recipe_is_unlocked','cozy_workstation_live_ops_json',
      'cozy_workstation_definition_json','cozy_crafting_job_json',
      'cozy_workstation_instance_json','cozy_recipe_version_json',
      'cozy_workstation_tutorial_json','cozy_workstation_workspace_json'
    ))
  and (select bool_and(procedure.provolatile='v')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'get_player_workstation_workspace','start_player_workstation_job',
      'collect_player_workstation_job','accept_player_workstation_tutorial',
      'turn_in_player_workstation_tutorial','reconcile_phase11b_crafting'
    )),
  'function volatility matches timestamp-derived reads and state-mutating dependencies'
);

do $$
declare
  owner_wallet constant text:='11111111111111111111111111111175';
  other_wallet constant text:='11111111111111111111111111111176';
  owner_id uuid; other_id uuid; owner_home uuid; other_home uuid;
  hearth uuid; workbench uuid; other_hearth uuid; recipe_version uuid; fee_recipe_version uuid;
  soup_item uuid; twine_item uuid; beans_item uuid;
  inventory_version integer; dust_version integer; station_version integer; job_version integer;
  job_id uuid; fee_job uuid; second_job uuid; third_job uuid;
  before_beans integer; used_slots integer; before_dust bigint;
  result jsonb; replay jsonb; workspace jsonb; reconcile jsonb;
  filler record;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'Phase Eleven B Owner','moss','lantern-square',
      '79000000-0000-4000-8000-000000000001',12,10.5,'north'),
    (other_wallet,'Phase Eleven B Other','moonberry','lantern-square',
      '79000000-0000-4000-8000-000000000001',12,10.5,'north');
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict other_id from public.player_profiles where wallet_address=other_wallet;
  perform public.bootstrap_player_cozy_gameplay(
    owner_wallet,'phase11b-owner-bootstrap-0001','phase11b:owner:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(
    other_wallet,'phase11b-other-bootstrap-0001','phase11b:other:bootstrap');
  perform public.accept_player_starter_farming_quest(
    owner_wallet,'phase11b-owner-farming-0001','phase11b:owner:farming');
  perform public.accept_player_starter_farming_quest(
    other_wallet,'phase11b-other-farming-0001','phase11b:other:farming');

  update public.player_quest_instances instance set
    status='reward_claimed',completed_at=now(),reward_settled_at=now(),
    reward_ledger_entry_id=(select ledger.id from public.player_dust_ledger ledger
      where ledger.player_profile_id=instance.player_profile_id order by ledger.created_at limit 1),
    state_version=state_version+1
  from public.cozy_quest_versions version
  where instance.quest_version_id=version.id and version.quest_kind='farming_tutorial'
    and instance.player_profile_id in (owner_id,other_id);
  select id into strict owner_home from public.player_homes where player_profile_id=owner_id;
  select id into strict other_home from public.player_homes where player_profile_id=other_id;
  perform private.ensure_player_home_workstations(owner_id,'phase11b:owner:stations');
  perform private.ensure_player_home_workstations(other_id,'phase11b:other:stations');

  result:=public.accept_player_workstation_tutorial(
    owner_wallet,'phase11b-owner-tutorial-0001','phase11b:owner:tutorial');
  replay:=public.accept_player_workstation_tutorial(
    owner_wallet,'phase11b-owner-tutorial-0001','phase11b:owner:tutorial:replay');
  perform pg_temp.phase11b_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and result#>>'{view,status}'='active',
    'workstation tutorial acceptance is idempotent and requires Phase 11A completion');

  select station.id,station.state_version into strict hearth,station_version
  from public.player_home_workstations station
  join public.cozy_workstation_definitions definition on definition.id=station.workstation_definition_id
  where station.player_profile_id=owner_id and definition.workstation_type='cooking_hearth';
  select station.id into strict workbench
  from public.player_home_workstations station
  join public.cozy_workstation_definitions definition on definition.id=station.workstation_definition_id
  where station.player_profile_id=owner_id and definition.workstation_type='crafting_workbench';
  select station.id into strict other_hearth
  from public.player_home_workstations station
  join public.cozy_workstation_definitions definition on definition.id=station.workstation_definition_id
  where station.player_profile_id=other_id and definition.workstation_type='cooking_hearth';
  select active.recipe_version_id into strict recipe_version
  from public.cozy_active_recipe_versions active
  join public.cozy_recipe_definitions definition on definition.id=active.recipe_definition_id
  where definition.slug='garden-soup';
  select id into strict beans_item from public.cozy_item_definitions where slug='moonbean';
  select id into strict soup_item from public.cozy_item_definitions where slug='garden-soup';
  select id into strict twine_item from public.cozy_item_definitions where slug='garden-twine';
  insert into public.cozy_recipe_definitions(
    id,slug,name,description,kind,station_type,output_item_definition_id,
    output_quantity,dust_fee,active,content_version
  ) values(
    'b1100000-0000-4000-8000-000000000301','local-dust-fee-twine',
    'Local DUST-fee Twine','Rollback-only optional fee execution fixture.',
    'crafting','crafting_workbench',twine_item,1,5,true,1
  );
  insert into public.cozy_recipe_versions(
    id,recipe_definition_id,version_number,lifecycle_status,public_name,public_description,
    recipe_category,workstation_type,output_item_definition_id,output_quantity,
    production_duration_seconds,local_duration_seconds,dust_fee,unlock_rule,discovery_policy,
    tutorial_eligible,repeatable,maximum_batch_quantity,enabled,cancellation_policy,
    safe_metadata,configuration_revision,activated_at
  ) values(
    'b1100000-0000-4000-8000-000000000302',
    'b1100000-0000-4000-8000-000000000301',1,'active','Local DUST-fee Twine',
    'Rollback-only optional fee execution fixture.','crafting','crafting_workbench',
    twine_item,1,30,3,5,'starter','visible_locked',false,true,4,true,'disabled',
    '{"localFixture":true}'::jsonb,1,now()
  ) returning id into fee_recipe_version;
  insert into public.cozy_recipe_version_ingredients(
    recipe_version_id,item_definition_id,quantity,display_order
  ) values(fee_recipe_version,beans_item,1,1);
  insert into public.cozy_active_recipe_versions(recipe_definition_id,recipe_version_id)
  values('b1100000-0000-4000-8000-000000000301',fee_recipe_version);
  insert into public.player_recipe_unlocks(
    player_profile_id,recipe_definition_id,unlock_source,source_reference_id
  ) values(owner_id,'b1100000-0000-4000-8000-000000000301','starter',null);
  perform private.cozy_add_item(
    owner_id,beans_item,20,'system_refund','beans','phase11b-beans-0001','phase11b:test:beans');
  update public.player_homes set inside_home=true,current_position_x=3,current_position_y=6
  where id=owner_home;
  update public.player_homes set inside_home=true,current_position_x=3,current_position_y=6
  where id=other_home;

  select state_version into strict inventory_version
  from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict dust_version
  from public.player_dust_accounts where player_profile_id=owner_id;
  before_beans:=private.cozy_owned_quantity(owner_id,beans_item);
  result:=public.start_player_workstation_job(
    owner_wallet,hearth,recipe_version,1,inventory_version,dust_version,station_version,
    'phase11b-job-start-0001','phase11b:job:start');
  replay:=public.start_player_workstation_job(
    owner_wallet,hearth,recipe_version,1,inventory_version,dust_version,station_version,
    'phase11b-job-start-0001','phase11b:job:start:replay');
  job_id:=(result#>>'{job,id}')::uuid;
  perform pg_temp.phase11b_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (replay#>>'{job,id}')::uuid=job_id
      and private.cozy_owned_quantity(owner_id,beans_item)=before_beans-2
      and (select ingredient_snapshot#>>'{0,quantity}'='2'
        and output_item_definition_id=soup_item and output_quantity=1
        from public.player_crafting_jobs where id=job_id),
    'start consumes one immutable ingredient snapshot exactly once');

  workspace:=public.get_player_workstation_workspace(owner_wallet,hearth,'phase11b:workspace:running');
  perform pg_temp.phase11b_assert(
    workspace->>'status'='loaded'
      and workspace#>>'{workspace,workstation,id}'=hearth::text
      and workspace#>>'{workspace,dust,stateVersion}'=dust_version::text,
    'workspace projection is owner-bound and exposes inventory and DUST revisions');
  perform pg_temp.phase11b_assert(
    public.get_player_workstation_workspace(other_wallet,hearth,'phase11b:cross-owner')->>'status'
      ='workstation_not_found',
    'another owner cannot read a workstation by UUID');

  update public.player_crafting_jobs set
    started_at=now()-interval '31 seconds',completes_at=now()-interval '1 second'
  where id=job_id;
  workspace:=public.get_player_workstation_workspace(owner_wallet,hearth,'phase11b:workspace:offline');
  perform pg_temp.phase11b_assert(
    workspace#>>'{workspace,jobs,0,status}'='ready'
      and (workspace#>>'{workspace,jobs,0,progress}')::numeric=1,
    'offline completion is derived from authoritative timestamps without a client timer');

  select state_version into strict inventory_version
  from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict job_version from public.player_crafting_jobs where id=job_id;
  select state_version into strict station_version from public.player_home_workstations where id=hearth;
  result:=public.collect_player_workstation_job(
    owner_wallet,hearth,job_id,job_version,inventory_version,station_version,
    'phase11b-job-collect-0001','phase11b:job:collect');
  replay:=public.collect_player_workstation_job(
    owner_wallet,hearth,job_id,job_version,inventory_version,station_version,
    'phase11b-job-collect-0001','phase11b:job:collect:replay');
  perform pg_temp.phase11b_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and private.cozy_owned_quantity(owner_id,soup_item)=1
      and (select status='collected' and output_settlement_reference is not null
        from public.player_crafting_jobs where id=job_id)
      and exists(select 1 from public.player_recipe_unlocks unlock
        join public.cozy_recipe_definitions definition on definition.id=unlock.recipe_definition_id
        where unlock.player_profile_id=owner_id and definition.slug='garden-twine'),
    'collection grants output once and advances only valid collected tutorial output');

  update public.player_homes set current_position_x=7,current_position_y=6 where id=owner_home;
  update public.cozy_crafting_action_cooldowns
    set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict inventory_version
  from public.player_inventory_state where player_profile_id=owner_id;
  select state_version,balance into strict dust_version,before_dust
  from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict station_version
  from public.player_home_workstations where id=workbench;
  result:=public.start_player_workstation_job(
    owner_wallet,workbench,fee_recipe_version,2,inventory_version,dust_version,station_version,
    'phase11b-fee-start-0001','phase11b:fee:start');
  replay:=public.start_player_workstation_job(
    owner_wallet,workbench,fee_recipe_version,2,inventory_version,dust_version,station_version,
    'phase11b-fee-start-0001','phase11b:fee:start:replay');
  fee_job:=(result#>>'{job,id}')::uuid;
  perform pg_temp.phase11b_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (replay#>>'{job,id}')::uuid=fee_job
      and (select balance=before_dust-10 from public.player_dust_accounts
        where player_profile_id=owner_id)
      and (select dust_fee=10 and output_quantity=2 from public.player_crafting_jobs
        where id=fee_job),
    'optional DUST fee and batch output snapshot settle exactly once on start');
  update public.player_homes set current_position_x=3,current_position_y=6 where id=owner_home;

  update public.cozy_crafting_action_cooldowns
    set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict station_version from public.player_home_workstations where id=hearth;
  result:=public.start_player_workstation_job(owner_wallet,hearth,recipe_version,1,
    inventory_version,dust_version,station_version,'phase11b-job-start-0002','phase11b:job:start:two');
  second_job:=(result#>>'{job,id}')::uuid;
  update public.cozy_crafting_action_cooldowns
    set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict station_version from public.player_home_workstations where id=hearth;
  result:=public.start_player_workstation_job(owner_wallet,hearth,recipe_version,1,
    inventory_version,dust_version,station_version,'phase11b-job-start-0003','phase11b:job:start:three');
  third_job:=(result#>>'{job,id}')::uuid;
  update public.cozy_crafting_action_cooldowns
    set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict station_version from public.player_home_workstations where id=hearth;
  before_beans:=private.cozy_owned_quantity(owner_id,beans_item);
  result:=public.start_player_workstation_job(owner_wallet,hearth,recipe_version,1,
    inventory_version,dust_version,station_version,'phase11b-job-start-full','phase11b:job:full');
  perform pg_temp.phase11b_assert(
    result->>'status'='crafting_queue_full'
      and private.cozy_owned_quantity(owner_id,beans_item)=before_beans,
    'queue-full rejection consumes no ingredients or DUST');

  perform private.cozy_add_item(owner_id,soup_item,19,'system_refund','soup-fill',
    'phase11b-fill-0001','phase11b:test:fill');
  for filler in select item.id from public.cozy_item_definitions item
    where item.active and not exists(select 1 from public.player_inventory_stacks stack
      where stack.player_profile_id=owner_id and stack.item_definition_id=item.id and stack.quantity>0)
    order by item.slug
  loop
    select count(*) into used_slots from public.player_inventory_stacks
    where player_profile_id=owner_id and quantity>0;
    exit when used_slots>=8;
    perform private.cozy_add_item(owner_id,filler.id,1,'system_refund','slot-fill',
      'phase11b-slot-'||filler.id::text,'phase11b:test:slot');
  end loop;
  select count(*) into strict used_slots from public.player_inventory_stacks
  where player_profile_id=owner_id and quantity>0;
  update public.player_inventory_state set capacity=used_slots where player_profile_id=owner_id;
  update public.player_crafting_jobs set
    started_at=now()-interval '31 seconds',completes_at=now()-interval '1 second'
  where id=second_job;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict job_version from public.player_crafting_jobs where id=second_job;
  select state_version into strict station_version from public.player_home_workstations where id=hearth;
  result:=public.collect_player_workstation_job(owner_wallet,hearth,second_job,job_version,
    inventory_version,station_version,'phase11b-collect-full-0001','phase11b:collect:full');
  perform pg_temp.phase11b_assert(
    result->>'status'='inventory_full'
      and (select status='ready' from public.player_crafting_jobs where id=second_job)
      and private.cozy_owned_quantity(owner_id,soup_item)=20,
    'full inventory leaves output attached to a ready job for safe retry');

  update public.player_crafting_jobs set
    started_at=now()-interval '31 seconds',completes_at=now()-interval '1 second'
  where id=third_job;
  reconcile:=public.reconcile_phase11b_crafting(100,'phase11b:worker:reconcile');
  perform pg_temp.phase11b_assert(
    reconcile->>'status'='completed'
      and (reconcile->>'readied')::integer>=1
      and not (reconcile->>'perJobTimersScheduled')::boolean
      and (select status='ready' from public.player_crafting_jobs where id=third_job),
    'bounded reconciliation persists ready state without scheduling per-job timers');
end;
$$;

select pg_temp.phase11b_assert(
  has_function_privilege('service_role',
    'public.reconcile_phase11b_crafting(integer,text)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.reconcile_phase11b_crafting(integer,text)','EXECUTE'),
  'only the trusted worker role can execute crafting reconciliation'
);

select pg_temp.phase11b_assert(
  not has_table_privilege('authenticated','public.player_crafting_jobs','SELECT')
  and not has_table_privilege('service_role','public.player_crafting_jobs','SELECT')
  and not has_table_privilege('service_role','public.player_crafting_jobs','UPDATE'),
  'crafting tables expose no direct authenticated or service-role data path'
);

rollback;
