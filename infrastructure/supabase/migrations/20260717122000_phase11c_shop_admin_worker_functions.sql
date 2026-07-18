-- Starville Phase 11C: catalog successor workflow, stock/live-ops controls,
-- bounded inspection, and worker reconciliation/restock.

create or replace function public.get_admin_shop_operations(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_shop_definition_id uuid,
  p_limit integer,
  p_request_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  can_stock boolean;
  can_transactions boolean;
  can_receipts boolean;
  can_live_ops boolean;
begin
  if p_limit not between 1 and 100 or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_ADMIN_SHOP_OPERATIONS_REQUEST'; end if;
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.read')
    then raise exception using errcode='42501',message='ECONOMY_SHOP_READ_DENIED'; end if;
  can_stock:=private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.stock.read');
  can_transactions:=private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.transactions.read');
  can_receipts:=private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.receipts.read');
  can_live_ops:=private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.live_ops.manage');
  if not exists(select 1 from public.cozy_shop_definitions where id=p_shop_definition_id)
    then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object(
    'status','loaded',
    'permissions',jsonb_build_object(
      'stockRead',can_stock,'transactionsRead',can_transactions,
      'receiptsRead',can_receipts,'liveOpsManage',can_live_ops,
      'stockManage',private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.stock.manage'),
      'reconciliationManage',private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.reconciliation.manage')
    ),
    'shop',(select jsonb_build_object(
      'shopDefinitionId',shop.id,'slug',shop.slug,'name',shop.name,'description',shop.description,
      'buyEnabled',shop.buy_enabled,'sellEnabled',shop.sell_enabled,
      'interactionRadius',shop.interaction_radius,'configurationRevision',shop.configuration_revision,
      'worldPlacement',jsonb_build_object(
        'interactionId',interaction.interaction_id,'worldObjectId',interaction.world_object_id,
        'worldId',map.slug,'worldRevisionId',interaction.map_version_id,
        'x',interaction.position_x,'y',interaction.position_y,
        'assetRef',interaction.asset_ref,'assetVersionId',interaction.asset_version_id,
        'artworkReadiness',interaction.safe_metadata->>'artworkReadiness'
      )
    ) from public.cozy_shop_definitions shop
      join public.cozy_shop_interactions interaction on interaction.shop_definition_id=shop.id
      join public.world_maps map on map.id=interaction.world_map_id
      where shop.id=p_shop_definition_id),
    'liveOps',case when can_live_ops or can_stock then (
      select jsonb_build_object(
        'accessEnabled',settings.access_enabled,'buyingEnabled',settings.buying_enabled,
        'sellingEnabled',settings.selling_enabled,'stockDecrementEnabled',settings.stock_decrement_enabled,
        'restockEnabled',settings.restock_enabled,'tutorialObjectivesEnabled',settings.tutorial_objectives_enabled,
        'tutorialRewardsEnabled',settings.tutorial_rewards_enabled,
        'saleDustIssuanceEnabled',settings.sale_dust_issuance_enabled,
        'globalDailySaleDustCap',settings.global_daily_sale_dust_cap,
        'maintenanceMessage',settings.maintenance_message,
        'configurationRevision',settings.configuration_revision,'updatedAt',settings.updated_at
      ) from public.economy_shop_live_ops settings where settings.shop_definition_id=p_shop_definition_id
    ) else null end,
    'catalog',(select jsonb_build_object(
      'catalogId',catalog.id,'catalogKey',catalog.catalog_key,'publicName',catalog.public_name,
      'description',catalog.description,'lifecycleStatus',catalog.lifecycle_status,
      'activeVersionId',active.shop_version_id
    ) from public.economy_shop_catalogs catalog
      join public.economy_active_shop_versions active on active.shop_definition_id=catalog.shop_definition_id
      where catalog.shop_definition_id=p_shop_definition_id),
    'availableOffers',coalesce((select jsonb_agg(jsonb_build_object(
      'offerId',offer.id,'itemSlug',item.slug,'itemName',item.name,'itemCategory',item.category,
      'buyPrice',offer.buy_price,'sellPrice',offer.sell_price,
      'buyEligible',item.buy_eligible and offer.buy_price is not null,
      'sellEligible',item.sell_eligible and item.category not in ('permanent_tool','special')
        and offer.sell_price is not null
    ) order by item.category,item.name)
      from public.cozy_shop_offers offer
      join public.cozy_item_definitions item on item.id=offer.item_definition_id
      where offer.shop_definition_id=p_shop_definition_id and offer.active and item.active),'[]'::jsonb),
    'versions',coalesce((select jsonb_agg(jsonb_build_object(
      'versionId',version.id,'versionNumber',version.version_number,
      'status',version.lifecycle_status,'name',version.name,'description',version.description,
      'revision',version.revision,'effectiveAt',version.effective_at,
      'publishedAt',version.published_at,'reason',version.reason,
      'validationResults',version.validation_results,
      'active',active.shop_version_id=version.id,
      'entryCount',(select count(*) from public.economy_shop_version_offers entry where entry.shop_version_id=version.id),
      'entries',coalesce((select jsonb_agg(jsonb_build_object(
        'entryId',entry.entry_id,'offerId',entry.offer_id,'itemSlug',item.slug,'itemName',item.name,
        'itemCategory',item.category,'buyEnabled',entry.buy_enabled,'sellEnabled',entry.sell_enabled,
        'buyPrice',entry.buy_price,'sellPrice',entry.sell_price,'stockMode',entry.stock_mode,
        'restockMode',entry.restock_mode,'maximumStock',entry.maximum_stock,
        'restockAmount',entry.restock_amount,'restockIntervalSeconds',entry.restock_interval_seconds,
        'playerBuyDailyLimit',entry.player_buy_daily_limit,
        'playerSellDailyLimit',entry.player_sell_daily_limit,
        'eligibilityRule',entry.eligibility_rule,'enabled',entry.enabled,
        'displayOrder',entry.display_order,'revision',entry.revision
      ) order by entry.display_order)
        from public.economy_shop_version_offers entry
        join public.cozy_shop_offers offer on offer.id=entry.offer_id
        join public.cozy_item_definitions item on item.id=offer.item_definition_id
        where entry.shop_version_id=version.id),'[]'::jsonb)
    ) order by version.version_number desc)
      from public.economy_shop_versions version
      join public.economy_active_shop_versions active on active.shop_definition_id=version.shop_definition_id
      where version.shop_definition_id=p_shop_definition_id),'[]'::jsonb),
    'stock',case when can_stock then coalesce((select jsonb_agg(jsonb_build_object(
      'catalogVersionId',entry.shop_version_id,'entryId',entry.entry_id,
      'itemSlug',item.slug,'itemName',item.name,'stockMode',entry.stock_mode,
      'currentStock',stock.current_stock,'maximumStock',stock.maximum_stock,
      'stockRevision',stock.stock_revision,'restockMode',entry.restock_mode,
      'restockAmount',entry.restock_amount,'nextRestockAt',stock.next_restock_at,
      'restockPaused',stock.restock_paused,'updatedAt',stock.updated_at
    ) order by entry.display_order)
      from public.economy_active_shop_versions active
      join public.economy_shop_version_offers entry on entry.shop_version_id=active.shop_version_id
      join public.cozy_shop_offers offer on offer.id=entry.offer_id
      join public.cozy_item_definitions item on item.id=offer.item_definition_id
      join public.economy_shop_stock stock
        on stock.catalog_version_id=entry.shop_version_id and stock.catalog_entry_id=entry.entry_id
      where active.shop_definition_id=p_shop_definition_id),'[]'::jsonb) else '[]'::jsonb end,
    'transactions',case when can_transactions then coalesce((select jsonb_agg(jsonb_build_object(
      'transactionId',page.id,'playerProfileId',page.player_profile_id,
      'direction',page.direction,'itemSlug',page.item_slug,'quantity',page.quantity,
      'unitPrice',page.unit_price,'totalDust',page.total_dust,'status',page.status,
      'catalogVersionId',page.catalog_version_id,'catalogEntryId',page.catalog_entry_id,
      'dustLedgerReceiptId',page.ledger_receipt,'inventoryHistoryEntryId',page.inventory_history_entry_id,
      'receiptId',page.receipt_id,'failureCode',page.failure_code,
      'idempotencyEvidence',encode(extensions.digest(page.idempotency_key::bytea,'sha256'),'hex'),
      'requestId',page.request_id,'createdAt',page.created_at
    ) order by page.created_at desc) from (
      select transaction.*,item.slug as item_slug,ledger.public_receipt_id as ledger_receipt,
        receipt.public_receipt_id as receipt_id
      from public.economy_shop_transactions transaction
      join public.cozy_item_definitions item on item.id=transaction.item_definition_id
      left join public.player_dust_ledger ledger on ledger.id=transaction.dust_ledger_entry_id
      left join public.economy_shop_receipts receipt on receipt.transaction_id=transaction.id
      where transaction.shop_definition_id=p_shop_definition_id
      order by transaction.created_at desc limit p_limit
    ) page),'[]'::jsonb) else '[]'::jsonb end,
    'receipts',case when can_receipts then coalesce((select jsonb_agg(jsonb_build_object(
      'receiptId',receipt.public_receipt_id,'transactionId',receipt.transaction_id,
      'direction',receipt.direction,'itemName',receipt.item_name,'quantity',receipt.quantity,
      'unitPrice',receipt.unit_price,'totalDust',receipt.total_dust,
      'status',receipt.transaction_status,'supportReference',receipt.support_reference,
      'createdAt',receipt.created_at
    ) order by receipt.created_at desc)
      from public.economy_shop_receipts receipt
      join public.economy_shop_transactions transaction on transaction.id=receipt.transaction_id
      where transaction.shop_definition_id=p_shop_definition_id),'[]'::jsonb) else '[]'::jsonb end,
    'reconciliation',coalesce((select jsonb_agg(jsonb_build_object(
      'id',queue.id,'transactionId',queue.transaction_id,'type',queue.reconciliation_type,
      'status',queue.status,'attemptCount',queue.attempt_count,
      'lastErrorCode',queue.last_error_code,'createdAt',queue.created_at
    ) order by queue.created_at desc)
      from public.economy_shop_reconciliation_queue queue
      left join public.economy_shop_transactions transaction on transaction.id=queue.transaction_id
      where transaction.shop_definition_id=p_shop_definition_id or queue.transaction_id is null),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(jsonb_build_object(
      'id',event.id,'adminUserId',event.admin_user_id,'actionKey',event.action_key,
      'targetId',event.target_id,'reason',event.reason,'requestId',event.request_id,
      'createdAt',event.created_at
    ) order by event.created_at desc)
      from public.economy_shop_admin_audit_events event
      where event.shop_definition_id=p_shop_definition_id),'[]'::jsonb),
    'generatedAt',now()
  );
