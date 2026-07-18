-- Starville Phase 11C: owner-scoped General Store workspace, atomic buy/sell,
-- immutable receipts, and authoritative tutorial progression.

create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,
  p_scope text,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in (
       'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
       'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
       'home_read','home_write','vertical_slice_read','plot_provision','home_farm_write',
       'starter_quest_write','workstation_read','workstation_write','workstation_collect',
       'workstation_tutorial_write','shop_workspace_read','shop_transaction_write',
       'shop_receipt_read','shop_tutorial_write','shop_event_read'
     ) or p_limit not between 1 and 600 then
    raise exception using errcode='22023',message='INVALID_COZY_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-rate:'||p_player_profile_id::text||':'||p_scope,0));
  insert into public.cozy_gameplay_rate_limits(
    player_profile_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(p_player_profile_id,p_scope,1,now(),now()+interval '1 minute',now())
  on conflict(player_profile_id,scope) do update set
    attempt_count=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then 1 else public.cozy_gameplay_rate_limits.attempt_count+1 end,
    window_started_at=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then now() else public.cozy_gameplay_rate_limits.window_started_at end,
    window_expires_at=case when public.cozy_gameplay_rate_limits.window_expires_at<=now()
      then now()+interval '1 minute' else public.cozy_gameplay_rate_limits.window_expires_at end,
    updated_at=now()
  where public.cozy_gameplay_rate_limits.window_expires_at<=now()
     or public.cozy_gameplay_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function private.cozy_shop_entry_is_unlocked(
  p_player_profile_id uuid,
  p_eligibility_rule text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_eligibility_rule
    when 'ordinary_gameplay' then true
    when 'phase11a_complete' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='farming_tutorial' and instance.status='reward_claimed'
    )
    when 'phase11b_complete' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='workstation_tutorial' and instance.status='reward_claimed'
    )
    when 'tutorial_only' then exists(
      select 1 from public.player_quest_instances instance
      join public.cozy_quest_versions version on version.id=instance.quest_version_id
      where instance.player_profile_id=p_player_profile_id
        and version.quest_kind='shop_tutorial' and instance.status='active'
    )
    else false
  end;
$$;

create or replace function private.cozy_shop_tutorial_json(p_player_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'questDefinitionId',version.quest_definition_id,
    'questVersionId',version.id,
    'name',version.name,
    'description',version.description,
    'eligible',exists(
      select 1 from public.player_quest_instances required_instance
      where required_instance.player_profile_id=p_player_profile_id
        and required_instance.quest_definition_id=version.required_quest_definition_id
        and required_instance.status='reward_claimed'
    ),
    'status',coalesce(instance.status,'available'),
    'stateVersion',instance.state_version,
    'rewardDust',version.reward_dust,
    'requiredPurchaseItemSlug',purchase_item.slug,
    'requiredSaleItemSlug',sale_item.slug,
    'objectives',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',objective.objective_key,'label',objective.label,
        'requiredCount',objective.required_count,
        'currentCount',coalesce(progress.current_count,0),
        'completed',coalesce(progress.current_count,0)>=objective.required_count
      ) order by objective.sequence_number)
      from public.cozy_quest_objectives objective
      left join public.player_quest_objective_progress progress
        on progress.quest_objective_id=objective.id
       and progress.player_quest_instance_id=instance.id
      where objective.quest_version_id=version.id
    ),'[]'::jsonb)
  )
  from public.cozy_active_shop_tutorial_versions active
  join public.cozy_quest_versions version on version.id=active.quest_version_id
  join public.cozy_item_definitions purchase_item
    on purchase_item.id=version.required_purchase_item_definition_id
  join public.cozy_item_definitions sale_item
    on sale_item.id=version.required_sale_item_definition_id
  left join public.player_quest_instances instance
    on instance.player_profile_id=p_player_profile_id
   and instance.quest_definition_id=version.quest_definition_id;
$$;

