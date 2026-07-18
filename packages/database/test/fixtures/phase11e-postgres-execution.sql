\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11e_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11E_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase11e_assert(
  (select count(*)=5 from public.housing_decoration_zones)
  and (select count(*)=1 from public.housing_upgrade_versions where lifecycle_status='active')
  and (select count(*)=3 from public.progression_achievement_definitions
    where id in ('e1100000-0000-4000-8000-000000000230',
      'e1100000-0000-4000-8000-000000000231','e1100000-0000-4000-8000-000000000232'))
  and exists(select 1 from public.cozy_quest_definitions where slug='home-sweet-home')
  and exists(select 1 from public.progression_titles where title_key='cozy-decorator')
  and exists(select 1 from public.progression_badges where badge_key='home-sweet-home'),
  'bounded housing zones, upgrade, tutorial, achievements, title, and badge exist'
);

select pg_temp.phase11e_assert(
  (select bool_and(procedure.provolatile='s')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='private' and procedure.proname in (
      'housing_zone_json','housing_furniture_definition_json','housing_placement_json',
      'housing_revision_summary_json','housing_storage_json','housing_tutorial_json',
      'housing_upgrade_json','housing_workspace_json','housing_validate_layout_draft',
      'housing_storage_can_add','cozy_player_home_json','cozy_furniture_placement_valid'
    ))
  and (select bool_and(procedure.provolatile='v')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'get_player_housing_workspace','open_player_decoration_session',
      'validate_player_home_layout','save_player_home_layout','enter_player_home',
      'open_player_home_storage','get_player_home_layout_history',
      'get_player_home_layout_revision','transfer_player_home_storage',
      'purchase_player_home_upgrade','complete_player_home_interaction',
      'get_admin_housing_workspace','create_admin_housing_upgrade_successor',
      'transition_admin_housing_upgrade','update_admin_housing_live_ops',
      'request_admin_housing_reconciliation','request_admin_housing_correction',
      'apply_admin_housing_correction','run_housing_maintenance'
    )),
  'function volatility matches authoritative reads, time, rate limits, and mutations'
);

