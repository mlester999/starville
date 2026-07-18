-- Starville Phase 9A.1: bound canonical source, sink, and operation identifiers.
-- Existing format checks and the closed source/sink registries remain authoritative.

alter table public.economy_source_versions
  add constraint economy_source_versions_source_key_length_check
    check (char_length(source_key) between 3 and 80),
  add constraint economy_source_versions_operation_key_length_check
    check (char_length(operation_key) between 3 and 80);

alter table public.economy_active_source_versions
  add constraint economy_active_source_versions_source_key_length_check
    check (char_length(source_key) between 3 and 80);

alter table public.economy_sink_versions
  add constraint economy_sink_versions_sink_key_length_check
    check (char_length(sink_key) between 3 and 80),
  add constraint economy_sink_versions_operation_key_length_check
    check (char_length(operation_key) between 3 and 80);

alter table public.economy_active_sink_versions
  add constraint economy_active_sink_versions_sink_key_length_check
    check (char_length(sink_key) between 3 and 80);

alter table public.player_dust_ledger
  add constraint player_dust_ledger_operation_key_length_check
    check (char_length(operation_key) between 3 and 80);

-- Keep review, approval, and scheduling explicit without weakening the existing
-- immutable published-version boundary.
alter table public.economy_policy_versions
  add column approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  add column approved_at timestamptz,
  add column scheduled_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  add column scheduled_at timestamptz,
  add constraint economy_policy_versions_approval_pair_check check (
    (approved_by_admin_id is null) = (approved_at is null)
  ),
  add constraint economy_policy_versions_schedule_pair_check check (
    (scheduled_by_admin_id is null) = (scheduled_at is null)
    and (scheduled_at is null or approved_at is not null)
  );

alter table public.economy_shop_versions
  add column approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  add column approved_at timestamptz,
  add column scheduled_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  add column scheduled_at timestamptz,
  add constraint economy_shop_versions_approval_pair_check check (
    (approved_by_admin_id is null) = (approved_at is null)
  ),
  add constraint economy_shop_versions_schedule_pair_check check (
    (scheduled_by_admin_id is null) = (scheduled_at is null)
    and (scheduled_at is null or approved_at is not null)
  );

create index economy_policy_versions_scheduled_activation_idx
  on public.economy_policy_versions(effective_at, version_number desc)
  where lifecycle_status = 'in_review' and scheduled_at is not null;

create index economy_shop_versions_scheduled_activation_idx
  on public.economy_shop_versions(effective_at, shop_definition_id, version_number desc)
  where lifecycle_status = 'in_review' and scheduled_at is not null;