create or replace function private.cozy_advance_shop_tutorial(
  p_player_profile_id uuid,
  p_event_key text,
  p_related_entity_id uuid,
  p_idempotency_key text,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  instance public.player_quest_instances%rowtype;
  selected_objective_key text;
  objective public.cozy_quest_objectives%rowtype;
begin
  select instance_row.* into instance
  from public.player_quest_instances instance_row
  join public.cozy_quest_versions version on version.id=instance_row.quest_version_id
  where instance_row.player_profile_id=p_player_profile_id
    and instance_row.status='active' and version.quest_kind='shop_tutorial'
  for update of instance_row;
  if not found then return false; end if;

  selected_objective_key:=case p_event_key
    when 'shopkeeper_interacted' then 'interact_with_shopkeeper'
    when 'shop_opened' then 'open_shop'
    when 'shop_item_purchased' then 'buy_catalog_item'
    when 'shop_item_sold' then 'sell_catalog_item'
    when 'shop_receipt_inspected' then 'inspect_shop_receipt'
    when 'shopkeeper_returned' then 'return_to_shopkeeper'
    when 'shop_tutorial_reward_settled' then 'receive_reward'
    else null end;
  if selected_objective_key is null then return false; end if;

  select * into strict objective from public.cozy_quest_objectives
  where quest_version_id=instance.quest_version_id
    and cozy_quest_objectives.objective_key=selected_objective_key;
  insert into public.player_quest_events(
    player_profile_id,player_quest_instance_id,event_key,related_entity_id,
    idempotency_key,request_id,event_summary
  ) values(
    p_player_profile_id,instance.id,p_event_key,p_related_entity_id,
    p_idempotency_key,p_request_id,jsonb_build_object('objectiveKey',selected_objective_key)
  ) on conflict(player_profile_id,event_key,idempotency_key) do nothing;
  if not found then return false; end if;

  update public.player_quest_objective_progress set
    current_count=least(objective.required_count,current_count+1),
    completed_at=case when current_count+1>=objective.required_count then now() else completed_at end,
    state_version=state_version+1
  where player_quest_instance_id=instance.id and quest_objective_id=objective.id;
  update public.player_quest_instances set state_version=state_version+1 where id=instance.id;
  return true;
end;
$$;

create or replace function private.cozy_shop_receipt_json(
  p_receipt public.economy_shop_receipts
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'receiptId',p_receipt.public_receipt_id,
    'transactionId',transaction.id,
    'shopName',p_receipt.shop_name,
    'itemName',p_receipt.item_name,
    'itemSlug',item.slug,
    'direction',p_receipt.direction,
    'quantity',p_receipt.quantity,
    'unitPrice',p_receipt.unit_price,
    'totalDust',p_receipt.total_dust,
    'currency',p_receipt.currency_key,
    'status',p_receipt.transaction_status,
    'catalogVersion',p_receipt.catalog_version_number,
    'resultingInventoryQuantity',p_receipt.resulting_inventory_quantity,
    'resultingDustBalance',p_receipt.resulting_dust_balance,
    'dustLedgerReceiptId',ledger.public_receipt_id,
    'supportReference',p_receipt.support_reference,
    'correctionLinked',transaction.correction_request_id is not null,
    'createdAt',p_receipt.created_at
  )
  from public.economy_shop_transactions transaction
  join public.cozy_item_definitions item on item.id=transaction.item_definition_id
  left join public.player_dust_ledger ledger on ledger.id=transaction.dust_ledger_entry_id
  where transaction.id=p_receipt.transaction_id;
$$;

create or replace function private.cozy_shop_workspace_json(
  p_player_profile_id uuid,
  p_shop_interaction public.cozy_shop_interactions,
  p_receipt_limit integer,
  p_before timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  shop public.cozy_shop_definitions%rowtype;
  npc public.cozy_starter_npcs%rowtype;
  map public.world_maps%rowtype;
  catalog public.economy_shop_catalogs%rowtype;
  version public.economy_shop_versions%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
  account public.player_dust_accounts%rowtype;
  inventory_state public.player_inventory_state%rowtype;
  day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  select * into strict shop from public.cozy_shop_definitions where id=p_shop_interaction.shop_definition_id;
  select * into strict npc from public.cozy_starter_npcs where id=p_shop_interaction.shopkeeper_npc_id;
  select * into strict map from public.world_maps where id=p_shop_interaction.world_map_id;
  select * into strict catalog from public.economy_shop_catalogs where shop_definition_id=shop.id;
  select version_row.* into strict version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions version_row on version_row.id=active.shop_version_id
  where active.shop_definition_id=shop.id;
  select * into strict live_ops from public.economy_shop_live_ops where shop_definition_id=shop.id;
  select * into strict account from public.player_dust_accounts where player_profile_id=p_player_profile_id;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=p_player_profile_id;

  return jsonb_build_object(
    'shop',jsonb_build_object(
      'shopId',shop.id,'interactionId',p_shop_interaction.interaction_id,
      'worldObjectId',p_shop_interaction.world_object_id,'slug',shop.slug,
      'name',shop.name,'description',shop.description,'shopType',shop.shop_type,
      'shopkeeper',jsonb_build_object('id',npc.id,'slug',npc.slug,'name',npc.name,'introduction',npc.introduction),
      'worldId',map.slug,'worldRevisionId',p_shop_interaction.map_version_id,
      'x',p_shop_interaction.position_x,'y',p_shop_interaction.position_y,
      'interactionRadius',p_shop_interaction.interaction_range,
      'assetRef',p_shop_interaction.asset_ref,'assetVersionId',p_shop_interaction.asset_version_id,
      'artworkReadiness',p_shop_interaction.safe_metadata->>'artworkReadiness'
    ),
    'catalog',jsonb_build_object(
      'catalogId',catalog.id,'catalogKey',catalog.catalog_key,'publicName',catalog.public_name,
      'versionId',version.id,'versionNumber',version.version_number,
      'revision',version.revision,'status',version.lifecycle_status,
      'publishedAt',version.published_at
    ),
    'availability',jsonb_build_object(
      'accessEnabled',shop.active and p_shop_interaction.active and p_shop_interaction.enabled and live_ops.access_enabled,
      'buyingEnabled',shop.buy_enabled and live_ops.buying_enabled,
      'sellingEnabled',shop.sell_enabled and live_ops.selling_enabled,
      'message',case when live_ops.access_enabled then shop.maintenance_message else live_ops.maintenance_message end,
      'serverTime',now()
    ),
    'dust',jsonb_build_object('balance',account.balance,'stateVersion',account.state_version),
    'inventory',jsonb_build_object(
      'stateVersion',inventory_state.state_version,'capacity',inventory_state.capacity,
      'usedSlots',(select count(*) from public.player_inventory_stacks stack where stack.player_profile_id=p_player_profile_id)
    ),
    'entries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'entryId',entry.entry_id,'offerId',entry.offer_id,
        'itemId',item.id,'itemSlug',item.slug,'itemName',item.name,
        'itemDescription',item.description,'itemCategory',item.category,
        'assetRef',item.asset_ref,'assetReadiness',item.asset_readiness,
        'buyEnabled',entry.buy_enabled,'sellEnabled',entry.sell_enabled,
        'buyPrice',entry.buy_price,'sellPrice',entry.sell_price,'currency',entry.currency_key,
        'minimumQuantity',base.minimum_quantity,'maximumQuantity',entry.maximum_quantity,
        'ownedQuantity',private.cozy_owned_quantity(p_player_profile_id,item.id),
        'stockMode',entry.stock_mode,'stock',stock.current_stock,'maximumStock',stock.maximum_stock,
        'stockRevision',stock.stock_revision,'nextRestockAt',stock.next_restock_at,
        'playerBuyDailyLimit',entry.player_buy_daily_limit,
        'playerSellDailyLimit',entry.player_sell_daily_limit,
        'boughtToday',coalesce(buy_usage.quantity_used,0),
        'soldToday',coalesce(sell_usage.quantity_used,0),
        'remainingBuyToday',greatest(0,entry.player_buy_daily_limit-coalesce(buy_usage.quantity_used,0)),
        'remainingSellToday',greatest(0,entry.player_sell_daily_limit-coalesce(sell_usage.quantity_used,0)),
        'availabilityFrom',entry.availability_from,'availabilityUntil',entry.availability_until,
        'eligibilityRule',entry.eligibility_rule,
        'eligible',private.cozy_shop_entry_is_unlocked(p_player_profile_id,entry.eligibility_rule),
        'unavailableReason',case
          when not entry.enabled then 'This catalog entry is disabled.'
          when not item.active then 'This item is currently disabled.'
          when not private.cozy_shop_entry_is_unlocked(p_player_profile_id,entry.eligibility_rule) then 'Complete the listed village requirement first.'
          when entry.stock_mode in ('global_limited','hybrid') and coalesce(stock.current_stock,0)=0 then 'Out of stock.'
          when entry.sell_enabled and not item.sell_eligible then 'This shop does not buy this item.'
          when item.account_bound or item.permanent_tool then 'Account-bound starter tools cannot be sold.'
          else null end,
        'entryRevision',entry.revision,'displayOrder',entry.display_order
      ) order by entry.display_order,item.name)
      from public.economy_shop_version_offers entry
      join public.cozy_shop_offers base on base.id=entry.offer_id
      join public.cozy_item_definitions item on item.id=base.item_definition_id
      join public.economy_shop_stock stock
        on stock.catalog_version_id=entry.shop_version_id and stock.catalog_entry_id=entry.entry_id
      left join public.economy_shop_player_limit_usage buy_usage
        on buy_usage.player_profile_id=p_player_profile_id
       and buy_usage.catalog_version_id=entry.shop_version_id
       and buy_usage.catalog_entry_id=entry.entry_id and buy_usage.direction='buy'
       and buy_usage.window_start=day_start
      left join public.economy_shop_player_limit_usage sell_usage
        on sell_usage.player_profile_id=p_player_profile_id
       and sell_usage.catalog_version_id=entry.shop_version_id
       and sell_usage.catalog_entry_id=entry.entry_id and sell_usage.direction='sell'
       and sell_usage.window_start=day_start
      where entry.shop_version_id=version.id
    ),'[]'::jsonb),
    'receipts',coalesce((
      select jsonb_agg(private.cozy_shop_receipt_json(page) order by page.created_at desc)
      from (
        select receipt.* from public.economy_shop_receipts receipt
        where receipt.player_profile_id=p_player_profile_id
          and (p_before is null or receipt.created_at<p_before)
        order by receipt.created_at desc limit p_receipt_limit
      ) page
    ),'[]'::jsonb),
    'nextReceiptCursor',(
      select min(page.created_at) from (
        select receipt.created_at from public.economy_shop_receipts receipt
        where receipt.player_profile_id=p_player_profile_id
          and (p_before is null or receipt.created_at<p_before)
        order by receipt.created_at desc limit p_receipt_limit
      ) page
    ),
    'tutorial',private.cozy_shop_tutorial_json(p_player_profile_id),
    'lastEventNumber',coalesce((select max(event.event_number) from public.economy_shop_events event
      where event.shop_definition_id=shop.id and (
        event.visibility='public_stock'
        or (event.visibility='owner' and event.player_profile_id=p_player_profile_id)
      )),0),
    'generatedAt',now()
  );