do $$
declare
  owner_wallet constant text:='11111111111111111111111111111197';
  other_wallet constant text:='11111111111111111111111111111198';
  owner_id uuid; other_id uuid; home_id uuid; storage_id uuid; housing_quest_id uuid;
  chair_stack_id uuid; chair_instance_id uuid; saved_revision_id uuid;
  home_version integer; head_revision integer; head_version integer;
  inventory_version integer; storage_version integer; dust_version integer;
  result jsonb; replay jsonb; draft jsonb;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'Phase Eleven E Owner','moss','lantern-square',
      '79000000-0000-4000-8000-000000000001',19,8,'north'),
    (other_wallet,'Phase Eleven E Other','moonberry','lantern-square',
      '79000000-0000-4000-8000-000000000001',19,8,'north');
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict other_id from public.player_profiles where wallet_address=other_wallet;
  perform public.bootstrap_player_cozy_gameplay(
    owner_wallet,'phase11e-owner-bootstrap-0001','phase11e:owner:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(
    other_wallet,'phase11e-other-bootstrap-0001','phase11e:other:bootstrap');

  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id,status
  ) values(
    owner_id,'e1100000-0000-4000-8000-000000000200',
    'e1100000-0000-4000-8000-000000000201','active'
  ) returning id into housing_quest_id;
  insert into public.player_quest_objective_progress(
    player_quest_instance_id,quest_objective_id
  ) select housing_quest_id,objective.id
  from public.cozy_quest_objectives as objective
  where objective.quest_version_id='e1100000-0000-4000-8000-000000000201';

  select id,state_version into strict home_id,home_version
  from public.player_homes where player_profile_id=owner_id;
  result:=public.enter_player_home(
    owner_wallet,home_version,'phase11e-owner-enter-0001','phase11e:owner:enter');
  perform pg_temp.phase11e_assert(result->>'status'='updated','the owner enters the canonical private home');
  result:=public.get_player_housing_workspace(owner_wallet,'phase11e:workspace');
  perform pg_temp.phase11e_assert(
    result->>'status'='loaded'
      and result#>>'{workspace,home,location}'='personal_home'
      and result#>>'{workspace,layout,activeRevision,revisionNumber}'='1'
      and result#>>'{workspace,home,homeTier}'='1'
      and result#>>'{workspace,storage,capacity}'='16'
      and (result#>>'{workspace,gameTest}')::boolean=false,
    'housing initialization creates private storage and an immutable starter revision'
  );
  select id into strict storage_id from public.home_storage_containers where player_home_id=home_id;
  select id into strict chair_stack_id from public.player_inventory_stacks
  where player_profile_id=owner_id and item_definition_id='71000000-0000-4000-8000-000000000015';
  perform pg_temp.phase11e_assert(
    private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000015')=1,
    'the canonical starter Willow Chair is inventory-backed'
  );

  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  result:=public.transfer_player_home_storage(
    owner_wallet,home_id,storage_id,'deposit','71000000-0000-4000-8000-000000000015',1,
    inventory_version,storage_version,'phase11e-storage-deposit-0001','phase11e:storage:deposit');
  replay:=public.transfer_player_home_storage(
    owner_wallet,home_id,storage_id,'deposit','71000000-0000-4000-8000-000000000015',1,
    inventory_version,storage_version,'phase11e-storage-deposit-0001','phase11e:storage:deposit:replay');
  perform pg_temp.phase11e_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (select count(*)=1 from public.home_storage_transactions
        where player_profile_id=owner_id and operation='deposit'
          and idempotency_key='phase11e-storage-deposit-0001')
      and (select quantity=1 from public.home_storage_stacks
        where storage_container_id=storage_id and item_definition_id='71000000-0000-4000-8000-000000000015'),
    'inventory-to-storage transfer is atomic and exactly once'
  );
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  result:=public.transfer_player_home_storage(
    owner_wallet,home_id,storage_id,'withdrawal','71000000-0000-4000-8000-000000000015',1,
    inventory_version,storage_version,'phase11e-storage-withdraw-0001','phase11e:storage:withdraw');
  replay:=public.transfer_player_home_storage(
    owner_wallet,home_id,storage_id,'withdrawal','71000000-0000-4000-8000-000000000015',1,
    inventory_version,storage_version,'phase11e-storage-withdraw-0001','phase11e:storage:withdraw:replay');
  perform pg_temp.phase11e_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (select count(*)=1 from public.home_storage_transactions
        where player_profile_id=owner_id and operation='withdrawal'
          and idempotency_key='phase11e-storage-withdraw-0001')
      and not exists(select 1 from public.home_storage_stacks
        where storage_container_id=storage_id and item_definition_id='71000000-0000-4000-8000-000000000015'),
    'storage-to-inventory transfer is atomic and exactly once'
  );
  select id into strict chair_stack_id from public.player_inventory_stacks
  where player_profile_id=owner_id and item_definition_id='71000000-0000-4000-8000-000000000015';

  select revision_number,state_version into strict head_revision,head_version
  from public.home_layout_heads where player_home_id=home_id;
  result:=public.open_player_decoration_session(
    owner_wallet,home_id,head_revision,'phase11e-decoration-open-0001','phase11e:decoration:open');
  perform pg_temp.phase11e_assert(result->>'status'='opened','Decoration Mode pins its base revision');
  draft:=jsonb_build_array(jsonb_build_object(
    'instanceId',null,'inventoryStackId',chair_stack_id,
    'furnitureDefinitionId','75000000-0000-4000-8000-000000000001',
    'zoneId','e1100000-0000-4000-8000-000000000010',
    'x',8,'y',2,'layer',1,'rotation',0
  ));
  result:=public.validate_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,draft,'phase11e:layout:valid');
  perform pg_temp.phase11e_assert(
    result->>'status'='validated' and (result#>>'{validation,valid}')::boolean,
    'owned Willow Chair validates in the enabled outdoor zone'
  );
  result:=public.validate_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,null,'phase11e:layout:null');
  perform pg_temp.phase11e_assert(
    result->>'status'='validated' and not (result#>>'{validation,valid}')::boolean,
    'null layout shape is rejected safely'
  );
  result:=public.validate_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,
    '[{"furnitureDefinitionId":"malformed","zoneId":"malformed","x":"bad"}]'::jsonb,
    'phase11e:layout:malformed');
  perform pg_temp.phase11e_assert(
    result->>'status'='validated' and not (result#>>'{validation,valid}')::boolean,
    'malformed placement identity is rejected safely'
  );
  result:=public.validate_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,
    jsonb_build_array(jsonb_build_object(
      'instanceId',null,'inventoryStackId',chair_stack_id,
      'furnitureDefinitionId','75000000-0000-4000-8000-000000000001',
      'zoneId','e1100000-0000-4000-8000-000000000010',
      'x',3,'y',3,'layer',1,'rotation',0)),
    'phase11e:layout:farm-collision');
  perform pg_temp.phase11e_assert(
    result->>'status'='validated' and not (result#>>'{validation,valid}')::boolean
      and exists(select 1 from jsonb_array_elements(result#>'{validation,issues}') issue
        where issue->>'code'='farm_tile_blocked'),
    'authoritative farming tiles cannot be covered by furniture'
  );

  select state_version into strict home_version from public.player_homes where id=home_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  result:=public.save_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,home_version,inventory_version,storage_version,
    draft,null,'phase11e-layout-save-0001','phase11e:layout:save');
  replay:=public.save_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,home_version,inventory_version,storage_version,
    draft,null,'phase11e-layout-save-0001','phase11e:layout:save:replay');
  perform pg_temp.phase11e_assert(
    result->>'status'='saved' and replay->>'status'='replayed'
      and (select count(*)=1 from public.player_home_furniture
        where player_home_id=home_id and removed_at is null)
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000015')=0
      and (select count(*)=2 from public.home_layout_revisions where player_home_id=home_id),
    'Save Layout consumes furniture and appends one revision exactly once'
  );
  perform pg_temp.phase11e_assert(
    exists(select 1 from public.progression_owner_events as event
      where event.player_profile_id=owner_id and event.event_key='quest_progressed'
        and event.safe_payload->>'requestId'='phase11e:layout:save'),
    'housing quest progress persists its authoritative layout-save request correlation'
  );
  select id into strict chair_instance_id from public.player_home_furniture
  where player_home_id=home_id and removed_at is null;
  select id into strict saved_revision_id from public.home_layout_revisions
  where player_home_id=home_id and revision_number=2;
  perform pg_temp.phase11e_assert(
    public.save_player_home_layout(
      owner_wallet,home_id,1,1,home_version,inventory_version,storage_version,
      draft,null,'phase11e-layout-stale-0001','phase11e:layout:stale')->>'status'='layout_conflict'
      and public.save_player_home_layout(
        other_wallet,home_id,1,1,1,1,1,'[]'::jsonb,null,
        'phase11e-layout-other-0001','phase11e:layout:other')->>'status'='home_permission_denied',
    'stale writers conflict and another player cannot write this home'
  );
  result:=public.get_player_home_layout_history(owner_wallet,home_id,null,20,'phase11e:history');
  replay:=public.get_player_home_layout_revision(owner_wallet,home_id,saved_revision_id,'phase11e:revision');
  perform pg_temp.phase11e_assert(
    result->>'status'='loaded' and jsonb_array_length(result#>'{history,revisions}')=2
      and replay->>'status'='loaded' and jsonb_array_length(replay->'placements')=1
      and public.get_player_home_layout_revision(
        owner_wallet,home_id,gen_random_uuid(),'phase11e:revision:missing')->>'status'='layout_not_found'
      and public.get_player_home_layout_revision(
        other_wallet,home_id,saved_revision_id,'phase11e:revision:other')->>'status'='home_permission_denied',
    'layout history and snapshots are owner-bound and missing-safe'
  );

  select revision_number,state_version into strict head_revision,head_version
  from public.home_layout_heads where player_home_id=home_id;
  perform public.open_player_decoration_session(
    owner_wallet,home_id,head_revision,'phase11e-decoration-remove-0001','phase11e:decoration:remove');
  select state_version into strict home_version from public.player_homes where id=home_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  result:=public.save_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,home_version,inventory_version,storage_version,
    '[]'::jsonb,null,'phase11e-layout-remove-0001','phase11e:layout:remove');
  replay:=public.save_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,home_version,inventory_version,storage_version,
    '[]'::jsonb,null,'phase11e-layout-remove-0001','phase11e:layout:remove:replay');
  perform pg_temp.phase11e_assert(
    result->>'status'='saved' and replay->>'status'='replayed'
      and (select removed_at is not null from public.player_home_furniture where id=chair_instance_id)
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000015')=1
      and (select count(*)=3 from public.home_layout_revisions where player_home_id=home_id),
    'removal returns furniture once while old snapshots remain immutable'
  );

  select revision_number,state_version into strict head_revision,head_version
  from public.home_layout_heads where player_home_id=home_id;
  perform public.open_player_decoration_session(
    owner_wallet,home_id,head_revision,'phase11e-decoration-restore-0001','phase11e:decoration:restore');
  select id into strict chair_stack_id from public.player_inventory_stacks
  where player_profile_id=owner_id and item_definition_id='71000000-0000-4000-8000-000000000015';
  draft:=jsonb_build_array(jsonb_build_object(
    'instanceId',null,'inventoryStackId',chair_stack_id,
    'furnitureDefinitionId','75000000-0000-4000-8000-000000000001',
    'zoneId','e1100000-0000-4000-8000-000000000010',
    'x',8,'y',2,'layer',1,'rotation',0
  ));
  select state_version into strict home_version from public.player_homes where id=home_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  result:=public.save_player_home_layout(
    owner_wallet,home_id,head_revision,head_version,home_version,inventory_version,storage_version,
    draft,saved_revision_id,'phase11e-layout-restore-0001','phase11e:layout:restore');
  perform pg_temp.phase11e_assert(
    result->>'status'='saved'
      and (select restoration_source_revision_id=saved_revision_id
        from public.home_layout_revisions where player_home_id=home_id and revision_number=4)
      and (select count(*)=4 from public.home_layout_revisions where player_home_id=home_id)
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000015')=0,
    'historical restoration consumes only available ownership and appends a new revision'
  );

  perform private.ensure_player_progression(owner_id);
  update public.player_level_progress set total_xp=190,skill_contribution_xp=0,
    milestone_xp=190,current_level=3,xp_in_level=0,progression_revision=progression_revision+1
  where player_profile_id=owner_id;
  select state_version into strict home_version from public.player_homes where id=home_id;
  select state_version into strict storage_version from public.home_storage_containers where id=storage_id;
  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  result:=public.purchase_player_home_upgrade(
    owner_wallet,home_id,'e1100000-0000-4000-8000-000000000101',
    home_version,dust_version,storage_version,'phase11e-home-upgrade-0001','phase11e:upgrade');
  replay:=public.purchase_player_home_upgrade(
    owner_wallet,home_id,'e1100000-0000-4000-8000-000000000101',
    home_version,dust_version,storage_version,'phase11e-home-upgrade-0001','phase11e:upgrade:replay');
  perform pg_temp.phase11e_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and (select home_tier=2 and furniture_capacity=12 and storage_capacity=24
        and indoor_foundation_enabled from public.player_homes where id=home_id)
      and (select capacity=24 from public.home_storage_containers where id=storage_id)
      and (select balance=0 from public.player_dust_accounts where player_profile_id=owner_id)
      and (select count(*)=1 from public.player_dust_ledger
        where player_profile_id=owner_id and reason='home_upgrade')
      and (select count(*)=1 from public.player_home_upgrade_transactions where player_home_id=home_id),
    'eligible Tier 2 purchase debits DUST and increases capacities exactly once'
  );