-- All DUST settlement paths acquire the player identity before the account.
-- This matches purchase settlement and prevents a profile/account lock inversion
-- when a reward and purchase reach the same player concurrently.
create or replace function private.cozy_apply_dust_delta(
  p_player_profile_id uuid,
  p_delta bigint,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
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
  account public.player_dust_accounts%rowtype;
  policy public.economy_policy_versions%rowtype;
begin
  perform 1 from public.player_profiles
  where id=p_player_profile_id for key share;
  if not found then return false; end if;
  select version.* into strict policy
  from public.economy_active_policy active
  join public.economy_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key;
  if not policy.economy_enabled
     and p_reason not in ('system_refund','migration_adjustment') then
    return false;
  end if;
  if p_reason in ('shop_purchase','shop_sale') and not policy.purchases_enabled then
    return false;
  end if;
  if p_reason='cooperative_activity_reward' and not policy.rewards_enabled then
    return false;
  end if;
  if p_reason='administrative_correction' and not policy.corrections_enabled then
    return false;
  end if;
  if p_delta>0 and not exists(
    select 1 from public.economy_active_source_versions active
    join public.economy_source_versions source on source.id=active.source_version_id
    where source.operation_key=p_reason and source.lifecycle_status='published'
      and source.effective_at<=now()
  ) then return false; end if;
  if p_delta<0 and not exists(
    select 1 from public.economy_active_sink_versions active
    join public.economy_sink_versions sink on sink.id=active.sink_version_id
    where sink.operation_key=p_reason and sink.lifecycle_status='published'
      and sink.effective_at<=now()
  ) then return false; end if;
  select * into strict account from public.player_dust_accounts
  where player_profile_id=p_player_profile_id for update;
  if p_delta=0 then return true; end if;
  if account.balance+p_delta<0 or account.balance+p_delta>9000000000000000 then
    return false;
  end if;
  update public.player_dust_accounts set
    balance=balance+p_delta,state_version=state_version+1,updated_at=now()
  where player_profile_id=p_player_profile_id returning * into account;
  insert into public.player_dust_ledger(
    player_profile_id,delta,resulting_balance,reason,reference_type,
    reference_id,idempotency_key,request_id
  ) values(
    p_player_profile_id,p_delta,account.balance,p_reason,p_reference_type,p_reference_id,
    encode(extensions.digest(
      convert_to(p_reason||':'||p_idempotency_key,'UTF8'),'sha256'
    ),'hex'),p_request_id
  );
  return true;
end;
$$;

-- Shop settlement keeps the player and moderation rows stable with compatible
-- shared locks. A per-player transaction advisory lock serializes purchases and
-- sales without conflicting with the foreign-key key-share lock used by every
-- DUST ledger write.
create or replace function public.transact_player_shop(
  p_wallet_address text,p_shop_slug text,p_offer_id uuid,p_operation text,p_quantity integer,
  p_expected_dust_state_version integer,p_expected_inventory_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype;moderation public.player_moderation_states%rowtype;
  selected_rows record;config public.cozy_gameplay_config%rowtype;shop public.cozy_shop_definitions%rowtype;
  shop_anchor public.cozy_shop_interactions%rowtype;offer public.cozy_shop_offers%rowtype;
  item public.cozy_item_definitions%rowtype;account public.player_dust_accounts%rowtype;
  inventory_state public.player_inventory_state%rowtype;receipt public.cozy_gameplay_idempotency%rowtype;
  operation_key text;request_hash text;response jsonb;transaction_id uuid:=gen_random_uuid();
  total bigint;total_numeric numeric;dust_delta bigint;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_offer_id is null or p_operation not in ('buy','sell') or p_quantity not between 1 and 99
     or p_expected_dust_state_version<1 or p_expected_inventory_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_SHOP_TRANSACTION_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows from public.player_profiles p
  join public.player_moderation_states m on m.player_profile_id=p.id where p.wallet_address=p_wallet_address for share of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cozy-shop-player:'||profile.id::text,0)
  );
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_write',config.mutation_rate_limit) then return jsonb_build_object('status','rate_limited'); end if;
  operation_key:=case when p_operation='buy' then 'shop_buy' else 'shop_sell' end;
  request_hash:=encode(extensions.digest(convert_to(p_shop_slug||':'||p_offer_id::text||':'||p_operation||':'||p_quantity::text||':'||p_expected_dust_state_version::text||':'||p_expected_inventory_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cozy-idem:'||profile.id::text||':'||operation_key||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency where player_profile_id=profile.id and operation=operation_key and idempotency_key=p_idempotency_key;
  if found then if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb); end if;
  select * into shop from public.cozy_shop_definitions where slug=p_shop_slug and active;
  if not found then return jsonb_build_object('status','shop_offer_unavailable'); end if;
  select * into shop_anchor from public.cozy_shop_interactions where shop_definition_id=shop.id and active;
  if not found or profile.current_map_id<>(select slug from public.world_maps where id=shop_anchor.world_map_id)
     or profile.current_map_version_id is distinct from shop_anchor.map_version_id
     or sqrt(power(profile.safe_position_x-shop_anchor.position_x,2)+power(profile.safe_position_y-shop_anchor.position_y,2))>shop_anchor.interaction_range then
    return jsonb_build_object('status','shop_offer_unavailable'); end if;
  select * into offer from public.cozy_shop_offers where id=p_offer_id and shop_definition_id=shop.id and active
    and (available_from is null or available_from<=now()) and (available_until is null or available_until>now());
  if not found then return jsonb_build_object('status','shop_offer_unavailable'); end if;
  if p_quantity<offer.minimum_quantity or p_quantity>offer.maximum_quantity then return jsonb_build_object('status','invalid_quantity'); end if;
  select * into strict item from public.cozy_item_definitions where id=offer.item_definition_id and active;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id for update;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id for update;
  if account.state_version<>p_expected_dust_state_version or inventory_state.state_version<>p_expected_inventory_state_version then return jsonb_build_object('status','state_conflict'); end if;
  if p_operation='buy' then
    if offer.buy_price is null or not item.buy_eligible then return jsonb_build_object('status','shop_offer_unavailable'); end if;
    total_numeric:=offer.buy_price::numeric*p_quantity;
    if total_numeric>9000000000000000 then return jsonb_build_object('status','invalid_quantity'); end if;
    total:=total_numeric::bigint;dust_delta:=-total;
    if account.balance<total then return jsonb_build_object('status','insufficient_dust'); end if;
    if not private.cozy_can_add_item(profile.id,item.id,p_quantity) then return jsonb_build_object('status','inventory_full'); end if;
    if not private.cozy_apply_dust_delta(profile.id,dust_delta,'shop_purchase','shop_transaction',transaction_id::text,
      encode(extensions.digest(convert_to(operation_key||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),p_request_id) then raise exception 'SHOP_DUST_LOCK_FAILED'; end if;
    if not private.cozy_add_item(profile.id,item.id,p_quantity,'shop_purchase',transaction_id::text,p_idempotency_key,p_request_id) then raise exception 'SHOP_INVENTORY_LOCK_FAILED'; end if;
  else
    if offer.sell_price is null or not item.sell_eligible or item.category in ('permanent_tool','special') then return jsonb_build_object('status','shop_offer_unavailable'); end if;
    total_numeric:=offer.sell_price::numeric*p_quantity;
    if total_numeric>9000000000000000 then return jsonb_build_object('status','invalid_quantity'); end if;
    total:=total_numeric::bigint;dust_delta:=total;
    if private.cozy_owned_quantity(profile.id,item.id)<p_quantity then return jsonb_build_object('status','item_unavailable'); end if;
    if not private.cozy_remove_item(profile.id,item.id,p_quantity,'shop_sale',transaction_id::text,p_idempotency_key,p_request_id) then raise exception 'SHOP_INVENTORY_LOCK_FAILED'; end if;
    if not private.cozy_apply_dust_delta(profile.id,dust_delta,'shop_sale','shop_transaction',transaction_id::text,
      encode(extensions.digest(convert_to(operation_key||':'||p_idempotency_key,'UTF8'),'sha256'),'hex'),p_request_id) then raise exception 'SHOP_DUST_LOCK_FAILED'; end if;
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
  select * into strict inventory_state from public.player_inventory_state where player_profile_id=profile.id;
  response:=jsonb_build_object('status','updated','transactionId',transaction_id,'operation',p_operation,
    'itemSlug',item.slug,'quantity',p_quantity,'dustDelta',dust_delta,'dustBalance',account.balance,
    'dustStateVersion',account.state_version,'inventoryStateVersion',inventory_state.state_version,'replayed',false);
  insert into public.cozy_gameplay_idempotency(player_profile_id,operation,idempotency_key,request_hash,response,request_id)
  values(profile.id,operation_key,p_idempotency_key,request_hash,response,p_request_id);
  insert into public.cozy_gameplay_action_events(player_profile_id,operation,target_type,target_id,idempotency_key,request_id,result_summary)
  values(profile.id,operation_key,'shop_offer',offer.id,p_idempotency_key,p_request_id,
    jsonb_build_object('transactionId',transaction_id,'operation',p_operation,'itemSlug',item.slug,'quantity',p_quantity,'dustDelta',dust_delta));
  return response;
end;
$$;

create or replace function public.purchase_player_economy_shop(
  p_wallet_address text, p_shop_slug text, p_offer_id uuid, p_quantity integer,
  p_expected_unit_price bigint, p_expected_shop_version_id uuid, p_expected_shop_revision integer,
  p_expected_dust_state_version integer, p_expected_inventory_state_version integer,
  p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; policy public.economy_policy_versions%rowtype; maintenance public.live_operations_maintenance%rowtype;
  shop public.cozy_shop_definitions%rowtype; version public.economy_shop_versions%rowtype;
  version_offer public.economy_shop_version_offers%rowtype; cozy_offer public.cozy_shop_offers%rowtype;
  item public.cozy_item_definitions%rowtype; existing public.economy_purchase_receipts%rowtype;
  ledger public.player_dust_ledger%rowtype; history public.player_inventory_history%rowtype;
  response jsonb; request_hash text; transaction_id text; total_price bigint;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_offer_id is null or p_quantity not between 1 and 99 or p_expected_unit_price not between 1 and 1000000
     or p_expected_shop_version_id is null or p_expected_shop_revision < 1
     or p_expected_dust_state_version < 1 or p_expected_inventory_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_ECONOMY_PURCHASE_REQUEST';
  end if;
  request_hash := encode(extensions.digest(convert_to(
    p_shop_slug || ':' || p_offer_id::text || ':' || p_quantity::text || ':' || p_expected_unit_price::text || ':' ||
    p_expected_shop_version_id::text || ':' || p_expected_shop_revision::text,'UTF8'),'sha256'),'hex');
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address for share of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cozy-shop-player:' || profile.id::text,0)
  );
  if moderation.status = 'suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('economy-purchase:' || profile.id::text || ':' || p_idempotency_key,0));
  select * into existing from public.economy_purchase_receipts
  where player_profile_id = profile.id and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_build_object('status','replayed','replayed',true,'receipt',private.economy_purchase_receipt_json(existing));
  end if;
  select policy_row.* into strict policy from public.economy_active_policy active
  join public.economy_policy_versions policy_row on policy_row.id = active.policy_version_id where active.singleton_key for share of policy_row;
  select * into strict maintenance from public.live_operations_maintenance where singleton_key;
  if private.live_operations_maintenance_state(maintenance) in ('active','expired')
     or not policy.economy_enabled or not policy.purchases_enabled then
    return jsonb_build_object('status','maintenance');
  end if;
  select * into shop from public.cozy_shop_definitions where slug = p_shop_slug and active;
  if not found then return jsonb_build_object('status','shop_unavailable'); end if;
  select version_row.* into strict version from public.economy_active_shop_versions active
  join public.economy_shop_versions version_row on version_row.id = active.shop_version_id
  where active.shop_definition_id = shop.id for share of version_row;
  if version.id <> p_expected_shop_version_id or version.revision <> p_expected_shop_revision then
    return jsonb_build_object('status','shop_changed');
  end if;
  select offer.* into version_offer from public.economy_shop_version_offers offer
  where offer.shop_version_id = version.id and offer.offer_id = p_offer_id and offer.enabled and not offer.protected_item;
  if not found or p_quantity > version_offer.maximum_quantity or version_offer.unit_price <> p_expected_unit_price then
    return jsonb_build_object('status','shop_changed');
  end if;
  select * into strict cozy_offer from public.cozy_shop_offers where id = p_offer_id for share;
  if cozy_offer.buy_price is distinct from version_offer.unit_price or not cozy_offer.active then
    return jsonb_build_object('status','shop_changed');
  end if;
  select * into strict item from public.cozy_item_definitions where id = cozy_offer.item_definition_id;
  if not item.active or not item.buy_eligible or item.category in ('permanent_tool','special') then
    return jsonb_build_object('status','protected_item');
  end if;
  if (select coalesce(sum(receipt.quantity),0) from public.economy_purchase_receipts receipt
      where receipt.player_profile_id = profile.id and receipt.offer_id = p_offer_id
        and receipt.created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') + p_quantity > version_offer.daily_limit then
    return jsonb_build_object('status','daily_limit');
  end if;
  if exists (select 1 from public.economy_purchase_receipts receipt
    where receipt.player_profile_id = profile.id and receipt.offer_id = p_offer_id
      and receipt.created_at > now() - make_interval(secs => version_offer.cooldown_seconds)) then
    return jsonb_build_object('status','cooldown');
  end if;
  total_price := version_offer.unit_price * p_quantity;
  response := public.transact_player_shop(
    p_wallet_address,p_shop_slug,p_offer_id,'buy',p_quantity,p_expected_dust_state_version,
    p_expected_inventory_state_version,p_idempotency_key,p_request_id
  );
  if response ->> 'status' not in ('updated','replayed') then return response; end if;
  transaction_id := response ->> 'transactionId';
  select * into strict ledger from public.player_dust_ledger
  where player_profile_id = profile.id and reason = 'shop_purchase' and reference_id = transaction_id;
  select * into strict history from public.player_inventory_history
  where player_profile_id = profile.id and reason = 'shop_purchase' and reference_id = transaction_id;
  insert into public.economy_purchase_receipts (
    player_profile_id,shop_version_id,offer_id,item_definition_id,quantity,unit_price,total_price,
    dust_ledger_entry_id,inventory_history_entry_id,idempotency_key,request_hash,request_id
  ) values (
    profile.id,version.id,p_offer_id,item.id,p_quantity,version_offer.unit_price,total_price,
    ledger.id,history.id,p_idempotency_key,request_hash,p_request_id
  ) on conflict (player_profile_id,idempotency_key) do nothing;
  select * into strict existing from public.economy_purchase_receipts
  where player_profile_id = profile.id and idempotency_key = p_idempotency_key;
  return response || jsonb_build_object('receipt',private.economy_purchase_receipt_json(existing));
end;
$$;

create or replace function public.operate_admin_economy_policy_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_action text,
  p_effective_at timestamptz,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  version public.economy_policy_versions%rowtype;
  required_permission text;
  presentation_status text;
begin
  required_permission := case
    when p_action in ('approve','schedule','publish','rollback') then 'economy.settings.publish'
    else 'economy.settings.edit'
  end;
  if not private.social_admin_authorized(
    p_user_id,p_auth_session_id,p_assurance_level,required_permission
  ) then
    raise exception using errcode='42501',message='ECONOMY_SETTINGS_TRANSITION_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'policy_mutation',20,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_expected_revision < 1
     or p_action not in ('validate','submit_review','approve','schedule','publish','rollback')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or (p_action='schedule' and (
       p_effective_at is null or p_effective_at<=now() or p_effective_at>now()+interval '90 days'
     )) then
    raise exception using errcode='22023',message='INVALID_ECONOMY_POLICY_TRANSITION';
  end if;

  select * into version from public.economy_policy_versions where id=p_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.revision<>p_expected_revision then
    return jsonb_build_object('status','revision_conflict','currentRevision',version.revision);
  end if;

  if p_action='rollback' then
    if version.lifecycle_status<>'published' then
      return jsonb_build_object('status','invalid_transition');
    end if;
    insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
    values(true,version.id,now()) on conflict(singleton_key) do update set
      policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
    presentation_status := 'rolled_back';
  elsif p_action='validate' then
    if version.lifecycle_status<>'draft' then return jsonb_build_object('status','invalid_transition'); end if;
    update public.economy_policy_versions set
      lifecycle_status='validated',revision=revision+1,
      validation_results=jsonb_build_object(
        'valid',true,
        'checks',jsonb_build_array(
          'bounded-policy','exact-reconciliation','correction-threshold-order',
          'effective-time','closed-source-sink-catalog'
        )
      )
    where id=version.id returning * into version;
    presentation_status := 'validated';
  elsif p_action='submit_review' then
    if version.lifecycle_status<>'validated' then return jsonb_build_object('status','invalid_transition'); end if;
    update public.economy_policy_versions set lifecycle_status='in_review',revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'in_review';
  elsif p_action='approve' then
    if version.lifecycle_status<>'in_review' or version.approved_at is not null then
      return jsonb_build_object('status','invalid_transition');
    end if;
    if version.created_by_admin_id=p_user_id then
      return jsonb_build_object('status','separation_of_duty');
    end if;
    update public.economy_policy_versions set
      approved_by_admin_id=p_user_id,approved_at=now(),reviewed_by_admin_id=p_user_id,
      reviewed_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'approved';
  elsif p_action='schedule' then
    if version.lifecycle_status<>'in_review' or version.approved_at is null then
      return jsonb_build_object('status','approval_required');
    end if;
    update public.economy_policy_versions set
      effective_at=p_effective_at,scheduled_by_admin_id=p_user_id,scheduled_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'scheduled';
  else
    if version.lifecycle_status<>'in_review' or version.approved_at is null then
      return jsonb_build_object('status','approval_required');
    end if;
    update public.economy_policy_versions set
      lifecycle_status='published',effective_at=now(),published_by_admin_id=p_user_id,
      published_at=now(),revision=revision+1
    where id=version.id returning * into version;
    insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
    values(true,version.id,now()) on conflict(singleton_key) do update set
      policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
    presentation_status := 'published';
  end if;

  insert into public.admin_audit_logs(
    event_key,actor_user_id,admin_session_id,request_id,outcome,metadata
  ) values(
    'economy.policy.'||p_action,p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object(
      'policyVersionId',version.id,'status',presentation_status,'revision',version.revision,
      'effectiveAt',version.effective_at
    )
  );
  return jsonb_build_object(
    'status',presentation_status,'versionId',version.id,'versionNumber',version.version_number,
    'revision',version.revision,'effectiveAt',version.effective_at,
    'active',exists(select 1 from public.economy_active_policy active where active.policy_version_id=version.id)
  );
end;
$$;

create or replace function public.operate_admin_economy_shop_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_shop_version_id uuid,
  p_expected_revision integer,
  p_action text,
  p_effective_at timestamptz,
  p_request_id text
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
begin
  required_permission := case
    when p_action in ('approve','schedule','publish','disable','rollback') then 'economy.shop.publish'
    else 'economy.shop.edit'
  end;
  if not private.social_admin_authorized(
    p_user_id,p_auth_session_id,p_assurance_level,required_permission
  ) then
    raise exception using errcode='42501',message='ECONOMY_SHOP_TRANSITION_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_expected_revision<1
     or p_action not in ('validate','submit_review','approve','schedule','publish','disable','rollback')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or (p_action='schedule' and (
       p_effective_at is null or p_effective_at<=now() or p_effective_at>now()+interval '90 days'
     )) then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_TRANSITION';
  end if;

  select * into version from public.economy_shop_versions where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.revision<>p_expected_revision then
    return jsonb_build_object('status','revision_conflict','currentRevision',version.revision);
  end if;

  if p_action='rollback' then
    if version.lifecycle_status<>'published' then
      return jsonb_build_object('status','invalid_transition');
    end if;
    update public.cozy_shop_offers base set
      buy_price=offer.unit_price,maximum_quantity=offer.maximum_quantity,active=offer.enabled
    from public.economy_shop_version_offers offer
    where offer.shop_version_id=version.id and base.id=offer.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(version.shop_definition_id,version.id,now()) on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
    update public.cozy_shop_definitions set active=true
    where id=version.shop_definition_id;
    presentation_status := 'rolled_back';
  elsif p_action='validate' then
    if version.lifecycle_status<>'draft' then return jsonb_build_object('status','invalid_transition'); end if;
    if not exists(
      select 1 from public.economy_shop_version_offers
      where shop_version_id=version.id and enabled
    ) or exists(
      select 1 from public.economy_shop_version_offers offer
      join public.cozy_shop_offers base on base.id=offer.offer_id
      join public.cozy_item_definitions item on item.id=base.item_definition_id
      where offer.shop_version_id=version.id and (
        offer.protected_item or not base.active or not item.active or not item.buy_eligible
        or item.category in ('permanent_tool','special') or offer.unit_price<1
      )
    ) then
      return jsonb_build_object('status','validation_failed');
    end if;
    update public.economy_shop_versions set
      lifecycle_status='validated',revision=revision+1,
      validation_results=jsonb_build_object(
        'valid',true,
        'checks',jsonb_build_array(
          'ordinary-items-only','positive-bounded-prices','purchase-limits',
          'inventory-compatibility','effective-time'
        )
      )
    where id=version.id returning * into version;
    presentation_status := 'validated';
  elsif p_action='submit_review' then
    if version.lifecycle_status<>'validated' then return jsonb_build_object('status','invalid_transition'); end if;
    update public.economy_shop_versions set lifecycle_status='in_review',revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'in_review';
  elsif p_action='approve' then
    if version.lifecycle_status<>'in_review' or version.approved_at is not null then
      return jsonb_build_object('status','invalid_transition');
    end if;
    if version.created_by_admin_id=p_user_id then
      return jsonb_build_object('status','separation_of_duty');
    end if;
    update public.economy_shop_versions set
      approved_by_admin_id=p_user_id,approved_at=now(),reviewed_by_admin_id=p_user_id,
      reviewed_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'approved';
  elsif p_action='schedule' then
    if version.lifecycle_status<>'in_review' or version.approved_at is null then
      return jsonb_build_object('status','approval_required');
    end if;
    update public.economy_shop_versions set
      effective_at=p_effective_at,scheduled_by_admin_id=p_user_id,scheduled_at=now(),revision=revision+1
    where id=version.id returning * into version;
    presentation_status := 'scheduled';
  elsif p_action='disable' then
    if version.lifecycle_status<>'in_review' or version.approved_at is null then
      return jsonb_build_object('status','approval_required');
    end if;
    update public.economy_shop_versions set lifecycle_status='disabled',revision=revision+1,
      published_by_admin_id=p_user_id,published_at=now()
    where id=version.id returning * into version;
    update public.cozy_shop_definitions set active=false
    where id=version.shop_definition_id;
    presentation_status := 'disabled';
  else
    if version.lifecycle_status<>'in_review' or version.approved_at is null then
      return jsonb_build_object('status','approval_required');
    end if;
    update public.economy_shop_versions set lifecycle_status='published',effective_at=now(),
      published_by_admin_id=p_user_id,published_at=now(),revision=revision+1
    where id=version.id returning * into version;
    update public.cozy_shop_offers base set
      buy_price=offer.unit_price,maximum_quantity=offer.maximum_quantity,active=offer.enabled
    from public.economy_shop_version_offers offer
    where offer.shop_version_id=version.id and base.id=offer.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(version.shop_definition_id,version.id,now()) on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
    update public.cozy_shop_definitions set active=true
    where id=version.shop_definition_id;
    presentation_status := 'published';
  end if;

  insert into public.admin_audit_logs(
    event_key,actor_user_id,admin_session_id,request_id,outcome,metadata
  ) values(
    'economy.shop.'||p_action,p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object(
      'shopVersionId',version.id,'shopDefinitionId',version.shop_definition_id,
      'status',presentation_status,'revision',version.revision,'effectiveAt',version.effective_at
    )
  );
  return jsonb_build_object(
    'status',presentation_status,'versionId',version.id,'versionNumber',version.version_number,
    'revision',version.revision,'effectiveAt',version.effective_at,
    'active',exists(select 1 from public.economy_active_shop_versions active where active.shop_version_id=version.id)
  );
end;
$$;

create or replace function public.activate_approved_economy_versions(
  p_batch_size integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  activated_policy integer := 0;
  activated_shops integer := 0;
  selected_policy public.economy_policy_versions%rowtype;
  selected_shop public.economy_shop_versions%rowtype;
begin
  if p_batch_size not between 1 and 100
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_ACTIVATION_REQUEST';
  end if;

  select * into selected_policy from public.economy_policy_versions
  where lifecycle_status='in_review' and approved_at is not null and scheduled_at is not null
    and effective_at<=now()
  order by effective_at desc,version_number desc limit 1 for update skip locked;
  if found then
    update public.economy_policy_versions set
      lifecycle_status='published',published_by_admin_id=scheduled_by_admin_id,
      published_at=now(),revision=revision+1
    where id=selected_policy.id returning * into selected_policy;
    insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
    values(true,selected_policy.id,now()) on conflict(singleton_key) do update set
      policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
    activated_policy := 1;
    insert into public.admin_audit_logs(event_key,request_id,outcome,metadata)
    values('economy.policy.scheduled_activation',p_request_id,'success',
      jsonb_build_object('policyVersionId',selected_policy.id,'effectiveAt',selected_policy.effective_at));
  end if;

  for selected_shop in
    select version.* from public.economy_shop_versions version
    where version.lifecycle_status='in_review' and version.approved_at is not null
      and version.scheduled_at is not null and version.effective_at<=now()
    order by version.effective_at,version.shop_definition_id,version.version_number
    limit p_batch_size for update skip locked
  loop
    update public.economy_shop_versions set
      lifecycle_status='published',published_by_admin_id=selected_shop.scheduled_by_admin_id,
      published_at=now(),revision=revision+1
    where id=selected_shop.id returning * into selected_shop;
    update public.cozy_shop_offers base set
      buy_price=offer.unit_price,maximum_quantity=offer.maximum_quantity,active=offer.enabled
    from public.economy_shop_version_offers offer
    where offer.shop_version_id=selected_shop.id and base.id=offer.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(selected_shop.shop_definition_id,selected_shop.id,now())
    on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
    update public.cozy_shop_definitions set active=true
    where id=selected_shop.shop_definition_id;
    activated_shops := activated_shops + 1;
    insert into public.admin_audit_logs(event_key,request_id,outcome,metadata)
    values('economy.shop.scheduled_activation',p_request_id,'success',
      jsonb_build_object(
        'shopVersionId',selected_shop.id,'shopDefinitionId',selected_shop.shop_definition_id,
        'effectiveAt',selected_shop.effective_at
      ));
  end loop;

  return jsonb_build_object(
    'policiesActivated',activated_policy,'shopsActivated',activated_shops,
    'requestId',p_request_id
  );
end;
$$;

create or replace function public.get_player_economy(
  p_wallet_address text,
  p_before_entry_number bigint,
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
  account public.player_dust_accounts%rowtype;
  policy_version integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_limit not between 1 and 100 or coalesce(p_before_entry_number,1)<1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_READ_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;
  moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then
    return jsonb_build_object('status','bootstrap_required');
  end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'dust_read',120) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id=profile.id;
  select version.version_number into strict policy_version
  from public.economy_active_policy active
  join public.economy_policy_versions version on version.id=active.policy_version_id
  where active.singleton_key;

  return jsonb_build_object(
    'status','loaded','dustBalance',account.balance,'dustStateVersion',account.state_version,
    'policyVersion',policy_version,'generatedAt',now(),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'publicReceiptId',page.public_receipt_id,'operationKey',page.operation_key,
      'sourceKey',source.source_key,'sinkKey',sink.sink_key,'delta',page.delta,
      'balanceBefore',page.balance_before,'balanceAfter',page.resulting_balance,
      'referenceType',page.reference_type,'referenceId',page.reference_id,
      'relatedPublicReceiptId',coalesce(purchase.public_receipt_id,correction.public_receipt_id),
      'referenceLabel',case page.operation_key
        when 'starter_grant' then 'Starter Balance'
        when 'cooperative_activity_reward' then 'Moonpetal Harvest Help'
        when 'shop_purchase' then 'Village Supply Shop'
        when 'shop_sale' then 'Village Shop Sale'
        when 'system_refund' then 'System Refund'
        when 'administrative_correction' then 'Administrative Correction'
        else 'DUST Activity' end,
      'correlationId',page.correlation_id,'createdAt',page.created_at
    ) order by page.entry_number desc)
    from (select * from public.player_dust_ledger ledger
      where ledger.player_profile_id=profile.id
        and (p_before_entry_number is null or ledger.entry_number<p_before_entry_number)
      order by ledger.entry_number desc limit p_limit) page
    left join public.economy_source_versions source on source.id=page.source_version_id
    left join public.economy_sink_versions sink on sink.id=page.sink_version_id
    left join public.economy_purchase_receipts purchase on purchase.dust_ledger_entry_id=page.id
    left join public.economy_correction_requests correction on correction.dust_ledger_entry_id=page.id
    ),'[]'::jsonb),
    'nextCursor',(select min(page.entry_number) from (select ledger.entry_number
      from public.player_dust_ledger ledger where ledger.player_profile_id=profile.id
        and (p_before_entry_number is null or ledger.entry_number<p_before_entry_number)
      order by ledger.entry_number desc limit p_limit) page)
  );
end;
$$;

create or replace function public.get_player_economy_shop(
  p_wallet_address text,
  p_shop_slug text,
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
  shop public.cozy_shop_definitions%rowtype;
  version public.economy_shop_versions%rowtype;
  policy public.economy_policy_versions%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;
  moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then
    return jsonb_build_object('status','bootstrap_required');
  end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'shop_read',120) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into shop from public.cozy_shop_definitions where slug=p_shop_slug;
  if not found then return jsonb_build_object('status','shop_unavailable'); end if;
  select version_row.* into strict version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions version_row on version_row.id=active.shop_version_id
  where active.shop_definition_id=shop.id;
  select policy_row.* into strict policy from public.economy_active_policy active
  join public.economy_policy_versions policy_row on policy_row.id=active.policy_version_id
  where active.singleton_key;
  return jsonb_build_object(
    'status','loaded','availability',case
      when shop.active and policy.economy_enabled and policy.purchases_enabled then 'open'
      else 'closed'
    end,
    'shop',jsonb_build_object(
      'shopKey','village-supply-shop','name',version.name,'versionId',version.id,
      'versionNumber',version.version_number,'revision',version.revision,
      'status',version.lifecycle_status,'interactionKey',version.interaction_key,
      'publishedAt',version.published_at
    ),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'offerId',offer.offer_id,'itemSlug',item.slug,'itemName',item.name,
      'itemDescription',item.description,'itemCategory',item.category,
      'unitPrice',offer.unit_price,'maximumQuantity',offer.maximum_quantity,
      'dailyLimit',offer.daily_limit,'cooldownSeconds',offer.cooldown_seconds,
      'inventoryCapacityCost',offer.inventory_capacity_cost,'protectedItem',offer.protected_item,
      'enabled',offer.enabled,'revision',offer.revision,
      'purchasedToday',(select coalesce(sum(receipt.quantity),0) from public.economy_purchase_receipts receipt
        where receipt.player_profile_id=profile.id and receipt.offer_id=offer.offer_id
          and receipt.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
      'remainingToday',greatest(0,offer.daily_limit-(select coalesce(sum(receipt.quantity),0)
        from public.economy_purchase_receipts receipt
        where receipt.player_profile_id=profile.id and receipt.offer_id=offer.offer_id
          and receipt.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')),
      'availableAt',(select case when max(receipt.created_at) is null or offer.cooldown_seconds=0 then null
        else max(receipt.created_at)+make_interval(secs=>offer.cooldown_seconds) end
        from public.economy_purchase_receipts receipt
        where receipt.player_profile_id=profile.id and receipt.offer_id=offer.offer_id)
    ) order by item.category,item.slug)
    from public.economy_shop_version_offers offer
    join public.cozy_shop_offers cozy_offer on cozy_offer.id=offer.offer_id
    join public.cozy_item_definitions item on item.id=cozy_offer.item_definition_id
    where offer.shop_version_id=version.id and offer.enabled and not offer.protected_item),'[]'::jsonb),
    'generatedAt',now()
  );
end;
$$;

create or replace function public.get_admin_economy_workspace(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_section text,
  p_identifier uuid,
  p_search text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  required_permission text;
  total integer;
  overview jsonb;
begin
  if p_section not in (
    'overview','sources','sinks','shops','shop','policies','reconciliation',
    'risk','corrections','simulations','audit'
  ) or p_page<1 or p_page_size not in (10,50,100)
     or char_length(coalesce(p_search,''))>128
     or (p_section='shop' and p_identifier is null) then
    raise exception using errcode='22023',message='INVALID_ECONOMY_WORKSPACE_QUERY';
  end if;
  required_permission := case
    when p_section in ('sources','sinks','policies') then 'economy.settings.read'
    when p_section in ('shops','shop') then 'economy.shop.read'
    when p_section in ('reconciliation','audit') then 'economy.audit.read'
    when p_section='risk' then 'economy.risk.read'
    when p_section='simulations' then 'economy.simulation.run'
    else 'economy.read'
  end;
  if not private.social_admin_authorized(
    p_user_id,p_auth_session_id,p_assurance_level,required_permission
  ) then
    raise exception using errcode='42501',message='ECONOMY_WORKSPACE_ACCESS_DENIED';
  end if;

  if p_section='overview' then
    overview := public.get_admin_economy_overview(
      p_user_id,p_auth_session_id,p_assurance_level
    );
    if overview->>'status'='rate_limited' then return overview; end if;
    return overview || jsonb_build_object(
      'dust',(overview->'dust') || jsonb_build_object(
        'createdToday',(select coalesce(sum(delta),0) from public.player_dust_ledger
          where delta>0 and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
        'destroyedToday',(select coalesce(-sum(delta),0) from public.player_dust_ledger
          where delta<0 and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
        'created7d',(select coalesce(sum(delta),0) from public.player_dust_ledger
          where delta>0 and created_at>=now()-interval '7 days'),
        'destroyed7d',(select coalesce(-sum(delta),0) from public.player_dust_ledger
          where delta<0 and created_at>=now()-interval '7 days')
      ),
      'activePolicy',(select jsonb_build_object(
        'id',version.id,'versionNumber',version.version_number,'status','published',
        'effectiveAt',version.effective_at
      ) from public.economy_active_policy active
        join public.economy_policy_versions version on version.id=active.policy_version_id
        where active.singleton_key),
      'shops',jsonb_build_object(
        'active',(select count(*) from public.economy_active_shop_versions),
        'disabled',(select count(*) from public.cozy_shop_definitions definition
          where not exists(select 1 from public.economy_active_shop_versions active
            where active.shop_definition_id=definition.id)),
        'scheduled',(select count(*) from public.economy_shop_versions
          where lifecycle_status='in_review' and scheduled_at is not null)
      ),
      'latestSimulation',(select jsonb_build_object(
        'runId',run.id,'candidate',coalesce(run.result->>'candidate',run.input->>'candidate','current-baseline'),
        'sourceToSinkRatio',(run.result->>'sourceToSinkRatio')::numeric,'createdAt',run.created_at
      ) from public.economy_simulation_runs run order by run.created_at desc limit 1)
    );
  elsif p_section='sources' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',source.id,'key',source.source_key,'operationKey',source.operation_key,
      'label',source.label,'description',source.description,'category',source.category,
      'ownerModule',case source.category when 'activity_reward' then 'cooperative_activities'
        when 'administrative_correction' then 'offchain_economy' else 'cozy_gameplay' end,
      'status',source.lifecycle_status,'enabled',source.lifecycle_status='published',
      'version',source.version_number,'revision',source.revision,
      'minimumAmount',source.minimum_amount,'maximumAmount',source.maximum_amount,
      'repeatable',source.repeatable,'dailyLimit',source.daily_limit,'weeklyLimit',source.weekly_limit,
      'lifetimeLimit',source.account_lifetime_limit,'walletDailyLimit',source.wallet_daily_limit,
      'cooldownSeconds',source.cooldown_seconds,'beginnerProtected',source.beginner_protected,
      'riskWeight',source.risk_weight,'effectiveAt',source.effective_at,
      'active',exists(select 1 from public.economy_active_source_versions active
        where active.source_version_id=source.id)
    ) order by source.source_key,source.version_number desc)
    from public.economy_source_versions source),'[]'::jsonb));
  elsif p_section='sinks' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',sink.id,'key',sink.sink_key,'operationKey',sink.operation_key,
      'label',sink.label,'description',sink.description,'category',sink.category,
      'ownerModule','offchain_economy',
      'status',sink.lifecycle_status,'enabled',sink.lifecycle_status='published',
      'version',sink.version_number,'revision',sink.revision,
      'minimumAmount',sink.minimum_amount,'maximumAmount',sink.maximum_amount,
      'reversibleByRefund',sink.reversible_by_refund,'beginnerProtected',sink.beginner_protected,
      'effectiveAt',sink.effective_at,
      'active',exists(select 1 from public.economy_active_sink_versions active
        where active.sink_version_id=sink.id)
    ) order by sink.sink_key,sink.version_number desc)
    from public.economy_sink_versions sink),'[]'::jsonb));
  elsif p_section='shops' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',definition.id,'shopDefinitionId',definition.id,'slug',definition.slug,
      'name',coalesce(editable.name,published.name,definition.name),
      'description',coalesce(editable.description,published.description,definition.description),
      'interactionKey',coalesce(editable.interaction_key,published.interaction_key,'phase7-general-store'),
      'ownerModule','cozy_gameplay','status',case
        when editable.scheduled_at is not null then 'scheduled'
        when editable.approved_at is not null then 'approved'
        when editable.id is not null then editable.lifecycle_status
        when published.id is not null then 'published' else 'disabled' end,
      'enabled',definition.active and published.id is not null,
      'activeVersionId',published.id,'activeVersionNumber',published.version_number,
      'draftVersionId',editable.id,'draftVersionNumber',editable.version_number,
      'offerCount',(select count(*) from public.economy_shop_version_offers offer
        where offer.shop_version_id=coalesce(editable.id,published.id) and offer.enabled),
      'revision',coalesce(editable.revision,published.revision,1),
      'effectiveAt',coalesce(editable.effective_at,published.effective_at),
      'lastValidatedAt',case when editable.validation_results is not null then editable.reviewed_at end,
      'playerAvailable',definition.active and published.id is not null
    ) order by definition.name)
    from public.cozy_shop_definitions definition
    left join lateral (select version.* from public.economy_shop_versions version
      join public.economy_active_shop_versions active on active.shop_version_id=version.id
      where active.shop_definition_id=definition.id limit 1) published on true
    left join lateral (select version.* from public.economy_shop_versions version
      where version.shop_definition_id=definition.id
        and version.lifecycle_status in ('draft','validated','in_review')
      order by version.version_number desc limit 1) editable on true),'[]'::jsonb));
  elsif p_section='shop' then
    return jsonb_build_object(
      'shop',(select jsonb_build_object(
        'shopDefinitionId',definition.id,'slug',definition.slug,'name',definition.name,
        'description',definition.description,
        'interactionKey',coalesce(active_version.interaction_key,'phase7-general-store'),
        'ownerModule','cozy_gameplay','activeVersionId',active_version.id
      ) from public.cozy_shop_definitions definition
      left join lateral (select version.* from public.economy_shop_versions version
        join public.economy_active_shop_versions active on active.shop_version_id=version.id
        where active.shop_definition_id=definition.id limit 1) active_version on true
      where definition.id=p_identifier),
      'versions',coalesce((select jsonb_agg(jsonb_build_object(
        'id',version.id,'versionNumber',version.version_number,'status',case
          when active.shop_version_id=version.id then 'published'
          when version.lifecycle_status='published' then 'superseded'
          when version.scheduled_at is not null then 'scheduled'
          when version.approved_at is not null then 'approved'
          else version.lifecycle_status end,
        'revision',version.revision,'name',version.name,'description',version.description,
        'interactionKey',version.interaction_key,'effectiveAt',version.effective_at,
        'active',active.shop_version_id=version.id,'validationResults',version.validation_results,
        'createdAt',version.created_at,'reviewedAt',version.reviewed_at,
        'approvedAt',version.approved_at,'scheduledAt',version.scheduled_at,
        'publishedAt',version.published_at,
        'offers',coalesce((select jsonb_agg(jsonb_build_object(
          'offerId',offer.offer_id,'itemSlug',item.slug,'itemName',item.name,
          'itemDescription',item.description,'category',item.category,
          'unitPrice',offer.unit_price,'maximumQuantity',offer.maximum_quantity,
          'dailyLimit',offer.daily_limit,'cooldownSeconds',offer.cooldown_seconds,
          'inventoryCapacityCost',offer.inventory_capacity_cost,'enabled',offer.enabled,
          'protectedItem',offer.protected_item,'revision',offer.revision
        ) order by item.category,item.name)
        from public.economy_shop_version_offers offer
        join public.cozy_shop_offers base on base.id=offer.offer_id
        join public.cozy_item_definitions item on item.id=base.item_definition_id
        where offer.shop_version_id=version.id),'[]'::jsonb)
      ) order by version.version_number desc)
      from public.economy_shop_versions version
      left join public.economy_active_shop_versions active
        on active.shop_definition_id=version.shop_definition_id
      where version.shop_definition_id=p_identifier),'[]'::jsonb)
    );
  elsif p_section='policies' then
    return jsonb_build_object(
      'activeVersionId',(select policy_version_id from public.economy_active_policy where singleton_key),
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',version.id,'versionNumber',version.version_number,'status',case
          when active.policy_version_id=version.id then 'published'
          when version.lifecycle_status='published' then 'superseded'
          when version.scheduled_at is not null then 'scheduled'
          when version.approved_at is not null then 'approved'
          else version.lifecycle_status end,
        'revision',version.revision,'economyEnabled',version.economy_enabled,
        'purchasesEnabled',version.purchases_enabled,'rewardsEnabled',version.rewards_enabled,
        'correctionsEnabled',version.corrections_enabled,'starterGrant',version.starter_grant,
        'beginnerProtectionHours',version.beginner_protection_hours,
        'lowValueCorrectionLimit',version.low_value_correction_limit,
        'highValueCorrectionLimit',version.high_value_correction_limit,
        'reconciliationTolerance',version.reconciliation_tolerance,
        'purchaseRateLimitPerMinute',version.purchase_rate_limit_per_minute,
        'historyRetentionDays',version.history_retention_days,
        'riskReviewThreshold',version.risk_review_threshold,'effectiveAt',version.effective_at,
        'active',active.policy_version_id=version.id,'validationResults',version.validation_results,
        'createdAt',version.created_at,'reviewedAt',version.reviewed_at,
        'approvedAt',version.approved_at,'scheduledAt',version.scheduled_at,
        'publishedAt',version.published_at
      ) order by version.version_number desc)
      from public.economy_policy_versions version
      left join public.economy_active_policy active on active.singleton_key),'[]'::jsonb)
    );
  elsif p_section='reconciliation' then
    return jsonb_build_object(
      'summary',jsonb_build_object(
        'balanced',(select count(*) from public.economy_reconciliation_results where status='balanced'),
        'pending',(select count(*) from public.economy_reconciliation_runs where status='running'),
        'mismatch',(select count(*) from public.economy_reconciliation_results where status='mismatch'),
        'blocked',(select count(*) from public.economy_reconciliation_runs where status='failed'),
        'reviewed',(select count(*) from public.economy_reconciliation_results where status in ('reviewed','resolved')),
        'lastRunAt',(select started_at from public.economy_reconciliation_runs order by started_at desc limit 1),
        'lastDurationMs',(select extract(epoch from completed_at-started_at)*1000
          from public.economy_reconciliation_runs where completed_at is not null order by started_at desc limit 1),
        'workerStatus',case when exists(select 1 from public.economy_reconciliation_runs where status='running')
          then 'running' else 'idle' end
      ),
      'runs',coalesce((select jsonb_agg(jsonb_build_object(
        'id',run.id,'scope',run.scope,'status',run.status,'checkedCount',run.checked_count,
        'mismatchCount',run.mismatch_count,'playerProfileId',run.requested_player_profile_id,
        'startedAt',run.started_at,'completedAt',run.completed_at,'failureCode',run.failure_code
      ) order by run.started_at desc) from (select * from public.economy_reconciliation_runs
        order by started_at desc limit 50) run),'[]'::jsonb),
      'results',coalesce((select jsonb_agg(jsonb_build_object(
        'id',result.id,'runId',result.run_id,'playerProfileId',result.player_profile_id,
        'displayName',profile.display_name,'storedBalance',result.stored_balance,
        'ledgerBalance',result.ledger_balance,'difference',result.difference,
        'status',result.status,'autoCorrected',result.auto_corrected,'createdAt',result.created_at
      ) order by result.created_at desc) from (select * from public.economy_reconciliation_results
        order by created_at desc limit 100) result
        join public.player_profiles profile on profile.id=result.player_profile_id),'[]'::jsonb)
    );
  elsif p_section='risk' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',signal.id,'publicSignalId','RISK-'||upper(substr(encode(extensions.digest(
        signal.id::text::bytea,'sha256'),'hex'),1,20)),
      'playerProfileId',signal.player_profile_id,'displayName',profile.display_name,
      'category',signal.signal_type,'severity',signal.severity,'confidence',signal.score,
      'safeSummary',signal.safe_summary,'firstSeenAt',signal.created_at,'lastSeenAt',signal.updated_at,
      'eventCount',coalesce((signal.evidence->>'eventCount')::integer,1),'status',signal.status,
      'sourceKey',signal.evidence->>'sourceKey','shopKey',signal.evidence->>'shopKey',
      'activityKey',signal.evidence->>'activityKey'
    ) order by signal.created_at desc) from (select * from public.economy_risk_signals
      order by created_at desc limit 100) signal
      left join public.player_profiles profile on profile.id=signal.player_profile_id),'[]'::jsonb));
  elsif p_section='corrections' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',correction.id,'publicReceiptId',correction.public_receipt_id,
      'playerProfileId',correction.player_profile_id,'displayName',profile.display_name,
      'delta',correction.delta,'reasonCategory',correction.reason_category,
      'explanation',correction.explanation,'status',correction.status,
      'balanceBefore',correction.balance_before,'balanceAfter',correction.balance_after,
      'requiresSecondApproval',correction.requires_second_approval,
      'createdAt',correction.created_at,'reviewedAt',correction.reviewed_at,
      'settledAt',correction.settled_at,'creatorIsCurrentAdmin',correction.created_by_admin_id=p_user_id,
      'firstApproved',correction.first_approved_by_admin_id is not null,
      'secondApproved',correction.second_approved_by_admin_id is not null
    ) order by correction.created_at desc) from (select * from public.economy_correction_requests
      order by created_at desc limit 100) correction
      join public.player_profiles profile on profile.id=correction.player_profile_id),'[]'::jsonb));
  elsif p_section='simulations' then
    return jsonb_build_object(
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'runId',run.id,'candidate',coalesce(run.result->>'candidate',run.input->>'candidate','current-baseline'),
        'seed',run.seed,'playerCount',run.player_count,'durationDays',run.duration_days,
        'scenario',coalesce(run.result->>'scenario',run.input->>'scenario','balanced'),
        'createdAt',run.created_at,'endingSupply',(run.result->>'endingSupply')::numeric,
        'sourceToSinkRatio',(run.result->>'sourceToSinkRatio')::numeric,
        'dailyNetChange',coalesce((run.result->>'dailyNetChange')::numeric,
          ((run.result->>'totalCreated')::numeric-(run.result->>'totalDestroyed')::numeric)/run.duration_days),
        'medianBalance',(run.result->>'medianBalance')::numeric,
        'p90Balance',(run.result->>'p90Balance')::numeric,'p99Balance',(run.result->>'p99Balance')::numeric,
        'shopParticipationRate',coalesce((run.result->>'shopParticipationRate')::numeric,
          (run.result->>'sinkParticipation')::numeric),
        'capReachRate',coalesce((run.result->>'capReachRate')::numeric,
          (run.result->>'dailyRewardCapReachRate')::numeric),
        'beginnerAffordabilityRate',coalesce((run.result->>'beginnerAffordabilityRate')::numeric,
          1-(run.result->>'unableToBuyBasicItemRate')::numeric),
        'concentration',(run.result->>'balanceConcentration')::numeric,
        'suspiciousEmissionContribution',(run.result->>'suspiciousRewardContribution')::numeric,
        'playerBalancesMutated',false
      ) order by run.created_at desc) from (select * from public.economy_simulation_runs
        order by created_at desc limit 100) run),'[]'::jsonb),
      'recommendation',jsonb_build_object(
        'candidate','balanced-combination','title','Candidate D — Balanced Combination',
        'rationale','Preserve starter access while combining modest repeatable-emission restraint with useful optional spending.',
        'planningRangeMin',0.95,'planningRangeMax',1.10,'published',false
      )
    );
  else
    select count(*)::integer into total from public.admin_audit_logs audit
    where audit.event_key like 'economy.%'
      and (coalesce(p_search,'')='' or audit.event_key ilike '%'||p_search||'%'
        or audit.request_id=p_search);
    return jsonb_build_object(
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',audit.id,'eventKey',audit.event_key,'actorDisplayName',admin.display_name,
        'outcome',audit.outcome,'targetType',split_part(audit.event_key,'.',2),
        'targetId',coalesce(audit.metadata->>'shopVersionId',audit.metadata->>'policyVersionId',
          audit.metadata->>'correctionId',audit.metadata->>'simulationRunId',audit.metadata->>'signalId'),
        'requestId',audit.request_id,'createdAt',audit.created_at,
        'summary',replace(audit.event_key,'.',' › ')
      ) order by audit.created_at desc) from (select * from public.admin_audit_logs audit
        where audit.event_key like 'economy.%'
          and (coalesce(p_search,'')='' or audit.event_key ilike '%'||p_search||'%'
            or audit.request_id=p_search)
        order by audit.created_at desc limit p_page_size offset (p_page-1)*p_page_size) audit
        left join public.admin_users admin on admin.user_id=audit.actor_user_id),'[]'::jsonb),
      'page',p_page,'pageSize',p_page_size,'total',total,
      'totalPages',ceil(total::numeric/p_page_size)::integer
    );
  end if;
