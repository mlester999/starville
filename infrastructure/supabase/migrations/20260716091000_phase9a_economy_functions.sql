-- Starville Phase 9A: authoritative settlement, reconciliation, risk review, and corrections.

create or replace function private.cozy_apply_dust_delta(
  p_player_profile_id uuid, p_delta bigint, p_reason text, p_reference_type text,
  p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account public.player_dust_accounts%rowtype; policy public.economy_policy_versions%rowtype;
begin
  select version.* into strict policy
  from public.economy_active_policy active
  join public.economy_policy_versions version on version.id = active.policy_version_id
  where active.singleton_key;
  if not policy.economy_enabled and p_reason not in ('system_refund','migration_adjustment') then return false; end if;
  if p_reason in ('shop_purchase','shop_sale') and not policy.purchases_enabled then return false; end if;
  if p_reason = 'cooperative_activity_reward' and not policy.rewards_enabled then return false; end if;
  if p_reason = 'administrative_correction' and not policy.corrections_enabled then return false; end if;
  if p_delta > 0 and not exists(
    select 1 from public.economy_active_source_versions active
    join public.economy_source_versions source on source.id=active.source_version_id
    where source.operation_key=p_reason and source.lifecycle_status='published' and source.effective_at<=now()
  ) then return false; end if;
  if p_delta < 0 and not exists(
    select 1 from public.economy_active_sink_versions active
    join public.economy_sink_versions sink on sink.id=active.sink_version_id
    where sink.operation_key=p_reason and sink.lifecycle_status='published' and sink.effective_at<=now()
  ) then return false; end if;
  select * into strict account from public.player_dust_accounts
  where player_profile_id = p_player_profile_id for update;
  if p_delta = 0 then return true; end if;
  if account.balance + p_delta < 0 or account.balance + p_delta > 9000000000000000 then return false; end if;
  update public.player_dust_accounts set
    balance = balance + p_delta, state_version = state_version + 1, updated_at = now()
  where player_profile_id = p_player_profile_id returning * into account;
  insert into public.player_dust_ledger (
    player_profile_id, delta, resulting_balance, reason, reference_type,
    reference_id, idempotency_key, request_id
  ) values (
    p_player_profile_id, p_delta, account.balance, p_reason, p_reference_type,
    p_reference_id,
    encode(extensions.digest(convert_to(p_reason || ':' || p_idempotency_key, 'UTF8'), 'sha256'), 'hex'),
    p_request_id
  );
  return true;
end;
$$;

create or replace function private.economy_assert_account_balanced()
returns trigger language plpgsql security definer set search_path = '' as $$
declare profile_id uuid; stored bigint; ledger_total bigint;
begin
  profile_id := coalesce(new.player_profile_id, old.player_profile_id);
  select account.balance into stored from public.player_dust_accounts account
  where account.player_profile_id = profile_id;
  if stored is null then return null; end if;
  select coalesce(sum(ledger.delta), 0)::bigint into ledger_total
  from public.player_dust_ledger ledger where ledger.player_profile_id = profile_id;
  if stored <> ledger_total then
    raise exception using errcode = '23514', message = 'DUST_ACCOUNT_LEDGER_MISMATCH';
  end if;
  return null;
end;
$$;

create constraint trigger player_dust_accounts_balanced
after insert or update on public.player_dust_accounts deferrable initially deferred
for each row execute function private.economy_assert_account_balanced();
create constraint trigger player_dust_ledger_balanced
after insert on public.player_dust_ledger deferrable initially deferred
for each row execute function private.economy_assert_account_balanced();

create or replace function private.economy_terminal_correction_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.status in ('rejected','settled','cancelled') then
    raise exception using errcode = '55000', message = 'TERMINAL_ECONOMY_CORRECTION_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger economy_correction_requests_terminal_immutable
before update or delete on public.economy_correction_requests
for each row execute function private.economy_terminal_correction_immutable();

create or replace function private.economy_purchase_receipt_json(receipt public.economy_purchase_receipts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receiptId', receipt.public_receipt_id,
    'shopVersionId', receipt.shop_version_id,
    'offerId', receipt.offer_id,
    'itemSlug', item.slug,
    'quantity', receipt.quantity,
    'unitPrice', receipt.unit_price,
    'totalPrice', receipt.total_price,
    'ledgerReceiptId', ledger.public_receipt_id,
    'settledAt', receipt.created_at
  )
  from public.cozy_item_definitions item
  join public.player_dust_ledger ledger on ledger.id = receipt.dust_ledger_entry_id
  where item.id = receipt.item_definition_id;
$$;

create or replace function private.economy_claim_admin_rate_limit(
  p_admin_user_id uuid, p_scope text, p_limit integer, p_window_seconds integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare claimed boolean;
begin
  if p_admin_user_id is null
     or p_scope not in (
       'overview_read','ledger_read','reconciliation','correction_create','correction_review',
       'risk_review','simulation_run','policy_mutation','shop_mutation'
     )
     or p_limit not between 1 and 600 or p_window_seconds not between 1 and 3600 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_ADMIN_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('economy-admin-rate:'||p_admin_user_id::text||':'||p_scope,0)
  );
  insert into public.economy_admin_rate_limits(
    admin_user_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(
    p_admin_user_id,p_scope,1,now(),now()+make_interval(secs=>p_window_seconds),now()
  ) on conflict(admin_user_id,scope) do update set
    attempt_count=case when economy_admin_rate_limits.window_expires_at<=now()
      then 1 else economy_admin_rate_limits.attempt_count+1 end,
    window_started_at=case when economy_admin_rate_limits.window_expires_at<=now()
      then now() else economy_admin_rate_limits.window_started_at end,
    window_expires_at=case when economy_admin_rate_limits.window_expires_at<=now()
      then now()+make_interval(secs=>p_window_seconds) else economy_admin_rate_limits.window_expires_at end,
    updated_at=now()
  where economy_admin_rate_limits.window_expires_at<=now()
     or economy_admin_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create or replace function public.get_player_economy(
  p_wallet_address text, p_before_entry_number bigint, p_limit integer, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; account public.player_dust_accounts%rowtype; policy_version integer;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_limit not between 1 and 100 or coalesce(p_before_entry_number, 1) < 1
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_ECONOMY_READ_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'economy_read', 120) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id = profile.id;
  select version.version_number into strict policy_version
  from public.economy_active_policy active join public.economy_policy_versions version on version.id = active.policy_version_id
  where active.singleton_key;
  return jsonb_build_object(
    'status','loaded','dustBalance',account.balance,'dustStateVersion',account.state_version,
    'policyVersion',policy_version,'generatedAt',now(),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'publicReceiptId',page.public_receipt_id,'operationKey',page.operation_key,
      'sourceKey',source.source_key,'sinkKey',sink.sink_key,'delta',page.delta,
      'balanceBefore',page.balance_before,'balanceAfter',page.resulting_balance,
      'referenceType',page.reference_type,'referenceId',page.reference_id,
      'correlationId',page.correlation_id,'createdAt',page.created_at
    ) order by page.entry_number desc)
    from (select * from public.player_dust_ledger ledger
      where ledger.player_profile_id = profile.id
        and (p_before_entry_number is null or ledger.entry_number < p_before_entry_number)
      order by ledger.entry_number desc limit p_limit) page
    left join public.economy_source_versions source on source.id = page.source_version_id
    left join public.economy_sink_versions sink on sink.id = page.sink_version_id),'[]'::jsonb),
    'nextCursor',(select min(page.entry_number) from (select ledger.entry_number
      from public.player_dust_ledger ledger where ledger.player_profile_id = profile.id
        and (p_before_entry_number is null or ledger.entry_number < p_before_entry_number)
      order by ledger.entry_number desc limit p_limit) page)
  );
