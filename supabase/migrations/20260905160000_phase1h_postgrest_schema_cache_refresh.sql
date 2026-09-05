-- Phase 1H operational repair: make the PostgREST schema refresh explicit.
-- This does not change payroll data or production. It ensures the Supabase
-- Data API sees the attendance interpretation RPC after the migration runs.

select pg_catalog.pg_notification_queue_usage();
notify pgrst, 'reload schema';

