-- 0016_sessions_revocation.sql
-- Transito Alerta SE — session revocation, rotation, reuse detection (T3.9)
-- MANUAL EXECUTION ONLY. Requires 0006 (user_sessions), 0009 (permissions
-- catalog) and 0015 (the four staff roles). Additive ALTER — the table has
-- existed since 0006 (proposal "Deviations": no second sessions table).
-- Rollback: database/rollback/0016_sessions_revocation.DOWN.sql

BEGIN;

-- 0. Abort loudly rather than silently no-op the role append (T3.2 precedent).
--
-- Se aceptan los dos nombres a propósito. La guarda pregunta "¿corrió 0015?",
-- y 0040_rename_roles renombró después `admin_sistema` a `master`: en una base
-- donde el rename ya pasó, el rol sigue existiendo, sólo que con otro nombre.
-- Mirando únicamente el nombre viejo, este fichero se volvía imposible de
-- re-aplicar sobre cualquier base ya migrada al día — abortaba en una
-- precondición que en realidad SÍ se cumplía.
--
-- El paso 4 (más abajo) conserva a propósito sólo los nombres pre-rename: en
-- una cadena limpia 0016 corre mucho antes que 0040, así que ésos son los
-- nombres vigentes en ese momento.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE name IN ('admin_sistema', 'master')) THEN
    RAISE EXCEPTION '0016 requires 0015 (staff roles) to have been applied first';
  END IF;
END $$;

-- 1. Eight additive columns. All NULLABLE (D12): no NOT NULL is achievable
--    without either deleting legacy rows or inventing a synthetic hash.
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token_hash          char(64),    -- sha256 hex (D5); NULL = legacy (D12)
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash char(64),    -- D4 grace window
  ADD COLUMN IF NOT EXISTS rotated_at                  timestamptz, -- D4b: written ONLY on a real rotation
  ADD COLUMN IF NOT EXISTS ip_address                  varchar(45), -- D13: varchar, never inet
  ADD COLUMN IF NOT EXISTS user_agent                  varchar(512),
  ADD COLUMN IF NOT EXISTS revoked_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at                timestamptz, -- "last refresh", not activity
  ADD COLUMN IF NOT EXISTS expires_at                  timestamptz;

-- 2. D12: legacy rows fail the D11 predicate on expiry as well as on the NULL
--    hash, so they are dead on two independent clauses. Idempotent.
UPDATE user_sessions SET expires_at = created_at WHERE expires_at IS NULL;

-- 3. Listing (findActiveByUser). now() is STABLE, not IMMUTABLE, so the other
--    two D11 clauses CANNOT be part of a partial index predicate — they are
--    residual filters on a small per-user set. Deliberate, not an omission.
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions (user_id, created_at DESC) WHERE revoked_at IS NULL;

-- 4. D1 boot-warm query.
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked
  ON user_sessions (revoked_at) WHERE revoked_at IS NOT NULL;

-- 5. Permission catalog.
INSERT INTO permissions (resource, action) VALUES
  ('sessions', 'READ'), ('sessions', 'DELETE')
ON CONFLICT (resource, action) DO NOTHING;

-- 6. Role-matrix append. roles.permissions is a jsonb string array (0015);
--    the @> guard makes the append idempotent. operador_sistema and
--    operador_organizacion get nothing (session listings are staff PII);
--    reporter needs nothing (own sessions are always permitted, D9).
UPDATE roles
   SET permissions = permissions || '["READ sessions", "DELETE sessions"]'::jsonb
 WHERE name IN ('admin_sistema', 'admin_organizacion')
   AND NOT permissions @> '["READ sessions"]'::jsonb;

COMMIT;