end;
$$;

create or replace function public.update_admin_shop_catalog_entry(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_version_id uuid,p_entry_id uuid,p_expected_revision integer,
  p_configuration jsonb,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_entry public.economy_shop_version_offers%rowtype;
  selected_version public.economy_shop_versions%rowtype;
  next_buy_enabled boolean;
  next_sell_enabled boolean;
  next_buy_price bigint;
  next_sell_price bigint;
  next_stock_mode text;
  next_restock_mode text;
  next_maximum_stock integer;
  next_restock_amount integer;
  next_restock_interval integer;
  next_buy_limit integer;
  next_sell_limit integer;
  next_enabled boolean;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit')
    then raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_revision<1 or p_configuration is null or jsonb_typeof(p_configuration)<>'object'
     or pg_column_size(p_configuration)>4096
     or p_configuration - array[
       'buyEnabled','sellEnabled','buyPrice','sellPrice','stockMode','restockMode',
       'maximumStock','restockAmount','restockIntervalSeconds','playerBuyDailyLimit',
       'playerSellDailyLimit','eligibilityRule','displayOrder','enabled'
     ] <> '{}'::jsonb
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_ENTRY_UPDATE'; end if;

  select * into selected_version from public.economy_shop_versions
  where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if selected_version.lifecycle_status<>'draft'
    then return jsonb_build_object('status','immutable_version'); end if;
  select * into selected_entry from public.economy_shop_version_offers
  where shop_version_id=p_shop_version_id and entry_id=p_entry_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if selected_entry.revision<>p_expected_revision
    then return jsonb_build_object('status','revision_conflict','currentRevision',selected_entry.revision); end if;

  next_buy_enabled:=coalesce((p_configuration->>'buyEnabled')::boolean,selected_entry.buy_enabled);
  next_sell_enabled:=coalesce((p_configuration->>'sellEnabled')::boolean,selected_entry.sell_enabled);
  next_buy_price:=case when next_buy_enabled then coalesce((p_configuration->>'buyPrice')::bigint,selected_entry.buy_price) else null end;
  next_sell_price:=case when next_sell_enabled then coalesce((p_configuration->>'sellPrice')::bigint,selected_entry.sell_price) else null end;
  next_stock_mode:=coalesce(p_configuration->>'stockMode',selected_entry.stock_mode);
  next_restock_mode:=coalesce(p_configuration->>'restockMode',selected_entry.restock_mode);
  next_maximum_stock:=case when next_stock_mode in ('global_limited','hybrid')
    then coalesce((p_configuration->>'maximumStock')::integer,selected_entry.maximum_stock) else null end;
  next_restock_amount:=case when next_restock_mode in ('fixed_interval','daily_utc')
    then coalesce((p_configuration->>'restockAmount')::integer,selected_entry.restock_amount) else null end;
  next_restock_interval:=case when next_restock_mode='fixed_interval'
      then coalesce((p_configuration->>'restockIntervalSeconds')::integer,selected_entry.restock_interval_seconds)
    when next_restock_mode='daily_utc' then 86400 else null end;
  next_buy_limit:=coalesce((p_configuration->>'playerBuyDailyLimit')::integer,selected_entry.player_buy_daily_limit);
  next_sell_limit:=coalesce((p_configuration->>'playerSellDailyLimit')::integer,selected_entry.player_sell_daily_limit);
  next_enabled:=coalesce((p_configuration->>'enabled')::boolean,selected_entry.enabled);

  if not(next_buy_enabled or next_sell_enabled)
     or (next_buy_enabled and next_buy_price not between 1 and 1000000)
     or (next_sell_enabled and next_sell_price not between 1 and 1000000)
     or next_stock_mode not in ('unlimited','global_limited','per_player_limited','hybrid')
     or next_restock_mode not in ('none','fixed_interval','daily_utc','manual')
     or (next_stock_mode in ('global_limited','hybrid') and next_maximum_stock not between 1 and 1000000)
     or (next_restock_mode in ('fixed_interval','daily_utc') and next_restock_amount not between 1 and next_maximum_stock)
     or (next_restock_mode='fixed_interval' and next_restock_interval not between 60 and 2592000)
     or next_buy_limit not between 1 and 9999 or next_sell_limit not between 1 and 9999
     or coalesce(p_configuration->>'eligibilityRule',selected_entry.eligibility_rule)
       not in ('ordinary_gameplay','phase11a_complete','phase11b_complete','tutorial_only')
     or coalesce((p_configuration->>'displayOrder')::integer,selected_entry.display_order) not between 1 and 1000
    then return jsonb_build_object('status','validation_failed'); end if;

  update public.economy_shop_version_offers set
    buy_enabled=next_buy_enabled,sell_enabled=next_sell_enabled,
    buy_price=next_buy_price,sell_price=next_sell_price,
    unit_price=coalesce(next_buy_price,next_sell_price),
    stock_mode=next_stock_mode,restock_mode=next_restock_mode,
    maximum_stock=next_maximum_stock,restock_amount=next_restock_amount,
    restock_interval_seconds=next_restock_interval,
    player_buy_daily_limit=next_buy_limit,player_sell_daily_limit=next_sell_limit,
    daily_limit=case when next_buy_enabled then next_buy_limit else next_sell_limit end,
    eligibility_rule=coalesce(p_configuration->>'eligibilityRule',eligibility_rule),
    display_order=coalesce((p_configuration->>'displayOrder')::integer,display_order),
    enabled=next_enabled,revision=revision+1
  where shop_version_id=p_shop_version_id and entry_id=p_entry_id returning * into selected_entry;
  update public.economy_shop_stock set
    maximum_stock=next_maximum_stock,
    current_stock=case when next_maximum_stock is null then null else least(coalesce(current_stock,next_maximum_stock),next_maximum_stock) end,
    next_restock_at=case
      when next_restock_mode='fixed_interval' then now()+make_interval(secs=>next_restock_interval)
      when next_restock_mode='daily_utc' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day'
      else null end,
    stock_revision=stock_revision+1
  where catalog_version_id=p_shop_version_id and catalog_entry_id=p_entry_id;
  update public.economy_shop_versions set revision=revision+1 where id=p_shop_version_id
  returning * into selected_version;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.entry.update',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',p_shop_version_id,'entryId',p_entry_id,'reason',btrim(p_reason)));
  return jsonb_build_object('status','updated','entryId',p_entry_id,
    'entryRevision',selected_entry.revision,'versionRevision',selected_version.revision);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='INVALID_SHOP_ENTRY_UPDATE';
