# Deployment boundary

Phase 1 establishes deterministic application builds but does not select or configure a production
hosting provider. Deployment manifests, secret references, health probes, rollout policies, and
environment-specific settings belong here once a provider is approved. No production credentials or
hardcoded project identifiers may be committed.
