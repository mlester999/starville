# Maintenance and announcements runbook

## Maintenance mode

Use maintenance for planned commissioning, unsafe dependencies, security containment, or a service
state that cannot safely admit players. The database clock and revision are authoritative.
Game/API/Reatime behavior must fail closed when the live-operations configuration cannot be
verified.

1. Open `/operations/live` with `live_operations.manage` and AAL2.
2. Record the change/incident identifier and a player-safe title/message. Do not include internal
   endpoints, stack traces, credentials, player identifiers, or unverified restoration times.
3. For scheduled maintenance, verify UTC start/end and `autoDisableAtEnd`. For immediate activation,
   type the required `MAINTENANCE` confirmation.
4. Submit with the displayed expected revision. A conflict means another operator changed the state;
   reload, review, and decide again.
5. Verify public status, Game admission denial, Realtime admission/disconnection behavior, and
   existing player-safe messaging. Record the revision and request ID.
6. During maintenance, post concise updates with evidence-based timing. Do not promise a return time
   that the incident commander has not approved.
7. Before disabling, verify API, Realtime, Worker, database, world manifest, assets, auth, wallet,
   and key gameplay readiness. Disable using the latest revision and confirm admission resumes.

Rollback is disabling or rescheduling with the current revision. If the control surface fails, keep
services fail closed, use the incident escalation path, and do not directly edit the table.

## Announcements

Announcements are operational communication, not arbitrary HTML. Messages are bounded safe text; CTA
URLs must be an internal absolute path or HTTPS and require a paired label.

1. Create a draft with internal title, player message, severity, ticker/banner presentation,
   priority, dismissal, UTC schedule, optional CTA, and an internal reason.
2. Review wording, locale assumptions, priority conflicts, start/end ordering, and destination
   safety. Never disclose private support/security evidence.
3. Publish or schedule with the current expected revision. Verify the effective status is derived
   from database time.
4. Observe Landing/Game presentation, keyboard access, reduced motion, narrow/mobile layout, and
   dismiss behavior.
5. Deactivate immediately when stale or inaccurate; archive only after operational use is complete.
   Preserve history instead of deleting records.

For a false or harmful announcement, deactivate it, publish a corrected message if needed, and
record both revision IDs in the incident/change record.

## Authorization and evidence

Read and manage permissions remain separate. Every mutation requires an authorized administrator,
AAL2, rate limits, reason, request identifier, expected revision, and audit before/after state.
Evidence contains timestamps, revision IDs, safe screenshots, request IDs, and operator/owner
sign-off—not tokens, cookies, wallet addresses, email addresses, or service credentials.
