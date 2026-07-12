# Phase 8 social multiplayer — approved future requirements

This document records approved Phase 8 requirements only. No presence, channel, chat, nearby-label,
gift, or trade UI is implemented in Phase 4.

Realtime play should target approximately 40 active characters per authenticated server channel and
create additional channels when population requires it. Switching must be safe and truthful: no
duplicate entity, cross-channel state leakage, false occupancy, or unauthenticated presence.

Chat is planned near the bottom-left with local/channel scope defined during Phase 8. It requires
rate limits, text sanitization, moderation, report and mute boundaries, and must never solicit or
display wallet secrets.

The N key may reveal nearby labels containing only approved public fields such as display name and,
once progression exists, level. Distant names should not remain permanently visible; range,
visibility, and performance limits must be explicit. N is deliberately not reserved by the current
Phase 4 input map.

Nearby interactions may eventually offer Inspect Character, Gift, and Trade. The server must
validate proximity, connection, and matching channel. Inspect exposes safe public data only. Gift
requires confirmation and server authority. Trade requires mutual consent, atomic settlement,
cancellation, and auditability and cannot precede inventory/economy systems. Clients never
authoritatively transfer items or currency, and ordinary trade sends no blockchain token transfer
unless a later approved design explicitly requires one.
