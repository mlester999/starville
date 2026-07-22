# Monitoring boundary

The API, Realtime service, and Worker expose bounded health/readiness surfaces and structured logs.
The Admin Operations views report measured server state and never infer online players, revenue, or
healthy dependencies from missing data.

Phase 13C defines the required signal and alert contract in
`docs/operations/observability-and-health.md`. Provider-specific metrics, tracing, error reporting,
dashboards, paging destinations, thresholds, retention, and launch observation remain Phase 13D
owner configuration. Missing telemetry is `unknown`, not healthy.

Instrumentation preserves safe request IDs and must never include secrets, full credential-bearing
URLs, cookies/tokens, signatures/nonces, raw wallet/email/IP identity, or private moderation/support
evidence. Production source maps are disabled for Game Client, API, Realtime, and Worker builds.
