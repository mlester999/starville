-- Starville Phase 8D-B: narrow cooperative-activity RPC authority.

create or replace function private.cooperative_activity_active_session(p_session_id uuid)
returns public.realtime_sessions language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.cooperative_activity_settings%rowtype;
begin
  session := private.social_graph_active_session(p_session_id);
  select * into strict settings from public.cooperative_activity_settings where singleton_key;
  if not settings.module_enabled then
    raise exception using errcode = '28000', message = 'COOPERATIVE_ACTIVITY_MODULE_DISABLED';
  end if;
  return session;
exception
  when sqlstate '28000' then
    if sqlerrm = 'SOCIAL_GRAPH_MAINTENANCE' then
      raise exception using errcode = '28000', message = 'COOPERATIVE_ACTIVITY_MAINTENANCE';
    end if;
    raise;
end;
$$;

create or replace function private.cooperative_activity_version_json(version public.cooperative_activity_versions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'versionId', version.id,
    'activityKey', definition.activity_key,
    'name', version.name,
    'shortDescription', version.short_description,
    'longDescription', version.long_description,
    'category', version.category,
    'status', version.lifecycle_status,
    'minimumPartySize', version.minimum_party_size,
    'maximumPartySize', version.maximum_party_size,
    'recommendedLevel', version.recommended_level,
    'durationSeconds', version.duration_seconds,
    'reconnectGraceSeconds', version.reconnect_grace_seconds,
    'waitingForPlayersSeconds', version.waiting_for_players_seconds,
    'entryWorldId', map.slug,
    'entryWorldName', map.display_name,
    'entryInteractionKey', version.entry_interaction_key,
    'sceneRef', version.scene_ref,
    'objectives', version.objective_definitions,
    'reward', version.reward_definition,
    'entryCooldownSeconds', version.entry_cooldown_seconds,
    'rewardCooldownSeconds', version.reward_cooldown_seconds,
    'dailyRewardLimit', version.daily_reward_limit,
    'requiredModules', to_jsonb(version.required_modules),
    'requiredAssets', to_jsonb(version.required_assets),
    'contentVersion', version.content_version,
    'revision', version.revision,
    'publishedAt', version.published_at
  )
  from public.cooperative_activity_definitions definition
  join public.world_maps map on map.id = version.entry_world_map_id
  where definition.id = version.activity_definition_id;
$$;

create or replace function private.cooperative_activity_preparation_json(
  preparation public.cooperative_activity_entry_preparations
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'preparationId', preparation.public_preparation_id,
    'activity', private.cooperative_activity_version_json(version),
    'partyRevision', ready.party_revision,
    'readyCheckId', ready.public_ready_check_id,
    'status', case
      when preparation.status = 'ready_check' and ready.status = 'completed' then 'ready'
      when preparation.status = 'ready_check' and ready.status in ('expired', 'invalidated') then ready.status
      else preparation.status
    end,
    'expiresAt', least(preparation.expires_at, ready.expires_at),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'presenceId', profile.public_presence_id,
        'displayName', profile.display_name,
        'state', response.state
      ) order by profile.public_presence_id)
      from public.player_party_ready_responses response
      join public.player_profiles profile on profile.id = response.player_profile_id
      where response.ready_check_id = ready.id
    ), '[]'::jsonb)
  )
  from public.cooperative_activity_versions version
  join public.player_party_ready_checks ready on ready.id = preparation.ready_check_id
  where version.id = preparation.activity_version_id;
$$;

create or replace function private.cooperative_activity_receipt_json(
  receipt public.cooperative_activity_reward_receipts
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'receiptId', receipt.public_receipt_id,
    'status', receipt.status,
    'dust', receipt.dust_amount,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('itemSlug', item.slug, 'quantity', reward_item.quantity)
        order by item.slug)
      from public.cooperative_activity_reward_items reward_item
      join public.cozy_item_definitions item on item.id = reward_item.item_definition_id
      where reward_item.reward_receipt_id = receipt.id
    ), '[]'::jsonb),
    'settledAt', receipt.settled_at,
    'dailyRewardNumber', receipt.daily_reward_number
  );
$$;

create or replace function private.cooperative_activity_snapshot_json(
  instance public.cooperative_activity_instances,
  p_viewer_profile_id uuid
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'instanceId', instance.public_instance_id,
    'activity', private.cooperative_activity_version_json(version),
    'status', instance.status,
    'revision', instance.revision,
    'currentObjectiveKey', instance.current_objective_key,
    'objectives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', objective.objective_key,
        'label', objective.label,
        'type', objective.objective_type,
        'current', objective.current_progress,
        'target', objective.target,
        'status', objective.status,
        'startedAt', objective.started_at,
        'completedAt', objective.completed_at,
        'timerEndsAt', objective.timer_ends_at
      ) order by objective.sequence_number)
      from public.cooperative_activity_objectives objective
      where objective.instance_id = instance.id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'presenceId', profile.public_presence_id,
        'displayName', profile.display_name,
        'level', profile.public_level,
        'connectionStatus', participant.connection_status,
        'contribution', participant.contribution,
        'rewardEligible', participant.reward_eligible,
        'reconnectDeadline', participant.reconnect_deadline
      ) order by participant.joined_at, profile.public_presence_id)
      from public.cooperative_activity_participants participant
      join public.player_profiles profile on profile.id = participant.player_profile_id
      where participant.instance_id = instance.id
    ), '[]'::jsonb),
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', object.object_key,
        'interactionKey', object.interaction_key,
        'label', object.label,
        'objectType', object.object_type,
        'x', object.position_x,
        'y', object.position_y,
        'interactionRange', object.interaction_range,
        'active', object.active and not exists (
          select 1 from public.cooperative_activity_progress_events event
          where event.instance_id = instance.id
            and event.objective_key = instance.current_objective_key
            and event.object_key = object.object_key
        )
      ) order by object.object_key)
      from public.cooperative_activity_objects object
      where object.activity_version_id = instance.activity_version_id and object.active
    ), '[]'::jsonb),
    'personalContribution', coalesce((
      select participant.contribution from public.cooperative_activity_participants participant
      where participant.instance_id = instance.id and participant.player_profile_id = p_viewer_profile_id
    ), 0),
    'temporaryItemCount', coalesce((
      select sum(item.quantity)::integer from public.cooperative_activity_temporary_items item
      where item.instance_id = instance.id and item.player_profile_id = p_viewer_profile_id
    ), 0),
    'startedAt', instance.started_at,
    'expiresAt', instance.expires_at,
    'pausedAt', instance.paused_at,
    'completedAt', instance.completed_at,
    'resultCode', instance.result_code,
    'receipts', coalesce((
      select jsonb_agg(private.cooperative_activity_receipt_json(receipt) order by receipt.settled_at)
      from public.cooperative_activity_reward_receipts receipt
      join public.cooperative_activity_completions completion on completion.id = receipt.completion_id
      where completion.instance_id = instance.id and receipt.player_profile_id = p_viewer_profile_id
    ), '[]'::jsonb),
    'spawn', jsonb_build_object('x', 10, 'y', 13)
  )
  from public.cooperative_activity_versions version
  where version.id = instance.activity_version_id;
$$;

