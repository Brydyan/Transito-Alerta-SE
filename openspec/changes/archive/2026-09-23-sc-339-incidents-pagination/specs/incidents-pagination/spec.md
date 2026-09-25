# Spec: Paginación de Incidencias (sc-339)

## Domain: incidents-pagination-api

### Requirement: Paginación server-side y validación estricta
El endpoint de listado de incidencias DEBE estar paginado y validar estrictamente los parámetros permitidos.

- Scenario: Paginación válida — GIVEN un request con `page` y `limit` WHEN se consulta el listado THEN se devuelve un envelope `{ items, total }` con el listado correspondiente a la página y el conteo total.
- Scenario: Parámetros no permitidos — GIVEN un request con parámetros fuera de la whitelist (ej. `search`, `priority`, `per_page`) WHEN se procesa THEN el backend rechaza la petición con estado 400 (Bad Request).
- Scenario: Valores por defecto — GIVEN un request sin `page` ni `limit` WHEN se procesa THEN asume `page=1` y `limit=20`.
- Scenario: Cache invalidation — GIVEN un listado en caché THEN la clave usa el formato `incidents:list:{zone}:{status}:{scope}:{page}:{limit}` y se invalida mediante el tag de zona.

## Domain: frontend-incidents

### Requirement: Paginación UI (Reemplazo de load-more)
El listado de incidencias DEBE usar controles de paginación tradicionales en lugar del botón "Ver más datos" (load-more).

- Scenario: Controles de paginación — GIVEN un listado con más elementos que el `pageSize` THEN se renderiza el componente `<app-pagination>` al pie.
- Scenario: Cambio de página — GIVEN el componente de paginación WHEN el usuario cambia de página THEN el listado refetch con el nuevo número de `page`.
- Scenario: Texto de rango — GIVEN una página cargada THEN el indicador de rango muestra «Mostrando 1-20 de N» en lugar de «Mostrando N de N».
- Scenario: Cambio de tamaño de página — GIVEN el selector de "Mostrar:" WHEN el usuario elige un nuevo `pageSize` THEN la página actual se reinicia a 1 y se refetch el listado.
- Scenario: Consistencia de pageSizeChange — GIVEN otros listados (`roles`, `department-list`, `incident-list`) WHEN se emite `pageSizeChange` THEN el componente actualiza el tamaño, reinicia la página a 1 y recarga los datos, alineándose con el patrón de `users-list`.
- Scenario: Ausencia de load-more — GIVEN el listado cargado THEN ya no existe el botón de "Ver más datos", el cual ha sido eliminado completamente.
