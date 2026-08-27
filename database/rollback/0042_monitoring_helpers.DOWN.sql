-- Rollback of migration 0042 — drops the 6 monitoring helper functions.
--
-- Change: 2026-08-26-t8-database-cutover. Mirrors
-- 0042_monitoring_helpers.sql. DROP FUNCTION IF EXISTS makes the DOWN
-- idempotent and safe to re-run (matches D8: "idempotente, reversible").
--
-- Order matters only if any of the 6 functions had a dependency on
-- another — none do, so the order is alphabetical for readability.

DROP FUNCTION IF EXISTS public.monitor_endpoint_latency_p95(text, integer);
DROP FUNCTION IF EXISTS public.monitor_5xx_count(integer);
DROP FUNCTION IF EXISTS public.monitor_incidents_per_minute(integer);
DROP FUNCTION IF EXISTS public.monitor_pg_pool_usage();
DROP FUNCTION IF EXISTS public.monitor_revocation_denylist_size();
DROP FUNCTION IF EXISTS public.monitor_unread_notifications_count();
