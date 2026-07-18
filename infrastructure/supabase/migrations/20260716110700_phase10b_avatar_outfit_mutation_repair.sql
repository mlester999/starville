-- Starville Phase 10B: deploy the current canonical avatar mutation boundary
-- forward-only and parse resolved accessory UUID strings without JSON quotes.
-- The linked Phase 10A history predates the create/update RPCs, while its
-- preview RPC contains the same unsafe jsonb::text::uuid conversion.

create or replace function public.preview_player_avatar(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare resolved jsonb;
declare version_id uuid;
declare items jsonb := '[]'::jsonb;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_REQUEST_ID';
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  if not private.claim_avatar_rate_limit('player_preview', p_wallet_address, 120, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not private.avatar_module_enabled() then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  resolved := private.resolve_avatar_selection(p_selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  for version_id in
    select (value #>> '{}')::uuid from jsonb_array_elements(
      jsonb_build_array(
        resolved -> 'faceVersionId', resolved -> 'eyesVersionId',
        resolved -> 'eyebrowsVersionId', resolved -> 'hairVersionId',
        resolved -> 'topVersionId', resolved -> 'bottomVersionId',
        resolved -> 'footwearVersionId'
      ) || coalesce(resolved -> 'accessoryVersionIds', '[]'::jsonb)
    ) value where jsonb_typeof(value) = 'string'
  loop
    items := items || jsonb_build_array(
      private.avatar_content_selection_json(version_id, true, false)
    );
  end loop;
  return jsonb_build_object('status', 'previewed', 'preview', jsonb_build_object(
    'selection', p_selection, 'resolvedVersionIds', resolved, 'items', items
  ));
end;
$$;

create or replace function private.mutate_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text,
  p_operation text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  access_session public.wallet_access_sessions%rowtype;
  player public.player_profiles%rowtype;
  moderation public.player_moderation_states%rowtype;
  avatar public.player_avatar_profiles%rowtype;
  settings public.avatar_settings%rowtype;
  denial text;
  resolved jsonb;
  request_hash_value text;
  replay_hash text;
  replay_response jsonb;
  before_profile jsonb;
  after_profile jsonb;
  result jsonb;
  accessory jsonb;
  accessory_order integer := 0;
  selected_ids uuid[];
begin
  if p_operation not in ('create', 'update')
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or p_expected_revision is null or p_expected_revision < 0
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_access_session_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_PROFILE_MUTATION';
  end if;
  request_hash_value := encode(extensions.digest(convert_to(
    p_operation || ':' || p_expected_revision::text || ':' || p_selection::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'avatar-idempotency:' || p_wallet_address || ':' || p_operation || ':' || p_request_id, 0
  ));

  select * into access_session from public.wallet_access_sessions
  where session_token_hash = p_access_session_token_hash
    and wallet_address = p_wallet_address
  for share;
  if not found then return jsonb_build_object('status', 'access_revoked'); end if;
  select * into player from public.player_profiles
  where wallet_address = p_wallet_address
  for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  denial := private.avatar_player_denial(access_session, player);
  if denial is not null then return jsonb_build_object('status', denial); end if;

  select request_hash, response_body into replay_hash, replay_response
  from public.avatar_idempotency
  where subject_key = p_wallet_address and operation = 'player_' || p_operation
    and request_id = p_request_id and expires_at > now();
  if replay_response is not null then
    if replay_hash = request_hash_value then return replay_response; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;

  if not private.avatar_module_enabled_locked() then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  select * into settings from public.avatar_settings
  where game_key = 'starville' for share;
  if settings.maintenance_mode then return jsonb_build_object('status', 'maintenance'); end if;
  if not settings.customization_enabled then
    return jsonb_build_object('status', 'module_disabled');
  end if;
  if not private.claim_avatar_rate_limit(
    case p_operation when 'create' then 'player_create' else 'player_update' end,
    p_wallet_address, 20, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;

  select * into moderation from public.player_moderation_states
  where player_profile_id = player.id for share;
  if moderation.status = 'suspended' then return jsonb_build_object('status', 'suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  select * into avatar from public.player_avatar_profiles
  where player_profile_id = player.id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if (p_operation = 'create' and (avatar.revision <> 0 or avatar.creator_completed_at is not null))
     or (p_operation = 'update' and avatar.creator_completed_at is null)
     or avatar.revision <> p_expected_revision then
    return jsonb_build_object(
      'status', 'profile_changed',
      'profile', private.avatar_profile_json(avatar, true, true)
    );
  end if;

  resolved := private.resolve_avatar_selection(p_selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  selected_ids := array_remove(array[
    (resolved ->> 'faceVersionId')::uuid,
    (resolved ->> 'eyesVersionId')::uuid,
    (resolved ->> 'eyebrowsVersionId')::uuid,
    (resolved ->> 'hairVersionId')::uuid,
    (resolved ->> 'topVersionId')::uuid,
    (resolved ->> 'bottomVersionId')::uuid,
    (resolved ->> 'footwearVersionId')::uuid
  ]::uuid[], null) || coalesce(array(
    select value::uuid
    from jsonb_array_elements_text(resolved -> 'accessoryVersionIds') item(value)
  ), array[]::uuid[]);
  perform 1
  from public.avatar_content_versions version
  join public.avatar_content_definitions definition
    on definition.id = version.avatar_content_definition_id
  where version.id = any(selected_ids)
    and version.lifecycle_status = 'active'
    and definition.enabled and definition.active_version_id = version.id
  for share of version, definition;
  perform 1 from public.avatar_body_presets
  where id = (resolved ->> 'bodyPresetId')::uuid and enabled for share;
  if resolved ->> 'skinPaletteId' is not null then
    perform 1 from public.avatar_palette_definitions
    where id = (resolved ->> 'skinPaletteId')::uuid
      and lifecycle_status = 'active' for share;
  end if;
  if resolved ->> 'hairPaletteId' is not null then
    perform 1 from public.avatar_palette_definitions
    where id = (resolved ->> 'hairPaletteId')::uuid
      and lifecycle_status = 'active' for share;
  end if;
  if resolved ->> 'presetVersionId' is not null then
    perform 1 from public.avatar_presets
    where id = (resolved ->> 'presetVersionId')::uuid
      and lifecycle_status = 'active' for share;
  end if;

  before_profile := private.avatar_profile_json(avatar, true, true);
  delete from public.player_avatar_profile_accessories
  where player_avatar_profile_id = avatar.id;
  update public.player_avatar_profiles set
    body_preset_id = (resolved ->> 'bodyPresetId')::uuid,
    skin_palette_id = (resolved ->> 'skinPaletteId')::uuid,
    face_version_id = (resolved ->> 'faceVersionId')::uuid,
    eyes_version_id = (resolved ->> 'eyesVersionId')::uuid,
    eyebrows_version_id = (resolved ->> 'eyebrowsVersionId')::uuid,
    hair_version_id = (resolved ->> 'hairVersionId')::uuid,
    hair_palette_id = (resolved ->> 'hairPaletteId')::uuid,
    top_version_id = (resolved ->> 'topVersionId')::uuid,
    bottom_version_id = (resolved ->> 'bottomVersionId')::uuid,
    footwear_version_id = (resolved ->> 'footwearVersionId')::uuid,
    preset_version_id = (resolved ->> 'presetVersionId')::uuid,
    revision = revision + 1,
    creator_completed_at = coalesce(creator_completed_at, now())
  where id = avatar.id
  returning * into avatar;
  for accessory in select value from jsonb_array_elements(resolved -> 'accessoryVersionIds') loop
    insert into public.player_avatar_profile_accessories (
      player_avatar_profile_id, avatar_content_version_id, sort_order
    ) values (avatar.id, (accessory #>> '{}')::uuid, accessory_order);
    accessory_order := accessory_order + 1;
  end loop;
  after_profile := private.avatar_profile_json(avatar, true, true);
  insert into public.player_avatar_profile_history (
    player_avatar_profile_id, revision, actor_type, actor_player_profile_id,
    request_id, before_profile, after_profile
  ) values (
    avatar.id, avatar.revision, 'player', player.id,
    p_request_id, before_profile, after_profile
  );
  result := jsonb_build_object(
    'status', case p_operation when 'create' then 'created' else 'updated' end,
    'profile', after_profile
  );
  delete from public.avatar_idempotency
  where subject_key = p_wallet_address and operation = 'player_' || p_operation
    and request_id = p_request_id and expires_at <= now();
  insert into public.avatar_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (
    p_wallet_address, 'player_' || p_operation, p_request_id,
    request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.create_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.mutate_player_avatar_profile(
    p_wallet_address, p_access_session_token_hash, p_expected_revision,
    p_selection, p_request_id, 'create'
  );
$$;

create or replace function public.update_player_avatar_profile(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_expected_revision integer,
  p_selection jsonb,
  p_request_id text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.mutate_player_avatar_profile(
    p_wallet_address, p_access_session_token_hash, p_expected_revision,
    p_selection, p_request_id, 'update'
  );
$$;

revoke all on function private.mutate_player_avatar_profile(text,text,integer,jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.preview_player_avatar(text,text,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.preview_player_avatar(text,text,jsonb,text) to service_role;
revoke all on function public.create_player_avatar_profile(text,text,integer,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_player_avatar_profile(text,text,integer,jsonb,text)
  to service_role;
revoke all on function public.update_player_avatar_profile(text,text,integer,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_player_avatar_profile(text,text,integer,jsonb,text)
  to service_role;
