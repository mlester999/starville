-- Phase 13E-A: forward-only correction for the hosted cleanup wrapper.
-- The original local started_at variable conflicted with scheduled_job_runs.started_at.
-- This migration never enables Cron and never calls cron.schedule.

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
declare run_started_at timestamptz := clock_timestamp();
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
        greatest(
          0,
          round(extract(epoch from clock_timestamp() - run_started_at) * 1000)::integer
        )
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
