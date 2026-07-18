begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','economy_source_versions','versioned DUST source catalog exists');
select has_table('public','economy_sink_versions','versioned DUST sink catalog exists');
select has_table('public','economy_policy_versions','versioned economy policy exists');
select has_table('public','economy_shop_versions','versioned shop catalog exists');
select has_table('public','economy_purchase_receipts','immutable purchase receipts exist');
select has_table('public','economy_reconciliation_runs','bounded reconciliation runs exist');
select has_table('public','economy_reconciliation_results','per-player reconciliation results exist');
select has_table('public','economy_risk_signals','review-only risk signals exist');
select has_table('public','economy_reward_quarantine','durable reward quarantine exists');
select has_table('public','economy_correction_requests','controlled correction requests exist');
select has_table('public','economy_daily_metrics','privacy-safe daily metrics exist');
select has_table('public','economy_admin_rate_limits','durable administrator economy rate limits exist');
select has_table('public','economy_simulation_runs','isolated simulation records exist');
select has_table('public','star_utility_versions','versioned read-only STAR utility boundary exists');
select has_function('public','create_admin_economy_policy_draft','structured policy draft creation exists');
select has_function('public','transition_admin_economy_policy_version','reviewed policy lifecycle exists');
select has_function('public','create_admin_economy_shop_draft','structured shop draft creation exists');
select has_function('public','update_admin_economy_shop_offer','structured shop offer editing exists');
select ok(
  (select count(*)=1
   from pg_proc routine
   join pg_namespace namespace on namespace.oid=routine.pronamespace
   where namespace.nspname='public' and routine.proname='update_admin_economy_shop_offer')
    and (select provolatile='v' and prosecdef and pronargdefaults=0
           and proconfig @> array['search_path=""']
           and pg_get_userbyid(proowner)='postgres'
         from pg_proc
         where oid='public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure)
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
  'shop-offer lint repair preserves one exact volatile SECURITY DEFINER signature, owner, empty search path, and narrow grant'
);
select ok(
  position('selected_item' in lower(pg_get_functiondef(
    'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure
  )))=0
    and position('perform 1' in lower(pg_get_functiondef(
      'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure
    )))>0
    and position('protected_or_unknown_item' in pg_get_functiondef(
      'public.update_admin_economy_shop_offer(uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text)'::regprocedure
    ))>0,
  'shop-offer lint repair removes the unused row variable and retains the closed item eligibility check'
);
select ok(
  (select count(*)=1
   from pg_proc routine
   join pg_namespace namespace on namespace.oid=routine.pronamespace
   where namespace.nspname='private' and routine.proname='resolve_avatar_selection')
    and (select provolatile='s' and prosecdef and pronargdefaults=1
           and proconfig @> array['search_path=""']
           and pg_get_userbyid(proowner)='postgres'
         from pg_proc
         where oid='private.resolve_avatar_selection(jsonb,boolean)'::regprocedure)
    and not has_function_privilege(
      'service_role','private.resolve_avatar_selection(jsonb,boolean)','execute'
    )
    and not has_function_privilege(
      'authenticated','private.resolve_avatar_selection(jsonb,boolean)','execute'
    ),
  'avatar lint repair preserves one exact stable SECURITY DEFINER signature, default, owner, empty search path, and private grant boundary'
);
select ok(
  position('configured_max_accessories' in lower(pg_get_functiondef(
    'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
  )))>0
    and position('settings.max_accessories' in lower(pg_get_functiondef(
      'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
    )))>0
    and position('select max_accessories into max_accessories' in lower(pg_get_functiondef(
      'private.resolve_avatar_selection(jsonb,boolean)'::regprocedure
    )))=0,
  'avatar lint repair uses an unambiguous qualified accessory-limit reference'
);
select has_function('public','transition_admin_economy_shop_version','reviewed shop lifecycle exists');
select has_function('public','activate_approved_economy_versions','approved effective-time activation worker exists');
select has_function('public','get_admin_economy_workspace','dedicated economy administration read model exists');
select has_function('public','get_admin_economy_ledger_filtered','bounded filtered ledger read model exists');
select has_function('public','operate_admin_economy_policy_version','explicit policy approval and scheduling lifecycle exists');
select has_function('public','operate_admin_economy_shop_version','explicit shop approval and scheduling lifecycle exists');
select ok(
  position('for key share' in lower(pg_get_functiondef(
    'private.cozy_apply_dust_delta(uuid,bigint,text,text,text,text,text)'::regprocedure
  )))>0,
  'DUST delta settlement acquires the player identity before the account to avoid purchase/reward deadlocks'
);
select ok(
  position('forshareofp,m' in replace(lower(pg_get_functiondef(
    'public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text)'::regprocedure
  )),' ',''))>0
  and position('cozy-shop-player:' in lower(pg_get_functiondef(
    'public.transact_player_shop(text,text,uuid,text,integer,integer,integer,text,text)'::regprocedure
  )))>0,
  'legacy shop settlement uses compatible identity locks and per-player serialization'
);
select ok(
  position('forshareofp,m' in replace(lower(pg_get_functiondef(
    'public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)'::regprocedure
  )),' ',''))>0
  and position('cozy-shop-player:' in lower(pg_get_functiondef(
    'public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)'::regprocedure
  )))>0,
  'hardened economy purchases use compatible identity locks and per-player serialization'
);
select has_function('private','economy_claim_admin_rate_limit','durable administrator economy rate-limit helper exists');

select has_check(
  'public','economy_source_versions','economy_source_versions_source_key_length_check',
  'source definition keys have an explicit named length boundary'
);
select has_check(
  'public','economy_policy_versions','economy_policy_versions_approval_pair_check',
  'policy approvals store an inseparable reviewer and timestamp pair'
);
select has_check(
  'public','economy_policy_versions','economy_policy_versions_schedule_pair_check',
  'policy scheduling requires a prior explicit approval'
);
select has_check(
  'public','economy_shop_versions','economy_shop_versions_approval_pair_check',
  'shop approvals store an inseparable reviewer and timestamp pair'
);
select has_check(
  'public','economy_shop_versions','economy_shop_versions_schedule_pair_check',
  'shop scheduling requires a prior explicit approval'
);
select has_check(
  'public','economy_source_versions','economy_source_versions_operation_key_length_check',
  'source operation keys have an explicit named length boundary'
);
select has_check(
  'public','economy_active_source_versions','economy_active_source_versions_source_key_length_check',
  'active source-version keys have an explicit named length boundary'
);
select has_check(
  'public','economy_sink_versions','economy_sink_versions_sink_key_length_check',
  'sink definition keys have an explicit named length boundary'
);
select has_check(
  'public','economy_sink_versions','economy_sink_versions_operation_key_length_check',
  'sink operation keys have an explicit named length boundary'
);
select has_check(
  'public','economy_active_sink_versions','economy_active_sink_versions_sink_key_length_check',
  'active sink-version keys have an explicit named length boundary'
);
select has_check(
  'public','player_dust_ledger','player_dust_ledger_operation_key_length_check',
  'canonical ledger operation keys have an explicit named length boundary'
);

select is(
  (select count(*)::integer from public.admin_permissions where key like 'economy.%'),
  13,
  'the economy catalog contains the existing read permission and twelve Phase 9A permissions'
);
select ok(
  not exists(
    select 1
    from public.admin_role_permissions mapping
    join public.admin_roles role on role.id=mapping.role_id
    join public.admin_permissions permission on permission.id=mapping.permission_id
    where role.key='read_only_analyst'
      and permission.key not like '%.read'
      and permission.key not like '%.inspect'
  ),
  'Read-only Analyst retains zero non-read permissions'
);
select ok(
  not exists(
    select 1
    from public.admin_role_permissions mapping
    join public.admin_roles role on role.id=mapping.role_id
    join public.admin_permissions permission on permission.id=mapping.permission_id
    where role.key='blockchain_operator' and permission.key like 'economy.%'
  ),
  'Blockchain Operator has no off-chain economy authority'
);

select is(
  (select array_agg(source_key order by source_key) from public.economy_active_source_versions),
  array['administrative-correction-credit','moonpetal-harvest-help','shop-sale','starter-grant','system-refund']::text[],
  'only the exact implemented and administrative source set is active'
);
select is(
  (select array_agg(sink_key order by sink_key) from public.economy_active_sink_versions),
  array['administrative-correction-debit','village-supply-shop']::text[],
  'only the reviewed correction and real Village Supply Shop sinks are active'
);
select ok(
  exists(
    select 1 from public.economy_source_versions
    where source_key='moonpetal-harvest-help' and daily_limit=2 and cooldown_seconds=300
      and lifecycle_status='published'
  ),
  'Moonpetal current two-per-day and 300-second controls are cataloged'
);
select ok(
  exists(
    select 1 from public.economy_policy_versions policy
    join public.economy_active_policy active on active.policy_version_id=policy.id
    where active.singleton_key and policy.lifecycle_status='published'
      and policy.starter_grant=250 and policy.reconciliation_tolerance=0
  ),
  'the published baseline preserves the current starter balance and exact reconciliation'
);
select ok(
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
  'all existing published and retained source and sink definitions satisfy the repaired boundary'
);

select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class
   where oid in (
     'public.economy_source_versions'::regclass,
     'public.economy_active_source_versions'::regclass,
     'public.economy_sink_versions'::regclass,
     'public.economy_active_sink_versions'::regclass,
     'public.economy_policy_versions'::regclass,
     'public.economy_active_policy'::regclass,
     'public.economy_shop_versions'::regclass,
     'public.economy_shop_version_offers'::regclass,
     'public.economy_active_shop_versions'::regclass,
     'public.economy_purchase_receipts'::regclass,
     'public.economy_reconciliation_runs'::regclass,
     'public.economy_reconciliation_results'::regclass,
     'public.economy_risk_signals'::regclass,
     'public.economy_reward_quarantine'::regclass,
     'public.economy_correction_requests'::regclass,
     'public.economy_daily_metrics'::regclass,
     'public.economy_admin_rate_limits'::regclass,
     'public.economy_simulation_runs'::regclass,
     'public.star_utility_versions'::regclass,
     'public.star_utility_active_version'::regclass
   )),
  'all Phase 9A authority tables force RLS'
);
select ok(
  not exists(select 1 from pg_policies where schemaname='public' and (tablename like 'economy_%' or tablename like 'star_utility_%')),
  'economy tables expose no direct browser policies'
);
select ok(
  not has_table_privilege('service_role','public.player_dust_accounts','update')
    and not has_table_privilege('service_role','public.player_dust_ledger','insert')
    and not has_table_privilege('service_role','public.economy_purchase_receipts','insert')
    and not has_table_privilege('authenticated','public.economy_policy_versions','select'),
  'trusted services and browsers receive no direct economy table mutation authority'
);

