-- Rollback for 0054_citizen_social_features.sql
-- Removes: tables (incident_followers, incident_corroborations), permission catalog entries, role grants, and user denormalization.

BEGIN;

-- 1) Remove permission UUIDs from roles.permissions
UPDATE roles r
   SET permissions = (
     SELECT jsonb_agg(DISTINCT elem)
     FROM jsonb_array_elements_text(r.permissions) AS elem
     WHERE elem NOT IN (
       SELECT p.id::text
       FROM permissions p
       WHERE p.resource IN ('incident-followers', 'incident-corroborations')
         AND p.deleted_at IS NULL
     )
   )
 WHERE r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND r.deleted_at IS NULL;

-- 2) Denormalize removal to users.permissions
UPDATE users u
   SET permissions = r.permissions,
       permission_version = u.permission_version + 1
  FROM roles r
 WHERE u.role_id = r.id
   AND r.name IN ('master', 'operador_sistema', 'admin_org', 'operador_org')
   AND u.deleted_at IS NULL
   AND u.is_active = TRUE
   AND r.deleted_at IS NULL;

-- 3) Drop tables
DROP TABLE IF EXISTS incident_corroborations;
DROP TABLE IF EXISTS incident_followers;

-- 4) (Optional) Mark permissions as deleted (soft delete)
-- UPDATE permissions SET deleted_at = now()
-- WHERE resource IN ('incident-followers', 'incident-corroborations')
--   AND deleted_at IS NULL;

COMMIT;
