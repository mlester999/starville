-- Forward-only hosted lint repair for the economy shop-offer and avatar
-- selection functions. Signatures, authority, volatility, and behavior remain
-- unchanged; only the reported PL/pgSQL findings are removed.

create or replace function public.update_admin_economy_shop_offer(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_shop_version_id uuid,
  p_expected_shop_revision integer,p_offer_id uuid,p_unit_price bigint,p_maximum_quantity integer,
  p_daily_limit integer,p_cooldown_seconds integer,p_enabled boolean,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare version public.economy_shop_versions%rowtype;
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
  perform 1 from public.cozy_shop_offers offer
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

create or replace function private.resolve_avatar_selection(
  p_selection jsonb,
  p_allow_protected boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  key_name text;
  key_value text;
  body_id uuid;
  skin_id uuid;
  face_id uuid;
  eyes_id uuid;
  eyebrows_id uuid;
  hair_id uuid;
  hair_palette_id uuid;
  top_id uuid;
  bottom_id uuid;
  footwear_id uuid;
  preset_id uuid;
  accessory_ids uuid[] := array[]::uuid[];
  selected_ids uuid[];
  configured_max_accessories integer;
begin
  if jsonb_typeof(p_selection) is distinct from 'object'
     or pg_column_size(p_selection) > 32768
     or p_selection::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
     or exists (
       select 1 from jsonb_object_keys(p_selection) item(key)
       where item.key not in (
         'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
         'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey',
         'accessoryKeys', 'presetKey'
       )
     )
     or jsonb_typeof(p_selection -> 'accessoryKeys') is distinct from 'array'
     or jsonb_array_length(p_selection -> 'accessoryKeys') > 4 then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  foreach key_name in array array[
    'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
    'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey', 'presetKey'
  ] loop
    if p_selection ? key_name
       and jsonb_typeof(p_selection -> key_name) not in ('string', 'null') then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
    key_value := p_selection ->> key_name;
    if key_value is not null and not private.valid_avatar_public_key(key_value) then
      return jsonb_build_object('status', 'invalid_selection');
    end if;
  end loop;
  if p_selection ->> 'bodyPresetKey' is null
     or exists (
       select 1 from jsonb_array_elements(p_selection -> 'accessoryKeys') item
       where jsonb_typeof(item) <> 'string'
          or not private.valid_avatar_public_key(item #>> '{}')
     )
     or (select count(*) from jsonb_array_elements_text(p_selection -> 'accessoryKeys')) <>
        (select count(distinct item) from jsonb_array_elements_text(p_selection -> 'accessoryKeys') item) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  select id into body_id from public.avatar_body_presets
  where preset_key = p_selection ->> 'bodyPresetKey' and enabled;
  if body_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;

  if p_selection ->> 'skinPaletteKey' is not null then
    select id into skin_id from public.avatar_palette_definitions
    where palette_key = p_selection ->> 'skinPaletteKey'
      and palette_type = 'skin' and lifecycle_status = 'active'
      and (p_allow_protected or access_level <> 'protected_administrator');
    if skin_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;
  if p_selection ->> 'hairPaletteKey' is not null then
    select id into hair_palette_id from public.avatar_palette_definitions
    where palette_key = p_selection ->> 'hairPaletteKey'
      and palette_type = 'hair' and lifecycle_status = 'active'
      and (p_allow_protected or access_level <> 'protected_administrator');
    if hair_palette_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;
  if p_selection ->> 'presetKey' is not null then
    select id into preset_id from public.avatar_presets
    where preset_key = p_selection ->> 'presetKey' and lifecycle_status = 'active';
    if preset_id is null then return jsonb_build_object('status', 'content_unavailable'); end if;
  end if;

  face_id := private.resolve_active_avatar_content(p_selection ->> 'faceKey', 'face', p_allow_protected);
  eyes_id := private.resolve_active_avatar_content(p_selection ->> 'eyesKey', 'eyes', p_allow_protected);
  eyebrows_id := private.resolve_active_avatar_content(p_selection ->> 'eyebrowsKey', 'eyebrows', p_allow_protected);
  hair_id := private.resolve_active_avatar_content(p_selection ->> 'hairKey', 'hair', p_allow_protected);
  top_id := private.resolve_active_avatar_content(p_selection ->> 'topKey', 'top', p_allow_protected);
  bottom_id := private.resolve_active_avatar_content(p_selection ->> 'bottomKey', 'bottom', p_allow_protected);
  footwear_id := private.resolve_active_avatar_content(p_selection ->> 'footwearKey', 'footwear', p_allow_protected);
  if (p_selection ->> 'faceKey' is not null and face_id is null)
     or (p_selection ->> 'eyesKey' is not null and eyes_id is null)
     or (p_selection ->> 'eyebrowsKey' is not null and eyebrows_id is null)
     or (p_selection ->> 'hairKey' is not null and hair_id is null)
     or (p_selection ->> 'topKey' is not null and top_id is null)
     or (p_selection ->> 'bottomKey' is not null and bottom_id is null)
     or (p_selection ->> 'footwearKey' is not null and footwear_id is null) then
    return jsonb_build_object('status', 'content_unavailable');
  end if;

  select coalesce(array_agg(version.id order by requested.ordinality), array[]::uuid[])
  into accessory_ids
  from jsonb_array_elements_text(p_selection -> 'accessoryKeys')
       with ordinality requested(content_key, ordinality)
  join public.avatar_content_definitions definition
    on definition.content_key = requested.content_key
   and definition.content_type = 'accessory'
   and definition.enabled
   and (p_allow_protected or definition.access_level <> 'protected_administrator')
  join public.avatar_content_versions version
    on version.id = definition.active_version_id
   and version.lifecycle_status = 'active';
  if cardinality(accessory_ids) <> jsonb_array_length(p_selection -> 'accessoryKeys') then
    return jsonb_build_object('status', 'content_unavailable');
  end if;
  select settings.max_accessories into configured_max_accessories
  from public.avatar_settings as settings
  where settings.game_key = 'starville';
  if cardinality(accessory_ids) > coalesce(configured_max_accessories, 0) then
    return jsonb_build_object('status', 'invalid_selection');
  end if;

  selected_ids := array_remove(array[
    face_id, eyes_id, eyebrows_id, hair_id, top_id, bottom_id, footwear_id
  ]::uuid[], null) || accessory_ids;
  if exists (
    select 1
    from unnest(selected_ids) selected(version_id)
    where exists (
      select 1 from public.avatar_content_compatibility compatibility
      where compatibility.avatar_content_version_id = selected.version_id
        and compatibility.compatibility_type = 'body_preset'
    ) and not exists (
      select 1 from public.avatar_content_compatibility compatibility
      where compatibility.avatar_content_version_id = selected.version_id
        and compatibility.compatibility_type = 'body_preset'
        and compatibility.body_preset_id = body_id
    )
  ) or exists (
    select 1 from public.avatar_content_compatibility compatibility
    where compatibility.compatibility_type = 'incompatible_content'
      and compatibility.avatar_content_version_id = any(selected_ids)
      and compatibility.other_avatar_content_version_id = any(selected_ids)
  ) then
    return jsonb_build_object('status', 'incompatible_selection');
  end if;

  return jsonb_build_object(
    'status', 'resolved',
    'bodyPresetId', body_id,
    'skinPaletteId', skin_id,
    'faceVersionId', face_id,
    'eyesVersionId', eyes_id,
    'eyebrowsVersionId', eyebrows_id,
    'hairVersionId', hair_id,
    'hairPaletteId', hair_palette_id,
    'topVersionId', top_id,
    'bottomVersionId', bottom_id,
    'footwearVersionId', footwear_id,
    'accessoryVersionIds', to_jsonb(accessory_ids),
    'presetVersionId', preset_id
  );
exception when others then
  return jsonb_build_object('status', 'invalid_selection');
end;
$$;

-- CREATE OR REPLACE preserves ownership and existing ACLs. Reassert the exact
-- intended executable surface so the repair cannot broaden access.
revoke all on function public.update_admin_economy_shop_offer(
  uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text
) from public, anon, authenticated, service_role;
grant execute on function public.update_admin_economy_shop_offer(
  uuid,uuid,text,uuid,integer,uuid,bigint,integer,integer,integer,boolean,text
) to service_role;

revoke all on function private.resolve_avatar_selection(jsonb,boolean)
  from public, anon, authenticated, service_role;
