-- Phase 13E-A: repository-controlled SQL/Cron proof.
-- The definition is intentionally disabled. This migration never calls cron.schedule.

create table public.scheduled_job_definitions (
  job_key text primary key check (job_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  provider text not null check (provider in ('custom-worker', 'supabase-cron')),
  executor text not null check (executor in ('sql-function', 'edge-function')),
  target text not null check (
    char_length(target) between 1 and 160 and target ~ '^[a-z0-9_.]+$'
  ),
  cron_expression text not null check (char_length(cron_expression) between 5 and 64),
  batch_size integer not null check (batch_size between 1 and 10000),
  enabled boolean not null default false,
  migration_state text not null check (
    migration_state in ('proof-disabled', 'shadow', 'ready', 'active', 'rolled-back')
  ),
  ownership_team text not null check (char_length(ownership_team) between 2 and 80),
  rollback_target text not null check (char_length(rollback_target) between 2 and 160),
  updated_at timestamptz not null default now()
);

insert into public.scheduled_job_definitions (
  job_key, provider, executor, target, cron_expression, batch_size, enabled,
  migration_state, ownership_team, rollback_target
) values (
  'social-interaction-expiry-cleanup',
  'supabase-cron',
  'sql-function',
  'public.run_scheduled_social_interaction_cleanup',
  '*/5 * * * *',
  1000,
  false,
  'proof-disabled',
  'Starville backend operations',
  'apps/worker social-interaction-expiry-cleanup'
)
on conflict (job_key) do update set
  provider = excluded.provider,
  executor = excluded.executor,
  target = excluded.target,
  cron_expression = excluded.cron_expression,
  batch_size = excluded.batch_size,
  enabled = false,
  migration_state = 'proof-disabled',
  ownership_team = excluded.ownership_team,
  rollback_target = excluded.rollback_target,
  updated_at = now();

create table public.scheduled_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.scheduled_job_definitions(job_key) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  status text not null check (status in ('running', 'succeeded', 'skipped_locked')),
  batch_size integer not null check (batch_size between 1 and 10000),
  attempt integer not null default 1 check (attempt between 1 and 10),
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 8192),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  constraint scheduled_job_run_state_check check (
    (status = 'running' and completed_at is null and duration_ms is null)
    or (status <> 'running' and completed_at is not null and duration_ms is not null)
  ),
  unique (job_key, request_id)
);

create index scheduled_job_runs_recent_idx
  on public.scheduled_job_runs(job_key, started_at desc);

alter table public.scheduled_job_definitions enable row level security;
alter table public.scheduled_job_definitions force row level security;
alter table public.scheduled_job_runs enable row level security;
alter table public.scheduled_job_runs force row level security;

revoke all on table public.scheduled_job_definitions
  from public, anon, authenticated, service_role;
revoke all on table public.scheduled_job_runs
  from public, anon, authenticated, service_role;

create or replace function public.run_scheduled_social_interaction_cleanup(
  p_batch_size integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare run_row public.scheduled_job_runs%rowtype;
declare result jsonb;
declare started_at timestamptz := clock_timestamp();
begin
  if p_batch_size not between 1 and 1000
     or p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULED_SOCIAL_CLEANUP';
  end if;

  select * into run_row
  from public.scheduled_job_runs
  where job_key = 'social-interaction-expiry-cleanup'
    and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'status', run_row.status,
      'runId', run_row.id,
      'summary', run_row.summary,
      'replayed', true
    );
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('scheduled-job:social-interaction-expiry-cleanup', 0)
  ) then
    insert into public.scheduled_job_runs (
      job_key, request_id, status, batch_size, completed_at, duration_ms, summary
    ) values (
      'social-interaction-expiry-cleanup', p_request_id, 'skipped_locked', p_batch_size,
      clock_timestamp(), 0, jsonb_build_object('outcome', 'already_running')
    )
    on conflict (job_key, request_id) do nothing
    returning * into run_row;
    if not found then
      select * into strict run_row
      from public.scheduled_job_runs
      where job_key = 'social-interaction-expiry-cleanup'
        and request_id = p_request_id;
    end if;
    return jsonb_build_object(
      'status', run_row.status,
      'runId', run_row.id,
      'summary', run_row.summary
    );
  end if;

  select * into run_row
  from public.scheduled_job_runs
  where job_key = 'social-interaction-expiry-cleanup'
    and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'status', run_row.status,
      'runId', run_row.id,
      'summary', run_row.summary,
      'replayed', true
    );
  end if;

  insert into public.scheduled_job_runs (
    job_key, request_id, status, batch_size
  ) values (
    'social-interaction-expiry-cleanup', p_request_id, 'running', p_batch_size
  )
  returning * into run_row;

  result := public.cleanup_social_interactions(
    p_batch_size,
    'cron:' || left(p_request_id, 123)
  );

  update public.scheduled_job_runs
  set status = 'succeeded',
      completed_at = clock_timestamp(),
      duration_ms = least(
        3600000,
        greatest(0, round(extract(epoch from clock_timestamp() - started_at) * 1000)::integer)
      ),
      summary = result || jsonb_build_object('outcome', 'completed')
  where id = run_row.id
  returning * into run_row;

  return jsonb_build_object(
    'status', 'succeeded',
    'runId', run_row.id,
    'summary', run_row.summary
  );
end;
$$;

comment on function public.run_scheduled_social_interaction_cleanup(integer,text) is
  'Bounded, idempotent SQL/Cron proof. Advisory locking prevents overlapping executions. '
  'Failures are rethrown and remain visible in cron.job_run_details; successful and lock-skipped '
  'attempts are recorded in scheduled_job_runs.';

revoke all on function public.run_scheduled_social_interaction_cleanup(integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.run_scheduled_social_interaction_cleanup(integer,text)
  to service_role;