end;
$$;

create or replace function public.get_player_economy_shop(
  p_wallet_address text, p_shop_slug text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; shop public.cozy_shop_definitions%rowtype;
  version public.economy_shop_versions%rowtype; policy public.economy_policy_versions%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_shop_slug is null or p_shop_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_ECONOMY_SHOP_REQUEST';
  end if;
  select p as profile_row, m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  if not private.claim_cozy_gameplay_rate_limit(profile.id, 'economy_shop_read', 120) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select * into shop from public.cozy_shop_definitions where slug = p_shop_slug and active;
  if not found then return jsonb_build_object('status','shop_unavailable'); end if;
  select version_row.* into strict version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions version_row on version_row.id = active.shop_version_id
  where active.shop_definition_id = shop.id;
  select policy_row.* into strict policy from public.economy_active_policy active
  join public.economy_policy_versions policy_row on policy_row.id = active.policy_version_id where active.singleton_key;
  return jsonb_build_object(
    'status',case when policy.economy_enabled and policy.purchases_enabled then 'loaded' else 'maintenance' end,
    'shop',jsonb_build_object('shopKey','village-supply-shop','name',version.name,'versionId',version.id,
      'versionNumber',version.version_number,'revision',version.revision,'status',version.lifecycle_status,
      'interactionKey',version.interaction_key,'publishedAt',version.published_at),
    'offers',coalesce((select jsonb_agg(jsonb_build_object(
      'offerId',offer.offer_id,'itemSlug',item.slug,'itemName',item.name,'unitPrice',offer.unit_price,
      'maximumQuantity',offer.maximum_quantity,'dailyLimit',offer.daily_limit,
      'cooldownSeconds',offer.cooldown_seconds,'inventoryCapacityCost',offer.inventory_capacity_cost,
      'protectedItem',offer.protected_item,'enabled',offer.enabled,'revision',offer.revision
    ) order by item.category,item.slug)
    from public.economy_shop_version_offers offer
    join public.cozy_shop_offers cozy_offer on cozy_offer.id = offer.offer_id
    join public.cozy_item_definitions item on item.id = cozy_offer.item_definition_id
    where offer.shop_version_id = version.id and offer.enabled and not offer.protected_item),'[]'::jsonb),
    'generatedAt',now()
  );
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
  where p.wallet_address = p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile := selected_rows.profile_row; moderation := selected_rows.moderation_row;
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

create or replace function public.run_admin_economy_reconciliation(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_player_profile_id uuid, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare run public.economy_reconciliation_runs%rowtype; account record; stored bigint; ledger_total bigint;
  mismatch_total integer := 0; checked_total integer := 0; signal_key text;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.audit.read') then
    raise exception using errcode = '42501', message = 'ECONOMY_AUDIT_ACCESS_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'reconciliation',10,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_ECONOMY_RECONCILIATION_REQUEST';
  end if;
  insert into public.economy_reconciliation_runs (
    scope,requested_player_profile_id,status,request_id,created_by_admin_id
  ) values (case when p_player_profile_id is null then 'global' else 'player' end,p_player_profile_id,'running',p_request_id,p_user_id)
  returning * into run;
  for account in select dust.player_profile_id,dust.balance from public.player_dust_accounts dust
    where p_player_profile_id is null or dust.player_profile_id = p_player_profile_id
    order by dust.player_profile_id limit 10000 for share of dust
  loop
    stored := account.balance;
    select coalesce(sum(ledger.delta),0)::bigint into ledger_total from public.player_dust_ledger ledger
    where ledger.player_profile_id = account.player_profile_id;
    checked_total := checked_total + 1;
    if stored <> ledger_total then mismatch_total := mismatch_total + 1; end if;
    insert into public.economy_reconciliation_results (
      run_id,player_profile_id,stored_balance,ledger_balance,difference,status,auto_corrected
    ) values (run.id,account.player_profile_id,stored,ledger_total,stored-ledger_total,
      case when stored = ledger_total then 'balanced' else 'mismatch' end,false);
    if stored <> ledger_total then
      signal_key := 'reconciliation:' || account.player_profile_id::text || ':' || stored::text || ':' || ledger_total::text;
      insert into public.economy_risk_signals (
        player_profile_id,signal_type,severity,status,score,safe_summary,evidence,deduplication_key
      ) values (account.player_profile_id,'reconciliation_mismatch','high','open',90,
        'Stored DUST balance does not match the append-only ledger total.',
        jsonb_build_object('storedBalance',stored,'ledgerBalance',ledger_total,'runId',run.id),
        encode(extensions.digest(convert_to(signal_key,'UTF8'),'sha256'),'hex'))
      on conflict (deduplication_key) do nothing;
    end if;
  end loop;
  update public.economy_reconciliation_runs set status = 'completed',checked_count = checked_total,
    mismatch_count = mismatch_total,completed_at = now() where id = run.id returning * into run;
  insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values ('economy.reconciliation.completed',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('runId',run.id,'scope',run.scope,'checkedCount',checked_total,'mismatchCount',mismatch_total));
  return jsonb_build_object('runId',run.id,'status',run.status,'checkedCount',checked_total,
    'mismatchCount',mismatch_total,'autoCorrected',false,'completedAt',run.completed_at);
exception when others then
  if run.id is not null then update public.economy_reconciliation_runs set status='failed',failure_code='RECONCILIATION_FAILED',completed_at=now() where id=run.id; end if;
  raise;
end;
$$;

create or replace function public.get_admin_economy_overview(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.read') then
    raise exception using errcode = '42501', message = 'ECONOMY_ACCESS_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'overview_read',120,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  return jsonb_build_object(
    'generatedAt',now(),
    'dust',jsonb_build_object(
      'totalSupply',(select coalesce(sum(balance),0) from public.player_dust_accounts),
      'accountCount',(select count(*) from public.player_dust_accounts),
      'fundedPlayerCount',(select count(*) from public.player_dust_accounts where balance > 0),
      'averageBalance',(select coalesce(round(avg(balance)::numeric,2),0) from public.player_dust_accounts),
      'medianBalance',(select coalesce(percentile_disc(0.5) within group(order by balance),0) from public.player_dust_accounts),
      'maximumBalance',(select coalesce(max(balance),0) from public.player_dust_accounts),
      'ledgerEntryCount',(select count(*) from public.player_dust_ledger),
      'lifetimeCreated',(select coalesce(sum(delta),0) from public.player_dust_ledger where delta > 0),
      'lifetimeDestroyed',(select coalesce(-sum(delta),0) from public.player_dust_ledger where delta < 0),
      'created30d',(select coalesce(sum(delta),0) from public.player_dust_ledger where delta > 0 and created_at >= now()-interval '30 days'),
      'destroyed30d',(select coalesce(-sum(delta),0) from public.player_dust_ledger where delta < 0 and created_at >= now()-interval '30 days'),
      'dailyEmissionEstimate',(select round(coalesce(sum(delta),0)::numeric/30,2) from public.player_dust_ledger where delta > 0 and created_at >= now()-interval '30 days'),
      'dailySinkEstimate',(select round(coalesce(-sum(delta),0)::numeric/30,2) from public.player_dust_ledger where delta < 0 and created_at >= now()-interval '30 days'),
      'sourceToSinkRatio',(select case when coalesce(-sum(delta) filter(where delta < 0),0)=0 then null
        else round(coalesce(sum(delta) filter(where delta > 0),0)::numeric/
          (-sum(delta) filter(where delta < 0))::numeric,4) end
        from public.player_dust_ledger where created_at >= now()-interval '30 days'),
      'inactiveBalancePercentage',null
    ),
    'openRiskSignals',(select count(*) from public.economy_risk_signals where status in ('open','reviewing')),
    'openCorrections',(select count(*) from public.economy_correction_requests where status = 'pending_review'),
    'reconciliationMismatches',(select count(*) from public.economy_reconciliation_results where status = 'mismatch'),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('key',source.source_key,'operationKey',source.operation_key,
      'status',source.lifecycle_status,'version',source.version_number,
      'lifetimeAmount',(select coalesce(sum(ledger.delta),0) from public.player_dust_ledger ledger
        where ledger.delta > 0 and ledger.operation_key=source.operation_key),
      'amount30d',(select coalesce(sum(ledger.delta),0) from public.player_dust_ledger ledger
        where ledger.delta > 0 and ledger.operation_key=source.operation_key and ledger.created_at>=now()-interval '30 days'))
      order by source.source_key),'[]'::jsonb)
      from public.economy_source_versions source where source.lifecycle_status in ('published','retired')),
    'sinks',(select coalesce(jsonb_agg(jsonb_build_object('key',sink.sink_key,'operationKey',sink.operation_key,
      'status',sink.lifecycle_status,'version',sink.version_number,
      'lifetimeAmount',(select coalesce(-sum(ledger.delta),0) from public.player_dust_ledger ledger
        where ledger.delta < 0 and ledger.operation_key=sink.operation_key),
      'amount30d',(select coalesce(-sum(ledger.delta),0) from public.player_dust_ledger ledger
        where ledger.delta < 0 and ledger.operation_key=sink.operation_key and ledger.created_at>=now()-interval '30 days'))
      order by sink.sink_key),'[]'::jsonb)
      from public.economy_sink_versions sink where sink.lifecycle_status in ('published','disabled','retired')),
    'starUtility',(select utility.definitions from public.star_utility_active_version active
      join public.star_utility_versions utility on utility.id=active.utility_version_id where active.singleton_key)
  );
