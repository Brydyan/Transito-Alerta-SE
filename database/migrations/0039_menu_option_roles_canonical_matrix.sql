-- 0039_menu_option_roles_canonical_matrix.sql
-- 2026-10-20 — sanea la matriz `menu_option_roles` de `operator_org`.
--
-- POR QUÉ ESTA MIGRACIÓN EXISTE
-- ──────────────────────────────
-- `0029_dynamic_menus_data_migration.sql` se editó IN-PLACE dos veces el
-- 2026-10-17 (corrección de GESTIÓN/CATÁLOGOS para operator_org, y el
-- bloqueo `2026-10-17-reportar-operator-org-block` para la hoja Reportar).
-- Las migraciones no se re-ejecutan, así que cualquier ambiente donde 0029
-- corrió antes de esas correcciones conserva la matriz anterior.
--
-- El propio 0029 anticipó el problema y prescribió el remedio, líneas
-- 146-148:
--
--     "Aplicable en staging sin pérdida funcional; si ya está aplicada en
--      producción, agregar una migración 0037 para DELETE de los accesos
--      indebidos."
--
-- Eso nunca se hizo. Esta es esa migración.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL DRIFT: `operator_org` conserva la fila de Reportar
-- ─────────────────────────────────────────────────────────────────────────
-- El cuerpo canónico de 0029 concede Reportar SÓLO a los roles con
-- `CREATE incidents` (línea 183):
--
--     WHERE r.name IN ('master', 'agent_system', 'admin_org')
--
-- `operator_org` no está en esa lista — su seed (`0009_roles_permissions.sql`
-- :180-187) le da READ + UPDATE sobre incidents, nunca CREATE. La fila
-- `(Reportar, operator_org)` es residuo de la corrida previa a la corrección.
--
-- Impacto funcional: NINGUNO hoy. `MenusService` filtra por permiso
-- efectivo además de por `can_read` (`menus.service.ts:21-22, 43-45`), y
-- `/reportar` exige `CREATE incidents` (`menu-map.ts:78`), así que la fila
-- ya estaba oculta. Pero es exactamente la clase de inconsistencia que
-- produjo el incidente `GET /api/auth/me` 500: la DB afirma una cosa, el
-- repo otra, y el próximo que lea la matriz se engaña.
--
-- Peligro latente: si mañana se otorgara `CREATE incidents` a
-- `operator_org`, el menú aparecería de inmediato — porque la fila ya
-- está — contradiciendo el diseño documentado.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO TOCA (y por qué)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. `admin_org` + raíz GESTIÓN. El comentario de 0029 (líneas 206-209)
--    afirma que admin_org NO necesita el grupo GESTIÓN. Es FALSO en efecto:
--    `MenusService.buildTree` descarta todo hijo cuyo padre no esté en el
--    set accesible (`menus.service.ts:195-202`, "orphan — excluded per
--    spec"). Sin el padre, Organizaciones, Departamentos y sus cuatro
--    hojas CRUD caerían como huérfanos y desaparecerían del menú. El dato
--    correcto; el comentario de 0029, no.
--
-- 2. `reporter` + grupo INCIDENCIAS. Misma razón: Inicio y Reportar cuelgan
--    de INCIDENCIAS y se irían con él.
--
-- 3. `agent_system` + Reportar. El cuerpo de 0029 sí se lo concede
--    (línea 183), así que no es drift. Queda oculto porque `agent_system`
--    tampoco tiene `CREATE incidents`. Canónico pero inerte — se deja como
--    está; retirarlo sería una decisión de producto, no una corrección.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CACHÉ
-- ─────────────────────────────────────────────────────────────────────────
-- `menu:v1:user:{userId}` tiene TTL de 1 h (`menus.service.ts:37-38`) y la
-- app sólo lo invalida en escrituras por UI (`invalidateCache()`), nunca
-- desde una migración. Tras aplicar hay que purgar `menu:v1:*` o el cambio
-- tarda hasta una hora en verse.
--
-- Rollback: database/rollback/0039_menu_option_roles_canonical_matrix.DOWN.sql

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- 0) LÍNEA BASE de huérfanos, ANTES de tocar nada
--
-- La cadena 0001→0038 deja huérfanos preexistentes: hay combinaciones
-- (menú legible, padre no legible) que el bootstrap produce y que
-- `buildTree` ya descarta hoy. 0039 no los causa ni los empeora, así que
-- un assert que exigiera CERO bloquearía un bootstrap limpio por deuda
-- ajena — que es exactamente lo que pasó en la primera versión de esta
-- migración ("Hay 4 menú(s) legible(s) cuyo padre NO es legible…").
--
-- Por eso el assert #3 compara contra esta línea base en vez de contra 0:
-- falla si ESTA migración introduce un huérfano, no si ya había.
--
-- El NOTICE reporta la línea base para que la deuda quede documentada y
-- sea atacable en una migración posterior con su propia línea base.
-- ════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _orphan_baseline ON COMMIT DROP AS
SELECT mor.role_id, mor.menu_option_id, mo.parent_id
  FROM menu_option_roles mor
  JOIN menu_options mo
    ON mo.id = mor.menu_option_id
   AND mo.deleted_at IS NULL
   AND mo.is_active = true
  LEFT JOIN menu_option_roles pmor
    ON pmor.menu_option_id = mo.parent_id
   AND pmor.role_id = mor.role_id
   AND pmor.can_read = true
 WHERE mor.can_read = true
   AND mo.parent_id IS NOT NULL
   AND pmor.menu_option_id IS NULL;

