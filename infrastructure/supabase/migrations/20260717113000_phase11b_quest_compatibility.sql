-- Keep the Phase 11A farming turn-in pinned to its quest after Phase 11B adds a second quest instance.

create or replace function public.deliver_player_starter_farming_quest(
  p_wallet_address text,p_expected_quest_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; instance public.player_quest_instances%rowtype;
  version public.cozy_quest_versions%rowtype; settings public.cozy_farming_settings%rowtype;
  config public.cozy_gameplay_config%rowtype; npc public.cozy_starter_npcs%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; ledger public.player_dust_ledger%rowtype;
  request_hash text; response jsonb; incomplete_count integer;
begin
  if p_expected_quest_state_version<1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_STARTER_QUEST_DELIVERY_REQUEST';
  end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into strict settings from public.cozy_farming_settings where singleton_key;
  if not settings.starter_quest_enabled then return jsonb_build_object('status','quest_not_available'); end if;
  if not settings.tutorial_rewards_enabled then return jsonb_build_object('status','economy_settlement_failed'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'starter_quest_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into strict npc from public.cozy_starter_npcs where slug='willow-guide' and active;
  if profile.current_map_id<>(select slug from public.world_maps where id=npc.world_map_id)
     or sqrt(power(profile.safe_position_x-npc.position_x,2)+power(profile.safe_position_y-npc.position_y,2))>npc.interaction_range
    then return jsonb_build_object('status','tool_action_too_far'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_expected_quest_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':starter_quest_delivery:'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation='starter_quest_delivery'
    and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  select instance_row.* into instance
  from public.player_quest_instances instance_row
  join public.cozy_quest_versions quest_version on quest_version.id=instance_row.quest_version_id
  where instance_row.player_profile_id=profile.id
    and quest_version.quest_kind='farming_tutorial'
  for update of instance_row;
  if not found then return jsonb_build_object('status','quest_not_available'); end if;
  if instance.status='reward_claimed' then return jsonb_build_object('status','quest_reward_already_settled'); end if;
  if instance.state_version<>p_expected_quest_state_version then return jsonb_build_object('status','state_conflict'); end if;
  select * into strict version from public.cozy_quest_versions where id=instance.quest_version_id;
  select count(*) into incomplete_count
  from public.cozy_quest_objectives objective
  join public.player_quest_objective_progress progress
    on progress.quest_objective_id=objective.id and progress.player_quest_instance_id=instance.id
  where objective.objective_key not in ('deliver_produce','receive_reward')
    and progress.current_count<objective.required_count;
  if incomplete_count>0 then return jsonb_build_object('status','quest_objective_incomplete'); end if;
  if private.cozy_owned_quantity(profile.id,version.delivery_item_definition_id)<version.delivery_quantity
    then return jsonb_build_object('status','tutorial_delivery_insufficient'); end if;
  if not private.cozy_claim_farming_cooldown(profile.id,'delivery',settings.delivery_cooldown_ms)
    then return jsonb_build_object('status','tool_action_cooldown'); end if;
  begin
    if not private.cozy_remove_item(
      profile.id,version.delivery_item_definition_id,version.delivery_quantity,
      'tutorial_delivery',instance.id::text,p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='TUTORIAL_DELIVERY_FAILED'; end if;
    perform private.cozy_advance_starter_quest(
      profile.id,'tutorial_produce_delivered',instance.id,
      'phase11-delivery:'||instance.id::text,p_request_id
    );
    if not private.cozy_apply_dust_delta(
      profile.id,version.reward_dust,'starter_farming_quest_reward','starter_farming_quest',
      instance.id::text,p_idempotency_key,p_request_id
    ) then raise exception using errcode='P0001',message='TUTORIAL_DUST_SETTLEMENT_FAILED'; end if;
    select * into strict ledger from public.player_dust_ledger
    where player_profile_id=profile.id and reason='starter_farming_quest_reward'
      and reference_id=instance.id::text;
    perform private.cozy_advance_starter_quest(
      profile.id,'tutorial_reward_settled',ledger.id,
      'phase11-reward:'||instance.id::text,p_request_id
    );
    update public.player_quest_instances set
      status='reward_claimed',completed_at=now(),reward_settled_at=now(),
      reward_ledger_entry_id=ledger.id,state_version=state_version+1,last_error_code=null
    where id=instance.id returning * into instance;
  exception when raise_exception then
    update public.player_quest_instances set last_error_code='ECONOMY_SETTLEMENT_FAILED'
    where id=instance.id;
    insert into public.cozy_farming_reconciliation_queue(
      player_profile_id,player_home_id,reconciliation_type,last_error_code
    ) select profile.id,home.id,'quest_reward_settlement','ECONOMY_SETTLEMENT_FAILED'
      from public.player_homes home where home.player_profile_id=profile.id;
    return jsonb_build_object('status','economy_settlement_failed');
  end;
  response:=jsonb_build_object(
    'status','updated','view',private.cozy_playable_vertical_slice_json(profile.id),
    'replayed',false,'announcement',version.reward_dust::text||' DUST received. Tutorial complete.'
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,'starter_quest_delivery',p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

revoke all on function public.deliver_player_starter_farming_quest(text,integer,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.deliver_player_starter_farming_quest(text,integer,text,text)
  to service_role;
