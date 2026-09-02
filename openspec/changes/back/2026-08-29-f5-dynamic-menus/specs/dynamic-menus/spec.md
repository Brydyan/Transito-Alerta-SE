# Spec: F5 — Menús dinámicos administrables

## Domain: dynamic-menus (NEW)

### Requirement: Resolución del menú desde base de datos
`GET /api/menus/my` DEBE resolver el menú del usuario desde `menu_options` y su matriz
de acceso, conservando el contrato de respuesta que ya consume el frontend.

- Scenario: Contrato preservado — GIVEN un usuario autenticado WHEN solicita su menú
  THEN la respuesta mantiene la forma `{ label, route, icon?, group?, order }` que el
  cliente ya consume, sin exigir cambios en `MenuService`
- Scenario: Filtrado por rol — GIVEN un rol con `can_read = true` sobre una opción
  THEN esa opción aparece en su menú
- Scenario: Sin acceso — GIVEN un rol sin fila en `menu_option_roles` para una opción
  THEN esa opción no aparece
- Scenario: Opción inactiva — GIVEN `is_active = false` THEN la opción no aparece para
  ningún rol, con independencia de la matriz
- Scenario: Opción borrada — GIVEN `deleted_at` no nulo THEN la opción no aparece
- Scenario: Paridad con el mapa estático — GIVEN la migración de datos aplicada
  WHEN `master@tase.local` solicita su menú THEN el conjunto de rutas coincide con el
  que devolvía `MENU_MAP`

### Requirement: Jerarquía padre/hijo
El menú DEBE soportar opciones anidadas y devolverlas estructuradas.

- Scenario: Hijos anidados — GIVEN una opción con `parent_id` apuntando a otra
  THEN se devuelve dentro de `children` de su padre, no como entrada de primer nivel
- Scenario: Padre sin acceso — GIVEN un rol sin lectura sobre el padre pero con lectura
  sobre un hijo THEN ni el padre ni el hijo aparecen: un hijo sin su padre no es navegable
- Scenario: Orden — GIVEN varias opciones hermanas THEN se devuelven ordenadas por
  `display_order` ascendente
- Scenario: Ciclo — GIVEN un intento de asignar como padre a un descendiente propio
  THEN se rechaza con 422 y no se persiste
- Scenario: Autopadre — GIVEN un intento de asignar la propia opción como su padre
  THEN se rechaza con 422

### Requirement: Matriz de acceso por rol
Cada opción DEBE declarar, por rol, si permite lectura y si permite escritura.

- Scenario: Lectura y escritura independientes — GIVEN un rol con `can_read = true` y
  `can_write = false` THEN ve la opción pero no puede realizar acciones de escritura
  en la sección
- Scenario: Escritura sin lectura — GIVEN un intento de guardar `can_write = true` con
  `can_read = false` THEN se rechaza con 422: no se puede escribir en lo que no se ve
- Scenario: Roles agrupados — GIVEN la respuesta de la matriz THEN los roles se
  presentan separados en «empresa principal» (`scope = 'platform'`) y «clientes»
  (`scope = 'client'`), según el mock 05-01
- Scenario: Rol nuevo — GIVEN un rol creado después de la opción THEN aparece en el
  bloque que le corresponde por su `scope`, sin acceso, no ausente de la matriz
- Scenario: Ámbito obligatorio — GIVEN la creación de un rol THEN su `scope` es
  `platform` o `client`; no existe un tercer estado ni un rol sin clasificar
- Scenario: Migración de roles existentes — GIVEN la migración aplicada THEN
  `master` y `operador_sistema` quedan como `platform`, y `admin_org` y
  `operador_org` como `client`

### Requirement: CRUD de opciones de menú
Un usuario con permisos administrativos DEBE poder crear, editar y eliminar opciones.

- Scenario: Alta — GIVEN nombre, ruta y orden válidos y permiso `CREATE menu-options`
  THEN se crea la opción y aparece en el árbol
- Scenario: Ruta duplicada — GIVEN una ruta ya usada por otra opción activa THEN se
  rechaza con 409
- Scenario: Edición — GIVEN una opción existente THEN pueden modificarse nombre, ruta,
  icono, orden, padre y matriz de acceso
- Scenario: Borrado con hijos — GIVEN una opción con descendientes THEN se rechaza con
  409 hasta que se reasignen o eliminen los hijos
- Scenario: Borrado lógico — GIVEN una opción sin hijos WHEN se elimina THEN se marca
  `deleted_at` y desaparece de los menús, sin borrado físico
- Scenario: Sin permiso — GIVEN un usuario sin `CREATE menu-options` THEN la operación
  responde 403

### Requirement: Endpoints asociados
Cada opción DEBE poder declarar qué endpoints de API necesita para operar.

- Scenario: Asignar — GIVEN endpoints disponibles en el catálogo THEN pueden asignarse
  a una opción y se listan como asignados
- Scenario: Quitar — GIVEN un endpoint asignado THEN puede retirarse
- Scenario: Catálogo paginado — GIVEN el catálogo de endpoints disponibles THEN se
  presenta paginado y filtrable por ruta, método o descripción
- Scenario: Asignación duplicada — GIVEN un endpoint ya asignado a la opción THEN
  reasignarlo es idempotente y no crea una segunda fila
- Scenario: Conteo — GIVEN una opción con endpoints asignados THEN se indica cuántos
  hay seleccionados

### Requirement: Caché de resolución
La resolución del menú DEBE cachearse e invalidarse ante cualquier escritura.

- Scenario: Servido desde caché — GIVEN dos peticiones consecutivas del mismo usuario
  sin escrituras intermedias THEN la segunda no vuelve a consultar la base de datos
- Scenario: Invalidación por escritura — GIVEN una opción modificada THEN la siguiente
  petición de cualquier usuario refleja el cambio
- Scenario: Invalidación por matriz — GIVEN un cambio en el acceso de un rol THEN los
  usuarios de ese rol reciben el menú actualizado en su siguiente petición

## Coverage

Happy paths: cubiertos (resolver, anidar, ordenar, CRUD, asignar endpoints, cachear).
Edge cases: cubiertos (ciclo, autopadre, hijo sin padre accesible, escritura sin
lectura, borrado con hijos, rol nuevo, asignación duplicada).
Error states: cubiertos (409 por ruta duplicada y por hijos, 422 por ciclo y por
combinación inválida, 403 sin permiso).
Regresión: exigida paridad explícita con la salida de `MENU_MAP` tras la migración.

## Next

Listo para `sdd-design`. Depende de F0 y F1; no bloquea nada.
