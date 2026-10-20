-- 0039_menu_option_roles_canonical_matrix.DOWN.sql
-- Rollback de `0039_menu_option_roles_canonical_matrix.sql`.
--
-- Restaura la fila `(Reportar, operator_org)` que el UP borró.
--
-- ⚠️ QUÉ SIGNIFICA ESTE ROLLBACK
--
-- Devuelve la DB al estado de la corrida previa a la corrección del
-- 2026-10-17 de `0029`, que es exactamente el drift que 0039 existe para
-- eliminar. La fila queda inerte —`MenusService` la oculta porque
-- `operator_org` no tiene `CREATE incidents` (`menu-map.ts:78`)— así que
-- el rollback no rompe el menú en runtime.
--
-- Se ejecuta por completitud del ciclo UP/DOWN, no porque "funcione mejor":
-- el estado previo es incorrecto según la matriz canónica de 0029
-- (línea 183: Reportar sólo para master, agent_system y admin_org).
--
-- No restaura los parents que 0039 dejó intactos a propósito
-- (`admin_org`+GESTIÓN, `reporter`+INCIDENCIAS): esos nunca se tocaron.
-- El UP tampoco los re-crea; sólo verifica el invariante de huérfanos.
--
-- Idempotente.
--
-- NOTA DE CACHÉ: tras aplicar, purgar `menu:v1:*` (TTL 1 h,
-- `menus.service.ts:37-38`). La app sólo lo invalida en escrituras por UI,
-- nunca desde una migración.

BEGIN;

INSERT INTO menu_option_roles (menu_option_id, role_id, can_read, can_write)
SELECT mo.id, r.id, true, false
  FROM menu_options mo
  CROSS JOIN roles r
 WHERE r.name = 'operator_org'
   AND r.deleted_at IS NULL
   AND mo.route = '/reportar'
   AND mo.deleted_at IS NULL
ON CONFLICT (menu_option_id, role_id) DO UPDATE
  SET can_read  = EXCLUDED.can_read,
      can_write = EXCLUDED.can_write;

COMMIT;