-- Migration 0027: Citizen Social Features (incident_followers, incident_corroborations)
-- Transito Alerta SE — F4 (Social Features, Incident Followers & Corroborations)
--
-- Original: 0049_citizen_social_features.sql (renumbered twice: 0049→0028→0027).
-- Now: 0027 (collision fix — 0028 belongs to F5 dynamic_menus_schema).
--
-- Same shape as 0049/0050/0026/0027/0053:
--   1. CREATE tables (incident_followers, incident_corroborations)
--   2. INSERT catalog rows idempotently (resource, action) — UUIDs generated
--   3. Grant to roles (master, agent_system, admin_org, operator_org)
--      by concatenating permission UUIDs to roles.permissions JSONB array
--   4. Denormaliza a users.permissions + bump permission_version para invalidar
--      cache perm:v3:uid:*
--
-- MANUAL EXECUTION ONLY — ver 0001_initial_schema.sql header.
-- Requires 0009 (permissions table + roles.permissions JSONB), 0026 (roles.permissions
-- UUID format), 0027 (catalog pattern).
--
-- Rollback: database/rollback/0027_citizen_social_features.DOWN.sql.

BEGIN;

-- 1) Create tables
CREATE TABLE incident_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, user_id)
);
CREATE INDEX idx_incident_followers_user_id ON incident_followers(user_id);

CREATE TABLE incident_corroborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, user_id)
);
CREATE INDEX idx_incident_corroborations_incident_id ON incident_corroborations(incident_id);

-- 2) Catalog: inserta las filas de permisos (idempotente).
INSERT INTO permissions (resource, action) VALUES
  ('incident-followers', 'CREATE'),
  ('incident-followers', 'DELETE'),
  ('incident-corroborations', 'CREATE')
ON CONFLICT (resource, action) DO NOTHING;

-- 3) Grant a roles. Mismo patrón que 0027/0053 — concatena las UUIDs
--    del catálogo y deduplica con jsonb_agg(DISTINCT elem).
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(
       r.permissions ||
       (SELECT COALESCE(jsonb_agg(p.id::text), '[]'::jsonb)
          FROM permissions p
         WHERE p.deleted_at IS NULL
           AND p.resource IN ('incident-followers', 'incident-corroborations')
           AND p.action IN ('CREATE', 'DELETE'))
     ) AS elem
   )
 WHERE r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
   AND r.deleted_at IS NULL;

-- 4) Denormalizar a users.permissions de los usuarios activos.
--    Bumpear permission_version invalida perm:v3:uid:* (patrón 0049/0050/0026/0027/0053).
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'agent_system', 'admin_org', 'operator_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

COMMIT;
