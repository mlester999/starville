\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.economy_assert(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode='P0001',
      message='ECONOMY_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

create or replace function pg_temp.economy_assert_check_violation(
  statement text,
  assertion_message text
)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when check_violation then
    return;
  end;
  raise exception using errcode='P0001',
    message='ECONOMY_ASSERTION_FAILED: ' || assertion_message;
end;
$$;

do $$
declare
  wallet constant text := '11111111111111111111111111111131';
  player_id constant uuid := '9a000000-0000-4000-8000-000000000001';
  creator_id constant uuid := '9a000000-0000-4000-8000-000000000011';
  reviewer_one_id constant uuid := '9a000000-0000-4000-8000-000000000012';
  reviewer_two_id constant uuid := '9a000000-0000-4000-8000-000000000013';
  analyst_id constant uuid := '9a000000-0000-4000-8000-000000000014';
  creator_auth constant uuid := '9a000000-0000-4000-8000-000000000021';
  reviewer_one_auth constant uuid := '9a000000-0000-4000-8000-000000000022';
  reviewer_two_auth constant uuid := '9a000000-0000-4000-8000-000000000023';
  analyst_auth constant uuid := '9a000000-0000-4000-8000-000000000024';
  creator_session constant uuid := '9a000000-0000-4000-8000-000000000031';
  reviewer_one_session constant uuid := '9a000000-0000-4000-8000-000000000032';
  reviewer_two_session constant uuid := '9a000000-0000-4000-8000-000000000033';
  analyst_session constant uuid := '9a000000-0000-4000-8000-000000000034';
  super_role uuid;
  analyst_role uuid;
  published_map_version uuid;
  shop_version uuid;
  fixture_offer_id constant uuid := '74000000-0000-4000-8000-000000000011';
  offer_price bigint;
  dust_version integer;
  inventory_version integer;
  v_balance_before bigint;
  v_balance_after bigint;
  item_before integer;
  result jsonb;
  replay jsonb;
  correction_id uuid;
  high_correction_id uuid;
  policy_draft_id uuid;
  closed_policy_id uuid;
  active_policy_before uuid;
  shop_draft_id uuid;
  draft_revision integer;
  rollback_revision integer;
  mismatched_balance bigint;
  rejected boolean := false;
  admin_record record;
begin
  perform pg_temp.economy_assert(
    (select count(*) = 1
     from pg_proc routine
     join pg_namespace namespace on namespace.oid = routine.pronamespace
     where namespace.nspname = 'public'
       and routine.proname = 'update_admin_economy_shop_offer')
      and (select routine.provolatile = 'v'
            and routine.prosecdef
            and routine.proconfig @> array['search_path=""']
            and pg_get_userbyid(routine.proowner) = 'postgres'
           from pg_proc routine
           where routine.oid =
             'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure)
      and has_function_privilege(
        'service_role',
        'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)',
        'execute'
      )
      and not has_function_privilege(
        'authenticated',
        'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)',
        'execute'
      ),
    'the repaired shop-offer function keeps one volatile SECURITY DEFINER signature, owner, empty search path, and narrow grant'
  );
  perform pg_temp.economy_assert(
    position('selected_item' in lower(pg_get_functiondef(
      'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure
    ))) = 0
      and position('perform 1' in lower(pg_get_functiondef(
        'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure
      ))) > 0,
    'the deployed shop-offer replacement has no unused row variable and retains the eligibility existence check'
  );
  perform pg_temp.economy_assert(
    not exists(
      select 1 from public.economy_source_versions
      where char_length(source_key) not between 3 and 80
         or char_length(operation_key) not between 3 and 80
    ) and not exists(
      select 1 from public.economy_sink_versions
      where char_length(sink_key) not between 3 and 80
         or char_length(operation_key) not between 3 and 80
    ) and not exists(
      select 1 from public.economy_active_source_versions
      where char_length(source_key) not between 3 and 80
    ) and not exists(
      select 1 from public.economy_active_sink_versions
      where char_length(sink_key) not between 3 and 80
    ),
    'existing published and retained source and sink definitions satisfy the 3-80 boundary'
  );

  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_source_versions(
        id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,repeatable,cooldown_seconds,beginner_protected,risk_weight
      ) values (
        '9a100000-0000-4000-8000-000000000003','ab',1,'draft','source_two',
        'gameplay_reward','Two key','Two-character source key rejection fixture.',1,1,false,0,false,1
      )
    $statement$,
    'a two-character source key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_source_versions(
        id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,repeatable,cooldown_seconds,beginner_protected,risk_weight
      ) values (
        '9a100000-0000-4000-8000-000000000004',repeat('a',81),1,'draft','source_oversized',
        'gameplay_reward','Long key','Oversized source key rejection fixture.',1,1,false,0,false,1
      )
    $statement$,
    'an 81-character source key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_source_versions(
        id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,repeatable,cooldown_seconds,beginner_protected,risk_weight
      ) values (
        '9a100000-0000-4000-8000-000000000005','source-operation-two',1,'draft','ab',
        'gameplay_reward','Two operation','Two-character source operation rejection fixture.',1,1,false,0,false,1
      )
    $statement$,
    'a two-character source operation key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_source_versions(
        id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,repeatable,cooldown_seconds,beginner_protected,risk_weight
      ) values (
        '9a100000-0000-4000-8000-000000000006','source-operation-oversized',1,'draft',repeat('a',81),
        'gameplay_reward','Long operation','Oversized source operation rejection fixture.',1,1,false,0,false,1
      )
    $statement$,
    'an 81-character source operation key is rejected'
  );

  insert into public.economy_source_versions(
    id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
    minimum_amount,maximum_amount,repeatable,cooldown_seconds,beginner_protected,risk_weight
  ) values
    ('9a100000-0000-4000-8000-000000000001','abc',1,'draft','abc','gameplay_reward',
      'Three key','Three-character source and operation key acceptance fixture.',1,1,false,0,false,1),
    ('9a100000-0000-4000-8000-000000000002',repeat('a',80),1,'draft',repeat('a',80),
      'gameplay_reward','Eighty key','Eighty-character source and operation key acceptance fixture.',1,1,false,0,false,1);
  insert into public.economy_active_source_versions(source_key,source_version_id) values
    ('abc','9a100000-0000-4000-8000-000000000001'),
    (repeat('a',80),'9a100000-0000-4000-8000-000000000002');
  perform pg_temp.economy_assert(
    (select char_length(source_key)=3 and char_length(operation_key)=3
     from public.economy_source_versions where id='9a100000-0000-4000-8000-000000000001')
      and (select char_length(source_key)=80 and char_length(operation_key)=80
       from public.economy_source_versions where id='9a100000-0000-4000-8000-000000000002')
      and (select count(*)=2 from public.economy_active_source_versions
       where source_version_id in (
         '9a100000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000002'
       )),
    'format-valid 3-character and 80-character source, operation, and active keys are accepted'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_active_source_versions(source_key,source_version_id)
      values ('ab','9a100000-0000-4000-8000-000000000001')
    $statement$,
    'a two-character active source-version key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_active_source_versions(source_key,source_version_id)
      values (repeat('a',81),'9a100000-0000-4000-8000-000000000001')
    $statement$,
    'an 81-character active source-version key is rejected'
  );

  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_sink_versions(
        id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,reversible_by_refund,beginner_protected
      ) values (
        '9a100000-0000-4000-8000-000000000013','ab',1,'draft','sink_two',
        'shop_purchase','Two key','Two-character sink key rejection fixture.',1,1,true,false
      )
    $statement$,
    'a two-character sink key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_sink_versions(
        id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,reversible_by_refund,beginner_protected
      ) values (
        '9a100000-0000-4000-8000-000000000014',repeat('b',81),1,'draft','sink_oversized',
        'shop_purchase','Long key','Oversized sink key rejection fixture.',1,1,true,false
      )
    $statement$,
    'an 81-character sink key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_sink_versions(
        id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,reversible_by_refund,beginner_protected
      ) values (
        '9a100000-0000-4000-8000-000000000015','sink-operation-two',1,'draft','ab',
        'shop_purchase','Two operation','Two-character sink operation rejection fixture.',1,1,true,false
      )
    $statement$,
    'a two-character sink operation key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_sink_versions(
        id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
        minimum_amount,maximum_amount,reversible_by_refund,beginner_protected
      ) values (
        '9a100000-0000-4000-8000-000000000016','sink-operation-oversized',1,'draft',repeat('b',81),
        'shop_purchase','Long operation','Oversized sink operation rejection fixture.',1,1,true,false
      )
    $statement$,
    'an 81-character sink operation key is rejected'
  );

  insert into public.economy_sink_versions(
    id,sink_key,version_number,lifecycle_status,operation_key,category,label,description,
    minimum_amount,maximum_amount,reversible_by_refund,beginner_protected
  ) values
    ('9a100000-0000-4000-8000-000000000011','def',1,'draft','def','shop_purchase',
      'Three key','Three-character sink and operation key acceptance fixture.',1,1,true,false),
    ('9a100000-0000-4000-8000-000000000012',repeat('b',80),1,'draft',repeat('b',80),
      'shop_purchase','Eighty key','Eighty-character sink and operation key acceptance fixture.',1,1,true,false);
  insert into public.economy_active_sink_versions(sink_key,sink_version_id) values
    ('def','9a100000-0000-4000-8000-000000000011'),
    (repeat('b',80),'9a100000-0000-4000-8000-000000000012');
  perform pg_temp.economy_assert(
    (select char_length(sink_key)=3 and char_length(operation_key)=3
     from public.economy_sink_versions where id='9a100000-0000-4000-8000-000000000011')
      and (select char_length(sink_key)=80 and char_length(operation_key)=80
       from public.economy_sink_versions where id='9a100000-0000-4000-8000-000000000012')
      and (select count(*)=2 from public.economy_active_sink_versions
       where sink_version_id in (
         '9a100000-0000-4000-8000-000000000011','9a100000-0000-4000-8000-000000000012'
       )),
    'format-valid 3-character and 80-character sink, operation, and active keys are accepted'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_active_sink_versions(sink_key,sink_version_id)
      values ('ab','9a100000-0000-4000-8000-000000000011')
    $statement$,
    'a two-character active sink-version key is rejected'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      insert into public.economy_active_sink_versions(sink_key,sink_version_id)
      values (repeat('b',81),'9a100000-0000-4000-8000-000000000011')
    $statement$,
    'an 81-character active sink-version key is rejected'
  );

  delete from public.economy_active_source_versions
  where source_version_id in (
    '9a100000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000002'
  );
  delete from public.economy_source_versions
  where id in (
    '9a100000-0000-4000-8000-000000000001','9a100000-0000-4000-8000-000000000002'
  );
  delete from public.economy_active_sink_versions
  where sink_version_id in (
    '9a100000-0000-4000-8000-000000000011','9a100000-0000-4000-8000-000000000012'
  );
  delete from public.economy_sink_versions
  where id in (
    '9a100000-0000-4000-8000-000000000011','9a100000-0000-4000-8000-000000000012'
  );

  select active_published_version_id into strict published_map_version
  from public.world_maps where slug='lantern-square';

  insert into public.player_profiles(
    id,wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values (
    player_id,wallet,'Economy Fixture','moss','lantern-square',published_map_version,
    5,5.7,'south'
  );
  result:=public.bootstrap_player_cozy_gameplay(
    wallet,'phase9a-bootstrap-0001','phase9a:bootstrap'
  );
  perform pg_temp.economy_assert(
    result->>'status'='loaded' and (result#>>'{dust,balance}')::bigint=250,
    'starter balance is granted exactly once through the existing bootstrap authority'
  );
  perform pg_temp.economy_assert(
    (select count(*)=1 and min(ledger.balance_before)=0 and min(ledger.resulting_balance)=250
     from public.player_dust_ledger ledger
     where ledger.player_profile_id=player_id and ledger.operation_key='starter_grant'),
    'starter grant has one enriched immutable ledger entry with exact arithmetic'
  );

  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced immediate;
  alter table public.player_dust_ledger disable trigger player_dust_ledger_append_only;
  perform pg_temp.economy_assert_check_violation(
    $statement$
      update public.player_dust_ledger set operation_key='ab'
      where player_profile_id='9a000000-0000-4000-8000-000000000001'
    $statement$,
    'a two-character canonical ledger operation key is rejected'
  );
  update public.player_dust_ledger set operation_key='abc'
  where player_profile_id=player_id;
  perform pg_temp.economy_assert(
    (select operation_key='abc' from public.player_dust_ledger where player_profile_id=player_id),
    'a three-character canonical ledger operation key is accepted'
  );
  update public.player_dust_ledger set operation_key=repeat('a',80)
  where player_profile_id=player_id;
  perform pg_temp.economy_assert(
    (select char_length(operation_key)=80 from public.player_dust_ledger where player_profile_id=player_id),
    'an 80-character canonical ledger operation key is accepted'
  );
  perform pg_temp.economy_assert_check_violation(
    $statement$
      update public.player_dust_ledger set operation_key=repeat('a',81)
      where player_profile_id='9a000000-0000-4000-8000-000000000001'
    $statement$,
    'an 81-character canonical ledger operation key is rejected'
  );
  update public.player_dust_ledger set operation_key='starter_grant'
  where player_profile_id=player_id;
  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced immediate;
  alter table public.player_dust_ledger enable trigger player_dust_ledger_append_only;
  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced deferred;

  update public.player_profiles profile set
    current_map_id=map.slug,
    current_map_version_id=anchor.map_version_id,
    safe_position_x=anchor.position_x,
    safe_position_y=anchor.position_y
  from public.cozy_shop_interactions anchor
  join public.world_maps map on map.id=anchor.world_map_id
  where profile.id=player_id
    and anchor.shop_definition_id='74000000-0000-4000-8000-000000000001'
    and anchor.active;

  select active.shop_version_id,offer.unit_price into strict shop_version,offer_price
  from public.economy_active_shop_versions active
  join public.economy_shop_version_offers offer on offer.shop_version_id=active.shop_version_id
  where active.shop_definition_id='74000000-0000-4000-8000-000000000001'
    and offer.offer_id=fixture_offer_id;
  select state_version,balance into strict dust_version,v_balance_before
  from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version
  from public.player_inventory_state where player_profile_id=player_id;
  select private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')
    into item_before;

  result:=public.purchase_player_economy_shop(
    wallet,'lantern-general-store',fixture_offer_id,2,offer_price+1,shop_version,1,
    dust_version,inventory_version,'phase9a-stale-price-0001','phase9a:stale-price'
  );
  perform pg_temp.economy_assert(
    result->>'status'='shop_changed'
      and (select balance=v_balance_before from public.player_dust_accounts where player_profile_id=player_id)
      and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=item_before,
    'a stale client price is rejected without charging DUST or granting inventory'
  );

  result:=public.purchase_player_economy_shop(
    wallet,'lantern-general-store',fixture_offer_id,2,offer_price,shop_version,1,
    dust_version,inventory_version,'phase9a-purchase-0001','phase9a:purchase'
  );
  select balance into strict v_balance_after from public.player_dust_accounts where player_profile_id=player_id;
  perform pg_temp.economy_assert(
    result->>'status'='updated' and result#>>'{receipt,receiptId}' like 'SHOP-%'
      and v_balance_after=v_balance_before-(offer_price*2)
      and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=item_before+2,
    'a published ordinary offer settles DUST and inventory atomically: result=' || result::text
      || ', before=' || v_balance_before::text || ', after=' || v_balance_after::text
      || ', price=' || offer_price::text || ', item-before=' || item_before::text
      || ', item-after=' || private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')::text
  );
  perform pg_temp.economy_assert(
    (select count(*)=1 and min(total_price)=offer_price*2
     from public.economy_purchase_receipts where player_profile_id=player_id)
      and (select count(*)=1 and min(ledger.balance_before)=v_balance_before and min(ledger.resulting_balance)=v_balance_after
       from public.player_dust_ledger ledger
       where ledger.player_profile_id=player_id and ledger.operation_key='shop_purchase'),
    'one immutable receipt references one ledger charge with exact before and after balances'
  );

  replay:=public.purchase_player_economy_shop(
    wallet,'lantern-general-store',fixture_offer_id,2,offer_price,shop_version,1,
    dust_version,inventory_version,'phase9a-purchase-0001','phase9a:purchase-replay'
  );
  perform pg_temp.economy_assert(
    replay->>'status'='replayed'
      and replay#>>'{receipt,receiptId}'=result#>>'{receipt,receiptId}'
      and (select balance=v_balance_after from public.player_dust_accounts where player_profile_id=player_id)
      and private.cozy_owned_quantity(player_id,'71000000-0000-4000-8000-000000000001')=item_before+2
      and (select count(*)=1 from public.economy_purchase_receipts where player_profile_id=player_id),
    'a purchase retry returns the original receipt without a second charge or item grant'
  );

  begin
    update public.economy_purchase_receipts set quantity=3 where player_profile_id=player_id;
  exception when object_not_in_prerequisite_state then
    rejected:=true;
  end;
  perform pg_temp.economy_assert(rejected,'completed purchase receipts cannot be edited');
  rejected:=false;

  result:=public.run_economy_reconciliation_worker(100,'phase9a:reconcile-balanced');
  perform pg_temp.economy_assert(
    (result->>'mismatchCount')::integer=0 and not (result->>'autoCorrected')::boolean,
    'reconciliation confirms the balanced account and never auto-corrects'
  );

  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced deferred;
  update public.player_dust_accounts set balance=balance+7 where player_profile_id=player_id
  returning balance into mismatched_balance;
  result:=public.run_economy_reconciliation_worker(100,'phase9a:reconcile-mismatch');
  perform pg_temp.economy_assert(
    (result->>'mismatchCount')::integer=1
      and (select balance=mismatched_balance from public.player_dust_accounts where player_profile_id=player_id)
      and exists(select 1 from public.economy_reconciliation_results where status='mismatch' and not auto_corrected)
      and exists(select 1 from public.economy_risk_signals where player_profile_id=player_id and signal_type='reconciliation_mismatch' and status='open'),
    'a mismatch creates review evidence and a risk signal without rewriting the account'
  );
  update public.player_dust_accounts set balance=balance-7 where player_profile_id=player_id;
  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced immediate;
  set constraints player_dust_accounts_balanced, player_dust_ledger_balanced deferred;

  select id into strict super_role from public.admin_roles where key='super_admin';
  select id into strict analyst_role from public.admin_roles where key='read_only_analyst';
  insert into auth.users(id,email) values
    (creator_id,'economy-creator@example.invalid'),
    (reviewer_one_id,'economy-reviewer-one@example.invalid'),
    (reviewer_two_id,'economy-reviewer-two@example.invalid'),
    (analyst_id,'economy-analyst@example.invalid');
  insert into auth.sessions(id,user_id) values
    (creator_auth,creator_id),(reviewer_one_auth,reviewer_one_id),
    (reviewer_two_auth,reviewer_two_id),(analyst_auth,analyst_id);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required) values
    (creator_id,super_role,'active','Economy Creator',false),
    (reviewer_one_id,super_role,'active','Economy Reviewer One',false),
    (reviewer_two_id,super_role,'active','Economy Reviewer Two',false),
    (analyst_id,analyst_role,'active','Economy Analyst',false);
  for admin_record in select user_id,permission_version,session_version from public.admin_users
    where user_id in (creator_id,reviewer_one_id,reviewer_two_id,analyst_id)
  loop
    insert into public.admin_sessions(
      id,user_id,auth_session_id,status,expires_at,permission_version_snapshot,session_version_snapshot
    ) values (
      case admin_record.user_id when creator_id then creator_session when reviewer_one_id then reviewer_one_session
        when reviewer_two_id then reviewer_two_session else analyst_session end,
      admin_record.user_id,
      case admin_record.user_id when creator_id then creator_auth when reviewer_one_id then reviewer_one_auth
        when reviewer_two_id then reviewer_two_auth else analyst_auth end,
      'active',now()+interval '1 hour',admin_record.permission_version,admin_record.session_version
    );
  end loop;

  result:=public.get_admin_economy_overview(creator_id,creator_auth,'aal2');
  perform pg_temp.economy_assert(
    (result#>>'{dust,totalSupply}')::bigint>=0
      and (result#>>'{dust,fundedPlayerCount}')::integer>=1
      and (result#>>'{dust,averageBalance}')::numeric>=0
      and (result#>>'{dust,medianBalance}')::bigint>=0
      and (result#>>'{dust,maximumBalance}')::bigint>=250
      and (result#>>'{dust,lifetimeCreated}')::bigint>=250
      and jsonb_array_length(result->'sources')=11
      and jsonb_array_length(result->'sinks')=6
      and exists(select 1 from public.economy_admin_rate_limits
        where admin_user_id=creator_id and scope='overview_read' and attempt_count=1),
    'the authorized baseline reports real distribution, lifetime, and source/sink metrics'
  );

  result:=public.get_admin_economy_workspace(
    creator_id,creator_auth,'aal2','sources',null,'',1,50
  );
  perform pg_temp.economy_assert(
    jsonb_array_length(result->'items')>=6
      and result#>>'{items,0,ownerModule}' is not null,
    'the permission-scoped source registry read model exposes real bounded registry metadata'
  );
  result:=public.get_admin_economy_workspace(
    creator_id,creator_auth,'aal2','shop','74000000-0000-4000-8000-000000000001','',1,50
  );
  perform pg_temp.economy_assert(
    result#>>'{shop,slug}'='lantern-general-store'
      and jsonb_array_length(result->'versions')>=1
      and jsonb_array_length(result#>'{versions,0,offers}')>=1,
    'the shop detail read model exposes versioned offers without raw table access'
  );
  result:=public.get_admin_economy_ledger_filtered(
    creator_id,creator_auth,'aal2','',1,10,'debit',null,'village-supply-shop',
    null,null,1,1000000,'completed'
  );
  perform pg_temp.economy_assert(
    (result->>'total')::integer>=1
      and result#>>'{items,0,direction}'='debit'
      and result#>>'{items,0,status}'='completed',
    'the bounded ledger read model applies authoritative direction and sink filters'
  );
  result:=public.get_player_economy_shop(wallet,'lantern-general-store','phase9a:shop-readiness');
  perform pg_temp.economy_assert(
    result->>'availability'='open'
      and (result#>>'{offers,0,purchasedToday}')::integer>=0
      and (result#>>'{offers,0,remainingToday}')::integer>=0
      and result#>>'{offers,0,itemDescription}' is not null,
    'the player shop catalog exposes safe authoritative limit and item presentation state'
  );
  result:=public.create_admin_economy_policy_draft(
    creator_id,creator_auth,'aal2','99000000-0000-4000-8000-000000000001',
    true,false,true,true,250,24,500,5000,10,730,60,now(),
    'phase9a:closed-shop-read-policy'
  );
  closed_policy_id:=(result->>'versionId')::uuid;
  select policy_version_id into strict active_policy_before
  from public.economy_active_policy where singleton_key;
  update public.economy_active_policy
  set policy_version_id=closed_policy_id,activated_at=now()
  where singleton_key;
  result:=public.get_player_economy_shop(
    wallet,'lantern-general-store','phase9a:closed-shop-readiness'
  );
  perform pg_temp.economy_assert(
    result->>'status'='loaded'
      and result->>'availability'='closed'
      and jsonb_array_length(result->'offers')>=1,
    'a paused purchase policy keeps the read-only catalog available with a closed state'
  );
  update public.economy_active_policy
  set policy_version_id=active_policy_before,activated_at=now()
  where singleton_key;
  result:=public.get_player_economy(wallet,null,20,'phase9a:history-readiness');
  perform pg_temp.economy_assert(
    exists(select 1 from jsonb_array_elements(result->'history') entry
      where entry->>'operationKey'='shop_purchase'
        and entry->>'relatedPublicReceiptId' like 'SHOP-%'
        and entry->>'referenceLabel'='Village Supply Shop'),
    'DUST history links the shop debit to a safe public receipt and friendly server label'
  );

  begin
    perform public.create_admin_economy_correction(
      analyst_id,analyst_auth,'aal2',player_id,10,'support_repair',
      'Unauthorized correction fixture explanation.','phase9a:analyst-correction'
    );
  exception when insufficient_privilege then
    rejected:=true;
  end;
  perform pg_temp.economy_assert(rejected,'a read-only analyst cannot create a correction');
  rejected:=false;

  result:=public.create_admin_economy_correction(
    creator_id,creator_auth,'aal2',player_id,20,'support_repair',
    'Verified missing low-value reward for the local fixture.','phase9a:correction-low'
  );
  correction_id:=(result->>'correctionId')::uuid;
  perform pg_temp.economy_assert(result->>'status'='pending_review' and not (result->>'requiresSecondApproval')::boolean,
    'an authorized creator may request but cannot directly settle a low-value correction');
  result:=public.review_admin_economy_correction(
    creator_id,creator_auth,'aal2',correction_id,'approve','phase9a:correction-self'
  );
  perform pg_temp.economy_assert(result->>'status'='separation_of_duty','a correction creator cannot self-approve');
  result:=public.review_admin_economy_correction(
    reviewer_one_id,reviewer_one_auth,'aal2',correction_id,'approve','phase9a:correction-low-approve'
  );
  perform pg_temp.economy_assert(
    result->>'status'='settled'
      and (select count(*)=1 from public.player_dust_ledger where reference_id=correction_id::text and operation_key='administrative_correction'),
    'one independent reviewer atomically settles one low-value correction ledger entry'
  );
  replay:=public.review_admin_economy_correction(
    reviewer_two_id,reviewer_two_auth,'aal2',correction_id,'approve','phase9a:correction-low-replay'
  );
  perform pg_temp.economy_assert(
    replay->>'status'='already_final'
      and (select count(*)=1 from public.player_dust_ledger where reference_id=correction_id::text),
    'a duplicate approval cannot settle a correction twice'
  );

  result:=public.create_admin_economy_correction(
    creator_id,creator_auth,'aal2',player_id,600,'incident_repair',
    'Verified higher-value incident correction requiring two reviewers.','phase9a:correction-high'
  );
  high_correction_id:=(result->>'correctionId')::uuid;
  perform pg_temp.economy_assert((result->>'requiresSecondApproval')::boolean,
    'a correction above the low-value threshold requires two reviewers');
  result:=public.review_admin_economy_correction(
    reviewer_one_id,reviewer_one_auth,'aal2',high_correction_id,'approve','phase9a:correction-high-first'
  );
  perform pg_temp.economy_assert(result->>'status'='second_approval_required',
    'the first independent high-value approval does not mutate DUST');
  result:=public.review_admin_economy_correction(
    reviewer_two_id,reviewer_two_auth,'aal2',high_correction_id,'approve','phase9a:correction-high-second'
  );
  perform pg_temp.economy_assert(
    result->>'status'='settled'
      and (select first_approved_by_admin_id=reviewer_one_id and second_approved_by_admin_id=reviewer_two_id
       from public.economy_correction_requests where id=high_correction_id)
      and (select count(*)=1 from public.player_dust_ledger where reference_id=high_correction_id::text),
    'two distinct reviewers settle one high-value correction exactly once'
  );

  result:=public.create_admin_economy_policy_draft(
    creator_id,creator_auth,'aal2','99000000-0000-4000-8000-000000000001',
    true,true,true,true,250,24,500,5000,10,730,60,now(),
    'phase9a:policy-draft'
  );
  policy_draft_id:=(result->>'versionId')::uuid;
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_policy_version(
    creator_id,creator_auth,'aal2',policy_draft_id,draft_revision,'validate',null,
    'phase9a:policy-validate'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_policy_version(
    creator_id,creator_auth,'aal2',policy_draft_id,draft_revision,'submit_review',null,
    'phase9a:policy-review'
  );
  draft_revision:=(result->>'revision')::integer;
  replay:=public.operate_admin_economy_policy_version(
    creator_id,creator_auth,'aal2',policy_draft_id,draft_revision,'approve',null,
    'phase9a:policy-self-approve'
  );
  perform pg_temp.economy_assert(replay->>'status'='separation_of_duty',
    'a policy draft creator cannot approve their own policy');
  result:=public.operate_admin_economy_policy_version(
    reviewer_one_id,reviewer_one_auth,'aal2',policy_draft_id,draft_revision,'approve',null,
    'phase9a:policy-approve'
  );
  draft_revision:=(result->>'revision')::integer;
  perform pg_temp.economy_assert(
    result->>'status'='approved'
      and (select approved_by_admin_id=reviewer_one_id and approved_at is not null
        from public.economy_policy_versions where id=policy_draft_id),
    'an independent publisher explicitly approves the exact reviewed policy revision'
  );
  result:=public.operate_admin_economy_policy_version(
    reviewer_one_id,reviewer_one_auth,'aal2',policy_draft_id,draft_revision,'schedule',
    now()+interval '1 day','phase9a:policy-schedule'
  );
  draft_revision:=(result->>'revision')::integer;
  perform pg_temp.economy_assert(
    result->>'status'='scheduled'
      and (select policy_version_id<>policy_draft_id from public.economy_active_policy where singleton_key),
    'scheduling an approved policy does not change the active policy before its effective time'
  );
  result:=public.operate_admin_economy_policy_version(
    reviewer_one_id,reviewer_one_auth,'aal2',policy_draft_id,draft_revision,'publish',null,
    'phase9a:policy-publish'
  );
  perform pg_temp.economy_assert(
    result->>'status'='published' and (result->>'active')::boolean
      and (select policy_version_id=policy_draft_id from public.economy_active_policy where singleton_key),
    'the reviewed policy workflow activates only an explicitly published effective version'
  );

  result:=public.create_admin_economy_shop_draft(
    creator_id,creator_auth,'aal2','74000000-0000-4000-8000-000000000001',shop_version,
    'Village Supply Shop','Reviewed local publication workflow fixture.',now(),'phase9a:shop-draft'
  );
  shop_draft_id:=(result->>'versionId')::uuid;
  draft_revision:=(result->>'revision')::integer;
  replay:=public.update_admin_economy_shop_offer(
    creator_id,creator_auth,'aal2','9a000000-0000-4000-8000-000000000099',1,
    fixture_offer_id,offer_price+2,20,40,0,true,'phase9a:shop-offer-missing-shop'
  );
  perform pg_temp.economy_assert(
    replay->>'status'='not_found',
    'shop offer editing rejects an unknown shop version without changing settlement state'
  );
  replay:=public.update_admin_economy_shop_offer(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,
    '9a000000-0000-4000-8000-000000000098',offer_price+2,20,40,0,true,
    'phase9a:shop-offer-missing-item'
  );
  perform pg_temp.economy_assert(
    replay->>'status'='protected_or_unknown_item',
    'shop offer editing rejects an unknown or ineligible item offer'
  );
  rejected:=false;
  begin
    perform public.update_admin_economy_shop_offer(
      analyst_id,analyst_auth,'aal2',shop_draft_id,draft_revision,fixture_offer_id,
      offer_price+2,20,40,0,true,'phase9a:shop-offer-unauthorized'
    );
  exception when insufficient_privilege then
    rejected:=true;
  end;
  perform pg_temp.economy_assert(
    rejected,
    'an administrator without economy.shop.edit cannot update a shop offer'
  );
  rejected:=false;
  result:=public.update_admin_economy_shop_offer(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,fixture_offer_id,
    offer_price+2,20,40,0,true,'phase9a:shop-offer-update'
  );
  draft_revision:=(result->>'revision')::integer;
  perform pg_temp.economy_assert(
    result->>'status'='draft'
      and (select unit_price=offer_price+2 from public.economy_shop_version_offers
        where shop_version_id=shop_draft_id and offer_id=fixture_offer_id)
      and (select buy_price=offer_price from public.cozy_shop_offers where id=fixture_offer_id)
      and exists(
        select 1 from public.admin_audit_logs
        where event_key='economy.shop.offer_updated'
          and actor_user_id=creator_id
          and request_id='phase9a:shop-offer-update'
      ),
    'a valid draft offer update preserves canonical settlement pricing until reviewed publication'
  );
  replay:=public.update_admin_economy_shop_offer(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision-1,fixture_offer_id,
    offer_price+3,20,40,0,true,'phase9a:shop-offer-stale'
  );
  perform pg_temp.economy_assert(
    replay->>'status'='revision_conflict'
      and (select unit_price=offer_price+2 from public.economy_shop_version_offers
        where shop_version_id=shop_draft_id and offer_id=fixture_offer_id),
    'a stale shop revision cannot overwrite the reviewed draft offer'
  );
  result:=public.operate_admin_economy_shop_version(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,'validate',null,
    'phase9a:shop-validate'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,'submit_review',null,
    'phase9a:shop-review'
  );
  draft_revision:=(result->>'revision')::integer;
  replay:=public.operate_admin_economy_shop_version(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,'approve',null,
    'phase9a:shop-self-approve'
  );
  perform pg_temp.economy_assert(replay->>'status'='separation_of_duty',
    'a shop draft creator cannot approve their own shop version');
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_draft_id,draft_revision,'approve',null,
    'phase9a:shop-approve'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_draft_id,draft_revision,'schedule',
    now()+interval '1 day','phase9a:shop-schedule'
  );
  draft_revision:=(result->>'revision')::integer;
  perform pg_temp.economy_assert(
    result->>'status'='scheduled'
      and (select shop_version_id<>shop_draft_id from public.economy_active_shop_versions
        where shop_definition_id='74000000-0000-4000-8000-000000000001'),
    'scheduling an approved shop version does not change the player catalog early'
  );
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_draft_id,draft_revision,'publish',null,
    'phase9a:shop-publish'
  );
  perform pg_temp.economy_assert(
    result->>'status'='published' and (result->>'active')::boolean
      and (select shop_version_id=shop_draft_id from public.economy_active_shop_versions
        where shop_definition_id='74000000-0000-4000-8000-000000000001')
      and (select buy_price=offer_price+2 from public.cozy_shop_offers where id=fixture_offer_id),
    'the structured shop workflow publishes an exact reviewed version and synchronizes canonical pricing'
  );
  begin
    update public.economy_shop_version_offers set unit_price=1
    where shop_version_id=shop_draft_id and offer_id=fixture_offer_id;
  exception when object_not_in_prerequisite_state then
    rejected:=true;
  end;
  perform pg_temp.economy_assert(rejected,'offers attached to a published shop version are immutable');
  rejected:=false;

  select revision into strict rollback_revision
  from public.economy_policy_versions where id=active_policy_before;
  result:=public.operate_admin_economy_policy_version(
    reviewer_one_id,reviewer_one_auth,'aal2',active_policy_before,rollback_revision,'rollback',null,
    'phase9a:policy-rollback'
  );
  perform pg_temp.economy_assert(
    result->>'status'='rolled_back'
      and (result->>'active')::boolean
      and (select lifecycle_status='published' from public.economy_policy_versions
        where id=active_policy_before),
    'rollback reactivates an immutable previously published policy without editing it'
  );
  select revision into strict rollback_revision
  from public.economy_shop_versions where id=shop_version;
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_version,rollback_revision,'rollback',null,
    'phase9a:shop-rollback'
  );
  perform pg_temp.economy_assert(
    result->>'status'='rolled_back'
      and (result->>'active')::boolean
      and (select shop_version_id=shop_version from public.economy_active_shop_versions
        where shop_definition_id='74000000-0000-4000-8000-000000000001')
      and (select buy_price=offer_price from public.cozy_shop_offers where id=fixture_offer_id),
    'rollback reactivates immutable reviewed shop offers through the controlled active pointer'
  );

  result:=public.create_admin_economy_shop_draft(
    creator_id,creator_auth,'aal2','74000000-0000-4000-8000-000000000001',shop_version,
    'Village Supply Shop','Reviewed local disable workflow fixture.',now(),
    'phase9a:shop-disable-draft'
  );
  shop_draft_id:=(result->>'versionId')::uuid;
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,'validate',null,
    'phase9a:shop-disable-validate'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    creator_id,creator_auth,'aal2',shop_draft_id,draft_revision,'submit_review',null,
    'phase9a:shop-disable-review'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_draft_id,draft_revision,'approve',null,
    'phase9a:shop-disable-approve'
  );
  draft_revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_draft_id,draft_revision,'disable',null,
    'phase9a:shop-disable'
  );
  perform pg_temp.economy_assert(
    result->>'status'='disabled'
      and not (select active from public.cozy_shop_definitions
        where id='74000000-0000-4000-8000-000000000001'),
    'an independently approved disable version closes canonical player availability'
  );
  result:=public.get_player_economy_shop(
    wallet,'lantern-general-store','phase9a:disabled-shop-read'
  );
  perform pg_temp.economy_assert(
    result->>'status'='loaded' and result->>'availability'='closed'
      and jsonb_array_length(result->'offers')>=1,
    'a disabled shop retains its published read-only catalog with a closed state'
  );
  select state_version into strict dust_version
  from public.player_dust_accounts where player_profile_id=player_id;
  select state_version into strict inventory_version
  from public.player_inventory_state where player_profile_id=player_id;
  result:=public.purchase_player_economy_shop(
    wallet,'lantern-general-store',fixture_offer_id,1,offer_price,shop_version,rollback_revision,
    dust_version,inventory_version,'phase9a-disabled-buy-0001','phase9a:disabled-buy'
  );
  perform pg_temp.economy_assert(
    result->>'status'='shop_unavailable'
      and not exists(select 1 from public.economy_purchase_receipts
        where idempotency_key='phase9a-disabled-buy-0001'),
    'a disabled shop rejects settlement without a debit, item, or receipt'
  );
  result:=public.operate_admin_economy_shop_version(
    reviewer_one_id,reviewer_one_auth,'aal2',shop_version,rollback_revision,'rollback',null,
    'phase9a:shop-disable-rollback'
  );
  perform pg_temp.economy_assert(
    result->>'status'='rolled_back'
      and (select active from public.cozy_shop_definitions
        where id='74000000-0000-4000-8000-000000000001'),
    'controlled rollback reopens a disabled shop without mutating its published version'
  );

  select balance into strict v_balance_before from public.player_dust_accounts where player_profile_id=player_id;
  result:=public.record_admin_economy_simulation(
    creator_id,creator_auth,'aal2',42,100,30,
    '{"scenario":"balanced"}'::jsonb,'{"totalDustSupply":1000}'::jsonb,'phase9a:simulation'
  );
  perform pg_temp.economy_assert(
    result->>'runId' is not null and not (result->>'playerBalancesMutated')::boolean
      and (select balance=v_balance_before from public.player_dust_accounts where player_profile_id=player_id),
    'recording a deterministic simulation artifact never mutates a real player balance'
  );
end;
$$;

select 'economy postgres execution assertions passed' as result;
rollback;
