-- Persistent local-only helpers for Phase 9A.1 real PostgreSQL economy races.
drop schema if exists phase9a_test cascade;
create schema phase9a_test;

insert into auth.users(id,email) values
  ('9a200000-0000-4000-8000-000000000001','phase9a-race-creator@example.invalid'),
  ('9a200000-0000-4000-8000-000000000002','phase9a-race-reviewer-one@example.invalid'),
  ('9a200000-0000-4000-8000-000000000003','phase9a-race-reviewer-two@example.invalid')
on conflict (id) do nothing;

insert into auth.sessions(id,user_id) values
  ('9a200000-0000-4000-8000-000000000011','9a200000-0000-4000-8000-000000000001'),
  ('9a200000-0000-4000-8000-000000000012','9a200000-0000-4000-8000-000000000002'),
  ('9a200000-0000-4000-8000-000000000013','9a200000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.admin_users(user_id,role_id,status,display_name,mfa_required)
select seed.user_id,role.id,'active',seed.display_name,false
from (values
  ('9a200000-0000-4000-8000-000000000001'::uuid,'Economy Race Creator'),
  ('9a200000-0000-4000-8000-000000000002'::uuid,'Economy Race Reviewer One'),
  ('9a200000-0000-4000-8000-000000000003'::uuid,'Economy Race Reviewer Two')
) seed(user_id,display_name)
cross join public.admin_roles role
where role.key='super_admin'
on conflict (user_id) do nothing;

insert into public.admin_sessions(
  id,user_id,auth_session_id,status,expires_at,
  permission_version_snapshot,session_version_snapshot
)
select seed.session_id,admin.user_id,seed.auth_session_id,'active',now()+interval '1 hour',
  admin.permission_version,admin.session_version
from (values
  ('9a200000-0000-4000-8000-000000000021'::uuid,
    '9a200000-0000-4000-8000-000000000001'::uuid,
    '9a200000-0000-4000-8000-000000000011'::uuid),
  ('9a200000-0000-4000-8000-000000000022'::uuid,
    '9a200000-0000-4000-8000-000000000002'::uuid,
    '9a200000-0000-4000-8000-000000000012'::uuid),
  ('9a200000-0000-4000-8000-000000000023'::uuid,
    '9a200000-0000-4000-8000-000000000003'::uuid,
    '9a200000-0000-4000-8000-000000000013'::uuid)
) seed(session_id,user_id,auth_session_id)
join public.admin_users admin on admin.user_id=seed.user_id
on conflict (id) do nothing;

create or replace function phase9a_test.reset_player(
  p_target_balance bigint,
  p_inventory_capacity integer,
  p_filled_slots integer
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  player_id constant uuid := '82000000-0000-4000-8000-000000000001';
  current_balance bigint;
  adjustment bigint;
  adjustment_key text := 'phase9a-race-reset-'||gen_random_uuid()::text;
begin
  if p_target_balance not between 0 and 1000000
     or p_inventory_capacity not between 8 and 200
     or p_filled_slots not between 0 and p_inventory_capacity then
    raise exception using errcode='22023',message='INVALID_PHASE9A_RACE_RESET';
  end if;

  insert into public.economy_active_policy(singleton_key,policy_version_id,activated_at)
  values(true,'99000000-0000-4000-8000-000000000001',now())
  on conflict(singleton_key) do update set
    policy_version_id=excluded.policy_version_id,activated_at=excluded.activated_at;
  insert into public.economy_active_shop_versions(
    shop_definition_id,shop_version_id,activated_at
  ) values(
    '74000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000031',now()
  ) on conflict(shop_definition_id) do update set
    shop_version_id=excluded.shop_version_id,activated_at=excluded.activated_at;
  update public.cozy_shop_definitions set active=true
  where id='74000000-0000-4000-8000-000000000001';
  update public.cozy_shop_offers base set
    buy_price=offer.unit_price,maximum_quantity=offer.maximum_quantity,active=offer.enabled
  from public.economy_shop_version_offers offer
  where offer.shop_version_id='99000000-0000-4000-8000-000000000031'
    and base.id=offer.offer_id;

  update public.player_moderation_states set
    status='active',suspension_reason=null,suspended_at=null,suspended_by_admin_id=null,
    rename_required=false,rename_reason=null,rename_required_at=null,
    rename_required_by_admin_id=null,version=version+1
  where player_profile_id=player_id;
  update public.player_profiles profile set
    current_map_id=map.slug,current_map_version_id=anchor.map_version_id,
    safe_position_x=anchor.position_x,safe_position_y=anchor.position_y
  from public.cozy_shop_interactions anchor
  join public.world_maps map on map.id=anchor.world_map_id
  where profile.id=player_id
    and anchor.shop_definition_id='74000000-0000-4000-8000-000000000001'
    and anchor.active;

  delete from public.cozy_gameplay_rate_limits where player_profile_id=player_id;
  delete from public.economy_admin_rate_limits where admin_user_id in (
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000002',
    '9a200000-0000-4000-8000-000000000003'
  );

  select balance into strict current_balance
  from public.player_dust_accounts where player_profile_id=player_id;
  adjustment:=p_target_balance-current_balance;
  if adjustment<>0 then
    if not private.cozy_apply_dust_delta(
      player_id,adjustment,
      case when adjustment>0 then 'system_refund' else 'administrative_correction' end,
      'system_operation',adjustment_key,adjustment_key,adjustment_key
    ) then
      raise exception using errcode='P0001',message='PHASE9A_RACE_BALANCE_RESET_FAILED';
    end if;
  end if;

  delete from public.player_inventory_stacks where player_profile_id=player_id;
  update public.player_inventory_state set
    capacity=p_inventory_capacity,state_version=state_version+1,updated_at=now()
  where player_profile_id=player_id;
  insert into public.player_inventory_stacks(
    player_profile_id,item_definition_id,slot_index,quantity
  )
  select player_id,item.id,row_number() over(order by item.id),1
  from (
    select id from public.cozy_item_definitions
    where active and id not in (
      '71000000-0000-4000-8000-000000000015',
      '71000000-0000-4000-8000-000000000016'
    )
    order by id limit p_filled_slots
  ) item;
end;
$$;

create or replace function phase9a_test.prepare_purchase(
  p_target_balance bigint,
  p_inventory_capacity integer,
  p_filled_slots integer,
  p_offer_a uuid,
  p_offer_b uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  version public.economy_shop_versions%rowtype;
  price_a bigint;
  price_b bigint;
  dust_version integer;
  inventory_version integer;
begin
  perform phase9a_test.reset_player(
    p_target_balance,p_inventory_capacity,p_filled_slots
  );
  select shop_version.* into strict version
  from public.economy_active_shop_versions active
  join public.economy_shop_versions shop_version on shop_version.id=active.shop_version_id
  where active.shop_definition_id='74000000-0000-4000-8000-000000000001';
  select unit_price into strict price_a
  from public.economy_shop_version_offers
  where shop_version_id=version.id and offer_id=p_offer_a;
  if p_offer_b is not null then
    select unit_price into strict price_b
    from public.economy_shop_version_offers
    where shop_version_id=version.id and offer_id=p_offer_b;
  end if;
  select state_version into strict dust_version
  from public.player_dust_accounts
  where player_profile_id='82000000-0000-4000-8000-000000000001';
  select state_version into strict inventory_version
  from public.player_inventory_state
  where player_profile_id='82000000-0000-4000-8000-000000000001';
  return jsonb_build_object(
    'shopVersionId',version.id,'shopRevision',version.revision,
    'priceA',price_a,'priceB',price_b,
    'dustVersion',dust_version,'inventoryVersion',inventory_version
  );
end;
$$;

create or replace function phase9a_test.approved_shop_version(p_tag text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
  version_id uuid;
  revision integer;
begin
  result:=public.create_admin_economy_shop_draft(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    '74000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000031',
    'Village Supply Shop','Concurrency-reviewed shop version.',now(),p_tag||'-draft'
  );
  version_id:=(result->>'versionId')::uuid;
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    version_id,revision,'validate',null,p_tag||'-validate'
  );
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    version_id,revision,'submit_review',null,p_tag||'-review'
  );
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_shop_version(
    '9a200000-0000-4000-8000-000000000002',
    '9a200000-0000-4000-8000-000000000012','aal2',
    version_id,revision,'approve',null,p_tag||'-approve'
  );
  return jsonb_build_object(
    'versionId',version_id,'revision',(result->>'revision')::integer
  );
end;
$$;

create or replace function phase9a_test.approved_policy_version(
  p_rewards_enabled boolean,
  p_tag text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result jsonb;
  version_id uuid;
  revision integer;
begin
  result:=public.create_admin_economy_policy_draft(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    '99000000-0000-4000-8000-000000000001',true,true,p_rewards_enabled,true,
    250,24,500,5000,10,730,60,now(),p_tag||'-draft'
  );
  version_id:=(result->>'versionId')::uuid;
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_policy_version(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    version_id,revision,'validate',null,p_tag||'-validate'
  );
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_policy_version(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    version_id,revision,'submit_review',null,p_tag||'-review'
  );
  revision:=(result->>'revision')::integer;
  result:=public.operate_admin_economy_policy_version(
    '9a200000-0000-4000-8000-000000000002',
    '9a200000-0000-4000-8000-000000000012','aal2',
    version_id,revision,'approve',null,p_tag||'-approve'
  );
  return jsonb_build_object(
    'versionId',version_id,'revision',(result->>'revision')::integer
  );
end;
$$;

create or replace function phase9a_test.create_correction(
  p_delta bigint,
  p_tag text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare result jsonb;
begin
  result:=public.create_admin_economy_correction(
    '9a200000-0000-4000-8000-000000000001',
    '9a200000-0000-4000-8000-000000000011','aal2',
    '82000000-0000-4000-8000-000000000001',p_delta,'incident_repair',
    'Verified concurrency fixture correction with independent review.',p_tag
  );
  return (result->>'correctionId')::uuid;
end;
$$;

select 'economy concurrency helpers prepared' as result;
