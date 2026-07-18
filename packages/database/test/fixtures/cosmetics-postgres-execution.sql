-- Executes Phase 10B cosmetic authority against isolated PostgreSQL.
begin;

create or replace function pg_temp.cosmetic_assert(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'COSMETICS_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  player_id constant uuid := '10b00000-0000-4000-8000-000000000001';
  challenge_id constant uuid := '10b00000-0000-4000-8000-000000000002';
  access_id constant uuid := '10b00000-0000-4000-8000-000000000003';
  admin_id constant uuid := '10b00000-0000-4000-8000-000000000004';
  admin_auth_id constant uuid := '10b00000-0000-4000-8000-000000000005';
  admin_session_id constant uuid := '10b00000-0000-4000-8000-000000000006';
  platform_version_id constant uuid := '10b00000-0000-4000-8000-000000000007';
  starter_definition constant uuid := '10b00000-0000-4000-8000-000000000010';
  starter_version constant uuid := '10b00000-0000-4000-8000-000000000011';
  grant_definition constant uuid := '10b00000-0000-4000-8000-000000000020';
  grant_version constant uuid := '10b00000-0000-4000-8000-000000000021';
  reward_definition constant uuid := '10b00000-0000-4000-8000-000000000030';
  reward_version constant uuid := '10b00000-0000-4000-8000-000000000031';
  draft_definition constant uuid := '10b00000-0000-4000-8000-000000000040';
  collection_id constant uuid := '10b00000-0000-4000-8000-000000000050';
  role_id uuid;
  config_id uuid;
  map_version_id uuid;
  platform_id uuid;
  platform_configuration jsonb;
  admin_permission_version integer;
  admin_session_version integer;
  result jsonb;
  replay jsonb;
  saved_loadout_id uuid;
  before_dust bigint;
  after_dust bigint;
  before_dust_events integer;
  after_dust_events integer;
  immutable_rejected boolean := false;
  oversized_rejected boolean := false;
  load_iteration integer;
begin
  perform pg_temp.cosmetic_assert(
    not exists (
      select 1
      from (values
        ('avatar_content_definitions','display_name'),
        ('avatar_content_definitions','category'),
        ('avatar_content_definitions','content_layer'),
        ('avatar_content_definitions','active_version_id'),
        ('avatar_content_versions','avatar_content_definition_id'),
        ('avatar_content_versions','version_number'),
        ('avatar_content_versions','lifecycle_status'),
        ('player_cosmetic_ownership','ownership_state'),
        ('cosmetic_ownership_receipts','request_id'),
        ('player_cosmetic_loadouts','selection'),
        ('player_cosmetic_loadouts','revision'),
        ('player_avatar_profile_history','revision'),
        ('cosmetic_emote_definitions','emote_key'),
        ('player_emote_wheels','emote_keys'),
        ('player_emote_wheels','revision'),
        ('cosmetic_collection_definitions','collection_key'),
        ('cosmetic_collection_members','avatar_content_definition_id'),
        ('cosmetic_collection_reward_receipts','request_id')
      ) expected(table_name, column_name)
      where not exists (
        select 1 from information_schema.columns column_definition
        where column_definition.table_schema = 'public'
          and column_definition.table_name = expected.table_name
          and column_definition.column_name = expected.column_name
      )
    ),
    'information_schema matches the Phase 10A/10B ownership, outfit, emote, collection, and audit contract'
  );
  perform pg_temp.cosmetic_assert(
    (select count(*) = 12 from public.admin_permissions where key like 'cosmetics.%')
      and not exists (
        select 1 from public.admin_role_permissions mapping
        join public.admin_roles role on role.id = mapping.role_id
        join public.admin_permissions permission on permission.id = mapping.permission_id
        where role.key = 'moderator' and permission.key like 'cosmetics.%'
      ),
    'cosmetic permissions are present and moderators receive no cosmetic economy authority'
  );
  perform pg_temp.cosmetic_assert(
    not exists (
      select 1 from pg_proc routine
      join pg_namespace namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname ~ '(purchase|buy).*cosmetic|cosmetic.*(purchase|buy)'
    )
      and (select not enabled and not purchase_available and lifecycle_status = 'disabled_preview'
           from public.cosmetic_shop_settings where game_key = 'starville')
      and not exists (select 1 from public.cosmetic_shop_offer_drafts where lifecycle_status <> 'draft'),
    'the cosmetic shop has no purchase RPC, cannot enable purchases, and contains no published offers'
  );
  perform pg_temp.cosmetic_assert(
    not has_function_privilege(
      'authenticated',
      'public.get_player_cosmetic_wardrobe(text,text,text)',
      'execute'
    )
      and has_function_privilege(
        'service_role',
        'public.get_player_cosmetic_wardrobe(text,text,text)',
        'execute'
      )
      and not has_function_privilege(
        'authenticated',
        'public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text)',
        'execute'
      ),
    'player and admin mutations retain the narrow service-role RPC boundary'
  );
  perform pg_temp.cosmetic_assert(
    not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in (
          'player_cosmetic_ownership', 'cosmetic_ownership_receipts',
          'player_cosmetic_loadouts', 'player_emote_entitlements', 'player_emote_wheels',
          'player_emote_activations', 'cosmetic_collection_definitions',
          'cosmetic_collection_members', 'cosmetic_collection_reward_receipts',
          'cosmetic_shop_settings', 'cosmetic_shop_offer_drafts', 'cosmetic_settings'
        )
        and (not relation.relrowsecurity or not relation.relforcerowsecurity)
    ),
    'all Phase 10B public tables force RLS'
  );
  perform pg_temp.cosmetic_assert(
    not has_table_privilege('anon', 'public.player_cosmetic_ownership', 'select')
      and not has_table_privilege('authenticated', 'public.player_cosmetic_ownership', 'select')
      and not has_table_privilege('authenticated', 'public.player_cosmetic_ownership', 'insert')
      and not has_table_privilege('authenticated', 'public.player_cosmetic_loadouts', 'update')
      and not has_table_privilege('authenticated', 'public.player_emote_wheels', 'update')
      and not has_table_privilege('service_role', 'public.cosmetic_ownership_receipts', 'update'),
    'anonymous, players, and the service role have no direct private cosmetic table mutation path'
  );
  perform pg_temp.cosmetic_assert(
    (select routine.provolatile = 's'
     from pg_proc routine
     where routine.oid = 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure)
      and (select dependency.provolatile = 's'
           from pg_proc dependency
           where dependency.oid = 'pg_catalog.pg_column_size("any")'::regprocedure),
    'selection validator volatility matches its STABLE pg_column_size dependency'
  );
  perform pg_temp.cosmetic_assert(
    (select routine.proisstrict and routine.prosecdef
            and routine.proconfig @> array['search_path=""']
     from pg_proc routine
     where routine.oid = 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure)
      and (select count(*) = 1
           from pg_proc routine
           join pg_namespace namespace on namespace.oid = routine.pronamespace
           where namespace.nspname = 'private'
             and routine.proname = 'valid_cosmetic_selection_shape')
      and not has_function_privilege(
        'service_role', 'private.valid_cosmetic_selection_shape(jsonb)', 'execute'
      ),
    'selection validator retains one strict SECURITY DEFINER signature, safe search path, and grants'
  );
  perform pg_temp.cosmetic_assert(
    not exists (
      select 1
      from pg_proc routine
      where routine.prokind = 'f'
        and routine.oid <> 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure
        and position(
          'private.valid_cosmetic_selection_shape' in pg_get_functiondef(routine.oid)
        ) > 0
    )
      and exists (
        select 1
        from pg_constraint constraint_definition
        where constraint_definition.conrelid = 'public.player_cosmetic_loadouts'::regclass
          and pg_get_constraintdef(constraint_definition.oid)
              like '%private.valid_cosmetic_selection_shape(selection)%'
      ),
    'selection validator has no function callers with incompatible volatility and remains the loadout CHECK'
  );
  perform pg_temp.cosmetic_assert(
    private.valid_cosmetic_selection_shape(
      '{"bodyPresetKey":"meadow-frame","accessoryKeys":["phase10b-starter-hat"]}'::jsonb
    )
      and not private.valid_cosmetic_selection_shape(
        '{"bodyPresetKey":"https://invalid.example","accessoryKeys":[]}'::jsonb
      )
      and private.valid_cosmetic_selection_shape(null::jsonb) is null
      and not private.valid_cosmetic_selection_shape('null'::jsonb)
      and not private.valid_cosmetic_selection_shape('[]'::jsonb)
      and not private.valid_cosmetic_selection_shape(
        '{"bodyPresetKey":"meadow-frame"}'::jsonb
      )
      and not private.valid_cosmetic_selection_shape(
        '{"bodyPresetKey":"meadow-frame","accessoryKeys":[{}]}'::jsonb
      )
      and (select column_definition.is_nullable = 'NO'
           from information_schema.columns column_definition
           where column_definition.table_schema = 'public'
             and column_definition.table_name = 'player_cosmetic_loadouts'
             and column_definition.column_name = 'selection'),
    'loadout selections preserve valid, invalid, SQL-null, JSON-null, and malformed behavior'
  );
  select platform.id, version.configuration
  into strict platform_id, platform_configuration
  from public.game_platforms platform
  join public.game_platform_active_configuration active
    on active.game_platform_id = platform.id
  join public.game_platform_configuration_versions version
    on version.id = active.configuration_version_id
  where platform.key = 'starville';
  platform_configuration := private.upgrade_phase10b_platform_configuration(
    platform_configuration
  );
  insert into public.game_platform_configuration_versions (
    id, game_platform_id, version_number, lifecycle_status, configuration,
    validation_results, published_at, revision
  ) select
    platform_version_id, platform_id, max(version_number) + 1, 'published',
    platform_configuration, '{"valid":true,"findings":[]}'::jsonb, now(), 1
  from public.game_platform_configuration_versions where game_platform_id = platform_id;
  update public.game_platform_active_configuration set
    configuration_version_id = platform_version_id, revision = revision + 1,
    activated_at = now()
  where game_platform_id = platform_id;
  perform pg_temp.cosmetic_assert(
    private.avatar_module_enabled(),
    'the fixture explicitly activates the prerequisite avatar platform module'
  );

  select id into strict role_id from public.admin_roles where key = 'super_admin';
  insert into auth.users(id, email) values (admin_id, 'phase10b-admin@example.invalid');
  insert into auth.sessions(id, user_id) values (admin_auth_id, admin_id);
  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values (admin_id, role_id, 'active', 'Phase 10B Admin', false)
  returning admin_users.permission_version, admin_users.session_version
    into admin_permission_version, admin_session_version;
  insert into public.admin_sessions(
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  ) values (
    admin_session_id, admin_id, admin_auth_id, 'active', now() + interval '1 hour',
    admin_permission_version, admin_session_version
  );

  insert into public.avatar_content_definitions (
    id, content_key, content_type, category, content_layer, display_name,
    description, access_level, created_by_admin_id
  ) values
    (starter_definition, 'phase10b-starter-hat', 'accessory', 'accessory', 'head_accessory',
     'Starter hat', 'Starter-owned Phase 10B test cosmetic.', 'starter', admin_id),
    (grant_definition, 'phase10b-lantern-top', 'top', 'outfit', 'top',
     'Lantern top', 'Grantable Phase 10B test cosmetic.', 'standard', admin_id),
    (reward_definition, 'phase10b-collection-pin', 'accessory', 'accessory', 'face_accessory',
     'Collection pin', 'Cosmetic-only collection reward.', 'standard', admin_id),
    (draft_definition, 'phase10b-unpublished', 'accessory', 'accessory', 'back_accessory',
     'Unpublished cosmetic', 'Must never be grantable.', 'standard', admin_id);
  insert into public.avatar_content_versions (
    id, avatar_content_definition_id, version_number, lifecycle_status,
    public_name, description, render_order, frame_width, frame_height,
    sheet_rows, sheet_columns, created_by_admin_id, submitted_by_admin_id,
    reviewed_by_admin_id, approved_by_admin_id, activated_by_admin_id,
    submitted_at, reviewed_at, approved_at, activated_at
  ) values
    (starter_version, starter_definition, 1, 'active', 'Historical starter version label', 'Starter cosmetic.',
     70, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
     now(), now(), now(), now()),
    (grant_version, grant_definition, 1, 'active', 'Lantern top', 'Grantable cosmetic.',
     40, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
     now(), now(), now(), now()),
    (reward_version, reward_definition, 1, 'active', 'Collection pin', 'Reward cosmetic.',
     71, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
     now(), now(), now(), now());
  update public.avatar_content_definitions definition set active_version_id = source.version_id
  from (values
    (starter_definition, starter_version),
    (grant_definition, grant_version),
    (reward_definition, reward_version)
  ) source(definition_id, version_id)
  where definition.id = source.definition_id;

  select id into strict config_id from public.token_gate_configs
  where environment_key = 'development' and network = 'solana:devnet';
  select active_published_version_id into strict map_version_id
  from public.world_maps where slug = 'lantern-square';
  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at, consumed_at,
    request_id, ip_hash
  ) values (
    challenge_id, '11111111111111111111111111111132', 'solana:devnet', config_id, 1,
    repeat('a',64), repeat('b',64), 'localhost', 'http://localhost:3000',
    now() - interval '1 minute', now() + interval '4 minutes', now(),
    'phase10b-challenge', repeat('c',64)
  );
  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id,
    config_version_snapshot, session_token_hash, observed_balance_raw,
    required_balance_raw, checked_slot, last_balance_check_at, expires_at
  ) values (
    access_id, challenge_id, '11111111111111111111111111111132', 'solana:devnet',
    config_id, 1, repeat('d',64), 1000, 1000, 1, now(), now() + interval '30 minutes'
  );
  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values (
    player_id, '11111111111111111111111111111132', 'Cosmetic Player', 'moss',
    'lantern-square', map_version_id, 12, 8, 'south'
  );
  result := public.get_player_cosmetic_wardrobe(
    '11111111111111111111111111111132', repeat('d',64), 'phase10b-wardrobe'
  );
  perform pg_temp.cosmetic_assert(
    result ->> 'status' = 'loaded'
      and jsonb_array_length(result -> 'emotes') = 6
      and jsonb_array_length(result -> 'emoteWheel') = 6
      and result #>> '{ownedItems,0,name}' = 'Starter hat'
      and result #>> '{ownedItems,0,state}' = 'owned'
      and result #>> '{ownedItems,0,available}' = 'true'
      and result #>> '{ownedItems,0,equipped}' = 'false'
      and result #>> '{ownedItems,0,usableVersionId}' = starter_version::text
      and (result #> '{ownedItems,0,previewMediaUrl}') = 'null'::jsonb
      and (select count(*) = 1 from public.player_cosmetic_ownership
           where player_profile_id = player_id
             and avatar_content_definition_id = starter_definition
             and ownership_state = 'owned'),
    'Wardrobe execution uses the definition-owned public name and returns bounded starter state'
  );
  update public.player_avatar_profiles
  set creator_completed_at = now(), revision = 1
  where player_profile_id = player_id;
  perform pg_temp.cosmetic_assert(
    (select creator_completed_at is not null and revision = 1
     from public.player_avatar_profiles where player_profile_id = player_id),
    'the prerequisite avatar profile is complete before equipped-cosmetic fallback testing'
  );
  select coalesce((
    select balance from public.player_dust_accounts where player_profile_id = player_id
  ), 0) into before_dust;
  select count(*)::integer into before_dust_events
  from public.player_dust_ledger where player_profile_id = player_id;

  result := public.save_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), 1, 'Lantern walk',
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["phase10b-starter-hat"]}'::jsonb,
    0, 'phase10b-save-loadout'
  );
  replay := public.save_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), 1, 'Lantern walk',
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["phase10b-starter-hat"]}'::jsonb,
    0, 'phase10b-save-loadout'
  );
  saved_loadout_id := (result ->> 'loadoutId')::uuid;
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'saved'
      and (result ->> 'revision')::integer = 1
      and (public.save_player_cosmetic_loadout(
        '11111111111111111111111111111132', repeat('d',64), 1, 'Stale overwrite',
        '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
        0, 'phase10b-save-stale'
      ) ->> 'status') = 'loadout_changed',
    'saved outfits replay exactly and stale revisions cannot overwrite a slot'
  );
  result := public.rename_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
    'Lantern promenade', 1, 'phase10b-rename-loadout'
  );
  replay := public.rename_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
    'Lantern promenade', 1, 'phase10b-rename-loadout'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'renamed'
      and (result ->> 'revision')::integer = 2
      and (public.rename_player_cosmetic_loadout(
        '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
        'Changed replay intent', 1, 'phase10b-rename-loadout'
      ) ->> 'status') = 'request_already_processed',
    'outfit rename is revision-safe and rejects changed request intent'
  );
  result := public.apply_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
    2, 1, 'phase10b-apply-loadout'
  );
  replay := public.apply_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
    2, 1, 'phase10b-apply-loadout'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'updated'
      and result ->> 'loadoutId' = saved_loadout_id::text
      and (select is_active from public.player_cosmetic_loadouts where id = saved_loadout_id)
      and (public.apply_player_cosmetic_loadout(
        '11111111111111111111111111111132', repeat('d',64), saved_loadout_id,
        2, 2, 'phase10b-apply-loadout'
      ) ->> 'status') = 'request_already_processed',
    'complete outfit application is atomic, avatar-revision safe, and intent-idempotent'
  );
  result := public.get_player_cosmetic_wardrobe(
    '11111111111111111111111111111132', repeat('d',64), 'phase10b-equipped-wardrobe'
  );
  perform pg_temp.cosmetic_assert(
    result #>> '{ownedItems,0,equipped}' = 'true',
    'Wardrobe marks the server-authoritative equipped definition'
  );
  result := public.save_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64), 2, 'Temporary outfit',
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    0, 'phase10b-save-delete-loadout'
  );
  replay := public.delete_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64),
    (result ->> 'loadoutId')::uuid, 1, 'phase10b-delete-loadout'
  );
  result := public.delete_player_cosmetic_loadout(
    '11111111111111111111111111111132', repeat('d',64),
    (result ->> 'loadoutId')::uuid, 1, 'phase10b-delete-loadout'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'deleted',
    'outfit deletion replays the exact deterministic response after removal'
  );
  perform pg_temp.cosmetic_assert(
    (public.save_player_cosmetic_loadout(
      '11111111111111111111111111111132', repeat('d',64), 6, 'Too many',
      '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
      0, 'phase10b-loadout-six'
    ) ->> 'status') = 'invalid_request'
      and saved_loadout_id is not null,
    'loadout count remains bounded to five slots'
  );

  result := public.update_player_emote_wheel(
    '11111111111111111111111111111132', repeat('d',64),
    array['wave','cheer'], 0, 'phase10b-wheel-update'
  );
  replay := public.update_player_emote_wheel(
    '11111111111111111111111111111132', repeat('d',64),
    array['wave','cheer'], 0, 'phase10b-wheel-update'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'updated'
      and (result ->> 'revision')::integer = 1
      and (public.update_player_emote_wheel(
        '11111111111111111111111111111132', repeat('d',64),
        array['wave','nod'], 0, 'phase10b-wheel-update'
      ) ->> 'status') = 'request_already_processed'
      and (public.update_player_emote_wheel(
        '11111111111111111111111111111132', repeat('d',64),
        array['wave','wave'], 1, 'phase10b-wheel-duplicate'
      ) ->> 'status') = 'invalid_request',
    'emote-wheel updates are bounded, revision-safe, and reject changed request intent'
  );

  result := public.grant_admin_player_cosmetic(
    admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
    'development_test', 'Single-player local grant execution proof.',
    'not_owned', 'phase10b-grant'
  );
  replay := public.grant_admin_player_cosmetic(
    admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
    'development_test', 'Single-player local grant execution proof.',
    'not_owned', 'phase10b-grant'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'granted'
      and (select count(*) = 1 from public.player_cosmetic_ownership
           where player_profile_id = player_id
             and avatar_content_definition_id = grant_definition)
      and (select count(*) = 1 from public.cosmetic_ownership_receipts
           where request_id = 'phase10b-grant'),
    'duplicate grant retries return the original receipt without duplicate ownership'
  );
  perform pg_temp.cosmetic_assert(
    (public.grant_admin_player_cosmetic(
      admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
      'development_test', 'Changed explanation must conflict safely.',
      'not_owned', 'phase10b-grant'
    ) ->> 'status') = 'request_already_processed',
    'a grant request ID cannot be reused with changed intent'
  );
  perform pg_temp.cosmetic_assert(
    (public.grant_admin_player_cosmetic(
      admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-unpublished',
      'development_test', 'Unpublished content must remain unavailable.',
      'not_owned', 'phase10b-grant-unpublished'
    ) ->> 'status') = 'not_found',
    'unpublished cosmetics cannot be granted'
  );

  update public.player_avatar_profiles
  set top_version_id = grant_version, revision = revision + 1
  where player_profile_id = player_id;

  result := public.revoke_admin_player_cosmetic(
    admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
    'technical_incompatibility', 'Validated local safe fallback execution proof.',
    'owned', 'phase10b-revoke'
  );
  replay := public.revoke_admin_player_cosmetic(
    admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
    'technical_incompatibility', 'Validated local safe fallback execution proof.',
    'owned', 'phase10b-revoke'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'revoked'
      and result ->> 'fallbackApplied' = 'true'
      and (select ownership_state = 'revoked' from public.player_cosmetic_ownership
           where player_profile_id = player_id
             and avatar_content_definition_id = grant_definition),
    'revocation replays exactly, preserves the record, and applies a safe appearance fallback'
  );
  perform pg_temp.cosmetic_assert(
    (public.revoke_admin_player_cosmetic(
      admin_id, admin_auth_id, 'aal2', player_id, 'phase10b-lantern-top',
      'technical_incompatibility', 'Changed revocation intent must conflict.',
      'owned', 'phase10b-revoke'
    ) ->> 'status') = 'request_already_processed',
    'a revocation request ID cannot be reused with changed intent'
  );
  result := public.get_player_cosmetic_wardrobe(
    '11111111111111111111111111111132', repeat('d',64), 'phase10b-revoked-wardrobe'
  );
  perform pg_temp.cosmetic_assert(
    exists (
      select 1 from jsonb_array_elements(result -> 'ownedItems') item
      where item ->> 'key' = 'phase10b-lantern-top'
        and item ->> 'state' = 'revoked'
        and item ->> 'available' = 'false'
        and item ->> 'equipped' = 'false'
        and item -> 'usableVersionId' = 'null'::jsonb
    ),
    'revoked ownership remains explainable while equipped appearance uses a safe fallback'
  );

  insert into public.cosmetic_collection_definitions (
    id, collection_key, display_name, description, lifecycle_status,
    reward_avatar_content_definition_id, created_by_admin_id
  ) values (
    collection_id, 'phase10b-starter-set', 'Starter set',
    'Local exact-once cosmetic collection fixture.', 'active', reward_definition, admin_id
  );
  insert into public.cosmetic_collection_members (
    cosmetic_collection_id, avatar_content_definition_id, sort_order
  ) values (collection_id, starter_definition, 1);
  result := public.claim_player_cosmetic_collection_reward(
    '11111111111111111111111111111132', repeat('d',64),
    'phase10b-starter-set', 'phase10b-collection-claim'
  );
  replay := public.claim_player_cosmetic_collection_reward(
    '11111111111111111111111111111132', repeat('d',64),
    'phase10b-starter-set', 'phase10b-collection-claim'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'claimed'
      and (select count(*) = 1 from public.cosmetic_collection_reward_receipts
           where player_profile_id = player_id and cosmetic_collection_id = collection_id)
      and (select count(*) = 1 from public.cosmetic_ownership_receipts
           where request_id = 'phase10b-collection-claim'
             and operation_key = 'reward' and reason_category = 'collection_completion'),
    'collection completion grants one cosmetic-only reward and retries return the original receipt'
  );
  insert into public.cosmetic_collection_definitions (
    collection_key, display_name, description, lifecycle_status,
    reward_avatar_content_definition_id, created_by_admin_id
  ) values (
    'phase10b-other-set', 'Other set', 'Changed request intent fixture.',
    'active', reward_definition, admin_id
  );
  insert into public.cosmetic_collection_members (
    cosmetic_collection_id, avatar_content_definition_id, sort_order
  ) select id, starter_definition, 1 from public.cosmetic_collection_definitions
    where collection_key = 'phase10b-other-set';
  perform pg_temp.cosmetic_assert(
    (public.claim_player_cosmetic_collection_reward(
      '11111111111111111111111111111132', repeat('d',64),
      'phase10b-other-set', 'phase10b-collection-claim'
    ) ->> 'status') = 'request_conflict',
    'a collection settlement request ID cannot be reused for a different collection'
  );
  insert into public.cosmetic_collection_definitions (
    collection_key, display_name, description, lifecycle_status,
    reward_avatar_content_definition_id, created_by_admin_id
  ) values (
    'phase10b-unavailable-reward', 'Unavailable reward',
    'Unavailable reward fixture.', 'active', draft_definition, admin_id
  );
  insert into public.cosmetic_collection_members (
    cosmetic_collection_id, avatar_content_definition_id, sort_order
  ) select id, starter_definition, 1 from public.cosmetic_collection_definitions
    where collection_key = 'phase10b-unavailable-reward';
  perform pg_temp.cosmetic_assert(
    (public.claim_player_cosmetic_collection_reward(
      '11111111111111111111111111111132', repeat('d',64),
      'phase10b-unavailable-reward', 'phase10b-unavailable-reward-claim'
    ) ->> 'status') = 'content_unavailable',
    'collection settlement cannot issue an unavailable reward definition'
  );

  result := public.activate_player_emote(
    '11111111111111111111111111111132', repeat('d',64), 'wave', 'phase10b-emote-wave'
  );
  replay := public.activate_player_emote(
    '11111111111111111111111111111132', repeat('d',64), 'wave', 'phase10b-emote-wave'
  );
  perform pg_temp.cosmetic_assert(
    result = replay and result ->> 'status' = 'activated'
      and result #>> '{event,type}' = 'player.emote'
      and octet_length((result -> 'event')::text) < 512
      and not ((result -> 'event') ? 'walletAddress')
      and not ((result -> 'event') ? 'ownership'),
    'emote activation is idempotent, compact, and omits private ownership fields'
  );
  perform pg_temp.cosmetic_assert(
    (public.activate_player_emote(
      '11111111111111111111111111111132', repeat('d',64),
      'cheer', 'phase10b-emote-wave'
    ) ->> 'status') = 'request_conflict',
    'an emote activation request ID cannot be reused for a different emote'
  );
  perform pg_temp.cosmetic_assert(
    (public.activate_player_emote(
      '11111111111111111111111111111132', repeat('d',64),
      repeat('e',81), 'phase10b-emote-oversized'
    ) ->> 'status') = 'invalid_request',
    'oversized emote keys are rejected'
  );

  select coalesce((
    select balance from public.player_dust_accounts where player_profile_id = player_id
  ), 0) into after_dust;
  select count(*)::integer into after_dust_events
  from public.player_dust_ledger where player_profile_id = player_id;
  perform pg_temp.cosmetic_assert(
    before_dust = after_dust and before_dust_events = after_dust_events,
    'ownership, outfits, emotes, collections, grants, and revocations do not mutate DUST'
  );

  update public.cosmetic_settings set wardrobe_enabled = false where game_key = 'starville';
  perform pg_temp.cosmetic_assert(
    (public.get_player_cosmetic_wardrobe(
      '11111111111111111111111111111132', repeat('d',64), 'phase10b-disabled'
    ) ->> 'status') = 'module_disabled'
      and (select count(*) = 1 from public.player_cosmetic_loadouts where id = saved_loadout_id),
    'disabling Wardrobe blocks new access while preserving saved outfits'
  );
  update public.cosmetic_settings set wardrobe_enabled = true where game_key = 'starville';

  begin
    update public.cosmetic_ownership_receipts set reason = 'Attempted mutation.'
    where request_id = 'phase10b-grant';
  exception when sqlstate '42501' then immutable_rejected := true;
  end;
  perform pg_temp.cosmetic_assert(immutable_rejected, 'completed ownership receipts are immutable');

  begin
    insert into public.cosmetic_collection_definitions (
      collection_key, display_name, description
    ) values (repeat('c',81), 'Oversized key', 'Must fail.');
  exception when check_violation then oversized_rejected := true;
  end;
  perform pg_temp.cosmetic_assert(oversized_rejected, '81-character cosmetic keys are rejected');

  result := public.get_resolved_public_avatar(
    (select appearance_id from public.player_avatar_profiles where player_profile_id = player_id),
    'phase10b-public-avatar'
  );
  perform pg_temp.cosmetic_assert(
    result ->> 'status' = 'loaded'
      and not (result -> 'appearance' ? 'ownedItems')
      and not (result -> 'appearance' ? 'acquisitionHistory')
      and not (result -> 'appearance' ? 'grantReason'),
    'public appearance resolution never exposes ownership or administrator history'
  );
  for load_iteration in 1..125 loop
    result := public.get_player_cosmetic_wardrobe(
      '11111111111111111111111111111132', repeat('d',64),
      'phase10b-load-wardrobe-' || load_iteration::text
    );
    perform pg_temp.cosmetic_assert(
      result ->> 'status' = 'loaded',
      'representative repeated Wardrobe reads remain available'
    );
    result := public.list_admin_cosmetic_audit(
      admin_id, admin_auth_id, 'aal2', ((load_iteration - 1) % 5) + 1, 20
    );
    perform pg_temp.cosmetic_assert(
      result ->> 'status' = 'loaded' and jsonb_array_length(result -> 'items') <= 20,
      'representative administrator audit pagination remains bounded'
    );
  end loop;
  -- API-created loadouts always persist the complete public AvatarSelection shape.
  -- Keep the earlier partial SQL fixture for null-slot execution coverage, then
  -- emit a production-shaped row for the shared TypeScript contract assertion.
  update public.player_cosmetic_loadouts set selection = '{
    "bodyPresetKey":"meadow-frame",
    "skinPaletteKey":"warm-tone",
    "faceKey":"soft-face",
    "eyesKey":"bright-eyes",
    "eyebrowsKey":"soft-brows",
    "hairKey":"meadow-hair",
    "hairPaletteKey":"chestnut-color",
    "topKey":"lantern-top",
    "bottomKey":"meadow-bottom",
    "footwearKey":"trail-shoes",
    "accessoryKeys":["phase10b-starter-hat"],
    "presetKey":null
  }'::jsonb where id = saved_loadout_id;
end;
$$;

select 'PHASE10B_CONTRACT_SAMPLE|' || private.cosmetic_wardrobe_json(
  '10b00000-0000-4000-8000-000000000001'
)::text as contract_sample;
select 'Phase 10B cosmetic postgres execution assertions passed' as result;
rollback;
