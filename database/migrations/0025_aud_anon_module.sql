-- 0025_aud_anon_module.sql
-- Transito Alerta SE — AUD/ANON Module
-- `back/2026-09-02-aud-audit-trail-and-identity-reveal`
-- `back/2026-09-02-anon-close-anonymous-reporting`
--
-- Group G consolidation (2026-10-14): fused from:
--   0045_audit_events              — AUD (sc-327): audit_events table
--   0046_incident_reporters        — AUD (sc-327): incident_reporters + is_anonymous
--   0048_close_anonymous_ceiling   — ANON (sc-326): close anonymous permissions
--   0067_restore_anonymous_mask    — QA sc-405: insert-or-repair anonymous mask row
--
-- Section order:
--   0025 → 0046 → 0048 → 0067
--   0048 establishes permissions='[]' on the mask row; 0067 runs last
--   because it repairs the full canonical state including permissions='[]'.
--   In the original chain 0046 ran before 0048 (lower number); the
--   SQL of 0046 does not fail without 0048 applied first — the header
--   note on 0046 documents semantic context, not a hard SQL dependency.
--
-- MANUAL EXECUTION ONLY — see 0001_initial_schema.sql header.
-- Requires 0001 (users), 0004 (incidents), 0008 (anonymous ceiling).
--
-- Rollback: database/rollback/0025_aud_anon_module.DOWN.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 1) AUD sc-327 — audit_events table
--
--    Generic, immutable audit log for all auditable actions (design D3).
--    One table instead of N per use case — the cost is a less-typed
--    metadata JSONB; the benefit is "what happened to this incident"
--    answered by one query.
--
--    justification: nullable in the schema, mandatory by action in the
--    app (REVEAL incidents, F7 cap override). Keeping the constraint in
--    the service avoids a migration per new action that requires it.
--
--    actor_id ON DELETE RESTRICT: a user with audit events cannot be
--    deleted. R32.1 requires explicit ON DELETE on every FK; the implicit
--    NO ACTION would fail the t7-integrity-referential gate.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action        varchar(64) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id   uuid,
  justification text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- (resource_type, resource_id, created_at DESC): "what happened to this incident"
CREATE INDEX IF NOT EXISTS idx_audit_resource
  ON audit_events (resource_type, resource_id, created_at DESC);

-- (actor_id, created_at DESC): "what did this operator do"
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_events (actor_id, created_at DESC);

COMMENT ON TABLE audit_events IS
  'AUD (sc-327): registro genérico e inmutable de acciones auditables. La escritura participa de la misma transacción que la acción auditada (D4).';

COMMENT ON COLUMN audit_events.action IS
  'Acción ejecutada (ej: REVEAL). El conjunto de valores válidos se controla por la app — la columna es varchar(64) para no crear una migración por cada acción nueva.';

COMMENT ON COLUMN audit_events.justification IS
  'AUD D3: nullable en el esquema, obligatorio por acción. La revelación de autoría y la excepción al tope de F7 lo exigen. La app rechaza con 400 si la acción lo requiere y el campo viene vacío.';

