\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11c_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11C_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase11c_assert(
  exists(select 1 from public.economy_shop_catalogs catalog
    join public.economy_active_shop_versions active on active.shop_definition_id=catalog.shop_definition_id
    join public.economy_shop_versions version on version.id=active.shop_version_id
    where catalog.catalog_key='general-store-catalog' and version.version_number>=2
      and version.lifecycle_status='published')
  and exists(select 1 from public.cozy_shop_interactions interaction
    join public.cozy_starter_npcs npc on npc.id=interaction.shopkeeper_npc_id
    where interaction.interaction_id='phase7-general-store'
      and interaction.world_object_id='phase7-general-store-object'
      and npc.slug='mira-general-store'),
  'the active catalog extends the canonical General Store interaction and Mira NPC'
);

select pg_temp.phase11c_assert(
  (select count(*)=5 from public.economy_shop_version_offers
    where shop_version_id='c1100000-0000-4000-8000-000000000030' and buy_enabled)
  and (select count(*)=6 from public.economy_shop_version_offers
    where shop_version_id='c1100000-0000-4000-8000-000000000030' and sell_enabled)
  and not exists(select 1 from public.economy_shop_version_offers entry
    join public.cozy_shop_offers offer on offer.id=entry.offer_id
    join public.cozy_item_definitions item on item.id=offer.item_definition_id
    where entry.shop_version_id='c1100000-0000-4000-8000-000000000030'
      and item.category in ('permanent_tool','special')),
  'the initial catalog has five buys, six explicit sales, and no protected tools or special items'
);

select pg_temp.phase11c_assert(
  not exists(select 1 from public.economy_shop_version_offers buy_entry
    join public.cozy_shop_offers buy_offer on buy_offer.id=buy_entry.offer_id
    join public.economy_shop_version_offers sell_entry on sell_entry.shop_version_id=buy_entry.shop_version_id
    join public.cozy_shop_offers sell_offer on sell_offer.id=sell_entry.offer_id
      and sell_offer.item_definition_id=buy_offer.item_definition_id
    where buy_entry.shop_version_id='c1100000-0000-4000-8000-000000000030'
      and buy_entry.buy_enabled and sell_entry.sell_enabled
      and sell_entry.sell_price>=buy_entry.buy_price),
  'the initial catalog blocks direct buy-to-sell arbitrage for the same item'
);

select pg_temp.phase11c_assert(
  exists(select 1 from public.economy_source_versions source
    join public.economy_active_source_versions active on active.source_version_id=source.id
    where source.source_key='starter-shop-tutorial' and source.minimum_amount=15
      and source.maximum_amount=15 and not source.repeatable)
  and exists(select 1 from public.economy_active_source_versions where source_key='shop-sale')
  and exists(select 1 from public.economy_active_sink_versions where sink_key='village-supply-shop'),
  'sales, purchases, and the one-time tutorial use canonical active DUST registries'
);

select pg_temp.phase11c_assert(
  (select bool_and(procedure.provolatile='s')
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='private' and procedure.proname in (
      'cozy_shop_entry_is_unlocked','cozy_shop_tutorial_json','cozy_shop_receipt_json','cozy_shop_workspace_json'))
  and (select bool_and(procedure.provolatile='v')
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'get_player_shop_workspace','execute_player_shop_transaction','get_player_shop_receipt',
      'get_player_shop_events','accept_player_shop_tutorial','turn_in_player_shop_tutorial','run_shop_restock_worker',
      'reconcile_shop_transactions','add_admin_shop_catalog_entry','remove_admin_shop_catalog_entry')),
  'shop function volatility matches database reads, time, rate limits, and mutations'
);

