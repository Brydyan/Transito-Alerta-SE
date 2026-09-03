# Spec: F1 — Alineación de menú y enrutado

## Domain: admin-panel-backend (MODIFIED)

### Requirement: Toda entrada de menú resuelve a una ruta registrada
Cada `route` emitida por `GET /api/menus/my` DEBE corresponder, tras el prefijado
`/app` del cliente, a una ruta declarada en `app.routes.ts`. Ninguna entrada puede
caer al wildcard.

- Scenario: Master ve el menú completo y navega — GIVEN `master@tase.local` autenticado
  (35 permisos) WHEN abre el sidebar y hace clic en cada entrada THEN ninguna
  navegación resuelve a `ErrorPageComponent`
- Scenario: Destino aún no implementado — GIVEN una entrada cuya pantalla llega en
  una fase posterior WHEN el usuario hace clic THEN se renderiza el placeholder
  «en construcción», no el 404
- Scenario: Cobertura verificable — GIVEN el conjunto de `route` de `MENU_MAP`
  WHEN se contrasta contra las rutas hijas de `/app` THEN la diferencia es vacía

### Requirement: Etiquetas en español
`MENU_MAP` DEBE emitir etiquetas en español, coherentes con `docs/mock`.

- Scenario: Etiqueta traducida — GIVEN la entrada de incidencias WHEN se serializa
  THEN `label` es `"Lista de Incidencias"`, no `"Incidents"`
- Scenario: Sin residuos en inglés — GIVEN el `MENU_MAP` completo WHEN se inspeccionan
  las claves THEN ninguna está en inglés

### Requirement: Agrupación y orden explícitos
`MenuEntry` DEBE transportar `group` y `order`, y `MenusService` DEBE devolver las
entradas ordenadas de forma determinista.

- Scenario: Grupo presente — GIVEN la entrada de usuarios WHEN se serializa THEN
  `group` es `"GESTIÓN"`
- Scenario: Entrada sin grupo — GIVEN la entrada de dashboard WHEN se serializa THEN
  `group` está ausente y el cliente la renderiza antes del primer encabezado
- Scenario: Orden determinista — GIVEN dos llamadas consecutivas al endpoint con el
  mismo usuario THEN la secuencia de entradas es idéntica y respeta `order` ascendente
- Scenario: Filtrado preserva agrupación — GIVEN `operador_org` (15 permisos)
  WHEN recibe su menú THEN los grupos que quedan sin entradas visibles no se emiten

### Requirement: Contrato de transformación en el cliente
`MenuService.transformBackendMenu()` DEBE propagar `group` al modelo del frontend
sin perder los campos ya soportados.

- Scenario: Mapeo completo — GIVEN `{ label, route, icon, group, order }` del backend
  WHEN se transforma THEN se obtiene `{ id, name, route, icon, group, children: [] }`
  con `name === label`
- Scenario: Backend antiguo — GIVEN una respuesta sin `group` (despliegue desfasado)
  WHEN se transforma THEN el item se renderiza sin encabezado y no se lanza excepción

### Requirement: Rutas huérfanas registradas
Los componentes que existen en `features/` pero no están declarados en
`app.routes.ts` DEBEN quedar registrados o eliminados; no pueden permanecer como
código muerto alcanzable sólo por import.

- Scenario: `citizen-report` alcanzable — GIVEN el componente `features/citizen-report/`
  WHEN se navega a su ruta THEN se monta, en lugar de ser inalcanzable
- Scenario: Ruta duplicada eliminada — GIVEN el `path: 'Reportes'` que hoy reapunta
  al Dashboard WHEN se revisa el árbol de rutas THEN ya no existe

## Coverage

Happy paths: cubiertos (menú completo navegable, etiquetas, agrupación, orden).
Edge cases: cubiertos (item sin grupo, grupo vacío tras filtrado, backend sin `group`,
destino no implementado).
Error states: el 404 deja de ser alcanzable desde el sidebar; el wildcard sigue
sirviendo para URLs escritas a mano, que es su función legítima.

## Next

Listo para `sdd-design`. Depende de F0; bloquea F2, F3 y F4.