DO $$
DECLARE v int; v_detail text;
BEGIN
  SELECT count(*) INTO v FROM _orphan_baseline;

  SELECT string_agg(format('%s → %s', r.name, mo.name), E'\n  ')
    INTO v_detail
    FROM _orphan_baseline b
    JOIN roles r       ON r.id = b.role_id
    JOIN menu_options mo ON mo.id = b.menu_option_id;

  RAISE NOTICE E'[0039] Línea base de menús huérfanos (preexistente): %\n  %', v, v_detail;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- 1) DELETE del acceso indebido
-- ════════════════════════════════════════════════════════════════════════
DELETE FROM menu_option_roles mor
  USING menu_options mo, roles r
 WHERE mor.menu_option_id = mo.id
   AND mor.role_id = r.id
   AND r.name = 'operator_org'
   AND r.deleted_at IS NULL
   AND mo.route = '/reportar'
   AND mo.deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- 2) ASSERT — operator_org cuelga sólo de INCIDENCIAS
--
-- La matriz canónica de 0029 le da a `operator_org` Dashboard (raíz) + el
-- grupo INCIDENCIAS + Inicio/Lista/Mapa. NADA de GESTIÓN ni CATÁLOGOS:
-- es despachador, no gestor.
--
-- Se chequea por GRUPO PADRE y no por lista de rutas a propósito. Las
-- rutas de 0029 son `/admin/users`, `/admin/roles`, `/admin/organizaciones`,
-- `/admin/departamentos`, `/admin/controles`, `/admin/audit-logs` — una
-- primera versión de este assert usaba `/usuarios`, `/organizaciones` y
-- compañía, que NO existen, y por lo tanto no detectaba nada.
--
-- Chequear por `parent.name` captura el invariante real y sobrevive a que
-- alguien renombre una ruta.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_bad int; v_detail text;
BEGIN
  SELECT count(*) INTO v_bad
    FROM menu_option_roles mor
    JOIN menu_options mo     ON mo.id     = mor.menu_option_id
                           AND mo.deleted_at IS NULL
    JOIN menu_options parent ON parent.id = mo.parent_id
    JOIN roles r            ON r.id      = mor.role_id
   WHERE r.name = 'operator_org'
     AND r.deleted_at IS NULL
     AND mor.can_read = true
     AND parent.name IN ('GESTIÓN', 'CATÁLOGOS');

  IF v_bad > 0 THEN
    SELECT string_agg(format('%s bajo %s (%s)', mo.name, parent.name, mo.route), E'\n  ')
      INTO v_detail
      FROM menu_option_roles mor
      JOIN menu_options mo     ON mo.id     = mor.menu_option_id
                             AND mo.deleted_at IS NULL
      JOIN menu_options parent ON parent.id = mo.parent_id
      JOIN roles r            ON r.id      = mor.role_id
     WHERE r.name = 'operator_org'
       AND r.deleted_at IS NULL
       AND mor.can_read = true
       AND parent.name IN ('GESTIÓN', 'CATÁLOGOS');

    RAISE EXCEPTION
      'operator_org tiene % menú(s) colgando de GESTIÓN/CATÁLOGOS. La matriz '
      'canónica de 0029 se los excluye TODOS: es despachador, no gestor. '
      'Offenses:\n  %', v_bad, v_detail;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- 3) ASSERT — 0039 NO INTRODUCE huérfanos
--
-- Ningún menú legible puede quedar colgado de un padre que el rol NO puede
-- leer. `MenusService.buildTree` descarta el hijo en ese caso
-- (`menus.service.ts:195-202`), así que la violación no se manifiesta como
-- error: se manifiesta como un menú que desapareció sin aviso.
--
-- Compara contra `_orphan_baseline` (capturado antes del DELETE), no contra
-- cero: el bootstrap limpio arrastra huérfanos preexistentes y esta
-- migración no es su dueña. Lo que se vigila es que 0039 no AGREGUE más.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_base int; v_new int; v_detail text;
BEGIN
  SELECT count(*) INTO v_base FROM _orphan_baseline;

  SELECT count(*) INTO v_new
    FROM menu_option_roles mor
    JOIN menu_options mo
      ON mo.id = mor.menu_option_id
     AND mo.deleted_at IS NULL
     AND mo.is_active = true
    LEFT JOIN menu_option_roles pmor
      ON pmor.menu_option_id = mo.parent_id
     AND pmor.role_id = mor.role_id
     AND pmor.can_read = true
   WHERE mor.can_read = true
     AND mo.parent_id IS NOT NULL
     AND pmor.menu_option_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM _orphan_baseline b
        WHERE b.role_id = mor.role_id
          AND b.menu_option_id = mor.menu_option_id
     );

  IF v_new > 0 THEN
    SELECT string_agg(format('%s → %s', r.name, mo.name), E'\n  ')
      INTO v_detail
      FROM menu_option_roles mor
      JOIN menu_options mo ON mo.id = mor.menu_option_id
      JOIN roles r       ON r.id = mor.role_id
      LEFT JOIN menu_option_roles pmor
        ON pmor.menu_option_id = mo.parent_id
       AND pmor.role_id = mor.role_id
       AND pmor.can_read = true
     WHERE mor.can_read = true
       AND mo.parent_id IS NOT NULL
       AND pmor.menu_option_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM _orphan_baseline b
          WHERE b.role_id = mor.role_id
            AND b.menu_option_id = mor.menu_option_id
       );

    RAISE EXCEPTION
      '0039 introdujo % menú(s) legible(s) con padre no legible (línea base: %). '
      'MenusService los descarta como huérfanos (menus.service.ts:195-202), '
      'así que desaparecerían del sidebar sin error visible. Offenses:\n  %',
      v_new, v_base, v_detail;
  END IF;

  RAISE NOTICE '[0039] Huérfanos preexistentes preservados sin cambio: %', v_base;
END $$;

COMMIT;