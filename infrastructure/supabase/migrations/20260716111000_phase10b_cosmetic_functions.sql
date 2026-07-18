-- Starville Phase 10B: narrow server-authoritative wardrobe, loadout, emote,
-- collection, grant, revocation, and disabled-shop RPC boundary.

create or replace function private.bootstrap_player_cosmetics(p_player_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.player_cosmetic_ownership (
    player_profile_id, avatar_content_definition_id, source_key
  )
  select p_player_profile_id, definition.id, 'starter_catalog'
  from public.avatar_content_definitions definition
  join public.avatar_content_versions version on version.id = definition.active_version_id
  where definition.enabled and definition.access_level = 'starter'
    and version.lifecycle_status = 'active'
  on conflict (player_profile_id, avatar_content_definition_id) do nothing;

  insert into public.player_emote_entitlements (player_profile_id, emote_key, source_key)
  select p_player_profile_id, emote.emote_key, 'starter_catalog'
  from public.cosmetic_emote_definitions emote
  where emote.lifecycle_status = 'active' and emote.starter_entitlement
  on conflict (player_profile_id, emote_key) do nothing;

  insert into public.player_emote_wheels (player_profile_id, emote_keys)
  select p_player_profile_id, coalesce(array_agg(emote.emote_key order by emote.emote_key), '{}'::text[])
  from (
    select definition.emote_key
    from public.cosmetic_emote_definitions definition
    where definition.lifecycle_status = 'active' and definition.starter_entitlement
    order by definition.emote_key limit 8
  ) emote
  on conflict (player_profile_id) do nothing;
end;
$$;

create or replace function private.bootstrap_new_player_cosmetics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bootstrap_player_cosmetics(new.id);
  return new;
end;
$$;

create trigger player_profiles_bootstrap_cosmetics
after insert on public.player_profiles
for each row execute function private.bootstrap_new_player_cosmetics();

do $$
declare player_id uuid;
begin
  for player_id in select id from public.player_profiles loop
    perform private.bootstrap_player_cosmetics(player_id);
  end loop;
end;
$$;

create or replace function private.cosmetic_selection_owned(
  p_player_profile_id uuid,
  p_selection jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare resolved jsonb;
declare version_id uuid;
begin
  resolved := private.resolve_avatar_selection(p_selection, false);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  for version_id in
    select selected.id
    from unnest(array_remove(array[
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
    ), '{}'::uuid[])) selected(id)
  loop
    if not exists (
      select 1
      from public.avatar_content_versions version
      join public.avatar_content_definitions definition
        on definition.id = version.avatar_content_definition_id
      left join public.player_cosmetic_ownership ownership
        on ownership.player_profile_id = p_player_profile_id
       and ownership.avatar_content_definition_id = definition.id
      where version.id = version_id
        and (
          ownership.ownership_state = 'owned'
          or (definition.access_level = 'starter' and ownership.id is null)
        )
    ) then return jsonb_build_object('status', 'not_owned'); end if;
  end loop;
  return resolved;
end;
$$;

create or replace function private.enforce_avatar_cosmetic_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare selected_id uuid;
begin
  foreach selected_id in array array_remove(array[
    new.face_version_id, new.eyes_version_id, new.eyebrows_version_id,
    new.hair_version_id, new.top_version_id, new.bottom_version_id,
    new.footwear_version_id
  ]::uuid[], null) loop
    if not exists (
      select 1
      from public.avatar_content_versions version
      join public.avatar_content_definitions definition
        on definition.id = version.avatar_content_definition_id
      left join public.player_cosmetic_ownership ownership
        on ownership.player_profile_id = new.player_profile_id
       and ownership.avatar_content_definition_id = definition.id
      where version.id = selected_id
        and (ownership.ownership_state = 'owned'
          or (definition.access_level = 'starter' and ownership.id is null))
    ) then raise exception using errcode = '42501', message = 'COSMETIC_NOT_OWNED'; end if;
  end loop;
  return new;
end;
$$;

create trigger player_avatar_profiles_enforce_cosmetic_ownership
before update of face_version_id, eyes_version_id, eyebrows_version_id, hair_version_id,
  top_version_id, bottom_version_id, footwear_version_id
on public.player_avatar_profiles
for each row execute function private.enforce_avatar_cosmetic_ownership();

create or replace function private.enforce_avatar_accessory_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare player_id uuid;
begin
  select player_profile_id into strict player_id
  from public.player_avatar_profiles where id = new.player_avatar_profile_id;
  if not exists (
    select 1
    from public.avatar_content_versions version
    join public.avatar_content_definitions definition
      on definition.id = version.avatar_content_definition_id
    left join public.player_cosmetic_ownership ownership
      on ownership.player_profile_id = player_id
     and ownership.avatar_content_definition_id = definition.id
    where version.id = new.avatar_content_version_id
      and (ownership.ownership_state = 'owned'
        or (definition.access_level = 'starter' and ownership.id is null))
  ) then raise exception using errcode = '42501', message = 'COSMETIC_NOT_OWNED'; end if;
  return new;
end;
$$;

create trigger player_avatar_accessories_enforce_cosmetic_ownership
before insert or update on public.player_avatar_profile_accessories
for each row execute function private.enforce_avatar_accessory_ownership();

create or replace function private.cosmetic_module_status(p_module_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when settings.maintenance_mode then 'maintenance'
    when p_module_key = 'wardrobe' and settings.wardrobe_enabled then 'enabled'
    when p_module_key = 'emotes' and settings.emotes_enabled then 'enabled'
    when p_module_key = 'cosmetic_collections' and settings.collections_enabled then 'enabled'
    else 'module_disabled'
  end
  from public.cosmetic_settings settings where settings.game_key = 'starville';
$$;

create or replace function private.cosmetic_shop_json()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', false,
    'lifecycle', 'disabled_preview',
    'currency', 'DUST',
    'purchaseAvailable', false,
    'message', settings.message,
    'offers', '[]'::jsonb
  )
  from public.cosmetic_shop_settings settings where settings.game_key = 'starville';
$$;

create or replace function private.cosmetic_wardrobe_json(p_player_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'loaded',
    'ownedItems', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ownershipId', ownership.id,
        'definitionId', definition.id,
        'key', definition.content_key,
        'name', definition.display_name,
        'category', definition.category,
        'layer', definition.content_layer,
        'source', ownership.source_key,
        'sourceLabel', source.display_name,
        'state', ownership.ownership_state,
        'available', ownership.ownership_state = 'owned'
          and definition.enabled and version.lifecycle_status = 'active',
        'equipped', exists (
          select 1
          from public.player_avatar_profiles avatar
          where avatar.player_profile_id = ownership.player_profile_id
            and (
              avatar.face_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.eyes_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.eyebrows_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.hair_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.top_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.bottom_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or avatar.footwear_version_id in (
                select owned_version.id from public.avatar_content_versions owned_version
                where owned_version.avatar_content_definition_id = definition.id
              )
              or exists (
                select 1
                from public.player_avatar_profile_accessories accessory
                join public.avatar_content_versions accessory_version
                  on accessory_version.id = accessory.avatar_content_version_id
                where accessory.player_avatar_profile_id = avatar.id
                  and accessory_version.avatar_content_definition_id = definition.id
              )
            )
        ),
        'usableVersionId', case
          when ownership.ownership_state = 'owned'
            and definition.enabled and version.lifecycle_status = 'active'
          then version.id else null end,
        'usableVersionNumber', case
          when ownership.ownership_state = 'owned'
            and definition.enabled and version.lifecycle_status = 'active'
          then version.version_number else null end,
        'previewMediaUrl', null,
        'acquiredAt', ownership.acquired_at
      ) order by ownership.ownership_state, definition.category, definition.display_name), '[]'::jsonb)
      from public.player_cosmetic_ownership ownership
      join public.cosmetic_acquisition_sources source on source.source_key = ownership.source_key
      join public.avatar_content_definitions definition
        on definition.id = ownership.avatar_content_definition_id
      left join public.avatar_content_versions version on version.id = definition.active_version_id
      where ownership.player_profile_id = p_player_profile_id
    ),
    'loadouts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'loadoutId', loadout.id, 'slot', loadout.slot_number,
        'name', loadout.display_name, 'selection', loadout.selection,
        'revision', loadout.revision, 'active', loadout.is_active,
        'updatedAt', loadout.updated_at
      ) order by loadout.slot_number), '[]'::jsonb)
      from public.player_cosmetic_loadouts loadout
      where loadout.player_profile_id = p_player_profile_id
    ),
    'emotes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', definition.emote_key, 'name', definition.display_name,
        'durationMs', definition.duration_ms, 'interruptible', definition.interruptible,
        'owned', entitlement.player_profile_id is not null,
        'sourceLabel', coalesce(source.display_name, 'Unavailable')
      ) order by definition.display_name), '[]'::jsonb)
      from public.cosmetic_emote_definitions definition
      left join public.player_emote_entitlements entitlement
        on entitlement.emote_key = definition.emote_key
       and entitlement.player_profile_id = p_player_profile_id
      left join public.cosmetic_acquisition_sources source
        on source.source_key = entitlement.source_key
      where definition.lifecycle_status = 'active'
    ),
    'emoteWheel', coalesce((
      select to_jsonb(wheel.emote_keys) from public.player_emote_wheels wheel
      where wheel.player_profile_id = p_player_profile_id
    ), '[]'::jsonb),
    'emoteWheelRevision', coalesce((
      select wheel.revision from public.player_emote_wheels wheel
      where wheel.player_profile_id = p_player_profile_id
    ), 0),
    'collections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', collection.collection_key, 'name', collection.display_name,
        'description', collection.description,
        'ownedCount', progress.owned_count, 'requiredCount', progress.required_count,
        'completed', progress.required_count > 0 and progress.owned_count = progress.required_count,
        'rewardKey', reward.content_key,
        'rewardClaimed', receipt.id is not null
      ) order by collection.display_name), '[]'::jsonb)
      from public.cosmetic_collection_definitions collection
      left join public.avatar_content_definitions reward
        on reward.id = collection.reward_avatar_content_definition_id
      left join public.cosmetic_collection_reward_receipts receipt
        on receipt.cosmetic_collection_id = collection.id
       and receipt.player_profile_id = p_player_profile_id
      cross join lateral (
        select count(member.avatar_content_definition_id)::integer as required_count,
          count(ownership.id) filter (where ownership.ownership_state = 'owned')::integer as owned_count
        from public.cosmetic_collection_members member
        left join public.player_cosmetic_ownership ownership
          on ownership.avatar_content_definition_id = member.avatar_content_definition_id
         and ownership.player_profile_id = p_player_profile_id
        where member.cosmetic_collection_id = collection.id
      ) progress
      where collection.lifecycle_status = 'active'
    ),
    'shop', private.cosmetic_shop_json()
  );