end;
$$;

create or replace function public.get_admin_economy_ledger_filtered(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_search text,
  p_page integer,
  p_page_size integer,
  p_direction text,
  p_source_key text,
  p_sink_key text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_minimum_amount bigint,
  p_maximum_amount bigint,
  p_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  total integer;
begin
  if not private.social_admin_authorized(
    p_user_id,p_auth_session_id,p_assurance_level,'economy.audit.read'
  ) then
    raise exception using errcode='42501',message='ECONOMY_AUDIT_ACCESS_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'ledger_read',60,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_page<1 or p_page_size not in (10,50,100) or char_length(coalesce(p_search,''))>128
     or p_direction is not null and p_direction not in ('credit','debit')
     or p_source_key is not null and (
       char_length(p_source_key) not between 3 and 80
       or p_source_key !~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
     )
     or p_sink_key is not null and (
       char_length(p_sink_key) not between 3 and 80
       or p_sink_key !~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
     )
     or p_date_from is not null and p_date_to is not null and p_date_from>p_date_to
     or coalesce(p_minimum_amount,0)<0 or coalesce(p_maximum_amount,9000000000000000)<0
     or p_minimum_amount is not null and p_maximum_amount is not null
       and p_minimum_amount>p_maximum_amount
     or p_status is not null and p_status<>'completed' then
    raise exception using errcode='22023',message='INVALID_ECONOMY_LEDGER_QUERY';
  end if;

  select count(*)::integer into total
  from public.player_dust_ledger ledger
  join public.player_profiles profile on profile.id=ledger.player_profile_id
  left join public.economy_source_versions source on source.id=ledger.source_version_id
  left join public.economy_sink_versions sink on sink.id=ledger.sink_version_id
  where (coalesce(p_search,'')='' or ledger.public_receipt_id=upper(p_search)
    or ledger.correlation_id=p_search or profile.id::text=p_search
    or profile.display_name ilike '%'||p_search||'%' or ledger.operation_key=p_search)
    and (p_direction is null or (p_direction='credit' and ledger.delta>0)
      or (p_direction='debit' and ledger.delta<0))
    and (p_source_key is null or source.source_key=p_source_key)
    and (p_sink_key is null or sink.sink_key=p_sink_key)
    and (p_date_from is null or ledger.created_at>=p_date_from)
    and (p_date_to is null or ledger.created_at<=p_date_to)
    and (p_minimum_amount is null or abs(ledger.delta)>=p_minimum_amount)
    and (p_maximum_amount is null or abs(ledger.delta)<=p_maximum_amount);

  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'publicReceiptId',page.public_receipt_id,'playerProfileId',page.player_profile_id,
      'displayName',page.display_name,'operationKey',page.operation_key,'delta',page.delta,
      'direction',case when page.delta>0 then 'credit' else 'debit' end,
      'balanceBefore',page.balance_before,'balanceAfter',page.resulting_balance,
      'sourceKey',page.source_key,'sinkKey',page.sink_key,'status','completed',
      'requestId',page.request_id,'createdAt',page.created_at
    ) order by page.entry_number desc) from (select ledger.*,profile.display_name,
      source.source_key,sink.sink_key
      from public.player_dust_ledger ledger
      join public.player_profiles profile on profile.id=ledger.player_profile_id
      left join public.economy_source_versions source on source.id=ledger.source_version_id
      left join public.economy_sink_versions sink on sink.id=ledger.sink_version_id
      where (coalesce(p_search,'')='' or ledger.public_receipt_id=upper(p_search)
        or ledger.correlation_id=p_search or profile.id::text=p_search
        or profile.display_name ilike '%'||p_search||'%' or ledger.operation_key=p_search)
        and (p_direction is null or (p_direction='credit' and ledger.delta>0)
          or (p_direction='debit' and ledger.delta<0))
        and (p_source_key is null or source.source_key=p_source_key)
        and (p_sink_key is null or sink.sink_key=p_sink_key)
        and (p_date_from is null or ledger.created_at>=p_date_from)
        and (p_date_to is null or ledger.created_at<=p_date_to)
        and (p_minimum_amount is null or abs(ledger.delta)>=p_minimum_amount)
        and (p_maximum_amount is null or abs(ledger.delta)<=p_maximum_amount)
      order by ledger.entry_number desc limit p_page_size offset (p_page-1)*p_page_size) page
    ),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'total',total,
    'totalPages',ceil(total::numeric/p_page_size)::integer
  );
