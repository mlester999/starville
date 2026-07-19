-- Starville Phase 12 hosted-validation repair.
-- Preserve the canonical seven-argument inventory authority while supporting the
-- committed Phase 12A onboarding-recovery metadata shape.

create function private.cozy_add_item(
  p_player_profile_id uuid,
  p_item_definition_id uuid,
  p_quantity integer,
  p_reason text,
  p_reference_id text,
  p_recovery_reference_id text,
  p_idempotency_key text,
  p_request_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_suffix text;
  ledger_request_id text;
begin
  -- Bounds mirror public.player_inventory_history exactly: the composed
  -- reference_id ('onboarding_recovery:' || recovery reference) stays within
  -- 128 characters and the idempotency key matches the ledger. The Phase 12A
  -- caller appends ':recovery:' plus the recovery UUID to its own valid
  -- 1-128 character request id. Preserve that complete caller contract here;
  -- an overlong composed child id is reduced to a deterministic SHA-256-bound
  -- ledger id below rather than rejecting an otherwise valid worker request.
  if p_quantity <> 1
    or p_reason <> 'starter_grant'
    or p_reference_id <> 'onboarding_recovery'
    or p_recovery_reference_id is null
    or char_length(p_recovery_reference_id) not between 1 and 108
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_request_id is null
  then
    raise exception using errcode = '22023', message = 'INVALID_ONBOARDING_RECOVERY_GRANT';
  end if;

  request_suffix := ':recovery:' || p_recovery_reference_id;
  if char_length(p_request_id) not between char_length(request_suffix) + 1
      and char_length(request_suffix) + 128
    or right(p_request_id, char_length(request_suffix)) <> request_suffix
  then
    raise exception using errcode = '22023', message = 'INVALID_ONBOARDING_RECOVERY_GRANT';
  end if;

  ledger_request_id := case
    when char_length(p_request_id) <= 128 then p_request_id
    else 'phase12a-recovery:' || encode(
      extensions.digest(convert_to(p_request_id, 'UTF8'), 'sha256'),
      'hex'
    )
  end;

  return private.cozy_add_item(
    p_player_profile_id,
    p_item_definition_id,
    p_quantity,
    p_reason,
    p_reference_id || ':' || p_recovery_reference_id,
    p_idempotency_key,
    ledger_request_id
  );
end;
$$;

revoke all on function private.cozy_add_item(
  uuid, uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;

comment on function private.cozy_add_item(
  uuid, uuid, integer, text, text, text, text, text
) is
  'Private Phase 12A onboarding-recovery compatibility wrapper; validates the fixed starter-grant metadata shape, deterministically bounds composed request ids, and delegates to the canonical inventory authority.';
