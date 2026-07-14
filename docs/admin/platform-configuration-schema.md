# Platform configuration schema

Every configuration has `schemaVersion: 1` and strict branding, branding-assets, theme, typography,
admin-login, landing, navigation, and module sections. Unknown keys are rejected. Text, links,
arrays, and payload sizes are bounded. External links require HTTPS; internal links must be
registered paths.

Validation findings use `blocking_error`, `warning`, `recommendation`, or `passed`. Required
security modules cannot be disabled. Duplicate sections, routes, or modules are blocking errors.
World Assets and other dependent modules cannot be enabled without registered dependencies.

Publication requires no blocking error, an approved review, approved referenced assets, the exact
draft revision, the exact active revision, a reason, and an idempotency request ID.