end;
$$;

create or replace function public.get_player_shop_workspace(
  p_wallet_address text,
  p_shop_interaction_id text,
  p_receipt_limit integer,
  p_before timestamptz,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  interaction public.cozy_shop_interactions%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_interaction_id is null or p_shop_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_receipt_limit not between 1 and 50
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_WORKSPACE_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_workspace_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into interaction from public.cozy_shop_interactions
  where interaction_id=p_shop_interaction_id and active and enabled;
  if not found then return jsonb_build_object('status','shop_not_found'); end if;
  if profile.current_map_id<>(select slug from public.world_maps where id=interaction.world_map_id)
     or profile.current_map_version_id is distinct from interaction.map_version_id
     or exists(select 1 from public.player_homes home where home.player_profile_id=profile.id and home.inside_home)
    then return jsonb_build_object('status','wrong_world'); end if;
  if sqrt(power(profile.safe_position_x-interaction.position_x,2)+power(profile.safe_position_y-interaction.position_y,2))>interaction.interaction_range
    then return jsonb_build_object('status','too_far'); end if;
  select * into strict live_ops from public.economy_shop_live_ops
  where shop_definition_id=interaction.shop_definition_id;
  if live_ops.tutorial_objectives_enabled then
    perform private.cozy_advance_shop_tutorial(
      profile.id,'shop_opened',interaction.id,
      'phase11c-open:'||interaction.id::text,p_request_id
    );
  end if;
  return jsonb_build_object(
    'status','loaded','workspace',private.cozy_shop_workspace_json(
      profile.id,interaction,p_receipt_limit,p_before
    )
  );
end;
$$;

create or replace function public.execute_player_shop_transaction(
  p_wallet_address text,
  p_shop_interaction_id text,
  p_catalog_entry_id uuid,
  p_direction text,
  p_quantity integer,
  p_expected_unit_price bigint,
  p_expected_catalog_version_id uuid,
  p_expected_catalog_revision integer,
  p_expected_entry_revision integer,
  p_expected_stock_revision integer,
  p_expected_dust_state_version integer,
  p_expected_inventory_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  maintenance public.live_operations_maintenance%rowtype;
  interaction public.cozy_shop_interactions%rowtype;
  shop public.cozy_shop_definitions%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
  catalog public.economy_shop_catalogs%rowtype;
  version public.economy_shop_versions%rowtype;
  entry public.economy_shop_version_offers%rowtype;
  base_offer public.cozy_shop_offers%rowtype;
  item public.cozy_item_definitions%rowtype;
  stock public.economy_shop_stock%rowtype;
  usage public.economy_shop_player_limit_usage%rowtype;
  global_usage public.economy_shop_global_limit_usage%rowtype;
  account public.player_dust_accounts%rowtype;
  inventory_state public.player_inventory_state%rowtype;
  existing public.economy_shop_transactions%rowtype;
  transaction public.economy_shop_transactions%rowtype;
  receipt public.economy_shop_receipts%rowtype;
  ledger public.player_dust_ledger%rowtype;
  history public.player_inventory_history%rowtype;
  source public.economy_source_versions%rowtype;
  sink public.economy_sink_versions%rowtype;
  quest_version public.cozy_quest_versions%rowtype;
  request_hash text;
  day_start timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  day_end timestamptz:=day_start+interval '1 day';
  unit_price bigint;
  total_numeric numeric;
  total_dust bigint;
  limit_value integer;
  resulting_quantity integer;
  cooldown_ms integer:=250;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_interaction_id is null or p_shop_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_catalog_entry_id is null or p_direction not in ('buy','sell')
     or p_quantity not between 1 and 99 or p_expected_unit_price not between 1 and 1000000
     or p_expected_catalog_version_id is null or p_expected_catalog_revision<1
     or p_expected_entry_revision<1 or p_expected_dust_state_version<1
     or p_expected_inventory_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_TRANSACTION_REQUEST';
  end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_shop_interaction_id||':'||p_catalog_entry_id::text||':'||p_direction||':'||p_quantity::text||':'||
    p_expected_unit_price::text||':'||p_expected_catalog_version_id::text||':'||
    p_expected_catalog_revision::text||':'||p_expected_entry_revision::text||':'||
    coalesce(p_expected_stock_revision::text,'none')||':'||p_expected_dust_state_version::text||':'||
    p_expected_inventory_state_version::text,'UTF8'),'sha256'),'hex');

  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for share of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase11c-shop-player:'||profile.id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase11c-shop-idem:'||profile.id::text||':'||p_idempotency_key,0));
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;

  select * into existing from public.economy_shop_transactions
  where player_profile_id=profile.id and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    select * into strict receipt from public.economy_shop_receipts where transaction_id=existing.id;
    select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
    select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id;
    select * into strict stock from public.economy_shop_stock
    where catalog_version_id=existing.catalog_version_id and catalog_entry_id=existing.catalog_entry_id;
    return jsonb_build_object(
      'status','replayed','replayed',true,'transactionId',existing.id,
      'direction',existing.direction,
      'itemSlug',(select slug from public.cozy_item_definitions where id=existing.item_definition_id),
      'quantity',existing.quantity,
      'dustDelta',case when existing.direction='buy' then -existing.total_dust else existing.total_dust end,
      'dustBalance',account.balance,'dustStateVersion',account.state_version,
      'inventoryStateVersion',inventory_state.state_version,
      'stockRevision',stock.stock_revision,
      'receipt',private.cozy_shop_receipt_json(receipt)
    );
  end if;

  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_transaction_write',30)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict maintenance from public.live_operations_maintenance where singleton_key;
  if private.live_operations_maintenance_state(maintenance) in ('active','expired')
    then return jsonb_build_object('status','maintenance'); end if;
  select * into interaction from public.cozy_shop_interactions
  where interaction_id=p_shop_interaction_id and active and enabled;
  if not found then return jsonb_build_object('status','shop_not_found'); end if;
  select * into strict shop from public.cozy_shop_definitions where id=interaction.shop_definition_id;
  select * into strict live_ops from public.economy_shop_live_ops where shop_definition_id=shop.id;
  if not shop.active or not live_ops.access_enabled then return jsonb_build_object('status','shop_disabled'); end if;
  if p_direction='buy' and (not shop.buy_enabled or not live_ops.buying_enabled)
    then return jsonb_build_object('status','buying_disabled'); end if;
  if p_direction='sell' and (not shop.sell_enabled or not live_ops.selling_enabled or not live_ops.sale_dust_issuance_enabled)
    then return jsonb_build_object('status','selling_disabled'); end if;
  if profile.current_map_id<>(select slug from public.world_maps where id=interaction.world_map_id)
     or profile.current_map_version_id is distinct from interaction.map_version_id
     or exists(select 1 from public.player_homes home where home.player_profile_id=profile.id and home.inside_home)
    then return jsonb_build_object('status','wrong_world'); end if;
  if sqrt(power(profile.safe_position_x-interaction.position_x,2)+power(profile.safe_position_y-interaction.position_y,2))>interaction.interaction_range
    then return jsonb_build_object('status','too_far'); end if;

  select version_row.* into strict version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions version_row on version_row.id=active.shop_version_id
  where active.shop_definition_id=shop.id for share of version_row;
  if version.id<>p_expected_catalog_version_id or version.revision<>p_expected_catalog_revision
    then return jsonb_build_object('status','catalog_changed'); end if;
  select * into entry from public.economy_shop_version_offers
  where shop_version_id=version.id and entry_id=p_catalog_entry_id and enabled;
  if not found then return jsonb_build_object('status','entry_not_found'); end if;
  if entry.revision<>p_expected_entry_revision then return jsonb_build_object('status','catalog_changed'); end if;
  if (entry.availability_from is not null and entry.availability_from>now())
     or (entry.availability_until is not null and entry.availability_until<=now())
    then return jsonb_build_object('status','entry_disabled'); end if;
  if not private.cozy_shop_entry_is_unlocked(profile.id,entry.eligibility_rule)
    then return jsonb_build_object('status','item_locked'); end if;
  select * into strict base_offer from public.cozy_shop_offers
  where id=entry.offer_id and shop_definition_id=shop.id and active;
  select * into strict item from public.cozy_item_definitions where id=base_offer.item_definition_id;
  if not item.active then return jsonb_build_object('status','item_disabled'); end if;
  if p_quantity<base_offer.minimum_quantity or p_quantity>entry.maximum_quantity
    then return jsonb_build_object('status','invalid_quantity'); end if;
  if p_direction='buy' then
    if not entry.buy_enabled or entry.buy_price is null or not item.buy_eligible
      then return jsonb_build_object('status','item_not_buyable'); end if;
    unit_price:=entry.buy_price;
  else
    if not entry.sell_enabled or entry.sell_price is null or not item.sell_eligible
      then return jsonb_build_object('status','item_not_sellable'); end if;
    if item.account_bound or item.permanent_tool or item.category in ('permanent_tool','special')
      then return jsonb_build_object('status','item_bound'); end if;
    unit_price:=entry.sell_price;
  end if;
  if unit_price<>p_expected_unit_price then return jsonb_build_object('status','price_changed'); end if;
  total_numeric:=unit_price::numeric*p_quantity;
  if total_numeric>9000000000000000 then return jsonb_build_object('status','invalid_quantity'); end if;
  total_dust:=total_numeric::bigint;

  if p_direction='buy' then
    select sink_row.* into sink from public.economy_active_sink_versions active
    join public.economy_sink_versions sink_row on sink_row.id=active.sink_version_id
    where active.sink_key='village-supply-shop' and sink_row.lifecycle_status='published';
    if not found or total_dust not between sink.minimum_amount and sink.maximum_amount
      then return jsonb_build_object('status','economy_policy_blocked'); end if;
  else
    select source_row.* into source from public.economy_active_source_versions active
    join public.economy_source_versions source_row on source_row.id=active.source_version_id
    where active.source_key='shop-sale' and source_row.lifecycle_status='published';
    if not found or total_dust not between source.minimum_amount and source.maximum_amount
      then return jsonb_build_object('status','economy_policy_blocked'); end if;
  end if;

  select * into strict account from public.player_dust_accounts
  where player_profile_id=profile.id for update;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id=profile.id for update;
  if account.state_version<>p_expected_dust_state_version
     or inventory_state.state_version<>p_expected_inventory_state_version
    then return jsonb_build_object('status','state_conflict'); end if;
  if p_direction='buy' and account.balance<total_dust
    then return jsonb_build_object('status','insufficient_dust'); end if;
  if p_direction='buy' and not private.cozy_can_add_item(profile.id,item.id,p_quantity)
    then return jsonb_build_object('status','inventory_full'); end if;
  if p_direction='sell' and private.cozy_owned_quantity(profile.id,item.id)<p_quantity
    then return jsonb_build_object('status','inventory_quantity_insufficient'); end if;

  select * into strict stock from public.economy_shop_stock
  where catalog_version_id=version.id and catalog_entry_id=entry.entry_id for update;
  if stock.current_stock is not null then
    if p_expected_stock_revision is null or stock.stock_revision<>p_expected_stock_revision
      then return jsonb_build_object('status','stock_conflict'); end if;
    if p_direction='buy' and stock.current_stock<p_quantity then return jsonb_build_object('status','out_of_stock'); end if;
  elsif p_expected_stock_revision is not null and stock.stock_revision<>p_expected_stock_revision then
    return jsonb_build_object('status','stock_conflict');
  end if;

  insert into public.economy_shop_player_limit_usage(
    player_profile_id,catalog_version_id,catalog_entry_id,direction,
    window_start,window_end
  ) values(profile.id,version.id,entry.entry_id,p_direction,day_start,day_end)
  on conflict do nothing;
  select * into strict usage from public.economy_shop_player_limit_usage
  where player_profile_id=profile.id and catalog_version_id=version.id
    and catalog_entry_id=entry.entry_id and direction=p_direction and window_start=day_start
  for update;
  limit_value:=case when p_direction='buy' then entry.player_buy_daily_limit else entry.player_sell_daily_limit end;
  if usage.quantity_used+p_quantity>limit_value then
    return jsonb_build_object('status',case when p_direction='buy' then 'purchase_limit' else 'sale_limit' end);
  end if;

  insert into public.economy_shop_global_limit_usage(
    shop_definition_id,direction,window_start,window_end
  ) values(shop.id,p_direction,day_start,day_end) on conflict do nothing;
  select * into strict global_usage from public.economy_shop_global_limit_usage
  where shop_definition_id=shop.id and direction=p_direction and window_start=day_start for update;
  if p_direction='sell' and global_usage.dust_total+total_dust>live_ops.global_daily_sale_dust_cap
    then return jsonb_build_object('status','global_limit'); end if;

  if exists(
    select 1 from public.economy_shop_action_cooldowns cooldown
    where cooldown.player_profile_id=profile.id and cooldown.action_key=p_direction
      and cooldown.last_action_at>now()-make_interval(secs=>cooldown_ms::numeric/1000)
  ) then return jsonb_build_object('status','cooldown'); end if;

  transaction.id:=gen_random_uuid();
  if p_direction='buy' then
    if not private.cozy_apply_dust_delta(
      profile.id,-total_dust,'shop_purchase','shop_transaction',transaction.id::text,
      p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='SHOP_DUST_SETTLEMENT_FAILED'; end if;
    if not private.cozy_add_item(
      profile.id,item.id,p_quantity,'shop_purchase',transaction.id::text,
      p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='SHOP_INVENTORY_SETTLEMENT_FAILED'; end if;
  else
    if not private.cozy_remove_item(
      profile.id,item.id,p_quantity,'shop_sale',transaction.id::text,
      p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='SHOP_INVENTORY_SETTLEMENT_FAILED'; end if;
    if not private.cozy_apply_dust_delta(
      profile.id,total_dust,'shop_sale','shop_transaction',transaction.id::text,
      p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='SHOP_DUST_SETTLEMENT_FAILED'; end if;
  end if;

  if p_direction='buy' and stock.current_stock is not null and live_ops.stock_decrement_enabled then
    update public.economy_shop_stock set
      current_stock=current_stock-p_quantity,stock_revision=stock_revision+1
    where catalog_version_id=version.id and catalog_entry_id=entry.entry_id
    returning * into stock;
  end if;
  update public.economy_shop_player_limit_usage set
    quantity_used=quantity_used+p_quantity,dust_total=dust_total+total_dust,
    usage_revision=usage_revision+1
  where player_profile_id=profile.id and catalog_version_id=version.id
    and catalog_entry_id=entry.entry_id and direction=p_direction and window_start=day_start;
  update public.economy_shop_global_limit_usage set
    quantity_used=quantity_used+p_quantity,dust_total=dust_total+total_dust,
    usage_revision=usage_revision+1
  where shop_definition_id=shop.id and direction=p_direction and window_start=day_start;
  insert into public.economy_shop_action_cooldowns(player_profile_id,action_key,last_action_at)
  values(profile.id,p_direction,now()) on conflict(player_profile_id,action_key) do update set
    last_action_at=excluded.last_action_at;

  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id;
  select * into strict ledger from public.player_dust_ledger
  where player_profile_id=profile.id and reason=case when p_direction='buy' then 'shop_purchase' else 'shop_sale' end
    and reference_id=transaction.id::text;
  select * into strict history from public.player_inventory_history
  where player_profile_id=profile.id and reason=case when p_direction='buy' then 'shop_purchase' else 'shop_sale' end
    and reference_id=transaction.id::text;
  resulting_quantity:=private.cozy_owned_quantity(profile.id,item.id);
  select * into strict catalog from public.economy_shop_catalogs where id=version.catalog_id;

  insert into public.economy_shop_transactions(
    id,player_profile_id,shop_definition_id,shop_world_object_id,catalog_id,
    catalog_version_id,catalog_entry_id,offer_id,item_definition_id,direction,
    quantity,unit_price,total_dust,currency_key,status,catalog_revision,entry_revision,
    stock_revision_before,stock_revision_after,stock_policy_snapshot,limit_policy_snapshot,
    dust_ledger_entry_id,inventory_history_entry_id,idempotency_key,request_hash,request_id,
    completed_at,safe_metadata
  ) values(
    transaction.id,profile.id,shop.id,interaction.id,catalog.id,version.id,entry.entry_id,
    entry.offer_id,item.id,p_direction,p_quantity,unit_price,total_dust,'DUST','completed',
    version.revision,entry.revision,
    case when stock.current_stock is null then null else stock.stock_revision-case when p_direction='buy' and live_ops.stock_decrement_enabled then 1 else 0 end end,
    stock.stock_revision,
    jsonb_build_object('mode',entry.stock_mode,'maximumStock',entry.maximum_stock,'restockMode',entry.restock_mode),
    jsonb_build_object('dailyLimit',limit_value,'windowStart',day_start,'windowEnd',day_end,'globalDailySaleDustCap',live_ops.global_daily_sale_dust_cap),
    ledger.id,history.id,p_idempotency_key,request_hash,p_request_id,now(),
    jsonb_build_object('environment','normal_gameplay','worldRevisionId',interaction.map_version_id)
  ) returning * into transaction;

  insert into public.economy_shop_receipts(
    transaction_id,player_profile_id,shop_name,item_name,direction,quantity,
    unit_price,total_dust,currency_key,transaction_status,catalog_version_number,
    resulting_inventory_quantity,resulting_dust_balance,support_reference
  ) values(
    transaction.id,profile.id,shop.name,item.name,p_direction,p_quantity,unit_price,
    total_dust,'DUST','completed',version.version_number,resulting_quantity,account.balance,
    'STORE-'||upper(substr(replace(transaction.id::text,'-',''),1,12))
  ) returning * into receipt;

  insert into public.economy_shop_events(
    player_profile_id,shop_definition_id,event_key,visibility,related_entity_id,safe_payload
  ) values
    (profile.id,shop.id,case when p_direction='buy' then 'shop_purchase_completed' else 'shop_sale_completed' end,
      'owner',transaction.id,jsonb_build_object('transactionId',transaction.id,'direction',p_direction,'itemSlug',item.slug,'quantity',p_quantity,'totalDust',total_dust)),
    (profile.id,shop.id,'receipt_available','owner',receipt.id,jsonb_build_object('receiptId',receipt.public_receipt_id)),
    (null,shop.id,'shop_stock_changed','public_stock',entry.entry_id,
      jsonb_build_object('entryId',entry.entry_id,'stock',stock.current_stock,'stockRevision',stock.stock_revision));

  if live_ops.tutorial_objectives_enabled then
    select version_row.* into quest_version
    from public.cozy_active_shop_tutorial_versions active
    join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
    if found and ((p_direction='buy' and item.id=quest_version.required_purchase_item_definition_id)
      or (p_direction='sell' and item.id=quest_version.required_sale_item_definition_id)) then
      perform private.cozy_advance_shop_tutorial(
        profile.id,case when p_direction='buy' then 'shop_item_purchased' else 'shop_item_sold' end,
        transaction.id,'phase11c-'||p_direction||':'||transaction.id::text,p_request_id
      );
    end if;
  end if;

  return jsonb_build_object(
    'status','completed','replayed',false,'transactionId',transaction.id,
    'direction',p_direction,'itemSlug',item.slug,'quantity',p_quantity,
    'dustDelta',case when p_direction='buy' then -total_dust else total_dust end,
    'dustBalance',account.balance,'dustStateVersion',account.state_version,
    'inventoryStateVersion',inventory_state.state_version,
    'stockRevision',stock.stock_revision,'receipt',private.cozy_shop_receipt_json(receipt)
  );
end;
$$;

create or replace function public.get_player_shop_receipt(
  p_wallet_address text,
  p_public_receipt_id text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  receipt public.economy_shop_receipts%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_public_receipt_id is null or p_public_receipt_id !~ '^STORE-[A-F0-9]{20}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_RECEIPT_REQUEST'; end if;
  select * into profile from public.player_profiles where wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_receipt_read',120)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into receipt from public.economy_shop_receipts
  where public_receipt_id=p_public_receipt_id and player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','receipt_not_found'); end if;
  select settings.* into strict live_ops
  from public.economy_shop_live_ops settings
  join public.economy_shop_transactions transaction on transaction.id=receipt.transaction_id
  where settings.shop_definition_id=transaction.shop_definition_id;
  if live_ops.tutorial_objectives_enabled then
    perform private.cozy_advance_shop_tutorial(
      profile.id,'shop_receipt_inspected',receipt.transaction_id,
      'phase11c-receipt:'||receipt.transaction_id::text,p_request_id
    );
  end if;
  return jsonb_build_object('status','loaded','receipt',private.cozy_shop_receipt_json(receipt),
    'tutorial',private.cozy_shop_tutorial_json(profile.id));
end;
$$;

create or replace function public.accept_player_shop_tutorial(
  p_wallet_address text,
  p_shop_interaction_id text,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  interaction public.cozy_shop_interactions%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
  version public.cozy_quest_versions%rowtype;
  instance public.player_quest_instances%rowtype;
  idempotency public.cozy_gameplay_idempotency%rowtype;
  request_hash text;
  response jsonb;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_interaction_id is null or p_shop_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_TUTORIAL_ACCEPT_REQUEST'; end if;
  request_hash:=encode(extensions.digest(convert_to(p_shop_interaction_id,'UTF8'),'sha256'),'hex');
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_tutorial_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':shop_tutorial_accept:'||p_idempotency_key,0));
  select * into idempotency from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='shop_tutorial_accept'
    and idempotency_key=p_idempotency_key;
  if found then
    if idempotency.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(idempotency.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into interaction from public.cozy_shop_interactions
  where interaction_id=p_shop_interaction_id and active and enabled;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if profile.current_map_id<>(select slug from public.world_maps where id=interaction.world_map_id)
     or profile.current_map_version_id is distinct from interaction.map_version_id
     or sqrt(power(profile.safe_position_x-interaction.position_x,2)+power(profile.safe_position_y-interaction.position_y,2))>interaction.interaction_range
    then return jsonb_build_object('status','quest_not_available'); end if;
  select * into strict live_ops from public.economy_shop_live_ops
  where shop_definition_id=interaction.shop_definition_id;
  if not live_ops.tutorial_objectives_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  select version_row.* into strict version
  from public.cozy_active_shop_tutorial_versions active
  join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  if not exists(
    select 1 from public.player_quest_instances required_instance
    where required_instance.player_profile_id=profile.id
      and required_instance.quest_definition_id=version.required_quest_definition_id
      and required_instance.status='reward_claimed'
  ) then return jsonb_build_object('status','quest_not_available'); end if;
  select * into instance from public.player_quest_instances
  where player_profile_id=profile.id and quest_definition_id=version.quest_definition_id;
  if found then
    return jsonb_build_object('status','quest_already_accepted','tutorial',private.cozy_shop_tutorial_json(profile.id));
  end if;
  insert into public.player_quest_instances(
    player_profile_id,quest_definition_id,quest_version_id
  ) values(profile.id,version.quest_definition_id,version.id) returning * into instance;
  insert into public.player_quest_objective_progress(player_quest_instance_id,quest_objective_id)
  select instance.id,objective.id from public.cozy_quest_objectives objective
  where objective.quest_version_id=version.id;
  insert into public.player_quest_events(
    player_profile_id,player_quest_instance_id,event_key,related_entity_id,
    idempotency_key,request_id,event_summary
  ) values(profile.id,instance.id,'shop_tutorial_accepted',interaction.id,
    'phase11c-accepted:'||instance.id::text,p_request_id,jsonb_build_object('shopInteractionId',interaction.interaction_id));
  perform private.cozy_advance_shop_tutorial(
    profile.id,'shopkeeper_interacted',interaction.shopkeeper_npc_id,
    'phase11c-shopkeeper:'||instance.id::text,p_request_id
  );
  response:=jsonb_build_object(
    'status','updated','tutorial',private.cozy_shop_tutorial_json(profile.id),
    'announcement','Mira has opened the General Store tutorial. Buy one Moonbean Seed.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'shop_tutorial_accept',p_idempotency_key,request_hash,response,p_request_id);
  return response||jsonb_build_object('replayed',false);
end;
$$;

create or replace function public.turn_in_player_shop_tutorial(
  p_wallet_address text,
  p_shop_interaction_id text,
  p_expected_quest_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  interaction public.cozy_shop_interactions%rowtype;
  live_ops public.economy_shop_live_ops%rowtype;
  version public.cozy_quest_versions%rowtype;
  instance public.player_quest_instances%rowtype;
  idempotency public.cozy_gameplay_idempotency%rowtype;
  ledger public.player_dust_ledger%rowtype;
  incomplete_count integer;
  request_hash text;
  response jsonb;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_interaction_id is null or p_shop_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_expected_quest_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_TUTORIAL_TURN_IN_REQUEST'; end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_shop_interaction_id||':'||p_expected_quest_state_version::text,'UTF8'),'sha256'),'hex');
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_tutorial_write',20)
    then return jsonb_build_object('status','rate_limited'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':shop_tutorial_turn_in:'||p_idempotency_key,0));
  select * into idempotency from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='shop_tutorial_turn_in'
    and idempotency_key=p_idempotency_key;
  if found then
    if idempotency.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(idempotency.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select * into interaction from public.cozy_shop_interactions
  where interaction_id=p_shop_interaction_id and active and enabled;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if profile.current_map_id<>(select slug from public.world_maps where id=interaction.world_map_id)
     or profile.current_map_version_id is distinct from interaction.map_version_id
     or sqrt(power(profile.safe_position_x-interaction.position_x,2)+power(profile.safe_position_y-interaction.position_y,2))>interaction.interaction_range
    then return jsonb_build_object('status','quest_objective_incomplete'); end if;
  select * into strict live_ops from public.economy_shop_live_ops
  where shop_definition_id=interaction.shop_definition_id;
  if not live_ops.tutorial_objectives_enabled or not live_ops.tutorial_rewards_enabled
    then return jsonb_build_object('status','quest_not_available'); end if;
  select version_row.* into strict version
  from public.cozy_active_shop_tutorial_versions active
  join public.cozy_quest_versions version_row on version_row.id=active.quest_version_id;
  select * into instance from public.player_quest_instances
  where player_profile_id=profile.id and quest_definition_id=version.quest_definition_id for update;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if instance.status='reward_claimed' then return jsonb_build_object('status','quest_reward_already_settled'); end if;
  if instance.state_version<>p_expected_quest_state_version then return jsonb_build_object('status','quest_conflict'); end if;
  select count(*) into incomplete_count
  from public.cozy_quest_objectives objective
  join public.player_quest_objective_progress progress
    on progress.quest_objective_id=objective.id and progress.player_quest_instance_id=instance.id
  where objective.objective_key not in ('return_to_shopkeeper','receive_reward')
    and progress.current_count<objective.required_count;
  if incomplete_count>0 then return jsonb_build_object('status','quest_objective_incomplete'); end if;
  perform private.cozy_advance_shop_tutorial(
    profile.id,'shopkeeper_returned',interaction.shopkeeper_npc_id,
    'phase11c-returned:'||instance.id::text,p_request_id
  );
  if not private.cozy_apply_dust_delta(
    profile.id,version.reward_dust,'starter_shop_quest_reward','starter_shop_quest',
    instance.id::text,p_idempotency_key,p_request_id
  ) then raise exception using errcode='P0001',message='SHOP_TUTORIAL_DUST_SETTLEMENT_FAILED'; end if;
  select * into strict ledger from public.player_dust_ledger
  where player_profile_id=profile.id and reason='starter_shop_quest_reward'
    and reference_id=instance.id::text;
  perform private.cozy_advance_shop_tutorial(
    profile.id,'shop_tutorial_reward_settled',ledger.id,
    'phase11c-reward:'||instance.id::text,p_request_id
  );
  update public.player_quest_instances set
    status='reward_claimed',completed_at=now(),reward_settled_at=now(),
    reward_ledger_entry_id=ledger.id,state_version=state_version+1,last_error_code=null
  where id=instance.id;
  response:=jsonb_build_object(
    'status','updated','tutorial',private.cozy_shop_tutorial_json(profile.id),
    'announcement',version.reward_dust::text||' DUST received. General Store tutorial complete.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'shop_tutorial_turn_in',p_idempotency_key,request_hash,response,p_request_id);
  return response||jsonb_build_object('replayed',false);
end;
$$;

create or replace function public.get_player_shop_events(
  p_wallet_address text,
  p_shop_interaction_id text,
  p_after_event_number bigint,
  p_limit integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  interaction public.cozy_shop_interactions%rowtype;
  visible_events jsonb;
  next_event_number bigint;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_interaction_id is null or p_shop_interaction_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_after_event_number not between 0 and 9007199254740991
     or p_limit not between 1 and 50
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_EVENT_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row; moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then
    return jsonb_build_object('status','bootstrap_required');
  end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_event_read',30) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into interaction from public.cozy_shop_interactions
  where interaction_id=p_shop_interaction_id and active and enabled;
  if not found then return jsonb_build_object('status','shop_not_found'); end if;
  if profile.current_map_id<>(select slug from public.world_maps where id=interaction.world_map_id)
     or profile.current_map_version_id is distinct from interaction.map_version_id
     or exists(select 1 from public.player_homes home where home.player_profile_id=profile.id and home.inside_home)
    then return jsonb_build_object('status','wrong_world'); end if;
  if sqrt(power(profile.safe_position_x-interaction.position_x,2)+power(profile.safe_position_y-interaction.position_y,2))>interaction.interaction_range
    then return jsonb_build_object('status','too_far'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'eventNumber',page.event_number,'eventKey',page.event_key,
      'visibility',page.visibility,'relatedEntityId',page.related_entity_id,
      'payload',page.safe_payload,'createdAt',page.created_at
    ) order by page.event_number),'[]'::jsonb),
    coalesce(max(page.event_number),p_after_event_number)
  into visible_events,next_event_number
  from (
    select event.* from public.economy_shop_events event
    where event.shop_definition_id=interaction.shop_definition_id
      and event.event_number>p_after_event_number
      and (
        event.visibility='public_stock'
        or (event.visibility='owner' and event.player_profile_id=profile.id)
      )
    order by event.event_number limit p_limit
  ) page;
  return jsonb_build_object(
    'status','loaded','events',visible_events,
    'lastEventNumber',next_event_number,
    'requiresRehydrate',jsonb_array_length(visible_events)>0
  );
end;
$$;

revoke all on function private.cozy_shop_entry_is_unlocked(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_shop_tutorial_json(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_advance_shop_tutorial(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_shop_receipt_json(public.economy_shop_receipts) from public,anon,authenticated,service_role;
revoke all on function private.cozy_shop_workspace_json(uuid,public.cozy_shop_interactions,integer,timestamptz) from public,anon,authenticated,service_role;

revoke all on function public.get_player_shop_workspace(text,text,integer,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_shop_events(text,text,bigint,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.execute_player_shop_transaction(text,text,uuid,text,integer,bigint,uuid,integer,integer,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_shop_receipt(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.accept_player_shop_tutorial(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.turn_in_player_shop_tutorial(text,text,integer,text,text) from public,anon,authenticated,service_role;

grant execute on function public.get_player_shop_workspace(text,text,integer,timestamptz,text) to service_role;
grant execute on function public.get_player_shop_events(text,text,bigint,integer,text) to service_role;
grant execute on function public.execute_player_shop_transaction(text,text,uuid,text,integer,bigint,uuid,integer,integer,integer,integer,integer,text,text) to service_role;
grant execute on function public.get_player_shop_receipt(text,text,text) to service_role;
grant execute on function public.accept_player_shop_tutorial(text,text,text,text) to service_role;
grant execute on function public.turn_in_player_shop_tutorial(text,text,integer,text,text) to service_role;

comment on function public.execute_player_shop_transaction(text,text,uuid,text,integer,bigint,uuid,integer,integer,integer,integer,integer,text,text) is
  'Atomic canonical buy/sell settlement. Prices, eligibility, stock, limits, inventory, DUST, receipts, and quest progress are server-selected.';