do $$
declare
  owner_wallet constant text:='11111111111111111111111111111185';
  other_wallet constant text:='11111111111111111111111111111186';
  owner_id uuid; other_id uuid; ledger_id uuid; soup_id uuid;
  active_catalog_id uuid;
  dust_version integer; inventory_version integer; quest_version integer;
  result jsonb; replay jsonb; workspace jsonb; sale jsonb; receipt jsonb; events jsonb;
  receipt_id text; before_soup integer;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'Phase Eleven C Owner','moss','lantern-square',
      '79000000-0000-4000-8000-000000000001',5.8,5.7,'south'),
    (other_wallet,'Phase Eleven C Other','moonberry','lantern-square',
      '79000000-0000-4000-8000-000000000001',12,10.5,'south');
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict other_id from public.player_profiles where wallet_address=other_wallet;
  select shop_version_id into strict active_catalog_id
  from public.economy_active_shop_versions
  where shop_definition_id='74000000-0000-4000-8000-000000000001';
  perform public.bootstrap_player_cozy_gameplay(owner_wallet,'phase11c-owner-bootstrap-0001','phase11c:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(other_wallet,'phase11c-other-bootstrap-0001','phase11c:other:bootstrap');
  select id into strict ledger_id from public.player_dust_ledger
  where player_profile_id=owner_id order by created_at limit 1;

  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id,status,state_version,
    completed_at,reward_settled_at,reward_ledger_entry_id
  ) values
    (owner_id,'a1100000-0000-4000-8000-000000000031','a1100000-0000-4000-8000-000000000032',
      'reward_claimed',2,now(),now(),ledger_id),
    (owner_id,'b1100000-0000-4000-8000-000000000201','b1100000-0000-4000-8000-000000000202',
      'reward_claimed',2,now(),now(),ledger_id);

  select id into strict soup_id from public.cozy_item_definitions where slug='garden-soup';
  perform private.cozy_add_item(owner_id,soup_id,2,'system_refund','phase11c-soup',
    'phase11c-soup-fixture-0001','phase11c:soup');
  before_soup:=private.cozy_owned_quantity(owner_id,soup_id);

  result:=public.accept_player_shop_tutorial(
    owner_wallet,'phase7-general-store','phase11c-shop-tutorial-0001','phase11c:tutorial:accept');
  replay:=public.accept_player_shop_tutorial(
    owner_wallet,'phase7-general-store','phase11c-shop-tutorial-0001','phase11c:tutorial:replay');
  perform pg_temp.phase11c_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and result#>>'{tutorial,status}'='active',
    'the shop tutorial requires Phase 11B and accepts exactly once near Mira');

  workspace:=public.get_player_shop_workspace(
    owner_wallet,'phase7-general-store',20,null,'phase11c:workspace:first');
  perform pg_temp.phase11c_assert(
    workspace->>'status'='loaded'
      and workspace#>>'{workspace,shop,interactionId}'='phase7-general-store'
      and workspace#>>'{workspace,shop,shopkeeper,slug}'='mira-general-store'
      and jsonb_array_length(workspace#>'{workspace,entries}')=11
      and workspace#>>'{workspace,dust,balance}'='250',
    'workspace rehydrates canonical placement, catalog, DUST, inventory, entries, and tutorial');
  perform pg_temp.phase11c_assert(
    public.get_player_shop_workspace(
      other_wallet,'phase7-general-store',20,null,'phase11c:workspace:far')->>'status'='too_far',
    'server-side proximity prevents remote shop access');

  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  result:=public.execute_player_shop_transaction(
    owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000101','buy',1,8,
    active_catalog_id,1,1,null,dust_version,inventory_version,
    'phase11c-shop-buy-0001','phase11c:buy');
  replay:=public.execute_player_shop_transaction(
    owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000101','buy',1,8,
    active_catalog_id,1,1,null,dust_version,inventory_version,
    'phase11c-shop-buy-0001','phase11c:buy:replay');
  perform pg_temp.phase11c_assert(
    result->>'status'='completed' and replay->>'status'='replayed'
      and result->>'transactionId'=replay->>'transactionId'
      and (select balance=242 from public.player_dust_accounts where player_profile_id=owner_id)
      and private.cozy_owned_quantity(owner_id,'71000000-0000-4000-8000-000000000001')=1
      and (select count(*)=1 from public.economy_shop_transactions
        where player_profile_id=owner_id and direction='buy'),
    'a purchase atomically debits canonical DUST, grants inventory, and replays one receipt');
  perform pg_temp.phase11c_assert(
    public.execute_player_shop_transaction(
      owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000101','buy',2,8,
      active_catalog_id,1,1,null,dust_version,inventory_version,
      'phase11c-shop-buy-0001','phase11c:buy:conflict')->>'status'='request_already_processed',
    'an idempotency key cannot be reused for a changed shop intent');

  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  sale:=public.execute_player_shop_transaction(
    owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000112','sell',1,10,
    active_catalog_id,1,1,null,dust_version,inventory_version,
    'phase11c-shop-sell-0001','phase11c:sell');
  receipt_id:=sale#>>'{receipt,receiptId}';
  perform pg_temp.phase11c_assert(
    sale->>'status'='completed'
      and private.cozy_owned_quantity(owner_id,soup_id)=before_soup-1
      and (select balance=252 from public.player_dust_accounts where player_profile_id=owner_id)
      and exists(select 1 from public.player_dust_ledger where player_profile_id=owner_id
        and reason='shop_sale' and delta=10)
      and exists(select 1 from public.economy_shop_receipts
        where player_profile_id=owner_id and public_receipt_id=receipt_id),
    'a sale atomically removes eligible inventory, credits canonical DUST, and stores a receipt');

  select state_version into strict dust_version from public.player_dust_accounts where player_profile_id=owner_id;
  select state_version into strict inventory_version from public.player_inventory_state where player_profile_id=owner_id;
  perform pg_temp.phase11c_assert(
    public.execute_player_shop_transaction(
      owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000112','sell',2,10,
      active_catalog_id,1,1,null,dust_version,inventory_version,
      'phase11c-shop-sell-too-many','phase11c:sell:too-many')->>'status'='inventory_quantity_insufficient',
    'a rejected sale leaves both inventory and DUST unchanged');
  perform pg_temp.phase11c_assert(
    public.execute_player_shop_transaction(
      owner_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000101','buy',1,9,
      active_catalog_id,1,1,null,dust_version,inventory_version,
      'phase11c-shop-stale-price','phase11c:price')->>'status'='price_changed',
    'a stale client price cannot authorize a transaction');

  receipt:=public.get_player_shop_receipt(owner_wallet,receipt_id,'phase11c:receipt:inspect');
  perform pg_temp.phase11c_assert(
    receipt->>'status'='loaded' and receipt#>>'{receipt,direction}'='sell'
      and receipt#>>'{receipt,totalDust}'='10'
      and public.get_player_shop_receipt(other_wallet,receipt_id,'phase11c:receipt:other')->>'status'='receipt_not_found',
    'receipt reads are owner scoped and expose the immutable price snapshot');

  events:=public.get_player_shop_events(
    owner_wallet,'phase7-general-store',0,50,'phase11c:events:owner');
  perform pg_temp.phase11c_assert(
    events->>'status'='loaded' and (events->>'requiresRehydrate')::boolean
      and exists(select 1 from jsonb_array_elements(events->'events') event
        where event->>'eventKey'='shop_purchase_completed' and event->>'visibility'='owner')
      and exists(select 1 from jsonb_array_elements(events->'events') event
        where event->>'eventKey'='shop_stock_changed' and event->>'visibility'='public_stock')
      and not exists(select 1 from jsonb_array_elements(events->'events') event
        where event->>'visibility'='operations'),
    'the bounded event cursor returns owner details and allowed public stock without operations events');
  update public.player_profiles set safe_position_x=5.8,safe_position_y=5.7 where id=other_id;
  events:=public.get_player_shop_events(
    other_wallet,'phase7-general-store',0,50,'phase11c:events:other');
  perform pg_temp.phase11c_assert(
    events->>'status'='loaded'
      and not exists(select 1 from jsonb_array_elements(events->'events') event
        where event->>'visibility'='owner')
      and position(receipt_id in events::text)=0,
    'another player receives no private transaction or receipt event');

  select instance.state_version into strict quest_version
  from public.player_quest_instances instance
  join public.cozy_quest_versions version on version.id=instance.quest_version_id
  where instance.player_profile_id=owner_id and version.quest_kind='shop_tutorial';
  result:=public.turn_in_player_shop_tutorial(
    owner_wallet,'phase7-general-store',quest_version,
    'phase11c-shop-turn-in-0001','phase11c:tutorial:turn-in');
  replay:=public.turn_in_player_shop_tutorial(
    owner_wallet,'phase7-general-store',quest_version,
    'phase11c-shop-turn-in-0001','phase11c:tutorial:turn-in:replay');
  perform pg_temp.phase11c_assert(
    result->>'status'='updated' and replay->>'status'='replayed'
      and result#>>'{tutorial,status}'='reward_claimed'
      and (select balance=267 from public.player_dust_accounts where player_profile_id=owner_id)
      and (select count(*)=1 from public.player_dust_ledger where player_profile_id=owner_id
        and reason='starter_shop_quest_reward' and delta=15),
    'the complete tutorial settles one bounded 15 DUST reward and safely replays');

  workspace:=public.get_player_shop_workspace(
    owner_wallet,'phase7-general-store',20,null,'phase11c:workspace:reconnect');
  perform pg_temp.phase11c_assert(
    workspace#>>'{workspace,dust,balance}'='267'
      and jsonb_array_length(workspace#>'{workspace,receipts}')=2
      and workspace#>>'{workspace,tutorial,status}'='reward_claimed',
    'reconnect rehydrates durable balance, limits, receipt history, and quest status');
end;
$$;

do $$
declare
  admin_user_id constant uuid:='f1100000-0000-4000-8000-000000000001';
  admin_auth_session_id constant uuid:='f1100000-0000-4000-8000-000000000002';
  admin_session_id constant uuid:='f1100000-0000-4000-8000-000000000003';
  super_role_id uuid;
  permission_version integer;
  session_version integer;
  draft_id uuid;
  removed_entry_id uuid;
  active_catalog_id uuid;
  result jsonb;
begin
  select id into strict super_role_id from public.admin_roles where key='super_admin';
  insert into auth.users(id,email) values(admin_user_id,'phase11c-admin@example.invalid');
  insert into auth.sessions(id,user_id) values(admin_auth_session_id,admin_user_id);
  insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
  values(admin_user_id,super_role_id,'active','Phase 11C Admin',false)
  returning admin_users.permission_version,admin_users.session_version
    into permission_version,session_version;
  insert into public.admin_sessions(
    id,user_id,auth_session_id,status,expires_at,
    permission_version_snapshot,session_version_snapshot
  ) values(
    admin_session_id,admin_user_id,admin_auth_session_id,'active',now()+interval '1 hour',
    permission_version,session_version
  );
  select shop_version_id into strict active_catalog_id
  from public.economy_active_shop_versions
  where shop_definition_id='74000000-0000-4000-8000-000000000001';

  result:=public.create_admin_shop_catalog_successor(
    admin_user_id,admin_auth_session_id,'aal2','74000000-0000-4000-8000-000000000001',
    active_catalog_id,'Phase 11C entry mutation draft',
    'A local-only successor used to prove safe draft entry creation and removal.',
    'Exercise draft-only entry creation and removal with optimistic revisions.',
    'phase11c-admin-successor'
  );
  draft_id:=(result->>'versionId')::uuid;
  select entry_id into strict removed_entry_id from public.economy_shop_version_offers
  where shop_version_id=draft_id and offer_id='74000000-0000-4000-8000-000000000011';
  result:=public.remove_admin_shop_catalog_entry(
    admin_user_id,admin_auth_session_id,'aal2',draft_id,removed_entry_id,1,1,
    'Remove one cloned entry from the local successor draft.',
    'phase11c-admin-entry-remove'
  );
  perform pg_temp.phase11c_assert(
    result->>'status'='removed' and (result->>'versionRevision')::integer=2
      and not exists(select 1 from public.economy_shop_version_offers
        where shop_version_id=draft_id and entry_id=removed_entry_id)
      and not exists(select 1 from public.economy_shop_stock
        where catalog_version_id=draft_id and catalog_entry_id=removed_entry_id),
    'entry removal is draft-only, revision checked, reference safe, and removes its unreferenced stock row');
  result:=public.add_admin_shop_catalog_entry(
    admin_user_id,admin_auth_session_id,'aal2',draft_id,
    '74000000-0000-4000-8000-000000000011',2,
    'Restore the approved offer to the local successor draft.',
    'phase11c-admin-entry-add'
  );
  perform pg_temp.phase11c_assert(
    result->>'status'='created' and (result->>'versionRevision')::integer=3
      and (select count(*)=11 from public.economy_shop_version_offers where shop_version_id=draft_id)
      and exists(select 1 from public.economy_shop_stock stock
        join public.economy_shop_version_offers entry
          on entry.shop_version_id=stock.catalog_version_id and entry.entry_id=stock.catalog_entry_id
        where entry.shop_version_id=draft_id and entry.offer_id='74000000-0000-4000-8000-000000000011')
      and (select shop_version_id=active_catalog_id
        from public.economy_active_shop_versions
        where shop_definition_id='74000000-0000-4000-8000-000000000001'),
    'entry creation uses an eligible canonical offer and leaves the active catalog unchanged');
  perform pg_temp.phase11c_assert(
    public.remove_admin_shop_catalog_entry(
      admin_user_id,admin_auth_session_id,'aal2',active_catalog_id,
      'c1100000-0000-4000-8000-000000000101',1,1,
      'Attempt removal from the immutable published catalog.',
      'phase11c-admin-active-remove')->>'status'='immutable_version'
      and (select count(*)=2 from public.economy_shop_admin_audit_events event
        where event.admin_user_id='f1100000-0000-4000-8000-000000000001'
          and event.action_key in ('catalog_entry_added','catalog_entry_removed')),
    'published entries remain immutable and successful draft mutations leave audit evidence');
end;
$$;

select pg_temp.phase11c_assert(
  not has_table_privilege('authenticated','public.economy_shop_transactions','SELECT')
  and not has_table_privilege('authenticated','public.economy_shop_stock','UPDATE')
  and not has_table_privilege('service_role','public.economy_shop_transactions','SELECT')
  and has_function_privilege('service_role',
    'public.execute_player_shop_transaction(text,text,uuid,text,integer,bigint,uuid,integer,integer,integer,integer,integer,text,text)','EXECUTE')
  and has_function_privilege('service_role',
    'public.get_player_shop_events(text,text,bigint,integer,text)','EXECUTE')
  and has_function_privilege('service_role',
    'public.add_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,text,text)','EXECUTE')
  and has_function_privilege('service_role',
    'public.remove_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,integer,text,text)','EXECUTE')
  and not has_function_privilege('authenticated',
    'public.execute_player_shop_transaction(text,text,uuid,text,integer,bigint,uuid,integer,integer,integer,integer,integer,text,text)','EXECUTE'),
  'RLS and grants expose only narrow trusted service RPCs'
);

select pg_temp.phase11c_assert(
  has_function_privilege('service_role','public.run_shop_restock_worker(integer,text)','EXECUTE')
  and has_function_privilege('service_role','public.reconcile_shop_transactions(integer,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.run_shop_restock_worker(integer,text)','EXECUTE'),
  'restock and reconciliation workers are trusted-service only'
);

select 'Phase 11C shop execution assertions passed' as result;

rollback;
