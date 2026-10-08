-- 0067_restore_anonymous_mask.sql
-- Transito Alerta SE — QA SC-405 (R-anonymous): repara la fila máscara
-- `users.device_uuid = 'anonymous'`.
--
-- Síntoma
-- -------
-- La fila sembrada por 0001 no existe en DBs cuyo esquema se bootstrapó
-- por backfill (0030 marcó 0001–0029 como aplicadas sin ejecutar su
-- contenido), o fue soft-deleted por error. AUD (sc-327) recicla esa
-- fila como autoría "mostrada" para publicaciones anónimas; sin ella,
-- `IncidentsService.resolveMaskUserId()` lanza en runtime:
--
--   Anonymous mask row not found (device_uuid='anonymous').
--   Migrations 0001 and 0048 must be applied.
--
-- Estado canónico de la fila (per specs AUD y ANON):
--   * device_uuid = 'anonymous'        (0001)
--   * permissions = '[]'               (0048 cerró el techo anónimo; la
--                                       máscara NO es identidad de auth)
--   * is_active  = true                (0001; 0048 no la desactivó)
--   * role_id    = NULL                (spec R-AUD-5: "sin rol"; nunca se
--                                       le conceden permisos por rol)
--   * deleted_at = NULL                (no borrada — ver aviso en 0048)
--   * role       = 'reporter' (default del DDL; string nominal, no matrix)
--
-- Idempotente: insert-or-repair. Re-ejecutar es un no-op.
--
-- Rollback: database/rollback/0067_restore_anonymous_mask.DOWN.sql
-- (informativo; no borrar la fila — ver comentario de 0048).

BEGIN;

-- 1) Insert si falta (device_uuid es UNIQUE).
INSERT INTO users (device_uuid, permissions, is_active, role)
VALUES ('anonymous', '[]'::jsonb, true, 'reporter')
ON CONFLICT (device_uuid) DO NOTHING;

-- 2) Repair si existe desviada (soft-delete, desactivada, permisos
--    restaurados por error, o rol asignado por error).
UPDATE users
   SET deleted_at = NULL,
       is_active  = true,
       permissions = '[]'::jsonb,
       role_id     = NULL,
       role        = 'reporter',
       updated_at  = now()
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