-- ════════════════════════════════════════════════════════════════════════
-- 2) AUD sc-327 — incident_reporters table + incidents.is_anonymous
--
--    The real authorship of an anonymous publication does NOT live in
--    incidents.citizen_id (which remains NOT NULL and means "displayed
--    authorship" after this migration). The anonymous mask row
--    (device_uuid='anonymous', seeded by 0001) becomes the displayed
--    author; the real author lives in incident_reporters.
--
--    is_anonymous DEFAULT false: existing incidents are not anonymous —
--    citizen_id already points to the real author; no data rewrite needed.
--
--    incident_id is PK → enforces 1:1 cardinality at DB level.
--    user_id ON DELETE RESTRICT: the real author cannot be deleted while
--    an authorship record exists. Needed by R32.1 (explicit ON DELETE).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN incidents.is_anonymous IS
  'AUD (sc-327) D1: si true, incidents.citizen_id apunta a la máscara (device_uuid=''anonymous'') y el autor real vive en incident_reporters. Default false en la migración para no reescribir datos históricos; las nuevas publicaciones anónimas lo setean explícitamente.';

CREATE TABLE IF NOT EXISTS incident_reporters (
  incident_id uuid        PRIMARY KEY REFERENCES incidents (id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- "what anonymous incidents did this person file" — used when master requests REVEAL
CREATE INDEX IF NOT EXISTS idx_incident_reporters_user
  ON incident_reporters (user_id, created_at DESC);

COMMENT ON TABLE incident_reporters IS
  'AUD (sc-327) D1: autor real de las incidencias anónimas. Una fila por incidencia. La PK sobre incident_id refleja la cardinalidad 1:1 (una incidencia tiene un único autor). El acceso está protegido por el permiso REVEAL (ver 0009).';

COMMENT ON COLUMN incident_reporters.user_id IS
  'Autor real. NO DEBE aparecer en ninguna respuesta del módulo de incidencias sin pasar por la acción REVEAL (PermissionGuard).';

-- ════════════════════════════════════════════════════════════════════════
-- 3) ANON sc-326 — close the anonymous device permission ceiling
--
--    Product decision 2026-09-02: anonymous devices cannot authenticate.
--    The ceiling they WOULD have had (READ/CREATE incidents + comments,
--    seeded by 0008) is now empty. This aligns the denormalized snapshot
--    with the new configuration.
--
--    The row is NOT deleted — AUD recycles it as the "displayed authorship"
--    mask for anonymous publications. Removing it would break FK
--    constraints. Future maintainers: DO NOT delete this row.
--
--    Idempotent: re-running sets permissions='[]' — no-op if already [].
-- ════════════════════════════════════════════════════════════════════════
UPDATE users
   SET permissions = '[]'::jsonb,
       updated_at  = now()
 WHERE device_uuid = 'anonymous';

-- ════════════════════════════════════════════════════════════════════════
-- 4) QA sc-405 — insert-or-repair the anonymous mask row
--
--    DBs bootstrapped via backfill (0030 marked 0001-0029 as applied
--    without executing their content) may lack this row. Without it,
--    IncidentsService.resolveMaskUserId() throws a 500 at runtime.
--
--    Canonical state (per AUD + ANON specs):
--      device_uuid = 'anonymous'
--      permissions = '[]'         (0048 closed the ceiling)
--      is_active   = true         (0001; 0048 did not deactivate it)
--      role_id     = NULL         (spec R-AUD-5: no role)
--      deleted_at  = NULL         (never deleted — see 0048 comment)
--      role        = 'reporter'   (DDL default; nominal, not a matrix)
--
--    Idempotent: re-running is a no-op if the row is already correct.
-- ════════════════════════════════════════════════════════════════════════

-- Insert if missing (device_uuid is UNIQUE).
INSERT INTO users (device_uuid, permissions, is_active, role)
VALUES ('anonymous', '[]'::jsonb, true, 'reporter')
ON CONFLICT (device_uuid) DO NOTHING;

-- Repair if exists but deviated (soft-deleted, deactivated, wrong permissions, role assigned).
UPDATE users
   SET deleted_at   = NULL,
       is_active    = true,
       permissions  = '[]'::jsonb,
       role_id      = NULL,
       role         = 'reporter',
       updated_at   = now()
 WHERE device_uuid = 'anonymous'
   AND (
         deleted_at IS NOT NULL
      OR is_active IS DISTINCT FROM true
      OR permissions <> '[]'::jsonb
      OR role_id IS NOT NULL
       );

COMMIT;

-- Verify:
--   SELECT device_uuid, permissions, is_active, role_id, deleted_at
--     FROM users WHERE device_uuid = 'anonymous';
--   expected: 'anonymous' | [] | t | NULL | NULL
