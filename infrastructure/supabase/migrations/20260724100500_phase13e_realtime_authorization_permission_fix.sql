-- Phase 13E-A: forward-only least-privilege repair for Realtime policy evaluation.
--
-- Repository migration policy treats committed migrations as immutable even while
-- they are pending on starville-dev. Keep this migration immediately after the
-- Realtime authorization migration so the reviewed hosted push cannot omit it.

revoke all on function private.supabase_realtime_topic_authorized(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.supabase_realtime_topic_authorized(uuid,text,text)
  to authenticated;

comment on function private.supabase_realtime_topic_authorized(uuid,text,text) is
  'SECURITY DEFINER policy entry point for authenticated private Realtime Broadcast and Presence. '
  'The exact EXECUTE grant is required by realtime.messages RLS; it grants no table authority.';