end;
$$;

do $$
declare
  owner_wallet constant text:='11111111111111111111111111111197';
  admin_one constant uuid:='fe110000-0000-4000-8000-000000000001';
  auth_one constant uuid:='fe110000-0000-4000-8000-000000000002';
  session_one constant uuid:='fe110000-0000-4000-8000-000000000003';
  admin_two constant uuid:='fe110000-0000-4000-8000-000000000004';
  auth_two constant uuid:='fe110000-0000-4000-8000-000000000005';
  session_two constant uuid:='fe110000-0000-4000-8000-000000000006';
  role_id uuid; owner_id uuid; home_id uuid; storage_id uuid; draft_version_id uuid;
  permission_version integer; session_version integer; home_version integer;
  correction_id uuid; result jsonb; workspace jsonb;
begin
  select id into strict role_id from public.admin_roles where key='super_admin';
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id,state_version into strict home_id,home_version
  from public.player_homes where player_profile_id=owner_id;
  select id into strict storage_id from public.home_storage_containers where player_home_id=home_id;
  insert into auth.users(id,email) values
    (admin_one,'phase11e-admin-one@example.invalid'),
    (admin_two,'phase11e-admin-two@example.invalid');
  insert into auth.sessions(id,user_id) values(auth_one,admin_one),(auth_two,admin_two);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_one,role_id,'active','Phase 11E Admin One',false)
  returning admin_users.permission_version,admin_users.session_version
  into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,permission_version_snapshot,session_version_snapshot
  ) values(session_one,admin_one,auth_one,'active',now()+interval '1 hour',permission_version,session_version);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_two,role_id,'active','Phase 11E Admin Two',false)
  returning admin_users.permission_version,admin_users.session_version
  into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,permission_version_snapshot,session_version_snapshot
  ) values(session_two,admin_two,auth_two,'active',now()+interval '1 hour',permission_version,session_version);

  workspace:=public.get_admin_housing_workspace(
    admin_one,auth_one,'aal2',owner_wallet,'',20,0,'phase11e:admin:workspace');
  perform pg_temp.phase11e_assert(
    workspace->>'status'='loaded' and jsonb_array_length(workspace->'furniture')=6
      and jsonb_array_length(workspace->'templates')>=1
      and workspace#>>'{playerHome,walletAddress}'=owner_wallet,
    'authorized AAL2 administration inspects bounded configuration and one owner projection'
  );
  result:=public.create_admin_housing_upgrade_successor(
    admin_one,auth_one,'aal2','e1100000-0000-4000-8000-000000000101',1,
    '{"dustCost":275,"storageCapacity":26,"furnitureCapacity":13}'::jsonb,
    'Create a reviewed local-only successor for deterministic Phase 11E validation.',
    'phase11e:admin:upgrade:create');
  draft_version_id:=(result#>>'{version,id}')::uuid;
  perform pg_temp.phase11e_assert(
    result->>'status'='created' and (result->>'activeVersionUnchanged')::boolean
      and (select upgrade_version_id='e1100000-0000-4000-8000-000000000101'
        from public.housing_active_upgrade_versions
        where upgrade_definition_id='e1100000-0000-4000-8000-000000000100'),
    'upgrade edits create a draft successor without rewriting active configuration'
  );
  result:=public.transition_admin_housing_upgrade(
    admin_one,auth_one,'aal2',draft_version_id,1,'validate',
    'Validate the bounded local successor while retaining the existing active pointer.',
    'phase11e:admin:upgrade:validate');
  perform pg_temp.phase11e_assert(result->>'status'='validated','successor validation records lifecycle evidence');

  result:=public.request_admin_housing_reconciliation(
    admin_one,auth_one,'aal2',owner_wallet,'layout_head',80,
    'Verify the immutable active layout head using bounded local evidence only.',
    'phase11e:admin:reconcile');
  result:=public.run_housing_maintenance(50,'phase11e:worker:maintenance');
  perform pg_temp.phase11e_assert(
    result->>'status'='processed' and (result->>'automaticItemCorrections')::integer=0
      and (result->>'automaticDustCorrections')::integer=0
      and exists(select 1 from public.housing_reconciliation_queue
        where player_home_id=home_id and reconciliation_type='layout_head' and status='resolved'),
    'maintenance validates layout heads without automatic item or DUST corrections'
  );

  update public.home_storage_containers set capacity=23 where id=storage_id;
  result:=public.request_admin_housing_correction(
    admin_one,auth_one,'aal2',owner_wallet,'repair_storage_mismatch',home_version,
    '{"currentCapacity":23,"authoritativeCapacity":24,"itemsMoved":0}'::jsonb,
    'Request projection-only storage capacity repair with preserved item history.',
    'phase11e:admin:correction:request');
  correction_id:=(result#>>'{correction,id}')::uuid;
  perform pg_temp.phase11e_assert(
    public.apply_admin_housing_correction(
      admin_one,auth_one,'aal2',correction_id,1,
      'Attempt same-operator review to prove dual control is enforced locally.',
      'phase11e:admin:correction:self')->>'status'='independent_review_required',
    'the correction requester cannot self-approve an AAL2 correction'
  );
  result:=public.apply_admin_housing_correction(
    admin_two,auth_two,'aal2',correction_id,1,
    'Independently approve the safe capacity projection repair with no item movement.',
    'phase11e:admin:correction:apply');
  perform pg_temp.phase11e_assert(
    result->>'status'='applied' and (result->>'itemsMoved')::integer=0
      and (select capacity=24 from public.home_storage_containers where id=storage_id),
    'independent review repairs only the safe storage projection and preserves items'
  );
end;
$$;

do $$
declare blocked boolean:=false;
begin
  begin
    update public.home_layout_revisions set change_summary='["rewritten"]'::jsonb
    where id=(select id from public.home_layout_revisions limit 1);
  exception when sqlstate '55000' then blocked:=true;
  end;
  perform pg_temp.phase11e_assert(blocked,'saved layout revisions reject rewriting');
end;
$$;

select pg_temp.phase11e_assert(
  not has_table_privilege('authenticated','public.home_layout_revisions','SELECT')
  and not has_table_privilege('authenticated','public.home_storage_stacks','SELECT')
  and not has_table_privilege('service_role','public.player_home_upgrade_transactions','SELECT')
  and has_function_privilege('service_role','public.get_player_housing_workspace(text,text)','EXECUTE')
  and has_function_privilege('service_role','public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.transfer_player_home_storage(text,uuid,uuid,text,uuid,integer,integer,integer,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.get_admin_housing_workspace(uuid,uuid,text,text,text,integer,integer,text)','EXECUTE')
  and has_function_privilege('service_role','public.run_housing_maintenance(integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.get_player_housing_workspace(text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.run_housing_maintenance(integer,text)','EXECUTE'),
  'RLS and grants expose only narrow service-authorized housing RPCs'
);

select 'Phase 11E housing execution assertions passed' as result;

rollback;