end;
$$;

create or replace function public.get_admin_economy_ledger(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_search text, p_page integer, p_page_size integer
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare total integer;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.audit.read') then
    raise exception using errcode = '42501', message = 'ECONOMY_AUDIT_ACCESS_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'ledger_read',60,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_page < 1 or p_page_size not in (10,50,100) or char_length(coalesce(p_search,'')) > 128 then
    raise exception using errcode = '22023', message = 'INVALID_ECONOMY_LEDGER_QUERY';
  end if;
  select count(*)::integer into total from public.player_dust_ledger ledger
  join public.player_profiles profile on profile.id = ledger.player_profile_id
  where coalesce(p_search,'') = '' or ledger.public_receipt_id = upper(p_search)
    or ledger.correlation_id = p_search or profile.display_name ilike '%'||p_search||'%';
  return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'publicReceiptId',page.public_receipt_id,'playerProfileId',page.player_profile_id,
    'displayName',profile.display_name,'operationKey',page.operation_key,'delta',page.delta,
    'balanceBefore',page.balance_before,'balanceAfter',page.resulting_balance,
    'requestId',page.request_id,'createdAt',page.created_at
  ) order by page.entry_number desc) from (select ledger.* from public.player_dust_ledger ledger
    join public.player_profiles profile on profile.id = ledger.player_profile_id
    where coalesce(p_search,'') = '' or ledger.public_receipt_id = upper(p_search)
      or ledger.correlation_id = p_search or profile.display_name ilike '%'||p_search||'%'
    order by ledger.entry_number desc limit p_page_size offset (p_page-1)*p_page_size) page
    join public.player_profiles profile on profile.id=page.player_profile_id),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'total',total,
    'totalPages',ceil(total::numeric/p_page_size)::integer);
