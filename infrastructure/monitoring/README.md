# Monitoring boundary

The API, real-time service, and worker expose local health/readiness surfaces and structured logs in
Phase 1. Provider-specific metrics, tracing, error reporting, dashboards, alerts, and retention
rules are deferred until a monitoring platform is chosen. Instrumentation must preserve request IDs
and must never include secrets or full credential-bearing URLs.
