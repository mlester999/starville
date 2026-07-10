# Admin portal Phase 1 scope

The Phase 1 admin portal is a separately deployable, branded application shell. It has no public
registration, login form, fake dashboard, player data, role flag, authorization bypass, or
privileged Supabase access.

Administrator authentication, trusted `admin_users` records, roles, permissions, protected routes,
the `/unauthorized` flow, session revocation, and audit records belong to Phase 2 and must be
enforced by the backend and Row Level Security—not by hidden frontend navigation.
