-- Technical failures for a new version of an existing active asset must not leave an open
-- candidate. The reservation remains as immutable audit evidence, but it becomes terminal and can
-- never replace the active version or block a later retry.

create or replace function public.fail_admin_game_asset_processing(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_upload_id uuid,
  p_expected_revision integer,
  p_error_code text,
  p_validation_results jsonb,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  asset public.world_assets%rowtype;
  version public.world_asset_versions%rowtype;
  upload public.world_asset_uploads%rowtype;
  safe_results jsonb := p_validation_results;
  terminal_lifecycle text;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if p_error_code not in (
       'UNSUPPORTED_IMAGE', 'MIME_MISMATCH', 'MALFORMED_IMAGE', 'ANIMATED_IMAGE',
       'IMAGE_TOO_LARGE', 'DIMENSIONS_TOO_LARGE', 'DECOMPRESSION_LIMIT',
       'DUPLICATE_CONTENT', 'PROCESSING_FAILED', 'STORAGE_FAILED'
     )
     or not private.valid_world_asset_validation_results(p_validation_results)
     or not private.claim_world_asset_rate_limit(
       'processing_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_PROCESSING_FAILURE';
  end if;
  if jsonb_array_length(safe_results -> 'issues') = 0 then
    safe_results := jsonb_set(
      safe_results,
      '{issues}',
      jsonb_build_array(jsonb_build_object(
        'code', p_error_code, 'level', 'blocking_error', 'path', 'source',
        'message', 'The image could not be processed safely.'
      ))
    );
  end if;
  safe_results := jsonb_set(safe_results, '{valid}', 'false'::jsonb, true);

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
    where id = p_version_id and world_asset_id = p_asset_id for update;
  select * into upload from public.world_asset_uploads
    where id = p_upload_id and world_asset_id = p_asset_id
      and world_asset_version_id = p_version_id for update;
  if asset.id is null or version.id is null or upload.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  terminal_lifecycle := case
    when asset.active_version_id is not null
      and asset.active_version_id <> version.id
      and not exists (
        select 1 from public.world_map_version_assets as reference
        where reference.world_asset_id = asset.id
          and reference.world_asset_version_id = version.id
      )
      and not exists (
        select 1 from public.world_asset_references as reference
        where reference.world_asset_id = asset.id
          and reference.world_asset_version_id = version.id
      )
    then 'archived'
    else 'validation_failed'
  end;

  replay := private.world_asset_replay(p_user_id, 'fail_asset_processing', p_request_id);
  if replay is not null then
    if upload.status = 'failed'
       and upload.revision = p_expected_revision + 1
       and upload.safe_error_code = p_error_code
       and upload.validation_results = safe_results
       and version.lifecycle_status = terminal_lifecycle then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if upload.revision <> p_expected_revision then
    return jsonb_build_object('status', 'upload_version_conflict', 'uploadRevision', upload.revision);
  end if;
  if upload.status in ('validated', 'failed', 'cancelled', 'expired') then
    return jsonb_build_object('status', 'processing_not_available');
  end if;

  update public.world_asset_uploads
  set status = 'failed', safe_error_code = p_error_code,
      validation_results = safe_results, revision = revision + 1, completed_at = now()
  where id = upload.id returning * into upload;
  update public.world_asset_versions
  set lifecycle_status = terminal_lifecycle,
      automated_validation_status = 'invalid',
      validation_results = safe_results,
      edit_version = edit_version + 1
  where id = version.id returning * into version;
  update public.world_asset_processing_jobs
  set status = 'failed', attempt_count = attempt_count + 1,
      safe_error_code = p_error_code, completed_at = now()
  where upload_id = upload.id;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, after_state, metadata
  ) values (
    'asset.processing.failed', 'processing_failed', 'assets.upload',
    p_user_id, admin_session_id, asset.id, version.id, upload.id,
    p_request_id, 'error', jsonb_build_object('lifecycleStatus', terminal_lifecycle),
    jsonb_build_object('safeErrorCode', p_error_code)
  );
  result := jsonb_build_object(
    'status', terminal_lifecycle, 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version),
    'validationResults', safe_results, 'uploadRevision', upload.revision
  );
  perform private.store_world_asset_replay(
    p_user_id, 'fail_asset_processing', p_request_id, result
  );
  return result;
end;
$$;

comment on function public.fail_admin_game_asset_processing(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, jsonb, text, integer
) is 'Records bounded processing failure evidence and terminally archives an unreferenced failed candidate when the canonical asset already has an active version.';
