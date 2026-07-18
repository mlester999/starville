# Phase 8B owner acceptance checklist

This checklist is intentionally pending until performed by the owner in real eligible sessions.

- [ ] Open two eligible player sessions in the same world/channel; A's Channel message reaches B
      once.
- [ ] Move the players apart and verify Nearby delivery stops outside the configured distance.
- [ ] Switch B to another channel and verify no old-channel delivery.
- [ ] Reconnect B and verify bounded history restores without duplicates.
- [ ] Hide/restore the browser tab and verify bounded unread reconciliation.
- [ ] Focus chat and verify WASD, Shift, E, and quickbar numbers do not reach gameplay.
- [ ] Mute A from B; verify only B hides A. Unmute and verify delivery returns.
- [ ] Block/unblock A and verify the durable preference after reconnect.
- [ ] Report a server-issued message and open it in Administration.
- [ ] Verify exact protected evidence, reporter privacy, related reports, and safe player link.
- [ ] Apply a temporary chat mute and verify the active client receives a private notice.
- [ ] Verify send is blocked immediately and remains blocked after refresh/reconnect.
- [ ] Remove/expire the mute and verify chat access returns.
- [ ] Test controlled escalation through the existing suspension workflow.
- [ ] Activate maintenance and verify realtime/chat access closes under existing policy.
- [ ] Review append-only audit history and confirm no private identity appears in general logs.
- [ ] Run the 40-user local chat load test and review CPU, memory, throughput, latency, and
      rejections.
- [ ] Validate player/admin chat at 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800,
      1440×900, and 1920×1080 with no horizontal overflow.
