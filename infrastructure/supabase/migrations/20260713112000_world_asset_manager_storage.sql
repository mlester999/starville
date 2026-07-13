-- Starville Phase 7.5A: private intake and immutable sanitized delivery buckets.
-- Browser code uploads only through the protected API multipart boundary and receives no Storage credential.

do $$
declare
  intake storage.buckets%rowtype;
  delivery storage.buckets%rowtype;
begin
  select * into intake from storage.buckets where id = 'asset-intake';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'asset-intake', 'asset-intake', false, 10485760,
      array['image/png', 'image/webp']::text[]
    );
  elsif intake.public
     or intake.file_size_limit is distinct from 10485760
     or intake.allowed_mime_types is distinct from array['image/png', 'image/webp']::text[] then
    raise exception using errcode = '22023', message = 'ASSET_INTAKE_BUCKET_CONFIGURATION_MISMATCH';
  end if;

  select * into delivery from storage.buckets where id = 'game-assets';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('game-assets', 'game-assets', true, 10485760, array['image/webp']::text[]);
  elsif not delivery.public
     or delivery.file_size_limit is distinct from 10485760
     or delivery.allowed_mime_types is distinct from array['image/webp']::text[] then
    raise exception using errcode = '22023', message = 'GAME_ASSETS_BUCKET_CONFIGURATION_MISMATCH';
  end if;
end;
$$;

-- Restrictive namespace guards remain effective even if an unrelated future
-- migration adds a permissive Storage policy. Public delivery GET behavior is
-- intentionally left to the public game-assets bucket; browser writes are
-- denied for both managed namespaces.
create policy starville_asset_intake_read_guard
on storage.objects
as restrictive
for select
to anon, authenticated
using (bucket_id is distinct from 'asset-intake');

create policy starville_asset_bucket_insert_guard
on storage.objects
as restrictive
for insert
to anon, authenticated
with check (bucket_id not in ('asset-intake', 'game-assets'));

create policy starville_asset_bucket_update_guard
on storage.objects
as restrictive
for update
to anon, authenticated
using (bucket_id not in ('asset-intake', 'game-assets'))
with check (bucket_id not in ('asset-intake', 'game-assets'));

create policy starville_asset_bucket_delete_guard
on storage.objects
as restrictive
for delete
to anon, authenticated
using (bucket_id not in ('asset-intake', 'game-assets'));

comment on table public.world_asset_uploads is
  'Private intake reservations. Exact storage paths are server-generated and never returned by administrator-facing read RPCs.';
comment on table public.world_asset_versions is
  'Immutable approved asset versions. Public paths point only to sanitized normalized WebP derivatives.';
