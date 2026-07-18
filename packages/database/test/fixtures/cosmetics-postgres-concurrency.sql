-- Persistent local fixture for independent-connection Phase 10B race tests.
begin;

do $$
declare
  admin_id constant uuid := '10b10000-0000-4000-8000-000000000001';
  admin_auth_id constant uuid := '10b10000-0000-4000-8000-000000000002';
  admin_session_id constant uuid := '10b10000-0000-4000-8000-000000000003';
  player_id constant uuid := '10b10000-0000-4000-8000-000000000004';
  challenge_id constant uuid := '10b10000-0000-4000-8000-000000000005';
  access_id constant uuid := '10b10000-0000-4000-8000-000000000006';
  starter_definition constant uuid := '10b10000-0000-4000-8000-000000000010';
  starter_version constant uuid := '10b10000-0000-4000-8000-000000000011';
  grant_definition constant uuid := '10b10000-0000-4000-8000-000000000020';
  grant_version constant uuid := '10b10000-0000-4000-8000-000000000021';
  reward_definition constant uuid := '10b10000-0000-4000-8000-000000000030';
  reward_version constant uuid := '10b10000-0000-4000-8000-000000000031';
  collection_id constant uuid := '10b10000-0000-4000-8000-000000000040';
  role_id uuid;
  config_id uuid;
  map_version_id uuid;
  admin_permission_version integer;
  admin_session_version integer;
  initial_loadout jsonb;
begin
  select id into strict role_id from public.admin_roles where key = 'super_admin';
  insert into auth.users(id, email) values (admin_id, 'phase10b-race-admin@example.invalid');
  insert into auth.sessions(id, user_id) values (admin_auth_id, admin_id);
  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  values (admin_id, role_id, 'active', 'Phase 10B Race Admin', false)
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
    (starter_definition, 'phase10b-race-starter', 'accessory', 'accessory', 'head_accessory',
     'Race starter', 'Concurrency starter cosmetic.', 'starter', admin_id),
    (grant_definition, 'phase10b-race-grant', 'accessory', 'accessory', 'face_accessory',
     'Race grant', 'Concurrency grant cosmetic.', 'standard', admin_id),
    (reward_definition, 'phase10b-race-reward', 'accessory', 'accessory', 'back_accessory',
     'Race reward', 'Concurrency collection reward.', 'standard', admin_id);
  insert into public.avatar_content_versions (
    id, avatar_content_definition_id, version_number, lifecycle_status,
    public_name, description, render_order, frame_width, frame_height,
    sheet_rows, sheet_columns, created_by_admin_id, submitted_by_admin_id,
    reviewed_by_admin_id, approved_by_admin_id, activated_by_admin_id,
    submitted_at, reviewed_at, approved_at, activated_at
  ) values
    (starter_version, starter_definition, 1, 'active', 'Race starter', 'Starter.',
     70, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
     now(), now(), now(), now()),
    (grant_version, grant_definition, 1, 'active', 'Race grant', 'Grant.',
     71, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
     now(), now(), now(), now()),
    (reward_version, reward_definition, 1, 'active', 'Race reward', 'Reward.',
     72, 32, 48, 1, 1, admin_id, admin_id, admin_id, admin_id, admin_id,
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
    challenge_id, '11111111111111111111111111111133', 'solana:devnet', config_id, 1,
    repeat('a',64), repeat('b',64), 'localhost', 'http://localhost:3000',
    now() - interval '1 minute', now() + interval '4 minutes', now(),
    'phase10b-race-challenge', repeat('c',64)
  );
  insert into public.wallet_access_sessions (
    id, challenge_id, wallet_address, network, token_gate_config_id,
    config_version_snapshot, session_token_hash, observed_balance_raw,
    required_balance_raw, checked_slot, last_balance_check_at, expires_at
  ) values (
    access_id, challenge_id, '11111111111111111111111111111133', 'solana:devnet',
    config_id, 1, repeat('e',64), 1000, 1000, 1, now(), now() + interval '30 minutes'
  );
  insert into public.player_profiles (
    id, wallet_address, display_name, appearance_preset, current_map_id,
    current_map_version_id, safe_position_x, safe_position_y, facing_direction
  ) values (
    player_id, '11111111111111111111111111111133', 'Cosmetic Racer', 'moss',
    'lantern-square', map_version_id, 12, 8, 'south'
  );

  initial_loadout := public.save_player_cosmetic_loadout(
    '11111111111111111111111111111133', repeat('e',64), 1, 'Initial outfit',
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":[]}'::jsonb,
    0, 'phase10b-race-loadout-initial'
  );
  if initial_loadout ->> 'status' <> 'saved' then
    raise exception 'Phase 10B race loadout setup failed';
  end if;

  insert into public.cosmetic_collection_definitions (
    id, collection_key, display_name, description, lifecycle_status,
    reward_avatar_content_definition_id, created_by_admin_id
  ) values (
    collection_id, 'phase10b-race-collection', 'Race collection',
    'Concurrency reward settlement fixture.', 'active', reward_definition, admin_id
  );
  insert into public.cosmetic_collection_members (
    cosmetic_collection_id, avatar_content_definition_id, sort_order
  ) values (collection_id, starter_definition, 1);
end;
$$;

commit;