select ok(
  has_function_privilege('service_role','public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)','execute')
    and not has_function_privilege('authenticated','public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)','execute'),
  'only the trusted server may call authoritative shop settlement'
);
select ok(
  has_function_privilege('service_role','public.run_economy_reconciliation_worker(integer,text)','execute')
    and not has_function_privilege('public','public.run_economy_reconciliation_worker(integer,text)','execute'),
  'only the trusted worker may run reconciliation'
);
select ok(
  has_function_privilege('service_role','public.get_admin_economy_workspace(uuid,uuid,text,text,uuid,text,integer,integer)','execute')
    and not has_function_privilege('authenticated','public.get_admin_economy_workspace(uuid,uuid,text,text,uuid,text,integer,integer)','execute')
    and has_function_privilege('service_role','public.operate_admin_economy_policy_version(uuid,uuid,text,uuid,integer,text,timestamptz,text)','execute')
    and has_function_privilege('service_role','public.operate_admin_economy_shop_version(uuid,uuid,text,uuid,integer,text,timestamptz,text)','execute')
    and not has_function_privilege('service_role','public.transition_admin_economy_policy_version(uuid,uuid,text,uuid,integer,text,text)','execute')
    and not has_function_privilege('service_role','public.transition_admin_economy_shop_version(uuid,uuid,text,uuid,integer,text,text)','execute'),
  'the trusted API receives only the reviewed Phase 9A.1 lifecycle and read functions'
);
select ok(
  position('''dust_read''' in pg_get_functiondef('public.get_player_economy(text,bigint,integer,text)'::regprocedure))>0
    and position('''shop_read''' in pg_get_functiondef('public.get_player_economy_shop(text,text,text)'::regprocedure))>0,
  'player economy reads reuse valid bounded cozy-gameplay rate-limit scopes'
);
select ok(
  (select provolatile='v' and prosecdef and proconfig @> array['search_path=""']
   from pg_proc where oid='public.purchase_player_economy_shop(text,text,uuid,integer,bigint,uuid,integer,integer,integer,text,text)'::regprocedure),
  'purchase authority is truthfully volatile, SECURITY DEFINER, and has an empty search path'
);
select ok(
  (select count(*)=1 from pg_proc routine join pg_namespace namespace on namespace.oid=routine.pronamespace
   where namespace.nspname='public' and routine.proname='purchase_player_economy_shop'),
  'shop purchase has one PostgREST-compatible signature and no obsolete overload'
);

