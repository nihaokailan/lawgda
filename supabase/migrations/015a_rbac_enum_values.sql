-- Adds the app_role enum values used by the RBAC migrations (016, 017, 018).
-- Postgres cannot use a newly added enum value inside the transaction that
-- added it, so this file must be run (and committed) on its own BEFORE 016.
-- It is idempotent and safe to re-run.

alter type app_role add value if not exists 'normal';
alter type app_role add value if not exists 'default_admin';