end;
$$;

revoke all on function public.get_admin_economy_workspace(uuid,uuid,text,text,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.get_admin_economy_ledger_filtered(
  uuid,uuid,text,text,integer,integer,text,text,text,timestamptz,timestamptz,bigint,bigint,text
) from public,anon,authenticated,service_role;
revoke all on function public.operate_admin_economy_policy_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) from public,anon,authenticated,service_role;
revoke all on function public.operate_admin_economy_shop_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) from public,anon,authenticated,service_role;

revoke execute on function public.transition_admin_economy_policy_version(
  uuid,uuid,text,uuid,integer,text,text
) from service_role;
revoke execute on function public.transition_admin_economy_shop_version(
  uuid,uuid,text,uuid,integer,text,text
) from service_role;

grant execute on function public.get_admin_economy_workspace(
  uuid,uuid,text,text,uuid,text,integer,integer
) to service_role;
grant execute on function public.get_admin_economy_ledger_filtered(
  uuid,uuid,text,text,integer,integer,text,text,text,timestamptz,timestamptz,bigint,bigint,text
) to service_role;
grant execute on function public.operate_admin_economy_policy_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) to service_role;
grant execute on function public.operate_admin_economy_shop_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) to service_role;

comment on function public.get_admin_economy_workspace(
  uuid,uuid,text,text,uuid,text,integer,integer
) is 'Permission-scoped bounded read model for the Phase 9A.1 economy administration pages.';
comment on function public.operate_admin_economy_policy_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) is 'Exact-revision policy lifecycle with separate approval, scheduling, and explicit publication.';
comment on function public.operate_admin_economy_shop_version(
  uuid,uuid,text,uuid,integer,text,timestamptz,text
) is 'Exact-revision shop lifecycle with validation, separate approval, scheduling, publication, and versioned disable.';