end;
$$;

create or replace function public.add_admin_shop_catalog_entry(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_version_id uuid,p_offer_id uuid,p_expected_version_revision integer,
  p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_version public.economy_shop_versions%rowtype;
  selected_offer public.cozy_shop_offers%rowtype;
  selected_item public.cozy_item_definitions%rowtype;
  created_entry public.economy_shop_version_offers%rowtype;
  next_buy_enabled boolean;
  next_sell_enabled boolean;
  next_display_order integer;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit')
    then raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_version_revision<1
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_ENTRY_CREATE'; end if;

  select * into selected_version from public.economy_shop_versions
  where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if selected_version.lifecycle_status<>'draft'
    then return jsonb_build_object('status','immutable_version'); end if;
  if selected_version.revision<>p_expected_version_revision
    then return jsonb_build_object('status','revision_conflict','currentRevision',selected_version.revision); end if;

  select * into selected_offer from public.cozy_shop_offers
  where id=p_offer_id and shop_definition_id=selected_version.shop_definition_id and active;
  if not found then return jsonb_build_object('status','offer_not_found'); end if;
  select * into selected_item from public.cozy_item_definitions
  where id=selected_offer.item_definition_id and active;
  if not found then return jsonb_build_object('status','item_unavailable'); end if;
  if exists(select 1 from public.economy_shop_version_offers
    where shop_version_id=p_shop_version_id and offer_id=p_offer_id)
    then return jsonb_build_object('status','entry_exists'); end if;

  next_buy_enabled:=selected_offer.buy_price is not null and selected_item.buy_eligible;
  next_sell_enabled:=selected_offer.sell_price is not null and selected_item.sell_eligible
    and selected_item.category not in ('permanent_tool','special');
  if not(next_buy_enabled or next_sell_enabled)
    then return jsonb_build_object('status','item_ineligible'); end if;
  if next_buy_enabled and next_sell_enabled and selected_offer.sell_price>=selected_offer.buy_price
    then return jsonb_build_object('status','validation_failed'); end if;
  select least(1000,coalesce(max(display_order),0)+1) into next_display_order
  from public.economy_shop_version_offers where shop_version_id=p_shop_version_id;

  insert into public.economy_shop_version_offers(
    shop_version_id,offer_id,entry_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
    inventory_capacity_cost,protected_item,enabled,revision,buy_enabled,sell_enabled,
    buy_price,sell_price,currency_key,stock_mode,restock_mode,maximum_stock,restock_amount,
    restock_interval_seconds,player_buy_daily_limit,player_sell_daily_limit,
    availability_from,availability_until,eligibility_rule,display_order,safe_metadata
  ) values(
    p_shop_version_id,p_offer_id,gen_random_uuid(),
    coalesce(case when next_buy_enabled then selected_offer.buy_price end,selected_offer.sell_price),
    selected_offer.maximum_quantity,case when next_buy_enabled then 40 else 20 end,0,
    1,false,true,1,next_buy_enabled,next_sell_enabled,
    case when next_buy_enabled then selected_offer.buy_price end,
    case when next_sell_enabled then selected_offer.sell_price end,
    'DUST',case when next_buy_enabled then 'unlimited' else 'per_player_limited' end,
    'none',null,null,null,40,20,selected_offer.available_from,selected_offer.available_until,
    'ordinary_gameplay',next_display_order,
    jsonb_build_object('createdByAdmin',true,'directArbitrageBlocked',true)
  ) returning * into created_entry;
  insert into public.economy_shop_stock(
    catalog_version_id,catalog_entry_id,current_stock,maximum_stock
  ) values(p_shop_version_id,created_entry.entry_id,null,null);
  update public.economy_shop_versions set revision=revision+1
  where id=p_shop_version_id returning * into selected_version;
  insert into public.economy_shop_admin_audit_events(
    admin_user_id,action_key,shop_definition_id,target_id,reason,request_id,previous_value,new_value
  ) values(p_user_id,'catalog_entry_added',selected_version.shop_definition_id,created_entry.entry_id,
    btrim(p_reason),p_request_id,'{}'::jsonb,
    jsonb_build_object('shopVersionId',p_shop_version_id,'offerId',p_offer_id,
      'entryId',created_entry.entry_id,'versionRevision',selected_version.revision));
  return jsonb_build_object('status','created','entryId',created_entry.entry_id,
    'entryRevision',created_entry.revision,'versionRevision',selected_version.revision);
end;
$$;

create or replace function public.remove_admin_shop_catalog_entry(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_version_id uuid,p_entry_id uuid,p_expected_version_revision integer,
  p_expected_entry_revision integer,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_version public.economy_shop_versions%rowtype;
  selected_entry public.economy_shop_version_offers%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit')
    then raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_version_revision<1 or p_expected_entry_revision<1
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_ENTRY_REMOVE'; end if;

  select * into selected_version from public.economy_shop_versions
  where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if selected_version.lifecycle_status<>'draft'
    then return jsonb_build_object('status','immutable_version'); end if;
  if selected_version.revision<>p_expected_version_revision
    then return jsonb_build_object('status','revision_conflict','currentRevision',selected_version.revision); end if;
  select * into selected_entry from public.economy_shop_version_offers
  where shop_version_id=p_shop_version_id and entry_id=p_entry_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if selected_entry.revision<>p_expected_entry_revision
    then return jsonb_build_object('status','revision_conflict','currentRevision',selected_entry.revision); end if;
  if exists(select 1 from public.economy_shop_transactions
    where catalog_version_id=p_shop_version_id and catalog_entry_id=p_entry_id)
    then return jsonb_build_object('status','entry_referenced'); end if;

  delete from public.economy_shop_stock
  where catalog_version_id=p_shop_version_id and catalog_entry_id=p_entry_id;
  delete from public.economy_shop_version_offers
  where shop_version_id=p_shop_version_id and entry_id=p_entry_id;
  update public.economy_shop_versions set revision=revision+1
  where id=p_shop_version_id returning * into selected_version;
  insert into public.economy_shop_admin_audit_events(
    admin_user_id,action_key,shop_definition_id,target_id,reason,request_id,previous_value,new_value
  ) values(p_user_id,'catalog_entry_removed',selected_version.shop_definition_id,p_entry_id,
    btrim(p_reason),p_request_id,
    jsonb_build_object('shopVersionId',p_shop_version_id,'offerId',selected_entry.offer_id,
      'entryId',p_entry_id,'entryRevision',selected_entry.revision),'{}'::jsonb);
  return jsonb_build_object('status','removed','entryId',p_entry_id,
    'versionRevision',selected_version.revision);
end;
$$;

create or replace function public.operate_admin_economy_shop_version(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_version_id uuid,p_expected_revision integer,p_action text,
  p_effective_at timestamptz,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  version public.economy_shop_versions%rowtype;
  required_permission text;
  presentation_status text;
  validation jsonb;
begin
  required_permission:=case when p_action in ('approve','schedule','publish','disable','rollback')
    then 'economy.shop.publish' else 'economy.shop.edit' end;
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,required_permission)
    then raise exception using errcode='42501',message='ECONOMY_SHOP_TRANSITION_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_revision<1
     or p_action not in ('validate','submit_review','approve','schedule','publish','disable','rollback')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or (p_action='schedule' and (p_effective_at is null or p_effective_at<=now() or p_effective_at>now()+interval '90 days'))
    then raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_TRANSITION'; end if;
  select * into version from public.economy_shop_versions where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.revision<>p_expected_revision
    then return jsonb_build_object('status','revision_conflict','currentRevision',version.revision); end if;

  if p_action='rollback' then
    if version.lifecycle_status<>'published' then return jsonb_build_object('status','invalid_transition'); end if;
    update public.cozy_shop_offers base set
      buy_price=case when entry.buy_enabled then entry.buy_price else null end,
      sell_price=case when entry.sell_enabled then entry.sell_price else null end,
      maximum_quantity=entry.maximum_quantity,active=entry.enabled
    from public.economy_shop_version_offers entry
    where entry.shop_version_id=version.id and base.id=entry.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(version.shop_definition_id,version.id,now()) on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
    update public.cozy_shop_definitions set active=true where id=version.shop_definition_id;
    presentation_status:='rolled_back';
  elsif p_action='validate' then
    if version.lifecycle_status<>'draft' then return jsonb_build_object('status','invalid_transition'); end if;
    if not exists(select 1 from public.economy_shop_version_offers where shop_version_id=version.id and enabled)
       or exists(select 1 from public.economy_shop_version_offers entry
         join public.cozy_shop_offers offer on offer.id=entry.offer_id
         join public.cozy_item_definitions item on item.id=offer.item_definition_id
         where entry.shop_version_id=version.id and entry.enabled and (
           entry.protected_item or not offer.active or not item.active
           or (entry.buy_enabled and (not item.buy_eligible or entry.buy_price not between 1 and 1000000))
           or (entry.sell_enabled and (not item.sell_eligible or item.category in ('permanent_tool','special') or entry.sell_price not between 1 and 1000000))
         ))
       or exists(select 1 from public.economy_shop_version_offers buy_entry
         join public.cozy_shop_offers buy_offer on buy_offer.id=buy_entry.offer_id
         join public.economy_shop_version_offers sell_entry
           on sell_entry.shop_version_id=buy_entry.shop_version_id
         join public.cozy_shop_offers sell_offer on sell_offer.id=sell_entry.offer_id
           and sell_offer.item_definition_id=buy_offer.item_definition_id
         where buy_entry.shop_version_id=version.id and buy_entry.enabled and sell_entry.enabled
           and buy_entry.buy_enabled and sell_entry.sell_enabled and sell_entry.sell_price>=buy_entry.buy_price)
      then return jsonb_build_object('status','validation_failed'); end if;
    validation:=jsonb_build_object('valid',true,'checks',jsonb_build_array(
      'ordinary-items-only','positive-bounded-prices','direct-arbitrage-blocked','explicit-sellability',
      'stock-policy-valid','bounded-player-limits','dust-source-and-sink-active','effective-time'));
    update public.economy_shop_versions set lifecycle_status='validated',revision=revision+1,
      validation_results=validation where id=version.id returning * into version;
    presentation_status:='validated';
  elsif p_action='submit_review' then
    if version.lifecycle_status<>'validated' then return jsonb_build_object('status','invalid_transition'); end if;
    update public.economy_shop_versions set lifecycle_status='in_review',revision=revision+1
    where id=version.id returning * into version;
    presentation_status:='in_review';
  elsif p_action='approve' then
    if version.lifecycle_status<>'in_review' or version.approved_at is not null
      then return jsonb_build_object('status','invalid_transition'); end if;
    if version.created_by_admin_id=p_user_id then return jsonb_build_object('status','separation_of_duty'); end if;
    update public.economy_shop_versions set approved_by_admin_id=p_user_id,approved_at=now(),
      reviewed_by_admin_id=p_user_id,reviewed_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status:='approved';
  elsif p_action='schedule' then
    if version.lifecycle_status<>'in_review' or version.approved_at is null
      then return jsonb_build_object('status','approval_required'); end if;
    update public.economy_shop_versions set effective_at=p_effective_at,
      scheduled_by_admin_id=p_user_id,scheduled_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status:='scheduled';
  elsif p_action='disable' then
    if version.lifecycle_status<>'in_review' or version.approved_at is null
      then return jsonb_build_object('status','approval_required'); end if;
    update public.economy_shop_versions set lifecycle_status='disabled',revision=revision+1,
      published_by_admin_id=p_user_id,published_at=now() where id=version.id returning * into version;
    update public.cozy_shop_definitions set active=false where id=version.shop_definition_id;
    presentation_status:='disabled';
  else
    if version.lifecycle_status<>'in_review' or version.approved_at is null
      then return jsonb_build_object('status','approval_required'); end if;
    update public.economy_shop_versions set lifecycle_status='published',effective_at=now(),
      published_by_admin_id=p_user_id,published_at=now(),revision=revision+1
    where id=version.id returning * into version;
    update public.cozy_shop_offers base set
      buy_price=case when entry.buy_enabled then entry.buy_price else null end,
      sell_price=case when entry.sell_enabled then entry.sell_price else null end,
      maximum_quantity=entry.maximum_quantity,active=entry.enabled
    from public.economy_shop_version_offers entry
    where entry.shop_version_id=version.id and base.id=entry.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(version.shop_definition_id,version.id,now()) on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
    update public.cozy_shop_definitions set active=true where id=version.shop_definition_id;
    insert into public.economy_shop_events(shop_definition_id,event_key,visibility,related_entity_id,safe_payload)
    values(version.shop_definition_id,'shop_catalog_changed','operations',version.id,
      jsonb_build_object('catalogVersionId',version.id,'catalogVersionNumber',version.version_number));
    presentation_status:='published';
  end if;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.'||p_action,p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',version.id,'shopDefinitionId',version.shop_definition_id,
      'status',presentation_status,'revision',version.revision,'effectiveAt',version.effective_at));
  return jsonb_build_object('status',presentation_status,'versionId',version.id,
    'versionNumber',version.version_number,'revision',version.revision,
    'effectiveAt',version.effective_at,
    'active',exists(select 1 from public.economy_active_shop_versions active where active.shop_version_id=version.id));
