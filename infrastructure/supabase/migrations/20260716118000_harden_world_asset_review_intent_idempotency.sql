-- Bind high-impact review lifecycle request IDs to one canonical server-derived intent.
-- This is additive: the existing mutation replay table remains the source of successful responses.

create table public.world_asset_operation_intents (
  administrator_user_id uuid not null references public.admin_users(user_id) on delete restrict,
  operation text not null check (
    operation in ('submit_asset_review', 'review_asset_version', 'activate_asset_version')
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  world_asset_id uuid not null references public.world_assets(id) on delete restrict,
  world_asset_version_id uuid not null references public.world_asset_versions(id) on delete restrict,
  intent_fingerprint text not null check (intent_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (administrator_user_id, operation, request_id),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);

create index world_asset_operation_intents_expiry_idx
  on public.world_asset_operation_intents(expires_at);

alter table public.world_asset_operation_intents enable row level security;
alter table public.world_asset_operation_intents force row level security;
revoke all on table public.world_asset_operation_intents
  from public, anon, authenticated, service_role;

create or replace function public.claim_admin_game_asset_operation_intent(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_operation text,
  p_request_id text,
  p_reason text,
  p_intent_fingerprint text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  stored_fingerprint text;
begin
  if p_operation not in (
       'submit_asset_review', 'review_asset_version', 'activate_asset_version'
     )
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.valid_world_asset_reason(p_reason)
     or coalesce(p_intent_fingerprint, '') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_OPERATION_INTENT';
  end if;
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level,
    case p_operation
      when 'submit_asset_review' then 'assets.edit'
      when 'review_asset_version' then 'assets.review'
      else 'assets.activate'
    end
  );
  if not exists (
    select 1
    from public.world_asset_versions as version
    where version.id = p_version_id and version.world_asset_id = p_asset_id
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.world_asset_operation_intents (
    administrator_user_id, operation, request_id, world_asset_id,
    world_asset_version_id, intent_fingerprint
  ) values (
    p_user_id, p_operation, p_request_id, p_asset_id,
    p_version_id, p_intent_fingerprint
  )
  on conflict (administrator_user_id, operation, request_id) do update
  set world_asset_id = excluded.world_asset_id,
      world_asset_version_id = excluded.world_asset_version_id,
      intent_fingerprint = excluded.intent_fingerprint,
      created_at = now(),
      expires_at = now() + interval '24 hours'
  where public.world_asset_operation_intents.expires_at <= now()
  returning intent_fingerprint into stored_fingerprint;

  if stored_fingerprint is not null then
    if p_operation = 'activate_asset_version' then
      insert into public.world_asset_audit_events (
        event_key, action, permission_key, actor_admin_user_id, admin_session_id,
        target_world_asset_id, target_world_asset_version_id, request_id,
        outcome, reason, after_state
      ) values (
        'asset.version.activation_requested', 'activation_requested', 'assets.activate',
        p_user_id, admin_session_id, p_asset_id, p_version_id, p_request_id, 'success', p_reason,
        jsonb_build_object(
          'mutationPerformed', false, 'worldReferencesChanged', false,
          'worldPublicationPerformed', false
        )
      )
      on conflict (request_id, event_key) do nothing;
    end if;
    return jsonb_build_object('status', 'claimed');
  end if;

  select intent.intent_fingerprint into stored_fingerprint
  from public.world_asset_operation_intents as intent
  where intent.administrator_user_id = p_user_id
    and intent.operation = p_operation
    and intent.request_id = p_request_id
    and intent.expires_at > now();

  if stored_fingerprint = p_intent_fingerprint then
    return jsonb_build_object('status', 'exact_replay');
  end if;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, before_state, after_state
  ) values (
    'asset.request.intent_conflict', 'request_conflict', 'assets.read', p_user_id,
    admin_session_id, p_asset_id, p_version_id, p_request_id, 'error',
    jsonb_build_object('operation', p_operation),
    jsonb_build_object('mutationPerformed', false, 'worldPublicationPerformed', false)
  )
  on conflict (request_id, event_key) do nothing;

  return jsonb_build_object('status', 'request_conflict');
end;
$$;

revoke all on function public.claim_admin_game_asset_operation_intent(
  uuid, uuid, text, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_game_asset_operation_intent(
  uuid, uuid, text, uuid, uuid, text, text, text, text
) to service_role;

comment on table public.world_asset_operation_intents is
  'Server-derived intent fingerprints prevent request IDs from being reused with changed review or activation intent.';
comment on function public.claim_admin_game_asset_operation_intent(
  uuid, uuid, text, uuid, uuid, text, text, text, text
) is
  'Claims one bounded review or activation intent before mutation; exact retries proceed and changed intent is rejected.';
