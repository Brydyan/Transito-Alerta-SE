-- Post-cutover monitoring queries — Transito-Alerta-SE.
--
-- Change: 2026-08-26-t8-database-cutover. Spec: capability `cutover`,
-- requirement R30.1 and R30.2. Design: design.md §3 and D5.
--
-- Every query below invokes a function defined in
-- `database/migrations/0042_monitoring_helpers.sql` rather than inlining
-- SQL against the domain tables. Two reasons:
--
--   1. Drift protection (D5): if a future migration renames a column
--      (e.g. `incidents.created_at` → `incidents.opened_at`) the
--      inline query breaks silently. The function signature is a
--      stable contract — rename the column inside the function body,
--      every monitoring alert keeps working.
--
--   2. Single point of definition for the alert threshold. The
--      `-- ALERT:` comment lives on the FUNCTION definition in the
--      migration, and the same alert text is mirrored here as a
--      runbook-readable comment so an operator running the query by
--      hand sees the threshold without a join to the function body.
--
-- To run all of them against staging in one shot:
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f queries.sql
-- To run them as a recurring job, the same file is what
-- `cutover-rehearsal.sh` invokes during the validation step (R26.1).
--
-- The 6 queries are listed in the order they appear in the design
-- (design.md §3) so a `cat -n` of this file matches the §3 numbering
-- one-for-one. Resist the urge to reorder.

\echo '── Q1: incidents per minute (last 5 min)'
SELECT * FROM monitor_incidents_per_minute(5);
-- ALERT: > 100 en cualquier bucket durante 2 buckets consecutivos

\echo ''
\echo '── Q2: endpoint latency p95 (proxy — see function header for limits)'
SELECT * FROM monitor_endpoint_latency_p95('/api/incidents', 60);
-- ALERT: p95 > 200 ms sostenido por 5 min (real metric: Prometheus)

\echo ''
\echo '── Q3: 5xx count (last 15 min, Postgres-side proxy)'
SELECT * FROM monitor_5xx_count(15);
-- ALERT: > 10 en 15 min (real metric: NestJS process counter)

\echo ''
\echo '── Q4: Postgres connection pool usage (current snapshot)'
SELECT
  state,
  count,
  round(100.0 * count / NULLIF((SELECT setting::int FROM pg_settings WHERE name='max_connections'), 0), 1)
    AS pct_of_max
FROM monitor_pg_pool_usage()
WHERE state IN ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)');
-- ALERT: > 80% de conexiones en uso por 5 min (compute % at callsite)

\echo ''
\echo '── Q5: revocation denylist size (user_sessions proxy)'
SELECT * FROM monitor_revocation_denylist_size();
-- ALERT: > 10 000 entradas (umbral arbitrario, ajustar tras 1 semana en prod)

\echo ''
\echo '── Q6: unread notifications per user (fan-out detector)'
SELECT * FROM monitor_unread_notifications_count();
-- ALERT: > 1 000 sin leer acumuladas para un solo usuario