end;
$$;

create or replace function public.update_admin_shop_live_ops(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_definition_id uuid,p_expected_revision integer,p_configuration jsonb,
  p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare previous public.economy_shop_live_ops%rowtype; updated public.economy_shop_live_ops%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.live_ops.manage')
    then raise exception using errcode='42501',message='ECONOMY_LIVE_OPS_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',20,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_revision<1 or p_configuration is null or jsonb_typeof(p_configuration)<>'object'
     or p_configuration - array['accessEnabled','buyingEnabled','sellingEnabled','stockDecrementEnabled',
       'restockEnabled','tutorialObjectivesEnabled','tutorialRewardsEnabled','saleDustIssuanceEnabled',
       'globalDailySaleDustCap','maintenanceMessage'] <> '{}'::jsonb
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_LIVE_OPS_UPDATE'; end if;
  select * into previous from public.economy_shop_live_ops where shop_definition_id=p_shop_definition_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if previous.configuration_revision<>p_expected_revision then
    return jsonb_build_object('status','revision_conflict','currentRevision',previous.configuration_revision); end if;
  update public.economy_shop_live_ops set
    access_enabled=coalesce((p_configuration->>'accessEnabled')::boolean,access_enabled),
    buying_enabled=coalesce((p_configuration->>'buyingEnabled')::boolean,buying_enabled),
    selling_enabled=coalesce((p_configuration->>'sellingEnabled')::boolean,selling_enabled),
    stock_decrement_enabled=coalesce((p_configuration->>'stockDecrementEnabled')::boolean,stock_decrement_enabled),
    restock_enabled=coalesce((p_configuration->>'restockEnabled')::boolean,restock_enabled),
    tutorial_objectives_enabled=coalesce((p_configuration->>'tutorialObjectivesEnabled')::boolean,tutorial_objectives_enabled),
    tutorial_rewards_enabled=coalesce((p_configuration->>'tutorialRewardsEnabled')::boolean,tutorial_rewards_enabled),
    sale_dust_issuance_enabled=coalesce((p_configuration->>'saleDustIssuanceEnabled')::boolean,sale_dust_issuance_enabled),
    global_daily_sale_dust_cap=coalesce((p_configuration->>'globalDailySaleDustCap')::bigint,global_daily_sale_dust_cap),
    maintenance_message=coalesce(p_configuration->>'maintenanceMessage',maintenance_message),
    configuration_revision=configuration_revision+1
  where shop_definition_id=p_shop_definition_id returning * into updated;
  insert into public.economy_shop_admin_audit_events(admin_user_id,action_key,shop_definition_id,target_id,
    reason,request_id,previous_value,new_value)
  values(p_user_id,'live_ops_updated',p_shop_definition_id,p_shop_definition_id,btrim(p_reason),p_request_id,
    to_jsonb(previous)-'updated_at',to_jsonb(updated)-'updated_at');
  insert into public.economy_shop_events(shop_definition_id,event_key,visibility,related_entity_id,safe_payload)
  values(p_shop_definition_id,'shop_availability_changed','operations',p_shop_definition_id,
    jsonb_build_object('configurationRevision',updated.configuration_revision));
  return jsonb_build_object('status','updated','configurationRevision',updated.configuration_revision);
exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode='22023',message='INVALID_SHOP_LIVE_OPS_UPDATE';
end; $$;

create or replace function public.restock_admin_shop_entry(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_catalog_version_id uuid,p_entry_id uuid,p_expected_stock_revision integer,
  p_quantity integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare stock public.economy_shop_stock%rowtype; updated public.economy_shop_stock%rowtype; shop_id uuid;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.stock.manage')
    then raise exception using errcode='42501',message='ECONOMY_STOCK_MANAGE_DENIED'; end if;
  if p_expected_stock_revision<1 or p_quantity not between 1 and 1000000
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_RESTOCK'; end if;
  select * into stock from public.economy_shop_stock
  where catalog_version_id=p_catalog_version_id and catalog_entry_id=p_entry_id for update;
  if not found or stock.maximum_stock is null then return jsonb_build_object('status','not_found'); end if;
  if stock.stock_revision<>p_expected_stock_revision then
    return jsonb_build_object('status','revision_conflict','currentRevision',stock.stock_revision); end if;
  select shop_definition_id into strict shop_id from public.economy_shop_versions where id=p_catalog_version_id;
  update public.economy_shop_stock set current_stock=least(maximum_stock,current_stock+p_quantity),
    stock_revision=stock_revision+1,last_restock_at=now()
  where catalog_version_id=p_catalog_version_id and catalog_entry_id=p_entry_id returning * into updated;
  insert into public.economy_shop_admin_audit_events(admin_user_id,action_key,shop_definition_id,target_id,
    reason,request_id,previous_value,new_value)
  values(p_user_id,'manual_restock',shop_id,p_entry_id,btrim(p_reason),p_request_id,
    jsonb_build_object('stock',stock.current_stock,'revision',stock.stock_revision),
    jsonb_build_object('stock',updated.current_stock,'revision',updated.stock_revision));
  insert into public.economy_shop_events(shop_definition_id,event_key,visibility,related_entity_id,safe_payload)
  values(shop_id,'shop_stock_changed','public_stock',p_entry_id,
    jsonb_build_object('entryId',p_entry_id,'currentStock',updated.current_stock,'stockRevision',updated.stock_revision));
  return jsonb_build_object('status','restocked','currentStock',updated.current_stock,'stockRevision',updated.stock_revision);
end; $$;

create or replace function public.request_admin_shop_reconciliation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_definition_id uuid,p_transaction_id uuid,p_reconciliation_type text,
  p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare queued public.economy_shop_reconciliation_queue%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.reconciliation.manage')
    then raise exception using errcode='42501',message='ECONOMY_RECONCILIATION_DENIED'; end if;
  if p_reconciliation_type not in ('settlement_mismatch','receipt_mismatch','stock_mismatch','limit_mismatch','stuck_transaction')
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_RECONCILIATION_REQUEST'; end if;
  if not exists(select 1 from public.economy_shop_transactions
      where id=p_transaction_id and shop_definition_id=p_shop_definition_id)
    then return jsonb_build_object('status','not_found'); end if;
  insert into public.economy_shop_reconciliation_queue(transaction_id,reconciliation_type,evidence)
  values(p_transaction_id,p_reconciliation_type,jsonb_build_object('reason',btrim(p_reason),'requestId',p_request_id))
  on conflict(transaction_id,reconciliation_type) do update set
    status=case when public.economy_shop_reconciliation_queue.status='resolved' then 'pending'
      else public.economy_shop_reconciliation_queue.status end,
    available_at=least(public.economy_shop_reconciliation_queue.available_at,now())
  returning * into queued;
  insert into public.economy_shop_admin_audit_events(admin_user_id,action_key,shop_definition_id,target_id,
    reason,request_id,new_value)
  values(p_user_id,'reconciliation_requested',p_shop_definition_id,queued.id,btrim(p_reason),p_request_id,
    jsonb_build_object('transactionId',p_transaction_id,'type',p_reconciliation_type));
  return jsonb_build_object('status','queued','reconciliationId',queued.id);
end; $$;

create or replace function public.run_shop_restock_worker(p_limit integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare selected record; processed integer:=0;
begin
  if p_limit not between 1 and 100 or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_RESTOCK_WORKER_REQUEST'; end if;
  for selected in
    select stock.*,entry.restock_mode,entry.restock_amount,entry.restock_interval_seconds,
      version.shop_definition_id,live_ops.restock_enabled
    from public.economy_shop_stock stock
    join public.economy_shop_version_offers entry
      on entry.shop_version_id=stock.catalog_version_id and entry.entry_id=stock.catalog_entry_id
    join public.economy_shop_versions version on version.id=stock.catalog_version_id
    join public.economy_active_shop_versions active on active.shop_version_id=version.id
    join public.economy_shop_live_ops live_ops on live_ops.shop_definition_id=version.shop_definition_id
    where stock.next_restock_at<=now() and not stock.restock_paused and live_ops.restock_enabled
      and entry.restock_mode in ('fixed_interval','daily_utc')
    order by stock.next_restock_at limit p_limit for update of stock skip locked
  loop
    update public.economy_shop_stock set
      current_stock=least(maximum_stock,current_stock+selected.restock_amount),
      stock_revision=stock_revision+1,last_restock_at=now(),
      next_restock_at=case when selected.restock_mode='fixed_interval'
        then now()+make_interval(secs=>selected.restock_interval_seconds)
        else date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day' end
    where catalog_version_id=selected.catalog_version_id and catalog_entry_id=selected.catalog_entry_id;
    insert into public.economy_shop_events(shop_definition_id,event_key,visibility,related_entity_id,safe_payload)
    select selected.shop_definition_id,'shop_stock_changed','public_stock',selected.catalog_entry_id,
      jsonb_build_object('entryId',stock.catalog_entry_id,'currentStock',stock.current_stock,
        'stockRevision',stock.stock_revision,'restock',true)
    from public.economy_shop_stock stock
    where stock.catalog_version_id=selected.catalog_version_id and stock.catalog_entry_id=selected.catalog_entry_id;
    processed:=processed+1;
  end loop;
  return jsonb_build_object('status','processed','restocked',processed,'requestId',p_request_id);
end; $$;

create or replace function public.reconcile_shop_transactions(p_limit integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare selected public.economy_shop_reconciliation_queue%rowtype; processed integer:=0; resolved integer:=0;
  mismatch boolean;
begin
  if p_limit not between 1 and 100 or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_RECONCILIATION_WORKER_REQUEST'; end if;
  for selected in select * from public.economy_shop_reconciliation_queue
    where status in ('pending','failed') and available_at<=now() order by created_at
    limit p_limit for update skip locked
  loop
    update public.economy_shop_reconciliation_queue set status='processing',attempt_count=attempt_count+1
    where id=selected.id;
    select case selected.reconciliation_type
      when 'receipt_mismatch' then not exists(select 1 from public.economy_shop_receipts where transaction_id=selected.transaction_id)
      when 'settlement_mismatch' then exists(select 1 from public.economy_shop_transactions transaction
        where transaction.id=selected.transaction_id and transaction.status='completed'
          and (transaction.dust_ledger_entry_id is null or transaction.inventory_history_entry_id is null))
      else false end into mismatch;
    update public.economy_shop_reconciliation_queue set
      status=case when mismatch then 'manual_review' else 'resolved' end,
      last_error_code=case when mismatch then 'SHOP_RECONCILIATION_MISMATCH' else null end
    where id=selected.id;
    processed:=processed+1; if not mismatch then resolved:=resolved+1; end if;
  end loop;
  return jsonb_build_object('status','processed','processed',processed,'resolved',resolved,
    'manualReview',processed-resolved,'requestId',p_request_id);
end; $$;

revoke all on function public.get_admin_shop_operations(uuid,uuid,text,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.update_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.add_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.remove_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.update_admin_shop_live_ops(uuid,uuid,text,uuid,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.restock_admin_shop_entry(uuid,uuid,text,uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.request_admin_shop_reconciliation(uuid,uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.run_shop_restock_worker(integer,text) from public,anon,authenticated;
revoke all on function public.reconcile_shop_transactions(integer,text) from public,anon,authenticated;
grant execute on function public.get_admin_shop_operations(uuid,uuid,text,uuid,integer,text) to service_role;
grant execute on function public.update_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text) to service_role;
grant execute on function public.add_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,text,text) to service_role;
grant execute on function public.remove_admin_shop_catalog_entry(uuid,uuid,text,uuid,uuid,integer,integer,text,text) to service_role;
grant execute on function public.update_admin_shop_live_ops(uuid,uuid,text,uuid,integer,jsonb,text,text) to service_role;
grant execute on function public.restock_admin_shop_entry(uuid,uuid,text,uuid,uuid,integer,integer,text,text) to service_role;
grant execute on function public.request_admin_shop_reconciliation(uuid,uuid,text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.run_shop_restock_worker(integer,text) to service_role;
grant execute on function public.reconcile_shop_transactions(integer,text) to service_role;

comment on function public.run_shop_restock_worker(integer,text) is
  'Bounded, lock-safe stock restock worker. No per-entry timers or browser authority.';
comment on function public.reconcile_shop_transactions(integer,text) is
  'Bounded exact-evidence shop reconciliation. Mismatches are preserved for manual review and never auto-correct DUST or inventory.';

create or replace function public.create_admin_shop_catalog_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_shop_definition_id uuid,p_expected_active_version_id uuid,
  p_name text,p_description text,p_reason text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare active_version public.economy_shop_versions%rowtype;
  successor public.economy_shop_versions%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit')
    then raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',20,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 80
     or p_description is null or char_length(btrim(p_description)) not between 3 and 280
     or p_reason is null or char_length(btrim(p_reason)) not between 12 and 500
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_SHOP_CATALOG_SUCCESSOR'; end if;
  select version.* into strict active_version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions version on version.id=active.shop_version_id
  where active.shop_definition_id=p_shop_definition_id for share of version;
  if active_version.id<>p_expected_active_version_id
    then return jsonb_build_object('status','revision_conflict','activeVersionId',active_version.id); end if;
  insert into public.economy_shop_versions(
    id,shop_definition_id,catalog_id,version_number,lifecycle_status,name,description,
    interaction_key,revision,effective_at,reason,safe_metadata,created_by_admin_id
  ) values(
    gen_random_uuid(),active_version.shop_definition_id,active_version.catalog_id,
    (select max(version_number)+1 from public.economy_shop_versions where shop_definition_id=p_shop_definition_id),
    'draft',btrim(p_name),btrim(p_description),active_version.interaction_key,1,now(),
    btrim(p_reason),active_version.safe_metadata,p_user_id
  ) returning * into successor;
  insert into public.economy_shop_version_offers(
    shop_version_id,offer_id,entry_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
    inventory_capacity_cost,protected_item,enabled,revision,buy_enabled,sell_enabled,
    buy_price,sell_price,currency_key,stock_mode,restock_mode,maximum_stock,restock_amount,
    restock_interval_seconds,player_buy_daily_limit,player_sell_daily_limit,
    availability_from,availability_until,eligibility_rule,display_order,safe_metadata
  ) select successor.id,entry.offer_id,gen_random_uuid(),entry.unit_price,entry.maximum_quantity,
    entry.daily_limit,entry.cooldown_seconds,entry.inventory_capacity_cost,entry.protected_item,
    entry.enabled,1,entry.buy_enabled,entry.sell_enabled,entry.buy_price,entry.sell_price,
    entry.currency_key,entry.stock_mode,entry.restock_mode,entry.maximum_stock,entry.restock_amount,
    entry.restock_interval_seconds,entry.player_buy_daily_limit,entry.player_sell_daily_limit,
    entry.availability_from,entry.availability_until,entry.eligibility_rule,entry.display_order,
    entry.safe_metadata||jsonb_build_object('clonedFromEntryId',entry.entry_id)
  from public.economy_shop_version_offers entry where entry.shop_version_id=active_version.id;
  insert into public.economy_shop_stock(
    catalog_version_id,catalog_entry_id,current_stock,maximum_stock,next_restock_at,restock_paused
  ) select successor.id,new_entry.entry_id,
    case when new_entry.stock_mode in ('global_limited','hybrid') then new_entry.maximum_stock else null end,
    new_entry.maximum_stock,
    case when new_entry.restock_mode='fixed_interval' then now()+make_interval(secs=>new_entry.restock_interval_seconds)
      when new_entry.restock_mode='daily_utc' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day'
      else null end,false
  from public.economy_shop_version_offers new_entry where new_entry.shop_version_id=successor.id;
  insert into public.economy_shop_admin_audit_events(
    admin_user_id,action_key,shop_definition_id,target_id,reason,request_id,previous_value,new_value
  ) values(p_user_id,'catalog_successor_created',p_shop_definition_id,successor.id,btrim(p_reason),p_request_id,
    jsonb_build_object('activeVersionId',active_version.id),jsonb_build_object('draftVersionId',successor.id));
  return jsonb_build_object('status','created','versionId',successor.id,'versionNumber',successor.version_number,'revision',successor.revision);
end;
$$;

revoke all on function public.create_admin_shop_catalog_successor(uuid,uuid,text,uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_admin_shop_catalog_successor(uuid,uuid,text,uuid,uuid,text,text,text,text)
  to service_role;

-- Preserve the Phase 9A API while routing it through the Phase 11C successor
-- model. This avoids breaking existing trusted admin clients during rollout.
create or replace function public.create_admin_economy_shop_draft(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_definition_id uuid,
  p_expected_active_version_id uuid,p_name text,p_description text,p_effective_at timestamptz,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; version_id uuid; selected public.economy_shop_versions%rowtype;
begin
  if p_effective_at is null or p_effective_at>now()+interval '90 days' then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_DRAFT';
  end if;
  result:=public.create_admin_shop_catalog_successor(
    p_user_id,p_auth_session_id,p_assurance_level,p_shop_definition_id,
    p_expected_active_version_id,p_name,p_description,
    'Phase 9A compatible successor draft request.',p_request_id
  );
  if result->>'status'<>'created' then return result; end if;
  version_id:=(result->>'versionId')::uuid;
  update public.economy_shop_versions set effective_at=p_effective_at
  where id=version_id and lifecycle_status='draft' returning * into strict selected;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.draft_created',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',selected.id,'shopDefinitionId',p_shop_definition_id,
      'baseVersionId',p_expected_active_version_id));
  return jsonb_build_object('status','draft','versionId',selected.id,
    'versionNumber',selected.version_number,'revision',selected.revision);
end;
$$;

create or replace function public.update_admin_economy_shop_offer(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_version_id uuid,
  p_expected_shop_revision integer,p_offer_id uuid,p_unit_price bigint,p_maximum_quantity integer,
  p_daily_limit integer,p_cooldown_seconds integer,p_enabled boolean,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare version public.economy_shop_versions%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit') then
    raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED'; end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60)
    then return jsonb_build_object('status','rate_limited'); end if;
  if p_expected_shop_revision<1 or p_unit_price not between 1 and 1000000
     or p_maximum_quantity not between 1 and 99 or p_daily_limit not between 1 and 999
     or p_cooldown_seconds not between 0 and 86400
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
    then raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_OFFER'; end if;
  select * into version from public.economy_shop_versions where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.lifecycle_status<>'draft' then return jsonb_build_object('status','immutable'); end if;
  if version.revision<>p_expected_shop_revision then return jsonb_build_object('status','revision_conflict'); end if;
  perform 1 from public.cozy_shop_offers offer
  join public.cozy_item_definitions item on item.id=offer.item_definition_id
  where offer.id=p_offer_id and offer.shop_definition_id=version.shop_definition_id
    and offer.active and item.active and item.buy_eligible and item.category not in ('permanent_tool','special');
  if not found then return jsonb_build_object('status','protected_or_unknown_item'); end if;
  update public.economy_shop_version_offers set unit_price=p_unit_price,
    buy_price=case when buy_enabled then p_unit_price else buy_price end,
    maximum_quantity=p_maximum_quantity,daily_limit=p_daily_limit,
    player_buy_daily_limit=case when buy_enabled then p_daily_limit else player_buy_daily_limit end,
    cooldown_seconds=p_cooldown_seconds,enabled=p_enabled,revision=revision+1
  where shop_version_id=p_shop_version_id and offer_id=p_offer_id;
  if not found then return jsonb_build_object('status','offer_not_in_draft'); end if;
  update public.economy_shop_versions set revision=revision+1 where id=p_shop_version_id returning * into version;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.offer_updated',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',version.id,'offerId',p_offer_id,'revision',version.revision));
  return jsonb_build_object('status','draft','versionId',version.id,'revision',version.revision);
end;
$$;
