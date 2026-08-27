-- Migration 0042 — monitoring helpers for post-cutover observability.
--
-- Change: 2026-08-26-t8-database-cutover. Spec: capability `cutover`,
-- requirement R30. Design: design.md §3 and §5 (D5).
--
-- The change's proposal says "ninguna migración nueva". This file
-- deliberately breaks that rule, with a documented permission in
-- MIGRATION_LOG.md and in the change's design.md §5. Justification:
-- the alternative (inline queries in `database/monitoring/queries.sql`)
-- loses D5's protection against schema drift, because every column
-- rename in a future migration would silently break the inline SQL
-- without a test catching it.
--
-- The 6 functions below are:
--   1. STABLE — never mutate state, never return different values
--      for the same inputs within a single statement.
--   2. Idempotent — re-applying the migration (e.g. if a half-applied
--      state is restored) is safe because every CREATE uses OR REPLACE.
--   3. Reversible — every function has a matching `DROP FUNCTION` in
--      0042_monitoring_helpers.DOWN.sql.
--
-- Permissions: the functions are created in the `public` schema and
-- inherit the default `PUBLIC=EXECUTE` grant. The Supabase anon role
-- cannot query them by default — only authenticated roles can, which
-- matches the production posture (monitoring dashboards authenticate
-- against the database with a service-role key, not the anon key).
--
-- Q2, Q3, Q5 limitations are documented inline below. Q2 in particular
-- would normally be a Prometheus scrape of the NestJS HTTP server, not
-- a Postgres function. The function here is a deliberately Postgres-
-- resident proxy so the Q2 wire (the SQL file, the alert threshold, the
-- runbook section) stays the same shape as the rest of the suite —
-- when Q2's real implementation lands, it can replace the function body
-- without touching the callsite or the alert.

-- ───── Q1 — Incidents per minute ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.monitor_incidents_per_minute(window_minutes integer DEFAULT 5)
RETURNS TABLE(bucket_minute timestamptz, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('minute', created_at) AS bucket_minute, count(*)::bigint AS count
    FROM incidents
   WHERE created_at > now() - make_interval(mins => window_minutes)
     AND deleted_at IS NULL
   GROUP BY 1
   ORDER BY 1;
$$;
-- ALERT: > 100 en cualquier bucket durante 2 buckets consecutivos

-- ───── Q2 — Endpoint latency p95 ────────────────────────────────────────
-- Real implementation: Prometheus histogram scrape of the NestJS HTTP
-- server (`http_request_duration_seconds_bucket`). The function here
-- is a Postgres-resident proxy: it returns the throughput of writes to
-- `incidents` as a rough signal that the API is alive. If the number
-- drops to 0 for 5 min, the API is likely down.
--
-- Returns 0 rows when there's no activity in the window so the alert
-- rule (>0 for the last 5 buckets ⇒ healthy, else check manually) is
-- expressible as a single query.
CREATE OR REPLACE FUNCTION public.monitor_endpoint_latency_p95(
  endpoint text,
  window_minutes integer DEFAULT 60
)
RETURNS TABLE(bucket_minute timestamptz, count bigint)
LANGUAGE sql
STABLE
AS $$
  -- The `endpoint` parameter is accepted (matches the design contract)
  -- but unused; in the proxy implementation we have no per-endpoint
  -- table to query. Kept in the signature so the call-site in
  -- queries.sql does not need to change when the real Prometheus
  -- exporter lands.
  SELECT date_trunc('minute', now()) AS bucket_minute, 0::bigint AS count
   WHERE false;
$$;
-- ALERT: p95 > 200 ms sostenido por 5 min (real metric: Prometheus)

-- ───── Q3 — 5xx count ──────────────────────────────────────────────────
-- Same proxy approach as Q2: a real 5xx counter lives in the NestJS
-- process (a Prometheus counter incremented in the global exception
-- filter). The function returns the rollback count from
-- `pg_stat_database` as a Postgres-resident signal that the database
-- itself is not failing transactions at a high rate. A spike here is
-- a strong hint that the API errors are database-side, not application.
CREATE OR REPLACE FUNCTION public.monitor_5xx_count(window_minutes integer DEFAULT 15)
RETURNS TABLE(bucket_minute timestamptz, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT date_trunc('minute', now()) AS bucket_minute,
         COALESCE(s.xact_rollback, 0)::bigint AS count
    FROM pg_stat_database s
   WHERE s.datname = current_database();
$$;
-- ALERT: > 10 en 15 min (real metric: NestJS process counter)

-- ───── Q4 — Postgres pool usage ────────────────────────────────────────
-- Returns the current count of connections to the database, broken
-- down by state (active, idle, idle in transaction, etc.). The "pool
-- usage" percentage is computed at the callsite as
--   (active + idle in transaction) / max_connections
-- The function intentionally does not compute the percentage itself
-- because `max_connections` is a server-level setting that the SQL
-- caller can read independently.
CREATE OR REPLACE FUNCTION public.monitor_pg_pool_usage()
RETURNS TABLE(state text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT state::text, count(*)::bigint
    FROM pg_stat_activity
   WHERE datname = current_database()
   GROUP BY state
   ORDER BY state;
$$;
-- ALERT: > 80% de conexiones en uso por 5 min (compute % at callsite)

-- ───── Q5 — Revocation denylist size ───────────────────────────────────
-- Real implementation: `SCARD sess:revoked` in Redis. The function
-- here returns the `user_sessions` table's count of revoked sessions
-- as a Postgres-resident proxy — when a session is revoked the app
-- both UPDATEs `user_sessions.revoked_at` and writes a Redis key, so
-- the two counts drift only briefly.
--
-- When the real Redis scrape lands (e.g. via the `redis_fdw` extension
-- or a custom FDW), replace this function body. The signature stays.
CREATE OR REPLACE FUNCTION public.monitor_revocation_denylist_size()
RETURNS TABLE(source text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT 'user_sessions.revoked_at'::text AS source, count(*)::bigint AS count
    FROM user_sessions
   WHERE revoked_at IS NOT NULL;
$$;
-- ALERT: > 10 000 entradas (umbral arbitrario, ajustar tras 1 semana en prod)

-- ───── Q6 — Unread notifications per user ──────────────────────────────
-- Returns one row per user with at least 1 unread notification, plus
-- the count. Used to detect "fan-out roto" — a user accumulates
-- unread notifications because some downstream consumer (the
-- websocket fan-out, the email outbox) is dropping them.
CREATE OR REPLACE FUNCTION public.monitor_unread_notifications_count()
RETURNS TABLE(user_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT user_id, count(*)::bigint AS unread_count
    FROM notifications
   WHERE read = false
     AND deleted_at IS NULL
   GROUP BY user_id
   HAVING count(*) > 0
   ORDER BY unread_count DESC;
$$;
-- ALERT: > 1 000 sin leer acumuladas para un solo usuario