$$;

create or replace function private.cosmetic_replay(
  p_subject_key text,
  p_operation text,
  p_request_id text,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare stored_hash text;
declare stored_response jsonb;
begin
  select request_hash, response_body into stored_hash, stored_response
  from public.cosmetic_idempotency
  where subject_key = p_subject_key and operation = p_operation
    and request_id = p_request_id and expires_at > now();
  if stored_response is null then return null; end if;
  if stored_hash <> p_request_hash then
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  return stored_response;
end;
$$;

create or replace function private.store_cosmetic_replay(
  p_subject_key text,
  p_operation text,
  p_request_id text,
  p_request_hash text,
  p_response jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.cosmetic_idempotency
  where subject_key = p_subject_key and operation = p_operation
    and request_id = p_request_id and expires_at <= now();
  insert into public.cosmetic_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (p_subject_key, p_operation, p_request_id, p_request_hash, p_response);
end;
$$;

create or replace function public.get_player_cosmetic_wardrobe(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare module_status text;
begin
  if char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_COSMETIC_REQUEST_ID';
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('wardrobe');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  perform private.bootstrap_player_cosmetics(player_id);
  return private.cosmetic_wardrobe_json(player_id);
end;
$$;

create or replace function public.save_player_cosmetic_loadout(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_slot integer,
  p_display_name text,
  p_selection jsonb,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare existing public.player_cosmetic_loadouts%rowtype;
declare resolved jsonb;
declare result jsonb;
declare request_hash_value text;
declare replay public.cosmetic_idempotency%rowtype;
declare module_status text;
begin
  if p_slot not between 1 and 5
     or char_length(coalesce(p_display_name, '')) not between 1 and 40
     or p_display_name <> btrim(p_display_name) or p_display_name ~ '[[:cntrl:]<>]'
     or p_expected_revision < 0
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('wardrobe');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  request_hash_value := encode(extensions.digest(
    p_slot::text || ':' || p_display_name || ':' || p_selection::text || ':' || p_expected_revision::text,
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cosmetic-idempotency:' || player_id::text || ':save_loadout:' || p_request_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-loadout:' || player_id::text || ':' || p_slot::text, 0)
  );
  select * into replay from public.cosmetic_idempotency
  where subject_key = player_id::text and operation = 'save_loadout'
    and request_id = p_request_id and expires_at > now();
  if found then
    if replay.request_hash = request_hash_value then return replay.response_body; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  perform private.bootstrap_player_cosmetics(player_id);
  resolved := private.cosmetic_selection_owned(player_id, p_selection);
  if resolved ->> 'status' <> 'resolved' then return resolved; end if;
  select * into existing from public.player_cosmetic_loadouts
  where player_profile_id = player_id and slot_number = p_slot for update;
  if (found and existing.revision <> p_expected_revision)
     or (not found and p_expected_revision <> 0) then
    return jsonb_build_object('status', 'loadout_changed');
  end if;
  insert into public.player_cosmetic_loadouts (
    player_profile_id, slot_number, display_name, selection
  ) values (player_id, p_slot, p_display_name, p_selection)
  on conflict (player_profile_id, slot_number) do update set
    display_name = excluded.display_name,
    selection = excluded.selection,
    revision = player_cosmetic_loadouts.revision + 1
  returning jsonb_build_object(
    'status', 'saved', 'loadoutId', id, 'slot', slot_number,
    'name', display_name, 'selection', selection, 'revision', revision,
    'active', is_active, 'updatedAt', updated_at
  ) into result;
  insert into public.cosmetic_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (player_id::text, 'save_loadout', p_request_id, request_hash_value, result);
  return result;
end;
$$;

create or replace function public.rename_player_cosmetic_loadout(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_loadout_id uuid,
  p_display_name text,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare loadout public.player_cosmetic_loadouts%rowtype;
declare module_status text;
declare result jsonb;
declare request_hash_value text;
declare replay public.cosmetic_idempotency%rowtype;
begin
  if char_length(coalesce(p_display_name, '')) not between 1 and 40
     or p_display_name <> btrim(p_display_name) or p_display_name ~ '[[:cntrl:]<>]'
     or p_expected_revision <= 0
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('wardrobe');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  request_hash_value := encode(extensions.digest(
    p_loadout_id::text || ':' || p_display_name || ':' || p_expected_revision::text,
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cosmetic-idempotency:' || player_id::text || ':rename_loadout:' || p_request_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-loadout-id:' || p_loadout_id::text, 0)
  );
  select * into replay from public.cosmetic_idempotency
  where subject_key = player_id::text and operation = 'rename_loadout'
    and request_id = p_request_id and expires_at > now();
  if found then
    if replay.request_hash = request_hash_value then return replay.response_body; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  select * into loadout from public.player_cosmetic_loadouts
  where id = p_loadout_id and player_profile_id = player_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if loadout.revision <> p_expected_revision then return jsonb_build_object('status', 'loadout_changed'); end if;
  update public.player_cosmetic_loadouts set
    display_name = p_display_name, revision = revision + 1
  where id = loadout.id returning * into loadout;
  result := jsonb_build_object(
    'status', 'renamed', 'loadoutId', loadout.id, 'name', loadout.display_name,
    'revision', loadout.revision, 'updatedAt', loadout.updated_at
  );
  insert into public.cosmetic_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (player_id::text, 'rename_loadout', p_request_id, request_hash_value, result);
  return result;
end;
$$;

create or replace function public.delete_player_cosmetic_loadout(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_loadout_id uuid,
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare deleted_id uuid;
declare module_status text;
declare result jsonb;
declare request_hash_value text;
declare replay public.cosmetic_idempotency%rowtype;
begin
  if p_expected_revision <= 0 or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('wardrobe');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  request_hash_value := encode(extensions.digest(
    p_loadout_id::text || ':' || p_expected_revision::text, 'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cosmetic-idempotency:' || player_id::text || ':delete_loadout:' || p_request_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-loadout-id:' || p_loadout_id::text, 0)
  );
  select * into replay from public.cosmetic_idempotency
  where subject_key = player_id::text and operation = 'delete_loadout'
    and request_id = p_request_id and expires_at > now();
  if found then
    if replay.request_hash = request_hash_value then return replay.response_body; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  delete from public.player_cosmetic_loadouts
  where id = p_loadout_id and player_profile_id = player_id and revision = p_expected_revision
  returning id into deleted_id;
  if deleted_id is null then return jsonb_build_object('status', 'loadout_changed'); end if;
  result := jsonb_build_object('status', 'deleted', 'loadoutId', deleted_id);
  insert into public.cosmetic_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (player_id::text, 'delete_loadout', p_request_id, request_hash_value, result);
  return result;
end;
$$;

create or replace function public.apply_player_cosmetic_loadout(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_loadout_id uuid,
  p_expected_loadout_revision integer,
  p_expected_avatar_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare loadout public.player_cosmetic_loadouts%rowtype;
declare result jsonb;
declare module_status text;
declare request_hash_value text;
declare replay jsonb;
begin
  if p_expected_loadout_revision <= 0 or p_expected_avatar_revision < 0
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('wardrobe');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  request_hash_value := encode(extensions.digest(
    p_loadout_id::text || ':' || p_expected_loadout_revision::text || ':' ||
      p_expected_avatar_revision::text,
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cosmetic-idempotency:' || player_id::text || ':apply_loadout:' || p_request_id, 0
  ));
  replay := private.cosmetic_replay(
    player_id::text, 'apply_loadout', p_request_id, request_hash_value
  );
  if replay is not null then return replay; end if;
  select * into loadout from public.player_cosmetic_loadouts
  where id = p_loadout_id and player_profile_id = player_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if loadout.revision <> p_expected_loadout_revision then
    return jsonb_build_object('status', 'loadout_changed');
  end if;
  if (private.cosmetic_selection_owned(player_id, loadout.selection) ->> 'status') <> 'resolved' then
    return jsonb_build_object('status', 'loadout_unavailable');
  end if;
  result := public.update_player_avatar_profile(
    p_wallet_address, p_access_session_token_hash, p_expected_avatar_revision,
    loadout.selection, p_request_id
  );
  if result ->> 'status' = 'updated' then
    update public.player_cosmetic_loadouts set is_active = false where player_profile_id = player_id;
    update public.player_cosmetic_loadouts set is_active = true where id = loadout.id;
    result := result || jsonb_build_object(
      'loadoutId', loadout.id, 'loadoutRevision', loadout.revision
    );
    perform private.store_cosmetic_replay(
      player_id::text, 'apply_loadout', p_request_id, request_hash_value, result
    );
    return result;
  end if;
  return result;
end;
$$;

create or replace function public.update_player_emote_wheel(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_emote_keys text[],
  p_expected_revision integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare wheel public.player_emote_wheels%rowtype;
declare module_status text;
declare result jsonb;
declare request_hash_value text;
declare replay public.cosmetic_idempotency%rowtype;
begin
  if private.valid_cosmetic_emote_keys(p_emote_keys) is distinct from true
     or p_expected_revision is null or p_expected_revision < 0
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('emotes');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  request_hash_value := encode(extensions.digest(
    array_to_string(p_emote_keys, ',') || ':' || p_expected_revision::text, 'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cosmetic-idempotency:' || player_id::text || ':update_emote_wheel:' || p_request_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-emote-wheel:' || player_id::text, 0)
  );
  select * into replay from public.cosmetic_idempotency
  where subject_key = player_id::text and operation = 'update_emote_wheel'
    and request_id = p_request_id and expires_at > now();
  if found then
    if replay.request_hash = request_hash_value then return replay.response_body; end if;
    return jsonb_build_object('status', 'request_already_processed');
  end if;
  perform private.bootstrap_player_cosmetics(player_id);
  if exists (
    select 1 from unnest(p_emote_keys) item(key)
    where not exists (
      select 1 from public.player_emote_entitlements entitlement
      join public.cosmetic_emote_definitions definition
        on definition.emote_key = entitlement.emote_key
       and definition.lifecycle_status = 'active'
      where entitlement.player_profile_id = player_id and entitlement.emote_key = item.key
    )
  ) then return jsonb_build_object('status', 'not_owned'); end if;
  select * into wheel from public.player_emote_wheels where player_profile_id = player_id for update;
  if not found or wheel.revision <> p_expected_revision then
    return jsonb_build_object('status', 'wheel_changed');
  end if;
  update public.player_emote_wheels set emote_keys = p_emote_keys, revision = revision + 1
  where player_profile_id = player_id returning * into wheel;
  result := jsonb_build_object(
    'status', 'updated', 'emoteKeys', to_jsonb(wheel.emote_keys),
    'revision', wheel.revision, 'updatedAt', wheel.updated_at
  );
  insert into public.cosmetic_idempotency (
    subject_key, operation, request_id, request_hash, response_body
  ) values (player_id::text, 'update_emote_wheel', p_request_id, request_hash_value, result);
  return result;
end;
$$;

create or replace function public.activate_player_emote(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_emote_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player public.player_profiles%rowtype;
declare emote public.cosmetic_emote_definitions%rowtype;
declare activation public.player_emote_activations%rowtype;
declare settings public.cosmetic_settings%rowtype;
begin
  if char_length(coalesce(p_emote_key, '')) not between 3 and 80
     or p_emote_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  select * into player from public.player_profiles
  where id = (context ->> 'playerProfileId')::uuid for share;
  select * into settings from public.cosmetic_settings where game_key = 'starville' for share;
  if settings.maintenance_mode then return jsonb_build_object('status', 'maintenance'); end if;
  if not settings.emotes_enabled then return jsonb_build_object('status', 'module_disabled'); end if;
  perform private.bootstrap_player_cosmetics(player.id);
  select definition.* into emote
  from public.cosmetic_emote_definitions definition
  join public.player_emote_entitlements entitlement
    on entitlement.emote_key = definition.emote_key
   and entitlement.player_profile_id = player.id
  where definition.emote_key = p_emote_key and definition.lifecycle_status = 'active'
  for share of definition, entitlement;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-emote:' || player.id::text, 0)
  );
  select * into activation from public.player_emote_activations
  where player_profile_id = player.id and request_id = p_request_id;
  if found then
    if activation.emote_key <> p_emote_key
       or activation.channel_key <> 'world:' || player.current_map_id then
      return jsonb_build_object('status', 'request_conflict');
    end if;
    return jsonb_build_object(
      'status', 'activated', 'channelKey', activation.channel_key,
      'event', jsonb_build_object(
        'type', 'player.emote', 'playerId', player.id, 'emoteKey', activation.emote_key,
        'activationId', activation.id,
        'startedAt', floor(extract(epoch from activation.created_at) * 1000)::bigint,
        'durationMs', activation.duration_ms
      )
    );
  end if;
  if (select count(*) from public.player_emote_activations
      where player_profile_id = player.id and created_at > now() - interval '10 seconds')
     >= settings.emote_rate_limit then return jsonb_build_object('status', 'rate_limited'); end if;
  insert into public.player_emote_activations (
    player_profile_id, emote_key, request_id, channel_key, duration_ms
  ) values (
    player.id, emote.emote_key, p_request_id, 'world:' || player.current_map_id, emote.duration_ms
  ) returning * into activation;
  return jsonb_build_object(
    'status', 'activated', 'channelKey', activation.channel_key,
    'event', jsonb_build_object(
      'type', 'player.emote', 'playerId', player.id, 'emoteKey', activation.emote_key,
      'activationId', activation.id,
      'startedAt', floor(extract(epoch from activation.created_at) * 1000)::bigint,
      'durationMs', activation.duration_ms
    )
  );
end;
$$;

create or replace function public.claim_player_cosmetic_collection_reward(
  p_wallet_address text,
  p_access_session_token_hash text,
  p_collection_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare context jsonb;
declare player_id uuid;
declare collection public.cosmetic_collection_definitions%rowtype;
declare required_count integer;
declare owned_count integer;
declare existing_reward public.cosmetic_collection_reward_receipts%rowtype;
declare module_status text;
begin
  if char_length(coalesce(p_collection_key, '')) not between 3 and 80
     or p_collection_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  context := private.avatar_player_context(p_wallet_address, p_access_session_token_hash);
  if context ->> 'status' <> 'authorized' then return context; end if;
  player_id := (context ->> 'playerProfileId')::uuid;
  module_status := private.cosmetic_module_status('cosmetic_collections');
  if module_status <> 'enabled' then return jsonb_build_object('status', module_status); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-receipt:' || p_request_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-collection:' || player_id::text || ':' || p_collection_key, 0)
  );
  select * into collection from public.cosmetic_collection_definitions
  where collection_key = p_collection_key and lifecycle_status = 'active' for share;
  if not found or collection.reward_avatar_content_definition_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into existing_reward from public.cosmetic_collection_reward_receipts
  where request_id = p_request_id;
  if found then
    if existing_reward.player_profile_id <> player_id
       or existing_reward.cosmetic_collection_id <> collection.id then
      return jsonb_build_object('status', 'request_conflict');
    end if;
    return jsonb_build_object(
      'status', 'claimed', 'collectionKey', collection.collection_key,
      'receiptId', existing_reward.id
    );
  end if;
  if exists (
    select 1 from public.cosmetic_collection_reward_receipts
    where player_profile_id = player_id and cosmetic_collection_id = collection.id
  ) then return jsonb_build_object('status', 'already_claimed'); end if;
  if not exists (
    select 1
    from public.avatar_content_definitions reward_definition
    join public.avatar_content_versions reward_version
      on reward_version.id = reward_definition.active_version_id
    where reward_definition.id = collection.reward_avatar_content_definition_id
      and reward_definition.enabled and reward_version.lifecycle_status = 'active'
  ) then return jsonb_build_object('status', 'content_unavailable'); end if;
  select count(*)::integer,
    count(ownership.id) filter (where ownership.ownership_state = 'owned')::integer
  into required_count, owned_count
  from public.cosmetic_collection_members member
  left join public.player_cosmetic_ownership ownership
    on ownership.player_profile_id = player_id
   and ownership.avatar_content_definition_id = member.avatar_content_definition_id
  where member.cosmetic_collection_id = collection.id;
  if required_count = 0 or owned_count <> required_count then
    return jsonb_build_object('status', 'incomplete');
  end if;
  insert into public.cosmetic_collection_reward_receipts (
    player_profile_id, cosmetic_collection_id, reward_avatar_content_definition_id, request_id
  ) values (
    player_id, collection.id, collection.reward_avatar_content_definition_id, p_request_id
  ) returning * into existing_reward;
  insert into public.player_cosmetic_ownership (
    player_profile_id, avatar_content_definition_id, source_key
  ) values (player_id, collection.reward_avatar_content_definition_id, 'collection_reward')
  on conflict (player_profile_id, avatar_content_definition_id) do update set
    ownership_state = 'owned', source_key = 'collection_reward',
    revoked_at = null, revoked_by_admin_id = null;
  insert into public.cosmetic_ownership_receipts (
    player_profile_id, avatar_content_definition_id, operation_key, source_key,
    reason_category, reason, request_id
  ) values (
    player_id, collection.reward_avatar_content_definition_id, 'reward', 'collection_reward',
    'collection_completion', 'Exact-once cosmetic collection completion reward.', p_request_id
  );
  return jsonb_build_object(
    'status', 'claimed', 'collectionKey', collection.collection_key,
    'receiptId', existing_reward.id
  );
end;
$$;

create or replace function public.activate_realtime_player_emote(
  p_realtime_session_id uuid,
  p_emote_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare realtime_session public.realtime_sessions%rowtype;
declare player public.player_profiles%rowtype;
declare access_session public.wallet_access_sessions%rowtype;
declare emote public.cosmetic_emote_definitions%rowtype;
declare activation public.player_emote_activations%rowtype;
declare settings public.cosmetic_settings%rowtype;
declare denial text;
begin
  if char_length(coalesce(p_emote_key, '')) not between 3 and 80
     or p_emote_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  select * into realtime_session from public.realtime_sessions
  where id = p_realtime_session_id and status = 'active'
    and last_heartbeat_at > now() - interval '30 seconds' for update;
  if not found then return jsonb_build_object('status', 'access_changed'); end if;
  select * into strict player from public.player_profiles where id = realtime_session.player_profile_id;
  select * into strict access_session from public.wallet_access_sessions
  where id = realtime_session.wallet_access_session_id;
  denial := private.realtime_access_denial(access_session, player);
  if denial is not null then return jsonb_build_object('status', denial); end if;
  select * into settings from public.cosmetic_settings where game_key = 'starville' for share;
  if settings.maintenance_mode then return jsonb_build_object('status', 'maintenance'); end if;
  if not settings.emotes_enabled then return jsonb_build_object('status', 'module_disabled'); end if;
  perform private.bootstrap_player_cosmetics(player.id);
  select definition.* into emote
  from public.cosmetic_emote_definitions definition
  join public.player_emote_entitlements entitlement
    on entitlement.emote_key = definition.emote_key
   and entitlement.player_profile_id = player.id
  where definition.emote_key = p_emote_key and definition.lifecycle_status = 'active'
  for share of definition, entitlement;
  if not found then return jsonb_build_object('status', 'not_owned'); end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-emote:' || player.id::text, 0)
  );
  select * into activation from public.player_emote_activations
  where player_profile_id = player.id and request_id = p_request_id;
  if found and (
    activation.emote_key <> p_emote_key
    or activation.channel_key <> 'channel:' || realtime_session.channel_id::text
  ) then return jsonb_build_object('status', 'request_conflict'); end if;
  if not found then
    if (select count(*) from public.player_emote_activations
        where player_profile_id = player.id and created_at > now() - interval '10 seconds')
       >= settings.emote_rate_limit then return jsonb_build_object('status', 'rate_limited'); end if;
    insert into public.player_emote_activations (
      player_profile_id, emote_key, request_id, channel_key, duration_ms
    ) values (
      player.id, emote.emote_key, p_request_id,
      'channel:' || realtime_session.channel_id::text, emote.duration_ms
    ) returning * into activation;
  end if;
  return jsonb_build_object(
    'status', 'activated', 'presenceId', player.public_presence_id,
    'channelId', realtime_session.channel_id,
    'emoteKey', activation.emote_key, 'activationId', activation.id,
    'startedAt', floor(extract(epoch from activation.created_at) * 1000)::bigint,
    'durationMs', activation.duration_ms
  );
end;
$$;

create or replace function public.get_admin_cosmetic_overview(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.read'
  );
  return jsonb_build_object(
    'status', 'loaded',
    'overview', jsonb_build_object(
      'ownedEntitlements', (select count(*) from public.player_cosmetic_ownership where ownership_state = 'owned'),
      'revokedEntitlements', (select count(*) from public.player_cosmetic_ownership where ownership_state = 'revoked'),
      'savedLoadouts', (select count(*) from public.player_cosmetic_loadouts),
      'activeEmotes', (select count(*) from public.cosmetic_emote_definitions where lifecycle_status = 'active'),
      'activeCollections', (select count(*) from public.cosmetic_collection_definitions where lifecycle_status = 'active'),
      'shop', private.cosmetic_shop_json()
    )
  );
end;
$$;

create or replace function public.list_admin_cosmetic_audit(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.audit.read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (20, 50, 100) then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  return jsonb_build_object(
    'status', 'loaded', 'page', p_page, 'pageSize', p_page_size,
    'total', (select count(*) from public.cosmetic_ownership_receipts),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'receiptId', receipt.id, 'playerProfileId', receipt.player_profile_id,
        'definitionId', receipt.avatar_content_definition_id,
        'cosmeticKey', definition.content_key, 'operation', receipt.operation_key,
        'source', receipt.source_key, 'reasonCategory', receipt.reason_category,
        'reason', receipt.reason,
        'administratorUserId', receipt.administrator_user_id,
        'createdAt', receipt.created_at
      ) order by receipt.created_at desc, receipt.id desc), '[]'::jsonb)
      from (
        select * from public.cosmetic_ownership_receipts
        order by created_at desc, id desc
        limit p_page_size offset (p_page - 1) * p_page_size
      ) receipt
      join public.avatar_content_definitions definition
        on definition.id = receipt.avatar_content_definition_id
    )
  );
end;
$$;

create or replace function public.grant_admin_player_cosmetic(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_player_profile_id uuid,
  p_cosmetic_key text,
  p_reason_category text,
  p_explanation text,
  p_expected_state text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare definition public.avatar_content_definitions%rowtype;
declare ownership public.player_cosmetic_ownership%rowtype;
declare existing_receipt public.cosmetic_ownership_receipts%rowtype;
declare current_state text;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.grant'
  );
  if private.cosmetic_module_status('wardrobe') = 'maintenance' then
    return jsonb_build_object('status', 'maintenance');
  end if;
  if char_length(coalesce(p_cosmetic_key, '')) not between 3 and 80
     or p_cosmetic_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or p_reason_category not in (
       'customer_support', 'event_reward', 'content_recovery',
       'migration_correction', 'development_test'
     )
     or char_length(coalesce(p_explanation, '')) not between 12 and 500
     or p_explanation <> btrim(p_explanation) or p_explanation ~ '[[:cntrl:]<>]'
     or p_expected_state not in ('not_owned', 'revoked')
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  request_hash_value := encode(extensions.digest(
    p_player_profile_id::text || ':' || p_cosmetic_key || ':' || p_reason_category || ':' ||
      p_explanation || ':' || p_expected_state,
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-receipt:' || p_request_id, 0)
  );
  replay := private.cosmetic_replay(
    p_user_id::text, 'admin_grant', p_request_id, request_hash_value
  );
  if replay is not null then return replay; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-grant:' || p_player_profile_id::text || ':' || p_cosmetic_key, 0)
  );
  select * into existing_receipt from public.cosmetic_ownership_receipts
  where request_id = p_request_id;
  if found then return jsonb_build_object('status', 'request_conflict'); end if;
  select candidate.* into definition
  from public.avatar_content_definitions candidate
  join public.avatar_content_versions version on version.id = candidate.active_version_id
  where candidate.content_key = p_cosmetic_key and candidate.enabled
    and version.lifecycle_status = 'active' for share of candidate, version;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not exists (select 1 from public.player_profiles where id = p_player_profile_id for share) then
    return jsonb_build_object('status', 'player_not_found');
  end if;
  select * into ownership from public.player_cosmetic_ownership
  where player_profile_id = p_player_profile_id
    and avatar_content_definition_id = definition.id for update;
  current_state := case when found then ownership.ownership_state else 'not_owned' end;
  if current_state <> p_expected_state then
    return jsonb_build_object(
      'status', 'state_conflict', 'expectedState', p_expected_state, 'currentState', current_state
    );
  end if;
  insert into public.player_cosmetic_ownership (
    player_profile_id, avatar_content_definition_id, source_key, granted_by_admin_id
  ) values (p_player_profile_id, definition.id, 'administrator_grant', p_user_id)
  on conflict (player_profile_id, avatar_content_definition_id) do update set
    ownership_state = 'owned', source_key = 'administrator_grant',
    granted_by_admin_id = p_user_id, revoked_by_admin_id = null, revoked_at = null;
  insert into public.cosmetic_ownership_receipts (
    player_profile_id, avatar_content_definition_id, operation_key, source_key,
    administrator_user_id, admin_session_id, reason_category, reason, request_id
  ) values (
    p_player_profile_id, definition.id, 'grant', 'administrator_grant',
    p_user_id, admin_session_id, p_reason_category, p_explanation, p_request_id
  ) returning * into existing_receipt;
  result := jsonb_build_object(
    'status', 'granted', 'cosmeticKey', definition.content_key,
    'receiptId', existing_receipt.id
  );
  perform private.store_cosmetic_replay(
    p_user_id::text, 'admin_grant', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.revoke_admin_player_cosmetic(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_player_profile_id uuid,
  p_cosmetic_key text,
  p_reason_category text,
  p_explanation text,
  p_expected_state text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare admin_session_id uuid;
declare ownership public.player_cosmetic_ownership%rowtype;
declare definition public.avatar_content_definitions%rowtype;
declare avatar public.player_avatar_profiles%rowtype;
declare before_profile jsonb;
declare after_profile jsonb;
declare existing_receipt public.cosmetic_ownership_receipts%rowtype;
declare appearance_changed boolean;
declare request_hash_value text;
declare replay jsonb;
declare result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.revoke'
  );
  if private.cosmetic_module_status('wardrobe') = 'maintenance' then
    return jsonb_build_object('status', 'maintenance');
  end if;
  if char_length(coalesce(p_cosmetic_key, '')) not between 3 and 80
     or p_cosmetic_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     or p_reason_category not in (
       'content_retired', 'mistaken_administrative_grant', 'policy_violation',
       'asset_rights_issue', 'technical_incompatibility', 'migration_correction'
     )
     or char_length(coalesce(p_explanation, '')) not between 12 and 500
     or p_explanation <> btrim(p_explanation) or p_explanation ~ '[[:cntrl:]<>]'
     or p_expected_state <> 'owned'
     or char_length(coalesce(p_request_id, '')) not between 1 and 128 then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  request_hash_value := encode(extensions.digest(
    p_player_profile_id::text || ':' || p_cosmetic_key || ':' || p_reason_category || ':' ||
      p_explanation || ':' || p_expected_state,
    'sha256'
  ), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-receipt:' || p_request_id, 0)
  );
  replay := private.cosmetic_replay(
    p_user_id::text, 'admin_revoke', p_request_id, request_hash_value
  );
  if replay is not null then return replay; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cosmetic-grant:' || p_player_profile_id::text || ':' || p_cosmetic_key, 0)
  );
  select * into existing_receipt from public.cosmetic_ownership_receipts
  where request_id = p_request_id;
  if found then return jsonb_build_object('status', 'request_conflict'); end if;
  select candidate.* into definition from public.avatar_content_definitions candidate
  where candidate.content_key = p_cosmetic_key;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into ownership from public.player_cosmetic_ownership
  where player_profile_id = p_player_profile_id
    and avatar_content_definition_id = definition.id for update;
  if not found or ownership.ownership_state <> p_expected_state then
    return jsonb_build_object(
      'status', 'state_conflict', 'expectedState', p_expected_state,
      'currentState', case when found then ownership.ownership_state else 'not_owned' end
    );
  end if;
  select * into avatar from public.player_avatar_profiles
  where player_profile_id = p_player_profile_id for update;
  before_profile := private.avatar_profile_json(avatar, true, true);
  appearance_changed := coalesce(
    avatar.face_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.eyes_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.eyebrows_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.hair_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.top_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.bottom_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or avatar.footwear_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id)
    or exists (
      select 1 from public.player_avatar_profile_accessories accessory
      join public.avatar_content_versions version on version.id = accessory.avatar_content_version_id
      where accessory.player_avatar_profile_id = avatar.id
        and version.avatar_content_definition_id = definition.id
    ), false);
  if appearance_changed then
    delete from public.player_avatar_profile_accessories
    where player_avatar_profile_id = avatar.id
      and avatar_content_version_id in (
        select id from public.avatar_content_versions
        where avatar_content_definition_id = definition.id
      );
    update public.player_avatar_profiles set
      face_version_id = case when face_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else face_version_id end,
      eyes_version_id = case when eyes_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else eyes_version_id end,
      eyebrows_version_id = case when eyebrows_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else eyebrows_version_id end,
      hair_version_id = case when hair_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else hair_version_id end,
      top_version_id = case when top_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else top_version_id end,
      bottom_version_id = case when bottom_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else bottom_version_id end,
      footwear_version_id = case when footwear_version_id in (select id from public.avatar_content_versions where avatar_content_definition_id = definition.id) then null else footwear_version_id end,
      revision = case when creator_completed_at is null then revision else revision + 1 end
    where id = avatar.id returning * into avatar;
  end if;
  update public.player_cosmetic_ownership set
    ownership_state = 'revoked', revoked_by_admin_id = p_user_id, revoked_at = now()
  where id = ownership.id;
  after_profile := private.avatar_profile_json(avatar, true, true);
  if appearance_changed and avatar.creator_completed_at is not null then
    insert into public.player_avatar_profile_history (
      player_avatar_profile_id, revision, actor_type, actor_admin_user_id,
      request_id, before_profile, after_profile
    ) values (
      avatar.id, avatar.revision, 'administrator', p_user_id,
      p_request_id, before_profile, after_profile
    );
  end if;
  insert into public.cosmetic_ownership_receipts (
    player_profile_id, avatar_content_definition_id, operation_key, source_key,
    administrator_user_id, admin_session_id, reason_category, reason,
    fallback_applied, request_id
  ) values (
    p_player_profile_id, definition.id, 'revoke', ownership.source_key,
    p_user_id, admin_session_id, p_reason_category, p_explanation,
    appearance_changed, p_request_id
  ) returning * into existing_receipt;
  result := jsonb_build_object(
    'status', 'revoked', 'cosmeticKey', definition.content_key,
    'fallbackApplied', appearance_changed, 'receiptId', existing_receipt.id
  );
  perform private.store_cosmetic_replay(
    p_user_id::text, 'admin_revoke', p_request_id, request_hash_value, result
  );
  return result;
end;
$$;

create or replace function public.get_admin_cosmetic_settings(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.settings.read'
  );
  return (
    select jsonb_build_object(
      'status', 'loaded', 'settings', jsonb_build_object(
        'wardrobeEnabled', wardrobe_enabled, 'emotesEnabled', emotes_enabled,
        'collectionsEnabled', collections_enabled, 'maintenanceMode', maintenance_mode,
        'maximumLoadouts', max_loadouts, 'maximumEmoteWheelSlots', max_emote_wheel_slots,
        'emoteRateLimit', emote_rate_limit, 'revision', revision,
        'shop', private.cosmetic_shop_json()
      )
    ) from public.cosmetic_settings where game_key = 'starville'
  );
end;
$$;

-- No cosmetic purchase RPC exists in Phase 10B. The only shop read is this
-- explicit disabled preview, and it cannot expose draft offers.
create or replace function public.get_admin_cosmetic_shop_preview(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'cosmetics.shop.read'
  );
  return jsonb_build_object('status', 'loaded', 'shop', private.cosmetic_shop_json());
end;
$$;

revoke all on function private.bootstrap_player_cosmetics(uuid) from public, anon, authenticated, service_role;
revoke all on function private.bootstrap_new_player_cosmetics() from public, anon, authenticated, service_role;
revoke all on function private.cosmetic_selection_owned(uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function private.cosmetic_module_status(text) from public, anon, authenticated, service_role;
revoke all on function private.enforce_avatar_cosmetic_ownership() from public, anon, authenticated, service_role;
revoke all on function private.enforce_avatar_accessory_ownership() from public, anon, authenticated, service_role;
revoke all on function private.cosmetic_shop_json() from public, anon, authenticated, service_role;
revoke all on function private.cosmetic_wardrobe_json(uuid) from public, anon, authenticated, service_role;
revoke all on function private.cosmetic_replay(text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.store_cosmetic_replay(text,text,text,text,jsonb) from public, anon, authenticated, service_role;

revoke all on function public.get_player_cosmetic_wardrobe(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.get_player_cosmetic_wardrobe(text,text,text) to service_role;
revoke all on function public.save_player_cosmetic_loadout(text,text,integer,text,jsonb,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.save_player_cosmetic_loadout(text,text,integer,text,jsonb,integer,text) to service_role;
revoke all on function public.rename_player_cosmetic_loadout(text,text,uuid,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.rename_player_cosmetic_loadout(text,text,uuid,text,integer,text) to service_role;
revoke all on function public.delete_player_cosmetic_loadout(text,text,uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.delete_player_cosmetic_loadout(text,text,uuid,integer,text) to service_role;
revoke all on function public.apply_player_cosmetic_loadout(text,text,uuid,integer,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.apply_player_cosmetic_loadout(text,text,uuid,integer,integer,text) to service_role;
revoke all on function public.update_player_emote_wheel(text,text,text[],integer,text) from public, anon, authenticated, service_role;
grant execute on function public.update_player_emote_wheel(text,text,text[],integer,text) to service_role;
revoke all on function public.activate_player_emote(text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.activate_player_emote(text,text,text,text) to service_role;
revoke all on function public.claim_player_cosmetic_collection_reward(text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.claim_player_cosmetic_collection_reward(text,text,text,text) to service_role;
revoke all on function public.activate_realtime_player_emote(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.activate_realtime_player_emote(uuid,text,text) to service_role;
revoke all on function public.get_admin_cosmetic_overview(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_cosmetic_overview(uuid,uuid,text) to service_role;
revoke all on function public.list_admin_cosmetic_audit(uuid,uuid,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.list_admin_cosmetic_audit(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text) to service_role;
revoke all on function public.revoke_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.revoke_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text) to service_role;
revoke all on function public.get_admin_cosmetic_settings(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_cosmetic_settings(uuid,uuid,text) to service_role;
revoke all on function public.get_admin_cosmetic_shop_preview(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_cosmetic_shop_preview(uuid,uuid,text) to service_role;
