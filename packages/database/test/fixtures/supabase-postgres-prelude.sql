-- Minimal Supabase-owned objects required to execute Starville migrations in an
-- isolated stock PostgreSQL cluster. Production migrations remain unchanged.

do $$
declare
  role_name text;
begin
  foreach role_name in array array[
    'anon',
    'authenticated',
    'service_role',
    'supabase_admin'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I nologin', role_name);
    end if;
  end loop;
end;
$$;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

create table auth.users (
  id uuid primary key,
  email text,
  encrypted_password text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  factor_type text not null,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(auth.jwt() ->> 'sub', '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
