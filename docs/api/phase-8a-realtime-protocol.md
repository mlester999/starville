# Phase 8A realtime API and protocol

`POST /api/v1/token-access/player/realtime-ticket` uses the existing credentialed browser boundary
and accepts `{}` or `{"channelId":"<uuid>"}`. Success contains only an opaque one-use `ticket` and
`expiresAt`.

Connect to `NEXT_PUBLIC_REALTIME_URL + /connect`. Every message is strict JSON with `version: 1`.
Client types are `authenticate`, `movement`, `switch_channel`, `resync`, and `ping`. Server types
are `admitted`, `snapshot`, `presence_joined`, `presence_updated`, `presence_left`,
`channel_changed`, `channels`, `movement_rejected`, `error`, and `pong`.

Unknown fields/types, invalid coordinates/facing/state/sequence, messages over 16 KiB, and
unauthenticated operations are rejected. Safe errors contain a code, retryability, and optional
request ID. Canonical contracts live in `@starville/realtime`.

For `movement`, `x`, `y`, and `sequence` describe the requested logical position and ordering.
`facingDirection` remains format-validated for protocol compatibility but is not broadcast
authority. `movementState` is a bounded gait request used for the permitted movement envelope; the
server derives the published walking/jogging state from accepted displacement and elapsed time. It
derives facing from the accepted displacement in isometric screen space.

When input stops, the client sends the last accepted coordinates with a newer sequence. The server
publishes that accepted update as `idle` and retains the last authoritative facing. It never invents
a client sequence for a trailing idle update. Other clients render the `facingDirection` and
`movementState` in server presence messages rather than replaying the sender's hints.
