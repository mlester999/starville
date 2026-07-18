-- Persistent local-only helpers for the Phase 11C final-stock race.
drop schema if exists phase11c_test cascade;
create schema phase11c_test;

insert into public.player_profiles(
  wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
  safe_position_x,safe_position_y,facing_direction
) values
  ('11111111111111111111111111111187','Stock Buyer A','moss','lantern-square',
    '79000000-0000-4000-8000-000000000001',5.8,5.7,'south'),
  ('11111111111111111111111111111188','Stock Buyer B','moonberry','lantern-square',
    '79000000-0000-4000-8000-000000000001',5.8,5.7,'south');

select public.bootstrap_player_cozy_gameplay(
  '11111111111111111111111111111187','phase11c-race-bootstrap-a','phase11c:race:bootstrap:a'
);
select public.bootstrap_player_cozy_gameplay(
  '11111111111111111111111111111188','phase11c-race-bootstrap-b','phase11c:race:bootstrap:b'
);

update public.economy_shop_stock set current_stock=1,stock_revision=stock_revision+1
where catalog_version_id=(
    select active.shop_version_id from public.economy_active_shop_versions active
    where active.shop_definition_id='74000000-0000-4000-8000-000000000001'
  )
  and catalog_entry_id='c1100000-0000-4000-8000-000000000105';

create or replace function phase11c_test.buy_final_unit(
  p_wallet text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  profile_id uuid;
  dust_revision integer;
  inventory_revision integer;
  stock_revision integer;
  active_catalog_id uuid;
begin
  select id into strict profile_id from public.player_profiles where wallet_address=p_wallet;
  select state_version into strict dust_revision
  from public.player_dust_accounts where player_profile_id=profile_id;
  select state_version into strict inventory_revision
  from public.player_inventory_state where player_profile_id=profile_id;
  select active.shop_version_id into strict active_catalog_id
  from public.economy_active_shop_versions active
  where active.shop_definition_id='74000000-0000-4000-8000-000000000001';
  select stock.stock_revision into strict stock_revision
  from public.economy_shop_stock stock
  where stock.catalog_version_id=active_catalog_id
    and stock.catalog_entry_id='c1100000-0000-4000-8000-000000000105';
  return public.execute_player_shop_transaction(
    p_wallet,'phase7-general-store','c1100000-0000-4000-8000-000000000105',
    'buy',1,9,active_catalog_id,1,1,stock_revision,
    dust_revision,inventory_revision,p_idempotency_key,p_idempotency_key
  );
end;
$$;
