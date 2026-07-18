# Phase 8B chat moderation runbook

Use **Operations → Chat moderation**. The queue supports status, category, world, channel, safe
message/display-name search, and page sizes 10, 50, or 100. Detail shows protected evidence,
reporter/reported public identity, moderation history, active mute, related reports, and a safe link
to player search. It never shows wallet, email, IP, tokens, or private sessions.

## Workflow

`Open → Under Review → Actioned` or `Open/Under Review → Dismissed`.

Every mutation requires `multiplayer_chat.moderate`, AAL/session authorization, an expected
revision, unique request ID, and 12–500 character reason. Available actions are under review,
dismiss, record warning, chat mute (15 minutes, 1 hour, 24 hours, or 7 days), chat unmute, and
escalate. Escalation records the reviewed boundary and directs staff to the existing protected
player suspension workflow; it does not silently suspend from chat text alone.

Chat mutes affect sending only. Gameplay and System messages remain available. The realtime server
checks the durable mute on every send and refreshes mute state during authorization reconciliation,
so refresh/reconnect cannot bypass it. Evidence and action rows are append-only/immutable.

## Permission matrix

| Role                                 | Read        | Moderate | Reports | Audit | Settings read/edit |
| ------------------------------------ | ----------- | -------- | ------- | ----- | ------------------ |
| Super Admin                          | Yes         | Yes      | Yes     | Yes   | Yes / Yes          |
| Game Administrator                   | Yes         | Yes      | Yes     | Yes   | Yes / Yes          |
| Moderator                            | Yes         | Yes      | Yes     | No    | No / No            |
| Live Operations Manager              | Yes         | No       | Yes     | No    | No / No            |
| Customer Support                     | Yes         | No       | Yes     | No    | No / No            |
| Read-only Analyst                    | Yes         | No       | No      | No    | No / No            |
| World Designer / Blockchain Operator | No mutation | No       | No      | No    | No / No            |

If an action returns a revision conflict, reload the report and review the newer action. Never retry
with a fabricated revision. If persistence or realtime notification is unavailable, preserve the
request ID, inspect safe service logs, and verify the durable report before retrying.