end;
$$;

create or replace function public.create_admin_economy_correction(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_player_profile_id uuid, p_delta bigint, p_reason_category text,
  p_explanation text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account public.player_dust_accounts%rowtype; policy public.economy_policy_versions%rowtype;
  correction public.economy_correction_requests%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.correction.create') then
    raise exception using errcode='42501',message='ECONOMY_CORRECTION_CREATE_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'correction_create',20,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  select version.* into strict policy from public.economy_active_policy active
  join public.economy_policy_versions version on version.id=active.policy_version_id where active.singleton_key;
  if not policy.economy_enabled or not policy.corrections_enabled then return jsonb_build_object('status','maintenance'); end if;
  if p_delta = 0 or abs(p_delta) > policy.high_value_correction_limit
     or p_reason_category not in ('support_repair','incident_repair','migration_repair','refund')
     or char_length(coalesce(btrim(p_explanation),'')) not between 20 and 1000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_CORRECTION_REQUEST';
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id=p_player_profile_id for update;
  if account.balance + p_delta not between 0 and 9000000000000000 then
    return jsonb_build_object('status','invalid_balance');
  end if;
  insert into public.economy_correction_requests (
    player_profile_id,delta,reason_category,explanation,status,balance_before,balance_after,
    requires_second_approval,created_by_admin_id,request_id
  ) values (p_player_profile_id,p_delta,p_reason_category,btrim(p_explanation),'pending_review',
    account.balance,account.balance+p_delta,abs(p_delta)>policy.low_value_correction_limit,p_user_id,p_request_id)
  returning * into correction;
  insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values ('economy.correction.created',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('correctionId',correction.id,'playerProfileId',p_player_profile_id,
      'delta',p_delta,'requiresSecondApproval',correction.requires_second_approval));
  return jsonb_build_object('status','pending_review','correctionId',correction.id,
    'publicReceiptId',correction.public_receipt_id,'balanceBefore',correction.balance_before,
    'balanceAfter',correction.balance_after,'requiresSecondApproval',correction.requires_second_approval);
end;
$$;

create or replace function public.review_admin_economy_correction(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_correction_id uuid, p_action text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare correction public.economy_correction_requests%rowtype; account public.player_dust_accounts%rowtype;
  ledger_id uuid; approval_number integer;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.correction.review') then
    raise exception using errcode='42501',message='ECONOMY_CORRECTION_REVIEW_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'correction_review',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_action not in ('approve','reject') or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_CORRECTION_REVIEW';
  end if;
  select * into correction from public.economy_correction_requests where id=p_correction_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if correction.status <> 'pending_review' then return jsonb_build_object('status','already_final','finalStatus',correction.status); end if;
  if correction.created_by_admin_id=p_user_id or correction.first_approved_by_admin_id=p_user_id then
    return jsonb_build_object('status','separation_of_duty');
  end if;
  if p_action='reject' then
    update public.economy_correction_requests set status='rejected',rejected_by_admin_id=p_user_id,reviewed_at=now()
    where id=p_correction_id returning * into correction;
    insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
    values ('economy.correction.rejected',p_user_id,p_auth_session_id,p_request_id,'success',jsonb_build_object('correctionId',p_correction_id));
    return jsonb_build_object('status','rejected','correctionId',p_correction_id);
  end if;
  if correction.first_approved_by_admin_id is null then
    update public.economy_correction_requests set first_approved_by_admin_id=p_user_id,reviewed_at=now()
    where id=p_correction_id returning * into correction;
    approval_number := 1;
    if correction.requires_second_approval then
      insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
      values ('economy.correction.first_approved',p_user_id,p_auth_session_id,p_request_id,'success',jsonb_build_object('correctionId',p_correction_id));
      return jsonb_build_object('status','second_approval_required','correctionId',p_correction_id);
    end if;
  else
    update public.economy_correction_requests set second_approved_by_admin_id=p_user_id,reviewed_at=now()
    where id=p_correction_id returning * into correction;
    approval_number := 2;
  end if;
  select * into strict account from public.player_dust_accounts where player_profile_id=correction.player_profile_id for update;
  if account.balance <> correction.balance_before then return jsonb_build_object('status','state_conflict'); end if;
  if not private.cozy_apply_dust_delta(correction.player_profile_id,correction.delta,'administrative_correction',
    'system_operation',correction.id::text,'economy-correction:'||correction.id::text,p_request_id) then
    return jsonb_build_object('status','settlement_failed');
  end if;
  select id into strict ledger_id from public.player_dust_ledger where player_profile_id=correction.player_profile_id
    and reason='administrative_correction' and reference_id=correction.id::text;
  update public.economy_correction_requests set status='settled',dust_ledger_entry_id=ledger_id,settled_at=now(),
    reviewed_at=coalesce(reviewed_at,now()) where id=p_correction_id returning * into correction;
  insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values ('economy.correction.settled',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('correctionId',p_correction_id,'approvalNumber',approval_number,
      'ledgerEntryId',ledger_id,'publicReceiptId',correction.public_receipt_id));
  return jsonb_build_object('status','settled','correctionId',p_correction_id,
    'publicReceiptId',correction.public_receipt_id,'ledgerEntryId',ledger_id,
    'balanceAfter',correction.balance_after);
end;
$$;

create or replace function public.review_admin_economy_risk(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_signal_id uuid, p_status text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare signal public.economy_risk_signals%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.risk.review') then
    raise exception using errcode='42501',message='ECONOMY_RISK_REVIEW_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'risk_review',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_status not in ('reviewing','dismissed','confirmed','resolved')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_RISK_REVIEW';
  end if;
  update public.economy_risk_signals set status=p_status,reviewed_by_admin_id=p_user_id,reviewed_at=now()
  where id=p_signal_id and status in ('open','reviewing') returning * into signal;
  if not found then return jsonb_build_object('status','not_found_or_final'); end if;
  insert into public.admin_audit_logs (event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values ('economy.risk.reviewed',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('signalId',p_signal_id,'status',p_status));
  return jsonb_build_object('status',signal.status,'signalId',signal.id,'automaticPlayerAction',false);
end;
$$;

create or replace function public.record_admin_economy_simulation(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_seed integer, p_player_count integer, p_duration_days integer,
  p_input jsonb, p_result jsonb, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare run public.economy_simulation_runs%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.simulation.run') then
    raise exception using errcode='42501',message='ECONOMY_SIMULATION_ACCESS_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'simulation_run',10,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_seed not between 1 and 2147483647 or p_player_count not in (100,1000,10000)
     or p_duration_days not in (30,90,180) or jsonb_typeof(p_input) <> 'object'
     or jsonb_typeof(p_result) <> 'object' or octet_length(p_input::text)>16384
     or octet_length(p_result::text)>32768 or p_request_id is null
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SIMULATION';
  end if;
  insert into public.economy_simulation_runs(seed,player_count,duration_days,input,result,created_by_admin_id,request_id)
  values(p_seed,p_player_count,p_duration_days,p_input,p_result,p_user_id,p_request_id) returning * into run;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.simulation.recorded',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('simulationRunId',run.id,'seed',p_seed,'playerCount',p_player_count,'durationDays',p_duration_days));
  return jsonb_build_object('runId',run.id,'createdAt',run.created_at,'playerBalancesMutated',false);
end;
$$;

create or replace function public.create_admin_economy_policy_draft(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_base_version_id uuid,
  p_economy_enabled boolean,p_purchases_enabled boolean,p_rewards_enabled boolean,
  p_corrections_enabled boolean,p_starter_grant bigint,p_beginner_protection_hours integer,
  p_low_value_correction_limit bigint,p_high_value_correction_limit bigint,
  p_purchase_rate_limit_per_minute integer,p_history_retention_days integer,
  p_risk_review_threshold numeric,p_effective_at timestamptz,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare base public.economy_policy_versions%rowtype; draft public.economy_policy_versions%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.settings.edit') then
    raise exception using errcode='42501',message='ECONOMY_SETTINGS_EDIT_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'policy_mutation',20,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_request_id is null or char_length(p_request_id) not between 1 and 128
     or p_starter_grant not between 0 and 10000 or p_beginner_protection_hours not between 0 and 720
     or p_low_value_correction_limit not between 1 and 100000
     or p_high_value_correction_limit not between 1 and 1000000
     or p_low_value_correction_limit>=p_high_value_correction_limit
     or p_purchase_rate_limit_per_minute not between 1 and 60
     or p_history_retention_days not between 30 and 2555
     or p_risk_review_threshold not between 0 and 100
     or p_effective_at is null or p_effective_at>now()+interval '90 days' then
    raise exception using errcode='22023',message='INVALID_ECONOMY_POLICY_DRAFT';
  end if;
  select * into strict base from public.economy_policy_versions where id=p_base_version_id;
  if base.lifecycle_status<>'published' then
    raise exception using errcode='22023',message='ECONOMY_POLICY_BASE_NOT_PUBLISHED';
  end if;
  insert into public.economy_policy_versions(
    id,version_number,lifecycle_status,economy_enabled,purchases_enabled,rewards_enabled,
    corrections_enabled,starter_grant,beginner_protection_hours,low_value_correction_limit,
    high_value_correction_limit,reconciliation_tolerance,purchase_rate_limit_per_minute,
    history_retention_days,risk_review_threshold,revision,effective_at,created_by_admin_id
  ) values (
    gen_random_uuid(),(select max(version_number)+1 from public.economy_policy_versions),'draft',
    p_economy_enabled,p_purchases_enabled,p_rewards_enabled,p_corrections_enabled,p_starter_grant,
    p_beginner_protection_hours,p_low_value_correction_limit,p_high_value_correction_limit,0,
    p_purchase_rate_limit_per_minute,p_history_retention_days,p_risk_review_threshold,1,
    p_effective_at,p_user_id
  ) returning * into draft;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.policy.draft_created',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('policyVersionId',draft.id,'versionNumber',draft.version_number,'baseVersionId',base.id));
  return jsonb_build_object('status','draft','versionId',draft.id,'versionNumber',draft.version_number,
    'revision',draft.revision,'effectiveAt',draft.effective_at);
end;
$$;

create or replace function public.transition_admin_economy_policy_version(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_version_id uuid,
  p_expected_revision integer,p_action text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare version public.economy_policy_versions%rowtype; required_permission text; next_status text;
begin
  required_permission:=case when p_action='publish' then 'economy.settings.publish' else 'economy.settings.edit' end;
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,required_permission) then
    raise exception using errcode='42501',message='ECONOMY_SETTINGS_TRANSITION_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'policy_mutation',20,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_expected_revision<1 or p_action not in ('validate','submit_review','publish')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_POLICY_TRANSITION';
  end if;
  select * into version from public.economy_policy_versions where id=p_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.revision<>p_expected_revision then return jsonb_build_object('status','revision_conflict'); end if;
  if p_action='validate' and version.lifecycle_status='draft' then next_status:='validated';
  elsif p_action='submit_review' and version.lifecycle_status='validated' then next_status:='in_review';
  elsif p_action='publish' and version.lifecycle_status='in_review' then next_status:='published';
  else return jsonb_build_object('status','invalid_transition'); end if;
  if p_action='publish' and version.created_by_admin_id=p_user_id then
    return jsonb_build_object('status','separation_of_duty');
  end if;
  update public.economy_policy_versions set
    lifecycle_status=next_status,revision=revision+1,
    validation_results=case when p_action='validate' then
      '{"valid":true,"checks":["bounded-policy","exact-reconciliation","correction-threshold-order","effective-time"]}'::jsonb
      else validation_results end,
    reviewed_by_admin_id=case when p_action='submit_review' then p_user_id else reviewed_by_admin_id end,
    reviewed_at=case when p_action='submit_review' then now() else reviewed_at end,
    published_by_admin_id=case when p_action='publish' then p_user_id else published_by_admin_id end,
    published_at=case when p_action='publish' then now() else published_at end
  where id=p_version_id returning * into version;
  if p_action='publish' and version.effective_at<=now() then
    insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
    values(true,version.id,now()) on conflict(singleton_key) do update set
      policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
  end if;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.policy.'||p_action, p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('policyVersionId',version.id,'status',version.lifecycle_status,'revision',version.revision));
  return jsonb_build_object('status',version.lifecycle_status,'versionId',version.id,
    'versionNumber',version.version_number,'revision',version.revision,
    'active',exists(select 1 from public.economy_active_policy active where active.policy_version_id=version.id));
end;
$$;

create or replace function public.create_admin_economy_shop_draft(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_definition_id uuid,
  p_expected_active_version_id uuid,p_name text,p_description text,p_effective_at timestamptz,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare active_version public.economy_shop_versions%rowtype; draft public.economy_shop_versions%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit') then
    raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if char_length(coalesce(btrim(p_name),'')) not between 3 and 80
     or char_length(coalesce(btrim(p_description),'')) not between 3 and 280
     or p_effective_at is null or p_effective_at>now()+interval '90 days'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_DRAFT';
  end if;
  select version.* into strict active_version from public.economy_active_shop_versions active
  join public.economy_shop_versions version on version.id=active.shop_version_id
  where active.shop_definition_id=p_shop_definition_id for share of version;
  if active_version.id<>p_expected_active_version_id then return jsonb_build_object('status','version_conflict'); end if;
  insert into public.economy_shop_versions(
    id,shop_definition_id,version_number,lifecycle_status,name,description,interaction_key,
    revision,effective_at,created_by_admin_id
  ) values(
    gen_random_uuid(),p_shop_definition_id,
    (select max(version_number)+1 from public.economy_shop_versions where shop_definition_id=p_shop_definition_id),
    'draft',btrim(p_name),btrim(p_description),active_version.interaction_key,1,p_effective_at,p_user_id
  ) returning * into draft;
  insert into public.economy_shop_version_offers(
    shop_version_id,offer_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
    inventory_capacity_cost,protected_item,enabled,revision
  ) select draft.id,offer_id,unit_price,maximum_quantity,daily_limit,cooldown_seconds,
    inventory_capacity_cost,protected_item,enabled,1
  from public.economy_shop_version_offers where shop_version_id=active_version.id;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.draft_created',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',draft.id,'shopDefinitionId',p_shop_definition_id,'baseVersionId',active_version.id));
  return jsonb_build_object('status','draft','versionId',draft.id,'versionNumber',draft.version_number,'revision',draft.revision);
end;
$$;

create or replace function public.update_admin_economy_shop_offer(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_version_id uuid,
  p_expected_shop_revision integer,p_offer_id uuid,p_unit_price bigint,p_maximum_quantity integer,
  p_daily_limit integer,p_cooldown_seconds integer,p_enabled boolean,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare version public.economy_shop_versions%rowtype; selected_item public.cozy_item_definitions%rowtype;
begin
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,'economy.shop.edit') then
    raise exception using errcode='42501',message='ECONOMY_SHOP_EDIT_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_expected_shop_revision<1 or p_unit_price not between 1 and 1000000
     or p_maximum_quantity not between 1 and 99 or p_daily_limit not between 1 and 999
     or p_cooldown_seconds not between 0 and 86400
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_OFFER';
  end if;
  select * into version from public.economy_shop_versions where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.lifecycle_status<>'draft' then return jsonb_build_object('status','immutable'); end if;
  if version.revision<>p_expected_shop_revision then return jsonb_build_object('status','revision_conflict'); end if;
  select item.* into selected_item from public.cozy_shop_offers offer
  join public.cozy_item_definitions item on item.id=offer.item_definition_id
  where offer.id=p_offer_id and offer.shop_definition_id=version.shop_definition_id
    and offer.active and item.active and item.buy_eligible and item.category not in ('permanent_tool','special');
  if not found then return jsonb_build_object('status','protected_or_unknown_item'); end if;
  update public.economy_shop_version_offers set unit_price=p_unit_price,
    maximum_quantity=p_maximum_quantity,daily_limit=p_daily_limit,cooldown_seconds=p_cooldown_seconds,
    enabled=p_enabled,revision=revision+1
  where shop_version_id=p_shop_version_id and offer_id=p_offer_id;
  if not found then return jsonb_build_object('status','offer_not_in_draft'); end if;
  update public.economy_shop_versions set revision=revision+1 where id=p_shop_version_id returning * into version;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.offer_updated',p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',version.id,'offerId',p_offer_id,'revision',version.revision));
  return jsonb_build_object('status','draft','versionId',version.id,'revision',version.revision);
end;
$$;

create or replace function public.transition_admin_economy_shop_version(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_version_id uuid,
  p_expected_revision integer,p_action text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare version public.economy_shop_versions%rowtype; required_permission text; next_status text;
begin
  required_permission:=case when p_action='publish' then 'economy.shop.publish' else 'economy.shop.edit' end;
  if not private.social_admin_authorized(p_user_id,p_auth_session_id,p_assurance_level,required_permission) then
    raise exception using errcode='42501',message='ECONOMY_SHOP_TRANSITION_DENIED';
  end if;
  if not private.economy_claim_admin_rate_limit(p_user_id,'shop_mutation',30,60) then
    return jsonb_build_object('status','rate_limited');
  end if;
  if p_expected_revision<1 or p_action not in ('validate','submit_review','publish','disable')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_SHOP_TRANSITION';
  end if;
  select * into version from public.economy_shop_versions where id=p_shop_version_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if version.revision<>p_expected_revision then return jsonb_build_object('status','revision_conflict'); end if;
  if p_action='validate' and version.lifecycle_status='draft' then
    if not exists(select 1 from public.economy_shop_version_offers where shop_version_id=version.id and enabled)
       or exists(select 1 from public.economy_shop_version_offers offer
         join public.cozy_shop_offers base on base.id=offer.offer_id
         join public.cozy_item_definitions item on item.id=base.item_definition_id
         where offer.shop_version_id=version.id and (offer.protected_item or not base.active or not item.active
           or not item.buy_eligible or item.category in ('permanent_tool','special'))) then
      return jsonb_build_object('status','validation_failed');
    end if;
    next_status:='validated';
  elsif p_action='submit_review' and version.lifecycle_status='validated' then next_status:='in_review';
  elsif p_action='publish' and version.lifecycle_status='in_review' then next_status:='published';
  elsif p_action='disable' and version.lifecycle_status='in_review' then next_status:='disabled';
  else return jsonb_build_object('status','invalid_transition'); end if;
  if p_action in ('publish','disable') and version.created_by_admin_id=p_user_id then
    return jsonb_build_object('status','separation_of_duty');
  end if;
  update public.economy_shop_versions set lifecycle_status=next_status,revision=revision+1,
    validation_results=case when p_action='validate' then
      '{"valid":true,"checks":["ordinary-items-only","positive-bounded-prices","purchase-limits","effective-time"]}'::jsonb
      else validation_results end,
    reviewed_by_admin_id=case when p_action='submit_review' then p_user_id else reviewed_by_admin_id end,
    reviewed_at=case when p_action='submit_review' then now() else reviewed_at end,
    published_by_admin_id=case when p_action in ('publish','disable') then p_user_id else published_by_admin_id end,
    published_at=case when p_action='publish' then now() else published_at end
  where id=version.id returning * into version;
  if p_action='publish' and version.effective_at<=now() then
    update public.cozy_shop_offers base set
      buy_price=offer.unit_price,maximum_quantity=offer.maximum_quantity,active=offer.enabled
    from public.economy_shop_version_offers offer
    where offer.shop_version_id=version.id and base.id=offer.offer_id;
    insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
    values(version.shop_definition_id,version.id,now()) on conflict(shop_definition_id) do update set
      shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
  elsif p_action='disable' then
    delete from public.economy_active_shop_versions where shop_definition_id=version.shop_definition_id;
  end if;
  insert into public.admin_audit_logs(event_key,actor_user_id,admin_session_id,request_id,outcome,metadata)
  values('economy.shop.'||p_action,p_user_id,p_auth_session_id,p_request_id,'success',
    jsonb_build_object('shopVersionId',version.id,'status',version.lifecycle_status,'revision',version.revision));
  return jsonb_build_object('status',version.lifecycle_status,'versionId',version.id,'revision',version.revision,
    'active',exists(select 1 from public.economy_active_shop_versions active where active.shop_version_id=version.id));
end;
$$;

create or replace function public.activate_approved_economy_versions(p_batch_size integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare activated_policy integer:=0; activated_shops integer:=0; selected_policy uuid; selected_shop record;
begin
  if p_batch_size not between 1 and 100 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_ACTIVATION_REQUEST';
  end if;
  select id into selected_policy from public.economy_policy_versions
  where lifecycle_status='published' and effective_at<=now()
  order by effective_at desc,version_number desc limit 1;
  if selected_policy is not null and not exists(select 1 from public.economy_active_policy where policy_version_id=selected_policy) then
    insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
    values(true,selected_policy,now()) on conflict(singleton_key) do update set
      policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
    activated_policy:=1;
  end if;
  for selected_shop in select distinct on(version.shop_definition_id) version.*
    from public.economy_shop_versions version
    where version.lifecycle_status='published' and version.effective_at<=now()
    order by version.shop_definition_id,version.effective_at desc,version.version_number desc
    limit p_batch_size
  loop
    if not exists(select 1 from public.economy_active_shop_versions where shop_version_id=selected_shop.id) then
      update public.cozy_shop_offers base set buy_price=offer.unit_price,
        maximum_quantity=offer.maximum_quantity,active=offer.enabled
      from public.economy_shop_version_offers offer
      where offer.shop_version_id=selected_shop.id and base.id=offer.offer_id;
      insert into public.economy_active_shop_versions(shop_definition_id,shop_version_id,activated_at)
      values(selected_shop.shop_definition_id,selected_shop.id,now())
      on conflict(shop_definition_id) do update set shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
      activated_shops:=activated_shops+1;
    end if;
  end loop;
  return jsonb_build_object('policiesActivated',activated_policy,'shopsActivated',activated_shops,
    'publishedOnly',true,'requestId',p_request_id);
end;
$$;

create or replace function public.refresh_economy_daily_metrics(p_metric_date date,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare metric public.economy_daily_metrics%rowtype;
begin
  if p_metric_date is null or p_metric_date >= current_date
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_METRICS_REQUEST';
  end if;
  insert into public.economy_daily_metrics(
    metric_date,dust_created,dust_destroyed,transaction_count,active_player_count,median_balance,p90_balance
  ) select p_metric_date,
    coalesce(sum(delta) filter(where delta>0),0),coalesce(-sum(delta) filter(where delta<0),0),count(*),
    count(distinct player_profile_id),
    coalesce((select percentile_disc(0.5) within group(order by balance) from public.player_dust_accounts),0),
    coalesce((select percentile_disc(0.9) within group(order by balance) from public.player_dust_accounts),0)
  from public.player_dust_ledger where created_at >= p_metric_date::timestamptz
    and created_at < (p_metric_date+1)::timestamptz
  on conflict(metric_date) do nothing;
  select * into strict metric from public.economy_daily_metrics where metric_date=p_metric_date;
  return jsonb_build_object('metricDate',metric.metric_date,'dustCreated',metric.dust_created,
    'dustDestroyed',metric.dust_destroyed,'transactionCount',metric.transaction_count,
    'activePlayerCount',metric.active_player_count,'calculatedAt',metric.calculated_at);
end;
$$;

create or replace function public.run_economy_reconciliation_worker(p_batch_size integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare run public.economy_reconciliation_runs%rowtype; account record; ledger_total bigint;
  checked_total integer:=0; mismatch_total integer:=0; signal_key text;
begin
  if p_batch_size not between 1 and 10000 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_RECONCILIATION_WORKER_REQUEST';
  end if;
  insert into public.economy_reconciliation_runs(scope,status,request_id)
  values('global','running',p_request_id) returning * into run;
  for account in select dust.player_profile_id,dust.balance from public.player_dust_accounts dust
    order by dust.player_profile_id limit p_batch_size for share of dust loop
    select coalesce(sum(delta),0)::bigint into ledger_total from public.player_dust_ledger
    where player_profile_id=account.player_profile_id;
    checked_total:=checked_total+1;
    if account.balance<>ledger_total then mismatch_total:=mismatch_total+1; end if;
    insert into public.economy_reconciliation_results(
      run_id,player_profile_id,stored_balance,ledger_balance,difference,status,auto_corrected
    ) values(run.id,account.player_profile_id,account.balance,ledger_total,account.balance-ledger_total,
      case when account.balance=ledger_total then 'balanced' else 'mismatch' end,false);
    if account.balance<>ledger_total then
      signal_key:='reconciliation:'||account.player_profile_id::text||':'||account.balance::text||':'||ledger_total::text;
      insert into public.economy_risk_signals(
        player_profile_id,signal_type,severity,status,score,safe_summary,evidence,deduplication_key
      ) values(account.player_profile_id,'reconciliation_mismatch','high','open',90,
        'Stored DUST balance does not match the append-only ledger total.',
        jsonb_build_object('storedBalance',account.balance,'ledgerBalance',ledger_total,'runId',run.id),
        encode(extensions.digest(convert_to(signal_key,'UTF8'),'sha256'),'hex'))
      on conflict(deduplication_key) do nothing;
    end if;
  end loop;
  update public.economy_reconciliation_runs set status='completed',checked_count=checked_total,
    mismatch_count=mismatch_total,completed_at=now() where id=run.id;
  return jsonb_build_object('runId',run.id,'checkedCount',checked_total,'mismatchCount',mismatch_total,'autoCorrected',false);
end;
$$;

create or replace function public.scan_economy_risk_signals(p_batch_size integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare candidate record; inserted_count integer:=0; signal_key text;
begin
  if p_batch_size not between 1 and 1000 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_ECONOMY_RISK_WORKER_REQUEST';
  end if;
  for candidate in
    select ledger.player_profile_id,count(*)::integer as mutation_count
    from public.player_dust_ledger ledger where ledger.created_at>=now()-interval '1 hour'
    group by ledger.player_profile_id having count(*)>120
    order by count(*) desc limit p_batch_size
  loop
    signal_key:='velocity:'||candidate.player_profile_id::text||':'||date_trunc('hour',now())::text;
    insert into public.economy_risk_signals(
      player_profile_id,signal_type,severity,status,score,safe_summary,evidence,deduplication_key
    ) values(candidate.player_profile_id,'velocity','medium','open',65,
      'DUST mutation velocity exceeded the reviewed hourly signal threshold.',
      jsonb_build_object('window','one_hour','mutationCount',candidate.mutation_count),
      encode(extensions.digest(convert_to(signal_key,'UTF8'),'sha256'),'hex'))
    on conflict(deduplication_key) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return jsonb_build_object('signalsCreated',inserted_count,'automaticPlayerActions',0);
end;
$$;

revoke all on function private.cozy_apply_dust_delta(uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.economy_assert_account_balanced() from public,anon,authenticated,service_role;
revoke all on function private.economy_terminal_correction_immutable() from public,anon,authenticated,service_role;
revoke all on function private.economy_purchase_receipt_json(public.economy_purchase_receipts) from public,anon,authenticated,service_role;
revoke all on function private.economy_claim_admin_rate_limit(uuid,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_player_economy(text,bigint,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_economy_shop(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.run_admin_economy_reconciliation(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_economy_overview(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_economy_ledger(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.create_admin_economy_correction(uuid,uuid,text,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.review_admin_economy_correction(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.review_admin_economy_risk(uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_admin_economy_simulation(uuid,uuid,text,integer,integer,integer,jsonb,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.create_admin_economy_policy_draft(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,bigint,integer,bigint,bigint,integer,integer,numeric,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.transition_admin_economy_policy_version(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.create_admin_economy_shop_draft(uuid,uuid,text,uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.transition_admin_economy_shop_version(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.activate_approved_economy_versions(integer,text) from public,anon,authenticated,service_role;
revoke all on function public.refresh_economy_daily_metrics(date,text) from public,anon,authenticated,service_role;
revoke all on function public.run_economy_reconciliation_worker(integer,text) from public,anon,authenticated,service_role;
revoke all on function public.scan_economy_risk_signals(integer,text) from public,anon,authenticated,service_role;

grant execute on function public.get_player_economy(text,bigint,integer,text) to service_role;
grant execute on function public.get_player_economy_shop(text,text,text) to service_role;
grant execute on function public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.run_admin_economy_reconciliation(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.get_admin_economy_overview(uuid,uuid,text) to service_role;
grant execute on function public.get_admin_economy_ledger(uuid,uuid,text,text,integer,integer) to service_role;
grant execute on function public.create_admin_economy_correction(uuid,uuid,text,uuid,bigint,text,text,text) to service_role;
grant execute on function public.review_admin_economy_correction(uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.review_admin_economy_risk(uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.record_admin_economy_simulation(uuid,uuid,text,integer,integer,integer,jsonb,jsonb,text) to service_role;
grant execute on function public.create_admin_economy_policy_draft(uuid,uuid,text,uuid,boolean,boolean,boolean,boolean,bigint,integer,bigint,bigint,integer,integer,numeric,timestamptz,text) to service_role;
grant execute on function public.transition_admin_economy_policy_version(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.create_admin_economy_shop_draft(uuid,uuid,text,uuid,uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text) to service_role;
grant execute on function public.transition_admin_economy_shop_version(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.activate_approved_economy_versions(integer,text) to service_role;
grant execute on function public.refresh_economy_daily_metrics(date,text) to service_role;
grant execute on function public.run_economy_reconciliation_worker(integer,text) to service_role;
grant execute on function public.scan_economy_risk_signals(integer,text) to service_role;

comment on function public.run_admin_economy_reconciliation(uuid,uuid,text,uuid,text) is
  'Compares stored DUST balances with ledger totals and records mismatches; never rewrites balances.';
comment on function public.record_admin_economy_simulation(uuid,uuid,text,integer,integer,integer,jsonb,jsonb,text) is
  'Persists isolated deterministic simulation output; never reads or mutates individual player balances.';