select ok(
  exists(select 1 from pg_trigger where tgrelid='public.player_dust_ledger'::regclass and tgname='player_dust_ledger_append_only' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgrelid='public.economy_purchase_receipts'::regclass and tgname='economy_purchase_receipts_immutable' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgrelid='public.economy_policy_versions'::regclass and tgname='economy_policy_versions_published_immutable' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgrelid='public.economy_shop_versions'::regclass and tgname='economy_shop_versions_published_immutable' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgrelid='public.economy_shop_version_offers'::regclass and tgname='economy_shop_version_offers_published_immutable' and not tgisinternal),
  'ledger entries, receipts, and published configuration are immutable'
);
select ok(
  exists(select 1 from pg_trigger where tgrelid='public.player_dust_accounts'::regclass and tgname='player_dust_accounts_balanced' and tgdeferrable)
    and exists(select 1 from pg_trigger where tgrelid='public.player_dust_ledger'::regclass and tgname='player_dust_ledger_balanced' and tgdeferrable),
  'deferrable account-ledger consistency guards cover both authority sides'
);
select ok(
  position('autoCorrected' in pg_get_functiondef('public.run_economy_reconciliation_worker(integer,text)'::regprocedure))>0
    and position('''automaticPlayerActions'',0' in replace(pg_get_functiondef('public.scan_economy_risk_signals(integer,text)'::regprocedure),' ',''))>0,
  'reconciliation never rewrites balances and heuristics never take automatic player action'
);
select ok(
  not exists(
    select 1 from information_schema.routines
    where routine_schema in ('public','private') and routine_name like '%economy%'
      and lower(routine_definition) ~ '(token_transfer|transfer_star|burn_token|stake_token|dust_to_star|star_to_dust)'
  ),
  'Phase 9A economy routines contain no on-chain transfer or conversion authority'
);

select * from finish();
rollback;