create or replace function private.cooperative_activity_replay(
  p_player_profile_id uuid, p_operation text, p_client_request_id text, p_request_hash text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare stored public.cooperative_activity_idempotency%rowtype;
begin
  select * into stored from public.cooperative_activity_idempotency
  where player_profile_id = p_player_profile_id and operation = p_operation
    and client_request_id = p_client_request_id;
  if not found then return null; end if;
  if stored.request_hash <> p_request_hash then
    raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_IDEMPOTENCY_CONFLICT';
  end if;
  return stored.response;
end;
$$;

create or replace function private.cooperative_activity_store_replay(
  p_player_profile_id uuid, p_operation text, p_client_request_id text,
  p_request_hash text, p_response jsonb
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.cooperative_activity_idempotency (
    player_profile_id, operation, client_request_id, request_hash, response
  ) values (p_player_profile_id, p_operation, p_client_request_id, p_request_hash, p_response)
  on conflict (player_profile_id, operation, client_request_id) do nothing;
end;
$$;

create or replace function private.cooperative_activity_rate_allowed(
  p_player_profile_id uuid, p_operation text, p_limit integer, p_window_seconds integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare rate public.cooperative_activity_rate_limits%rowtype;
begin
  select * into rate from public.cooperative_activity_rate_limits
  where player_profile_id = p_player_profile_id and operation = p_operation for update;
  if not found or rate.window_expires_at <= now() then
    insert into public.cooperative_activity_rate_limits (
      player_profile_id, operation, attempt_count, window_started_at, window_expires_at
    ) values (
      p_player_profile_id, p_operation, 1, now(), now() + make_interval(secs => p_window_seconds)
    ) on conflict (player_profile_id, operation) do update set
      attempt_count = 1, window_started_at = excluded.window_started_at,
      window_expires_at = excluded.window_expires_at;
    return true;
  end if;
  if rate.attempt_count >= p_limit then return false; end if;
  update public.cooperative_activity_rate_limits set attempt_count = attempt_count + 1
  where player_profile_id = p_player_profile_id and operation = p_operation;
  return true;
end;
$$;

create or replace function private.cooperative_activity_active_instance(p_player_profile_id uuid)
returns public.cooperative_activity_instances language sql stable security definer set search_path = '' as $$
  select instance.*
  from public.cooperative_activity_participants participant
  join public.cooperative_activity_instances instance on instance.id = participant.instance_id
  where participant.player_profile_id = p_player_profile_id
    and participant.connection_status <> 'removed'
    and instance.status in ('preparing', 'waiting_for_players', 'active', 'paused')
  limit 1;
$$;

create or replace function private.cooperative_activity_availability(
  p_player_profile_id uuid, version public.cooperative_activity_versions
)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare member public.player_party_members%rowtype; party public.player_parties%rowtype;
  settings public.cooperative_activity_settings%rowtype; cooldown public.cooperative_activity_cooldowns%rowtype;
  active_instance public.cooperative_activity_instances%rowtype;
  member_count integer; utc_day date := (now() at time zone 'utc')::date;
begin
  select * into strict settings from public.cooperative_activity_settings where singleton_key;
  if not settings.module_enabled then return 'module_disabled'; end if;
  select * into active_instance from private.cooperative_activity_active_instance(p_player_profile_id);
  if active_instance.id is not null then return 'already_active'; end if;
  select * into member from public.player_party_members
  where player_profile_id = p_player_profile_id and status = 'active';
  if not found then return 'party_required'; end if;
  select * into party from public.player_parties where id = member.party_id and status = 'active';
  if not found then return 'party_required'; end if;
  if member.role <> 'leader' then return 'leader_required'; end if;
  select count(*)::integer into member_count from public.player_party_members
  where party_id = party.id and status = 'active';
  if member_count not between version.minimum_party_size and version.maximum_party_size then return 'party_size'; end if;
  select * into cooldown from public.cooperative_activity_cooldowns
  where player_profile_id = p_player_profile_id and activity_definition_id = version.activity_definition_id;
  if found and cooldown.entry_available_at > now() then return 'cooldown'; end if;
  if found and cooldown.reward_day = utc_day
     and cooldown.rewarded_completions >= version.daily_reward_limit then return 'daily_limit'; end if;
  return 'available';
end;
$$;

create or replace function private.cooperative_activity_catalog_json(p_player_profile_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare activities jsonb; utc_day date := (now() at time zone 'utc')::date;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'activity', private.cooperative_activity_version_json(version),
    'availability', private.cooperative_activity_availability(p_player_profile_id, version),
    'availableAt', case
      when cooldown.entry_available_at > now() then cooldown.entry_available_at
      when cooldown.reward_available_at > now() then cooldown.reward_available_at
      else null end,
    'rewardedCompletionsToday', case when cooldown.reward_day = utc_day then cooldown.rewarded_completions else 0 end,
    'partyEligible', private.cooperative_activity_availability(p_player_profile_id, version) in ('available', 'leader_required'),
    'leader', exists (
      select 1 from public.player_party_members member
      where member.player_profile_id = p_player_profile_id and member.status = 'active' and member.role = 'leader'
    )
  ) order by definition.activity_key), '[]'::jsonb) into activities
  from public.cooperative_activity_active_versions active
  join public.cooperative_activity_versions version on version.id = active.activity_version_id
  join public.cooperative_activity_definitions definition on definition.id = version.activity_definition_id
  left join public.cooperative_activity_cooldowns cooldown
    on cooldown.player_profile_id = p_player_profile_id
   and cooldown.activity_definition_id = version.activity_definition_id
  where active.enabled and version.lifecycle_status = 'published';
  return jsonb_build_object('generatedAt', now(), 'activities', activities);
end;
$$;

create or replace function private.cooperative_activity_fail(
  p_instance_id uuid, p_result_code text, p_request_id text
)
returns public.cooperative_activity_instances language plpgsql volatile security definer set search_path = '' as $$
declare instance public.cooperative_activity_instances%rowtype;
begin
  select * into strict instance from public.cooperative_activity_instances where id = p_instance_id for update;
  if instance.status not in ('preparing', 'waiting_for_players', 'active', 'paused') then return instance; end if;
  update public.cooperative_activity_instances set
    status = case when p_result_code = 'activity_expired' then 'expired' else 'failed' end,
    current_objective_key = null, revision = revision + 1, checkpoint_version = checkpoint_version + 1,
    completed_at = now(), result_code = p_result_code, reward_settlement_status = 'not_applicable'
  where id = instance.id returning * into instance;
  update public.cooperative_activity_participants set reward_eligible = false,
    connection_status = case when connection_status = 'removed' then connection_status else 'offline' end
  where instance_id = instance.id;
  delete from public.cooperative_activity_temporary_items where instance_id = instance.id;
  insert into public.cooperative_activity_audit (
    instance_id, activity_version_id, action, result, request_id, revision, details
  ) values (
    instance.id, instance.activity_version_id, 'instance_failed', p_result_code,
    p_request_id, instance.revision, jsonb_build_object('resultCode', p_result_code)
  );
  return instance;
end;
$$;

create or replace function private.cooperative_activity_advance(p_instance_id uuid, p_request_id text)
returns public.cooperative_activity_instances language plpgsql volatile security definer set search_path = '' as $$
declare instance public.cooperative_activity_instances%rowtype; objective public.cooperative_activity_objectives%rowtype;
  next_objective public.cooperative_activity_objectives%rowtype; active_count integer;
begin
  select * into strict instance from public.cooperative_activity_instances where id = p_instance_id for update;
  if instance.status not in ('waiting_for_players', 'active', 'paused') then return instance; end if;
  if instance.expires_at <= now() then
    return private.cooperative_activity_fail(instance.id, 'activity_expired', p_request_id);
  end if;
  select count(*)::integer into active_count from public.cooperative_activity_participants
  where instance_id = instance.id and connection_status = 'online' and reward_eligible;
  if active_count < instance.minimum_active_participants and instance.status = 'active'
     and not exists (
       select 1 from public.cooperative_activity_participants
       where instance_id = instance.id and connection_status = 'reconnecting'
         and reconnect_deadline > now() and reward_eligible
     ) then
    return private.cooperative_activity_fail(instance.id, 'insufficient_participants', p_request_id);
  end if;
  select * into objective from public.cooperative_activity_objectives
  where instance_id = instance.id and objective_key = instance.current_objective_key for update;
  if found and objective.objective_type = 'timed_wait' and objective.status = 'active'
     and objective.timer_ends_at <= now() then
    update public.cooperative_activity_objectives set current_progress = target,
      status = 'completed', completed_at = now() where instance_id = instance.id
      and objective_key = objective.objective_key;
    select * into next_objective from public.cooperative_activity_objectives
    where instance_id = instance.id and sequence_number = objective.sequence_number + 1 for update;
    if found then
      update public.cooperative_activity_objectives set status = 'active', started_at = now()
      where instance_id = instance.id and objective_key = next_objective.objective_key;
      update public.cooperative_activity_instances set current_objective_key = next_objective.objective_key,
        revision = revision + 1, checkpoint_version = checkpoint_version + 1
      where id = instance.id returning * into instance;
    end if;
    insert into public.cooperative_activity_audit (
      instance_id, activity_version_id, action, result, request_id, revision, details
    ) values (instance.id, instance.activity_version_id, 'timer_completed', 'advanced', p_request_id,
      instance.revision, jsonb_build_object('objectiveKey', objective.objective_key));
  end if;
  return instance;
end;
$$;

create or replace function private.cooperative_activity_settle(p_instance_id uuid, p_request_id text)
returns public.cooperative_activity_instances language plpgsql volatile security definer set search_path = '' as $$
declare instance public.cooperative_activity_instances%rowtype; version public.cooperative_activity_versions%rowtype;
  definition public.cooperative_activity_definitions%rowtype; completion public.cooperative_activity_completions%rowtype;
  participant public.cooperative_activity_participants%rowtype; receipt public.cooperative_activity_reward_receipts%rowtype;
  cooldown public.cooperative_activity_cooldowns%rowtype; reward_item jsonb; item public.cozy_item_definitions%rowtype;
  moderation public.player_moderation_states%rowtype; dust_amount bigint; minimum_contribution integer;
  item_added boolean; pending_exists boolean := false; daily_number integer; utc_day date := (now() at time zone 'utc')::date;
begin
  select * into strict instance from public.cooperative_activity_instances where id = p_instance_id for update;
  if instance.status = 'completed' then return instance; end if;
  if instance.status <> 'active' then return instance; end if;
  select * into strict version from public.cooperative_activity_versions where id = instance.activity_version_id;
  select * into strict definition from public.cooperative_activity_definitions where id = version.activity_definition_id;
  dust_amount := (version.reward_definition ->> 'dust')::bigint;
  minimum_contribution := (version.reward_definition ->> 'minimumContribution')::integer;

  insert into public.cooperative_activity_completions (
    instance_id, activity_version_id, party_public_id, duration_seconds, result
  ) values (
    instance.id, instance.activity_version_id, instance.party_public_id,
    least(3600, greatest(0, extract(epoch from now() - instance.started_at)::integer)), 'completed'
  ) returning * into completion;

  for participant in select * from public.cooperative_activity_participants
    where instance_id = instance.id order by player_profile_id for update
  loop
    select * into strict moderation from public.player_moderation_states
    where player_profile_id = participant.player_profile_id for share;
    insert into public.cooperative_activity_cooldowns (
      player_profile_id, activity_definition_id, entry_available_at, reward_available_at,
      reward_day, rewarded_completions
    ) values (
      participant.player_profile_id, definition.id, now(), now(), utc_day, 0
    ) on conflict (player_profile_id, activity_definition_id) do nothing;
    select * into strict cooldown from public.cooperative_activity_cooldowns
    where player_profile_id = participant.player_profile_id
      and activity_definition_id = definition.id for update;
    if cooldown.reward_day <> utc_day then
      update public.cooperative_activity_cooldowns set reward_day = utc_day, rewarded_completions = 0
      where player_profile_id = participant.player_profile_id and activity_definition_id = definition.id
      returning * into cooldown;
    end if;
    if not participant.reward_eligible or participant.connection_status = 'removed'
       or participant.contribution < minimum_contribution or moderation.status = 'suspended'
       or cooldown.reward_available_at > now() or cooldown.rewarded_completions >= version.daily_reward_limit then
      insert into public.cooperative_activity_reward_receipts (
        completion_id, player_profile_id, status, dust_amount, daily_reward_number, ineligibility_reason
      ) values (
        completion.id, participant.player_profile_id, 'ineligible', 0,
        cooldown.rewarded_completions,
        case
          when moderation.status = 'suspended' then 'suspended'
          when participant.connection_status = 'removed' then 'removed'
          when participant.contribution < minimum_contribution then 'minimum_contribution'
          when cooldown.rewarded_completions >= version.daily_reward_limit then 'daily_limit'
          else 'cooldown' end
      );
      continue;
    end if;
    daily_number := cooldown.rewarded_completions + 1;
    perform 1 from public.player_dust_accounts where player_profile_id = participant.player_profile_id for update;
    perform 1 from public.player_inventory_state where player_profile_id = participant.player_profile_id for update;
    if dust_amount > 0 and not private.cozy_apply_dust_delta(
      participant.player_profile_id, dust_amount, 'cooperative_activity_reward',
      'cooperative_activity', completion.public_completion_id::text,
      'activity-dust-' || completion.public_completion_id::text, p_request_id
    ) then raise exception using errcode = '40001', message = 'COOPERATIVE_ACTIVITY_DUST_SETTLEMENT_FAILED'; end if;
    pending_exists := exists (
      select 1
      from jsonb_array_elements(version.reward_definition -> 'items') reward_preview
      join public.cozy_item_definitions item_preview on item_preview.slug = reward_preview ->> 'itemSlug'
      where not private.cozy_can_add_item(
        participant.player_profile_id, item_preview.id, (reward_preview ->> 'quantity')::integer
      )
    );
    insert into public.cooperative_activity_reward_receipts (
      completion_id, player_profile_id, status, dust_amount, daily_reward_number
    ) values (
      completion.id, participant.player_profile_id,
      case when pending_exists then 'pending_inventory' else 'settled' end,
      dust_amount, daily_number
    ) returning * into receipt;
    for reward_item in select value from jsonb_array_elements(version.reward_definition -> 'items') loop
      select * into strict item from public.cozy_item_definitions
      where slug = reward_item ->> 'itemSlug' and active for share;
      item_added := private.cozy_add_item(
        participant.player_profile_id, item.id, (reward_item ->> 'quantity')::integer,
        'cooperative_activity_reward', completion.public_completion_id::text,
        'activity-item-' || completion.public_completion_id::text || '-' || item.slug,
        p_request_id
      );
      if not item_added then
        insert into public.cooperative_activity_pending_rewards (
          reward_receipt_id, player_profile_id, item_definition_id, quantity
        ) values (receipt.id, participant.player_profile_id, item.id, (reward_item ->> 'quantity')::integer);
      end if;
      insert into public.cooperative_activity_reward_items (
        reward_receipt_id, item_definition_id, quantity, status
      ) values (
        receipt.id, item.id, (reward_item ->> 'quantity')::integer,
        case when item_added then 'settled' else 'pending_inventory' end
      );
    end loop;
    update public.cooperative_activity_cooldowns set
      entry_available_at = now() + make_interval(secs => version.entry_cooldown_seconds),
      reward_available_at = now() + make_interval(secs => version.reward_cooldown_seconds),
      rewarded_completions = daily_number
    where player_profile_id = participant.player_profile_id and activity_definition_id = definition.id;
  end loop;

  update public.cooperative_activity_instances set status = 'completed', current_objective_key = null,
    revision = revision + 1, checkpoint_version = checkpoint_version + 1,
    completed_at = now(), result_code = 'community_harvest_complete', reward_settlement_status = 'settled'
  where id = instance.id returning * into instance;
  update public.cooperative_activity_participants set connection_status = 'offline', reconnect_deadline = null
  where instance_id = instance.id and connection_status <> 'removed';
  delete from public.cooperative_activity_temporary_items where instance_id = instance.id;
  insert into public.cooperative_activity_audit (
    instance_id, activity_version_id, action, result, request_id, revision,
    details
  ) values (
    instance.id, instance.activity_version_id, 'reward_settlement_completed', 'settled',
    p_request_id, instance.revision, jsonb_build_object('completionId', completion.public_completion_id)
  );
  return instance;
end;
$$;

create or replace function public.get_realtime_cooperative_activity_bootstrap(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  preparation public.cooperative_activity_entry_preparations%rowtype;
  instance public.cooperative_activity_instances%rowtype;
begin
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  select prepared.* into preparation
  from public.cooperative_activity_entry_preparations prepared
  join public.player_party_members member on member.party_id = prepared.party_id
  where member.player_profile_id = actor.id and member.status = 'active'
    and prepared.status in ('ready_check', 'ready') and prepared.expires_at > now()
  order by prepared.created_at desc limit 1;
  select * into instance from private.cooperative_activity_active_instance(actor.id);
  if instance.id is null then
    select activity_instance.* into instance
    from public.cooperative_activity_participants participant
    join public.cooperative_activity_instances activity_instance on activity_instance.id = participant.instance_id
    where participant.player_profile_id = actor.id and participant.connection_status <> 'removed'
      and activity_instance.status in ('completed','failed','cancelled','expired','abandoned')
      and activity_instance.completed_at > now() - interval '10 minutes'
    order by activity_instance.completed_at desc limit 1;
  end if;
  if instance.id is not null then
    instance := private.cooperative_activity_advance(instance.id, 'bootstrap-' || p_session_id::text);
    if instance.status in ('waiting_for_players','active','paused') then
      update public.cooperative_activity_participants set connection_status = 'online',
        reconnect_deadline = null, last_active_at = now()
      where instance_id = instance.id and player_profile_id = actor.id and connection_status <> 'removed';
    end if;
  end if;
  return jsonb_build_object(
    'catalog', private.cooperative_activity_catalog_json(actor.id),
    'preparation', case when preparation.id is null then null else private.cooperative_activity_preparation_json(preparation) end,
    'instance', case when instance.id is null then null else private.cooperative_activity_snapshot_json(instance, actor.id) end
  );
end;
$$;

create or replace function public.prepare_realtime_cooperative_activity_entry(
  p_session_id uuid, p_activity_key text, p_expected_party_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype; party public.player_parties%rowtype;
  version public.cooperative_activity_versions%rowtype; ready public.player_party_ready_checks%rowtype;
  preparation public.cooperative_activity_entry_preparations%rowtype; graph_settings public.social_graph_settings%rowtype;
  replay jsonb; response jsonb; request_hash text; member_count integer; candidate record;
  active_instance public.cooperative_activity_instances%rowtype;
begin
  if p_activity_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or p_expected_party_revision < 1
     or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_ENTRY';
  end if;
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_activity_key || ':' || p_expected_party_revision::text;
  replay := private.cooperative_activity_replay(actor.id, 'entry_prepare', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  if not private.cooperative_activity_rate_allowed(actor.id, 'entry_prepare', 8, 3600) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found then response := jsonb_build_object('status', 'party_required');
  elsif member.role <> 'leader' then response := jsonb_build_object('status', 'leader_required');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    select version_row.* into version
    from public.cooperative_activity_definitions definition
    join public.cooperative_activity_active_versions active on active.activity_definition_id = definition.id and active.enabled
    join public.cooperative_activity_versions version_row on version_row.id = active.activity_version_id
    where definition.activity_key = p_activity_key and version_row.lifecycle_status = 'published';
    if not found then response := jsonb_build_object('status', 'activity_unavailable');
    elsif party.revision <> p_expected_party_revision then response := jsonb_build_object('status', 'party_changed');
    else
      select * into active_instance from private.cooperative_activity_active_instance(actor.id);
      if active_instance.id is not null then response := jsonb_build_object('status', 'already_active');
      else
      select count(*)::integer into member_count from public.player_party_members
      where party_id = party.id and status = 'active';
      if member_count not between version.minimum_party_size and version.maximum_party_size then
        response := jsonb_build_object('status', 'party_size');
      elsif exists (
        select 1 from public.player_party_members party_member
        join public.player_moderation_states moderation on moderation.player_profile_id = party_member.player_profile_id
        where party_member.party_id = party.id and party_member.status = 'active'
          and (party_member.connection_status <> 'online' or moderation.status = 'suspended' or moderation.rename_required)
      ) or exists (
        select 1 from public.player_party_members left_member
        join public.player_party_members right_member on right_member.party_id = left_member.party_id
          and right_member.player_profile_id > left_member.player_profile_id and right_member.status = 'active'
        where left_member.party_id = party.id and left_member.status = 'active'
          and private.social_graph_pair_blocked(left_member.player_profile_id, right_member.player_profile_id)
      ) or exists (
        select 1 from public.player_party_members party_member
        join public.player_inventory_reservations reservation on reservation.player_profile_id = party_member.player_profile_id
        where party_member.party_id = party.id and party_member.status = 'active' and reservation.expires_at > now()
      ) or exists (
        select 1 from public.player_party_members party_member
        join public.cooperative_activity_participants participant on participant.player_profile_id = party_member.player_profile_id
          and participant.connection_status <> 'removed'
        join public.cooperative_activity_instances activity_run on activity_run.id = participant.instance_id
          and activity_run.status in ('preparing','waiting_for_players','active','paused')
        where party_member.party_id = party.id and party_member.status = 'active'
      ) then response := jsonb_build_object('status', 'entry_conflict');
      else
        for candidate in
          select party_member.player_profile_id
          from public.player_party_members party_member
          where party_member.party_id = party.id and party_member.status = 'active'
          order by party_member.player_profile_id
        loop
          insert into public.cooperative_activity_cooldowns (
            player_profile_id, activity_definition_id
          ) values (candidate.player_profile_id, version.activity_definition_id)
          on conflict (player_profile_id, activity_definition_id) do nothing;
          if exists (
            select 1 from public.cooperative_activity_cooldowns cooldown
            where cooldown.player_profile_id = candidate.player_profile_id
              and cooldown.activity_definition_id = version.activity_definition_id
              and (cooldown.entry_available_at > now() or cooldown.reward_available_at > now() or (
                cooldown.reward_day = (now() at time zone 'utc')::date
                and cooldown.rewarded_completions >= version.daily_reward_limit
              ))
          ) then response := jsonb_build_object('status', 'cooldown'); exit; end if;
        end loop;
        if response is null then
          update public.cooperative_activity_entry_preparations set status = 'invalidated', resolved_at = now()
          where party_id = party.id and status in ('ready_check', 'ready');
          perform private.social_graph_invalidate_ready_check(party.id, actor.id, p_client_request_id, party.revision);
          select * into strict graph_settings from public.social_graph_settings where singleton_key;
          update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
          insert into public.player_party_ready_checks (
            party_id, party_revision, created_by_profile_id, expires_at
          ) values (
            party.id, party.revision, actor.id,
            now() + make_interval(secs => graph_settings.ready_check_expiry_seconds)
          ) returning * into ready;
          insert into public.player_party_ready_responses (ready_check_id, player_profile_id, state)
          select ready.id, party_member.player_profile_id,
            case when party_member.connection_status = 'online' then 'waiting' else 'disconnected' end
          from public.player_party_members party_member
          where party_member.party_id = party.id and party_member.status = 'active';
          insert into public.cooperative_activity_entry_preparations (
            activity_version_id, party_id, party_revision, ready_check_id, leader_profile_id, expires_at
          ) values (
            version.id, party.id, party.revision, ready.id, actor.id,
            least(ready.expires_at, now() + interval '10 minutes')
          ) returning * into preparation;
          insert into public.cooperative_activity_audit (
            activity_version_id, actor_profile_id, action, result, request_id, revision, details
          ) values (
            version.id, actor.id, 'entry_prepared', 'ready_check', p_client_request_id,
            party.revision, jsonb_build_object('partyId', party.public_party_id)
          );
          response := jsonb_build_object('status', 'ready_check',
            'preparation', private.cooperative_activity_preparation_json(preparation),
            'affectedPresenceIds', private.social_graph_party_presence_ids(party.id));
        end if;
      end if;
      end if;
    end if;
  end if;
  perform private.cooperative_activity_store_replay(actor.id, 'entry_prepare', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.enter_realtime_cooperative_activity(
  p_session_id uuid, p_preparation_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  preparation public.cooperative_activity_entry_preparations%rowtype; ready public.player_party_ready_checks%rowtype;
  party public.player_parties%rowtype; version public.cooperative_activity_versions%rowtype;
  instance public.cooperative_activity_instances%rowtype; first_objective jsonb; member record;
  replay jsonb; response jsonb; request_hash text;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_ENTER';
  end if;
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_preparation_id::text;
  replay := private.cooperative_activity_replay(actor.id, 'entry_enter', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select prepared.* into preparation from public.cooperative_activity_entry_preparations prepared
  where prepared.public_preparation_id = p_preparation_id for update;
  if not found or preparation.leader_profile_id <> actor.id then response := jsonb_build_object('status', 'leader_required');
  else
    select * into party from public.player_parties where id = preparation.party_id and status = 'active' for update;
    select * into ready from public.player_party_ready_checks where id = preparation.ready_check_id for update;
    select * into strict version from public.cooperative_activity_versions where id = preparation.activity_version_id;
    if preparation.status = 'entered' then
      select * into instance from public.cooperative_activity_instances
      where party_id = preparation.party_id and status in ('waiting_for_players','active','paused');
      response := jsonb_build_object('status', 'entered',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
        'affectedPresenceIds', private.social_graph_party_presence_ids(party.id));
    elsif preparation.expires_at <= now() or ready.expires_at <= now() then
      update public.cooperative_activity_entry_preparations set status = 'expired', resolved_at = now()
      where id = preparation.id;
      response := jsonb_build_object('status', 'not_ready');
    elsif ready.status <> 'completed' or party.revision <> ready.party_revision
       or exists (select 1 from public.player_party_ready_responses where ready_check_id = ready.id and state <> 'ready') then
      response := jsonb_build_object('status', 'not_ready');
    elsif exists (
      select 1 from public.player_party_members party_member
      left join public.player_party_ready_responses ready_response
        on ready_response.ready_check_id = ready.id and ready_response.player_profile_id = party_member.player_profile_id
      where party_member.party_id = party.id and party_member.status = 'active'
        and ready_response.player_profile_id is null
    ) then response := jsonb_build_object('status', 'party_changed');
    else
      first_objective := version.objective_definitions -> 0;
      insert into public.cooperative_activity_instances (
        activity_version_id, party_id, party_public_id, locked_party_revision,
        leader_profile_id, status, current_objective_key, minimum_active_participants,
        waiting_expires_at, started_at, expires_at, return_world_map_id
      ) values (
        version.id, party.id, party.public_party_id, party.revision, actor.id, 'active',
        first_objective ->> 'key', version.minimum_party_size,
        now() + make_interval(secs => version.waiting_for_players_seconds), now(),
        now() + make_interval(secs => version.duration_seconds), session.world_map_id
      ) returning * into instance;
      insert into public.cooperative_activity_participants (
        instance_id, player_profile_id, public_presence_id, connection_status
      ) select instance.id, profile.id, profile.public_presence_id, 'online'
      from public.player_party_members party_member
      join public.player_profiles profile on profile.id = party_member.player_profile_id
      where party_member.party_id = party.id and party_member.status = 'active'
      order by profile.id;
      insert into public.cooperative_activity_objectives (
        instance_id, objective_key, sequence_number, objective_type, label, target,
        status, started_at, timer_ends_at
      ) select instance.id, objective ->> 'key', objective_row.ordinality,
        objective ->> 'type', objective ->> 'label', (objective ->> 'target')::integer,
        case when objective_row.ordinality = 1 then 'active' else 'pending' end,
        case when objective_row.ordinality = 1 then now() else null end,
        case when objective_row.ordinality = 1 and objective ->> 'type' = 'timed_wait'
          then now() + make_interval(secs => (objective ->> 'timeLimitSeconds')::integer) else null end
      from jsonb_array_elements(version.objective_definitions) with ordinality objective_row(objective, ordinality);
      update public.cooperative_activity_entry_preparations set status = 'entered', resolved_at = now()
      where id = preparation.id;
      insert into public.cooperative_activity_audit (
        instance_id, activity_version_id, actor_profile_id, action, result, request_id, revision, details
      ) values (
        instance.id, version.id, actor.id, 'instance_created', 'active', p_client_request_id,
        instance.revision, jsonb_build_object('partyId', party.public_party_id,
          'participantCount', (select count(*) from public.cooperative_activity_participants where instance_id = instance.id))
      );
      response := jsonb_build_object('status', 'entered',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
        'affectedPresenceIds', private.social_graph_party_presence_ids(party.id));
    end if;
  end if;
  perform private.cooperative_activity_store_replay(actor.id, 'entry_enter', p_client_request_id, request_hash, response);
  return response;
exception when unique_violation then
  response := jsonb_build_object('status', 'already_active');
  perform private.cooperative_activity_store_replay(actor.id, 'entry_enter', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.interact_realtime_cooperative_activity(
  p_session_id uuid, p_instance_id uuid, p_expected_revision integer,
  p_objective_key text, p_object_key text, p_position_x numeric, p_position_y numeric,
  p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  instance public.cooperative_activity_instances%rowtype; participant public.cooperative_activity_participants%rowtype;
  objective public.cooperative_activity_objectives%rowtype; object public.cooperative_activity_objects%rowtype;
  version public.cooperative_activity_versions%rowtype; next_objective public.cooperative_activity_objectives%rowtype;
  temp_quantity integer; replay jsonb; response jsonb; request_hash text; affected jsonb;
begin
  if p_expected_revision < 1 or p_objective_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_object_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_position_x not between 0 and 128 or p_position_y not between 0 and 128
     or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_INTERACTION';
  end if;
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_instance_id::text || ':' || p_expected_revision::text || ':' || p_objective_key || ':' || p_object_key;
  replay := private.cooperative_activity_replay(actor.id, 'interact', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  if not private.cooperative_activity_rate_allowed(actor.id, 'interact', 30, 10) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into instance from public.cooperative_activity_instances where public_instance_id = p_instance_id for update;
  if not found then response := jsonb_build_object('status', 'not_participant');
  else
    instance := private.cooperative_activity_advance(instance.id, p_client_request_id);
    select * into participant from public.cooperative_activity_participants
    where instance_id = instance.id and player_profile_id = actor.id for update;
    if not found or participant.connection_status <> 'online' or not participant.reward_eligible then
      response := jsonb_build_object('status', 'not_participant');
    elsif instance.status <> 'active' then response := jsonb_build_object('status', 'activity_expired');
    elsif instance.revision <> p_expected_revision or instance.current_objective_key <> p_objective_key then
      response := jsonb_build_object('status', 'objective_changed',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id));
    else
      select * into strict version from public.cooperative_activity_versions where id = instance.activity_version_id;
      select * into objective from public.cooperative_activity_objectives
      where instance_id = instance.id and objective_key = p_objective_key and status = 'active' for update;
      select * into object from public.cooperative_activity_objects
      where activity_version_id = instance.activity_version_id and object_key = p_object_key and active;
      if not found or object.interaction_key is distinct from (
        select definition ->> 'allowedInteractionKey'
        from jsonb_array_elements(version.objective_definitions) definition
        where definition ->> 'key' = p_objective_key
      ) then response := jsonb_build_object('status', 'invalid_object');
      elsif sqrt(power(object.position_x - p_position_x, 2) + power(object.position_y - p_position_y, 2)) > object.interaction_range then
        response := jsonb_build_object('status', 'out_of_range');
      elsif exists (
        select 1 from public.cooperative_activity_progress_events
        where instance_id = instance.id and objective_key = p_objective_key and object_key = p_object_key
      ) then response := jsonb_build_object('status', 'objective_changed',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id));
      else
        if objective.objective_type = 'shared_collect_count' then
          insert into public.cooperative_activity_temporary_items (
            instance_id, player_profile_id, item_key, quantity
          ) values (instance.id, actor.id, 'moonpetal-seed-bundle', 1)
          on conflict (instance_id, player_profile_id, item_key) do update set quantity =
            public.cooperative_activity_temporary_items.quantity + 1;
        elsif objective.objective_type = 'shared_plant_count' then
          select quantity into temp_quantity from public.cooperative_activity_temporary_items
          where instance_id = instance.id and player_profile_id = actor.id
            and item_key = 'moonpetal-seed-bundle' for update;
          if coalesce(temp_quantity, 0) < 1 then
            response := jsonb_build_object('status', 'invalid_object');
          else
            update public.cooperative_activity_temporary_items set quantity = quantity - 1
            where instance_id = instance.id and player_profile_id = actor.id and item_key = 'moonpetal-seed-bundle';
          end if;
        elsif objective.objective_type = 'shared_harvest_count' then
          insert into public.cooperative_activity_temporary_items (
            instance_id, player_profile_id, item_key, quantity
          ) values (instance.id, actor.id, 'moonpetal-harvest-bundle', 1)
          on conflict (instance_id, player_profile_id, item_key) do update set quantity =
            public.cooperative_activity_temporary_items.quantity + 1;
        elsif objective.objective_type = 'shared_deliver_count' then
          select quantity into temp_quantity from public.cooperative_activity_temporary_items
          where instance_id = instance.id and player_profile_id = actor.id
            and item_key = 'moonpetal-harvest-bundle' for update;
          if coalesce(temp_quantity, 0) < 1 then
            response := jsonb_build_object('status', 'invalid_object');
          else
            update public.cooperative_activity_temporary_items set quantity = quantity - 1
            where instance_id = instance.id and player_profile_id = actor.id and item_key = 'moonpetal-harvest-bundle';
          end if;
        end if;
        if response is null then
          insert into public.cooperative_activity_progress_events (
            instance_id, player_profile_id, objective_key, object_key, interaction_key,
            client_request_id, instance_revision
          ) values (
            instance.id, actor.id, p_objective_key, p_object_key, object.interaction_key,
            p_client_request_id, instance.revision
          );
          update public.cooperative_activity_participants set contribution = contribution + 1,
            last_active_at = now(), temporary_item_count = coalesce((
              select sum(quantity)::integer from public.cooperative_activity_temporary_items item
              where item.instance_id = instance.id and item.player_profile_id = actor.id
            ), 0)
          where instance_id = instance.id and player_profile_id = actor.id;
          update public.cooperative_activity_objectives set current_progress = least(target, current_progress + 1)
          where instance_id = instance.id and objective_key = objective.objective_key returning * into objective;
          if objective.current_progress >= objective.target then
            update public.cooperative_activity_objectives set status = 'completed', completed_at = now()
            where instance_id = instance.id and objective_key = objective.objective_key;
            select * into next_objective from public.cooperative_activity_objectives
            where instance_id = instance.id and sequence_number = objective.sequence_number + 1 for update;
            if found then
              update public.cooperative_activity_objectives set status = 'active', started_at = now(),
                timer_ends_at = case when next_objective.objective_type = 'timed_wait'
                  then now() + make_interval(secs => (
                    select (definition ->> 'timeLimitSeconds')::integer
                    from jsonb_array_elements(version.objective_definitions) definition
                    where definition ->> 'key' = next_objective.objective_key
                  )) else null end
              where instance_id = instance.id and objective_key = next_objective.objective_key;
              update public.cooperative_activity_instances set current_objective_key = next_objective.objective_key,
                revision = revision + 1, checkpoint_version = checkpoint_version + 1
              where id = instance.id returning * into instance;
            else
              instance := private.cooperative_activity_settle(instance.id, p_client_request_id);
            end if;
          else
            update public.cooperative_activity_instances set revision = revision + 1,
              checkpoint_version = checkpoint_version + 1 where id = instance.id returning * into instance;
          end if;
          select coalesce(jsonb_agg(profile.public_presence_id order by profile.public_presence_id), '[]'::jsonb)
          into affected from public.cooperative_activity_participants activity_participant
          join public.player_profiles profile on profile.id = activity_participant.player_profile_id
          where activity_participant.instance_id = instance.id and activity_participant.connection_status <> 'removed';
          insert into public.cooperative_activity_audit (
            instance_id, activity_version_id, actor_profile_id, action, result, request_id, revision, details
          ) values (
            instance.id, instance.activity_version_id, actor.id, 'objective_progressed', 'accepted',
            p_client_request_id, instance.revision,
            jsonb_build_object('objectiveKey', p_objective_key, 'objectKey', p_object_key)
          );
          response := jsonb_build_object('status',
            case when instance.status = 'completed' then 'completed' else 'progressed' end,
            'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
            'affectedPresenceIds', affected);
        end if;
      end if;
    end if;
  end if;
  perform private.cooperative_activity_store_replay(actor.id, 'interact', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function public.leave_realtime_cooperative_activity(
  p_session_id uuid, p_instance_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  instance public.cooperative_activity_instances%rowtype; active_count integer; response jsonb; affected jsonb;
begin
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  select * into instance from public.cooperative_activity_instances where public_instance_id = p_instance_id for update;
  if not found or not exists (select 1 from public.cooperative_activity_participants
    where instance_id = instance.id and player_profile_id = actor.id and connection_status <> 'removed') then
    return jsonb_build_object('status', 'not_participant');
  end if;
  update public.cooperative_activity_participants set connection_status = 'removed', reward_eligible = false,
    reconnect_deadline = null, removed_at = now(), removal_reason = 'left_activity'
  where instance_id = instance.id and player_profile_id = actor.id;
  delete from public.cooperative_activity_temporary_items
  where instance_id = instance.id and player_profile_id = actor.id;
  select count(*)::integer into active_count from public.cooperative_activity_participants
  where instance_id = instance.id and connection_status = 'online' and reward_eligible;
  if instance.status in ('active','paused','waiting_for_players') and active_count < instance.minimum_active_participants then
    instance := private.cooperative_activity_fail(instance.id, 'insufficient_participants', p_client_request_id);
  else
    update public.cooperative_activity_instances set revision = revision + 1, checkpoint_version = checkpoint_version + 1
    where id = instance.id returning * into instance;
  end if;
  select coalesce(jsonb_agg(profile.public_presence_id order by profile.public_presence_id), '[]'::jsonb)
  into affected from public.cooperative_activity_participants participant
  join public.player_profiles profile on profile.id = participant.player_profile_id
  where participant.instance_id = instance.id;
  response := jsonb_build_object('status', 'left', 'affectedPresenceIds', affected);
  insert into public.cooperative_activity_audit (
    instance_id, activity_version_id, actor_profile_id, action, result, request_id, revision
  ) values (instance.id, instance.activity_version_id, actor.id, 'participant_left', 'removed',
    p_client_request_id, instance.revision);
  return response;
end;
$$;

create or replace function public.handle_realtime_cooperative_activity_disconnect(
  p_session_id uuid, p_reason text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; actor public.player_profiles%rowtype;
  instance public.cooperative_activity_instances%rowtype; version public.cooperative_activity_versions%rowtype;
  affected jsonb;
begin
  select * into session from public.realtime_sessions where id = p_session_id;
  if not found then return jsonb_build_object('status', 'unchanged'); end if;
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  select * into instance from private.cooperative_activity_active_instance(actor.id);
  if instance.id is null then return jsonb_build_object('status', 'unchanged'); end if;
  select * into strict version from public.cooperative_activity_versions where id = instance.activity_version_id;
  if p_reason in ('player_suspended','access_revoked','authorization_failed','party_removed') then
    update public.cooperative_activity_participants set connection_status = 'removed', reward_eligible = false,
      reconnect_deadline = null, removed_at = now(), removal_reason = p_reason
    where instance_id = instance.id and player_profile_id = actor.id;
  else
    update public.cooperative_activity_participants set connection_status = 'reconnecting',
      reconnect_deadline = now() + make_interval(secs => version.reconnect_grace_seconds)
    where instance_id = instance.id and player_profile_id = actor.id and connection_status <> 'removed';
  end if;
  update public.cooperative_activity_instances set revision = revision + 1, checkpoint_version = checkpoint_version + 1
  where id = instance.id returning * into instance;
  select coalesce(jsonb_agg(profile.public_presence_id order by profile.public_presence_id), '[]'::jsonb)
  into affected from public.cooperative_activity_participants participant
  join public.player_profiles profile on profile.id = participant.player_profile_id
  where participant.instance_id = instance.id;
  insert into public.cooperative_activity_audit (
    instance_id, activity_version_id, actor_profile_id, action, result, request_id, revision,
    details
  ) values (instance.id, instance.activity_version_id, actor.id, 'participant_disconnected',
    case when p_reason in ('player_suspended','access_revoked','authorization_failed','party_removed') then 'removed' else 'reconnecting' end,
    p_request_id, instance.revision, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('status', 'updated',
    'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
    'affectedPresenceIds', affected);
end;
$$;

create or replace function public.cleanup_cooperative_activities(p_batch_size integer, p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare instance public.cooperative_activity_instances%rowtype; pending public.cooperative_activity_pending_rewards%rowtype;
  item_added boolean; processed integer := 0; failed integer := 0; reconnects integer := 0;
  claims integer := 0; active_count integer; settings public.cooperative_activity_settings%rowtype;
begin
  if p_batch_size not between 1 and 500 or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_CLEANUP';
  end if;
  select * into strict settings from public.cooperative_activity_settings where singleton_key;
  for instance in select activity_instance.* from public.cooperative_activity_instances activity_instance
    where activity_instance.status in ('waiting_for_players','active','paused')
      and (activity_instance.expires_at <= now() or exists (
        select 1 from public.cooperative_activity_participants participant
        where participant.instance_id = activity_instance.id and participant.connection_status = 'reconnecting'
          and participant.reconnect_deadline <= now()
      )) order by activity_instance.expires_at, activity_instance.id for update skip locked limit p_batch_size
  loop
    update public.cooperative_activity_participants set connection_status = 'removed', reward_eligible = false,
      removed_at = now(), removal_reason = 'reconnect_timeout', reconnect_deadline = null
    where instance_id = instance.id and connection_status = 'reconnecting' and reconnect_deadline <= now();
    get diagnostics reconnects = row_count;
    processed := processed + 1;
    if instance.expires_at <= now() then
      perform private.cooperative_activity_fail(instance.id, 'activity_expired', p_request_id);
      failed := failed + 1;
    else
      select count(*)::integer into active_count from public.cooperative_activity_participants
      where instance_id = instance.id and connection_status = 'online' and reward_eligible;
      if active_count < instance.minimum_active_participants then
        perform private.cooperative_activity_fail(instance.id, 'insufficient_participants', p_request_id);
        failed := failed + 1;
      else
        update public.cooperative_activity_instances set revision = revision + 1,
          checkpoint_version = checkpoint_version + 1 where id = instance.id;
      end if;
    end if;
  end loop;
  update public.cooperative_activity_entry_preparations set status = 'expired', resolved_at = now()
  where id in (
    select id from public.cooperative_activity_entry_preparations
    where status in ('ready_check','ready') and expires_at <= now()
    order by expires_at limit p_batch_size for update skip locked
  );
  for pending in select * from public.cooperative_activity_pending_rewards
    where status = 'pending' order by created_at, id for update skip locked limit p_batch_size
  loop
    perform 1 from public.player_inventory_state where player_profile_id = pending.player_profile_id for update;
    item_added := private.cozy_add_item(
      pending.player_profile_id, pending.item_definition_id, pending.quantity,
      'cooperative_activity_reward', pending.reward_receipt_id::text,
      'activity-pending-' || pending.id::text, p_request_id
    );
    if item_added then
      update public.cooperative_activity_pending_rewards set status = 'claimed', claimed_at = now() where id = pending.id;
      claims := claims + 1;
    end if;
  end loop;
  perform set_config('starville.cooperative_cleanup', 'enabled', true);
  delete from public.cooperative_activity_idempotency
  where created_at < now() - make_interval(hours => settings.idempotency_retention_hours);
  return jsonb_build_object('processed', processed, 'failed', failed,
    'reconnectsExpired', reconnects, 'pendingRewardsClaimed', claims);
end;
$$;

create or replace function public.get_admin_cooperative_activities(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_view text, p_search text, p_status text, p_page integer, p_page_size integer
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare total integer; rows jsonb;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.read') then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITIES_ACCESS_DENIED';
  end if;
  if p_view not in ('catalog','instances','rewards') or p_status not in (
    'all','draft','validated','in_review','published','superseded','disabled',
    'preparing','waiting_for_players','active','paused','completed','failed','cancelled','expired','abandoned',
    'settled','pending_inventory','ineligible'
  ) or p_page < 1 or p_page_size not in (10,50,100) then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITIES_QUERY';
  end if;
  if p_view = 'catalog' then
    select count(*)::integer, coalesce(jsonb_agg(private.cooperative_activity_version_json(version)
      order by version.created_at desc), '[]'::jsonb) into total, rows
    from public.cooperative_activity_versions version
    join public.cooperative_activity_definitions definition on definition.id = version.activity_definition_id
    where (p_status = 'all' or version.lifecycle_status = p_status)
      and (p_search = '' or definition.activity_key ilike '%' || p_search || '%' or version.name ilike '%' || p_search || '%');
  elsif p_view = 'instances' then
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
      'instanceId', instance.public_instance_id, 'activityKey', definition.activity_key,
      'activityName', version.name, 'partyId', instance.party_public_id,
      'status', instance.status, 'revision', instance.revision,
      'participantCount', (select count(*) from public.cooperative_activity_participants participant where participant.instance_id = instance.id),
      'currentObjectiveKey', instance.current_objective_key, 'startedAt', instance.started_at,
      'expiresAt', instance.expires_at, 'completedAt', instance.completed_at,
      'resultCode', instance.result_code
    ) order by instance.created_at desc), '[]'::jsonb) into total, rows
    from public.cooperative_activity_instances instance
    join public.cooperative_activity_versions version on version.id = instance.activity_version_id
    join public.cooperative_activity_definitions definition on definition.id = version.activity_definition_id
    where (p_status = 'all' or instance.status = p_status)
      and (p_search = '' or instance.public_instance_id::text = p_search or definition.activity_key ilike '%' || p_search || '%');
  else
    select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
      'receiptId', receipt.public_receipt_id, 'completionId', completion.public_completion_id,
      'instanceId', instance.public_instance_id, 'presenceId', profile.public_presence_id,
      'displayName', profile.display_name, 'status', receipt.status,
      'dust', receipt.dust_amount, 'settledAt', receipt.settled_at,
      'dailyRewardNumber', receipt.daily_reward_number
    ) order by receipt.settled_at desc), '[]'::jsonb) into total, rows
    from public.cooperative_activity_reward_receipts receipt
    join public.cooperative_activity_completions completion on completion.id = receipt.completion_id
    join public.cooperative_activity_instances instance on instance.id = completion.instance_id
    join public.player_profiles profile on profile.id = receipt.player_profile_id
    where (p_status = 'all' or receipt.status = p_status)
      and (p_search = '' or receipt.public_receipt_id::text = p_search or profile.display_name ilike '%' || p_search || '%');
  end if;
  return jsonb_build_object('view', p_view, 'rows', rows, 'total', total,
    'page', p_page, 'pageSize', p_page_size);
end;
$$;

create or replace function public.get_admin_cooperative_activity_instance(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_instance_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare instance public.cooperative_activity_instances%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.read') then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITIES_ACCESS_DENIED';
  end if;
  select * into instance from public.cooperative_activity_instances where public_instance_id = p_instance_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  return jsonb_build_object(
    'status','loaded',
    'instance', private.cooperative_activity_snapshot_json(instance, instance.leader_profile_id),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'entryNumber', audit.entry_number, 'action', audit.action, 'result', audit.result,
      'revision', audit.revision, 'createdAt', audit.created_at, 'details', audit.details
    ) order by audit.entry_number desc) from (
      select * from public.cooperative_activity_audit where instance_id = instance.id
      order by entry_number desc limit 100
    ) audit), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_admin_cooperative_activity_settings(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare settings public.cooperative_activity_settings%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.settings.read') then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_SETTINGS_ACCESS_DENIED';
  end if;
  select * into strict settings from public.cooperative_activity_settings where singleton_key;
  return jsonb_build_object('moduleEnabled', settings.module_enabled,
    'publicQueueEnabled', settings.public_queue_enabled,
    'allowExistingInstancesToFinish', settings.allow_existing_instances_to_finish,
    'maximumActiveInstances', settings.maximum_active_instances,
    'maximumFailedAttemptsPerHour', settings.maximum_failed_attempts_per_hour,
    'maximumPartyCreationsPerHour', settings.maximum_party_creations_per_hour,
    'version', settings.version, 'updatedAt', settings.updated_at);
end;
$$;

create or replace function public.preview_admin_cooperative_activity(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_version_id uuid,
  p_simulation_step integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare version public.cooperative_activity_versions%rowtype; objective jsonb;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.preview') then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_PREVIEW_ACCESS_DENIED';
  end if;
  if p_simulation_step not between 0 and 16 then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_PREVIEW';
  end if;
  select * into version from public.cooperative_activity_versions where id = p_version_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  objective := version.objective_definitions -> least(p_simulation_step, jsonb_array_length(version.objective_definitions)-1);
  return jsonb_build_object('status','preview','previewMode',true,
    'persistent',false,'rewardsSettled',false,
    'activity',private.cooperative_activity_version_json(version),
    'simulationStep',p_simulation_step,'currentObjectiveKey',objective->>'key');
end;
$$;

do $$
declare function_name text;
begin
  foreach function_name in array array[
    'private.cooperative_activity_active_session(uuid)',
    'private.cooperative_activity_version_json(public.cooperative_activity_versions)',
    'private.cooperative_activity_preparation_json(public.cooperative_activity_entry_preparations)',
    'private.cooperative_activity_receipt_json(public.cooperative_activity_reward_receipts)',
    'private.cooperative_activity_snapshot_json(public.cooperative_activity_instances,uuid)',
    'private.cooperative_activity_replay(uuid,text,text,text)',
    'private.cooperative_activity_store_replay(uuid,text,text,text,jsonb)',
    'private.cooperative_activity_rate_allowed(uuid,text,integer,integer)',
    'private.cooperative_activity_active_instance(uuid)',
    'private.cooperative_activity_availability(uuid,public.cooperative_activity_versions)',
    'private.cooperative_activity_catalog_json(uuid)',
    'private.cooperative_activity_fail(uuid,text,text)',
    'private.cooperative_activity_advance(uuid,text)',
    'private.cooperative_activity_settle(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', function_name);
  end loop;
end;
$$;

revoke all on function public.get_realtime_cooperative_activity_bootstrap(uuid) from public, anon, authenticated, service_role;
revoke all on function public.prepare_realtime_cooperative_activity_entry(uuid,text,integer,text) from public, anon, authenticated, service_role;
revoke all on function public.enter_realtime_cooperative_activity(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text) from public, anon, authenticated, service_role;
revoke all on function public.leave_realtime_cooperative_activity(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.handle_realtime_cooperative_activity_disconnect(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_cooperative_activities(integer,text) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_cooperative_activities(uuid,uuid,text,text,text,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_cooperative_activity_instance(uuid,uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_cooperative_activity_settings(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.preview_admin_cooperative_activity(uuid,uuid,text,uuid,integer) from public, anon, authenticated, service_role;

grant execute on function public.get_realtime_cooperative_activity_bootstrap(uuid) to service_role;
grant execute on function public.prepare_realtime_cooperative_activity_entry(uuid,text,integer,text) to service_role;
grant execute on function public.enter_realtime_cooperative_activity(uuid,uuid,text) to service_role;
grant execute on function public.interact_realtime_cooperative_activity(uuid,uuid,integer,text,text,numeric,numeric,text) to service_role;
grant execute on function public.leave_realtime_cooperative_activity(uuid,uuid,text) to service_role;
grant execute on function public.handle_realtime_cooperative_activity_disconnect(uuid,text,text) to service_role;
grant execute on function public.cleanup_cooperative_activities(integer,text) to service_role;
grant execute on function public.get_admin_cooperative_activities(uuid,uuid,text,text,text,text,integer,integer) to service_role;
grant execute on function public.get_admin_cooperative_activity_instance(uuid,uuid,text,uuid) to service_role;
grant execute on function public.get_admin_cooperative_activity_settings(uuid,uuid,text) to service_role;
grant execute on function public.preview_admin_cooperative_activity(uuid,uuid,text,uuid,integer) to service_role;
