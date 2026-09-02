# Proposal: F2 — Catálogos (Ubicaciones, Categorías, Organizaciones)

## Intent

Tres módulos con **backend completo y cero frontend**. Es el mayor desequilibrio
del proyecto: 20 módulos de dominio en `backend/src/modules/` contra 8 rutas en
`frontend/src/app/app.routes.ts`.

| Capacidad | Módulo backend | Frontend | Mock |
|---|---|---|---|
| Ubicaciones | `geo-zones` | ausente | 06-01, 06-02 |
| Categorías | `incident-categories` | ausente | 07-01 |
| Organizaciones | `organizations` | ausente | 08-01 |

Los tres ya pasaron por SDD del lado servidor y están archivados:
`openspec/changes/archive/t3.8-locations`, `t3.7-incident-categories`,
`t3.2-organizations`. No hay que diseñar dominio: hay que consumirlo.

Se agrupan en una sola fase porque comparten forma —listado con búsqueda y filtros,
formulario de alta/edición, borrado con confirmación— y porque hacerlos en serie
amortiza el andamiaje: el primero paga el patrón, los otros dos lo copian.

La excepción es Ubicaciones, y es sustantiva: el mock 06-01 muestra una **tabla en
árbol** de cuatro niveles (País → Provincia → Cantón → Parroquia) con expansión por
fila, no una tabla plana.

## Scope

### In Scope
- **Ubicaciones** (`/app/ubicaciones`): tabla jerárquica expandible, badge de nivel,
  código monoespaciado, filtro por nivel, búsqueda; formulario de alta/edición
  (mock 06-02) con selección de nivel y de padre
- **Categorías** (`/app/categorias`): listado, alta, edición, borrado
- **Organizaciones** (`/app/organizaciones`): listado, alta, edición, borrado
- Servicios Angular para los tres dominios en `frontend/src/app/core/services/`
- Modelos tipados alineados al wire (post `SnakeCaseResponseInterceptor`)
- Tarjetas de resumen al pie de cada listado (mock 06-01)
- Sustituir los tres placeholders que F1 dejó registrados

### Out of Scope
- Cambios de backend. Si aparece deriva de contrato se documenta y se abre change
  aparte, siguiendo `docs/agents/gemini-architect.md` §"Si Minimax reporta inconsistencia".
- Dibujo de geometrías sobre mapa para zonas geográficas — el mock 06-02 no lo
  muestra; el mapa llega en F4
- Importación masiva / CSV
- Papelera o restauración de borrados lógicos

## Capabilities

### New Capabilities
- `frontend-catalogs`: contrato de UI compartido por los tres catálogos —listado con
  búsqueda y filtros, formulario, borrado confirmado— más la variante en árbol de
  Ubicaciones

### Modified Capabilities
- ninguna del lado backend

## DB Schema Changes

Ninguna. Las tablas existen desde las migraciones `0009`–`0016` y `0041`
(`database/MIGRATION_LOG.md`).

## Permission Requirements (RBAC)

Sin permisos nuevos. Se consumen los ya presentes en `users.permissions`:

| Pantalla | Lectura | Escritura |
|---|---|---|
| Ubicaciones | `READ geo-zones` | `CREATE/UPDATE/DELETE geo-zones` |
| Categorías | `READ incident-categories` | `CREATE/UPDATE/DELETE incident-categories` |
| Organizaciones | `READ organizations` | `CREATE/UPDATE/DELETE organizations` |

Los permisos de escritura DEBEN gobernar la UI: `operador_org` (15 permisos) tiene
lectura pero no escritura en catálogos y no debe ver botones que le van a devolver 403.

## Domain Module Dependencies

- `backend/src/modules/geo-zones` — jerarquía y consulta espacial
- `backend/src/modules/incident-categories`
- `backend/src/modules/organizations`
- Frontend: `core/services/http.service.ts`, `shared/components/{pagination,
  confirm-dialog,empty-state,table-skeleton,toast}` (todos existentes)

## Approach

Se implementa **Categorías primero**, aunque el mock más rico sea Ubicaciones. Es el
catálogo más simple y sirve para fijar el patrón —servicio, modelo, listado,
formulario, tests— que Organizaciones copia casi literal. Ubicaciones va al final,
cuando el patrón ya está probado y sólo queda resolver lo que tiene de específico:
el árbol.

Para el árbol se carga la jerarquía completa de una vez y se expande en cliente. Las
zonas de Ecuador son un conjunto acotado y estable; paginar o cargar por demanda un
árbol de cuatro niveles añade complejidad de estado sin resolver un problema real.
El umbral queda documentado en el diseño.

## Dependencies

- **Depende de**: F0 (primitivos `ui-table`, `ui-badge`, `ui-page-header`, `ui-button`),
  F1 (rutas `/ubicaciones`, `/categorias`, `/organizaciones` registradas)
- **Bloquea**: nada. F3 y F4 pueden avanzar en paralelo.

## Risks

- **R1 — Deriva de contrato wire vs DTO.** Precedente directo: SC-209 encontró
  `size_bytes` ≠ `file_size` entre modelo frontend y wire real. Mitigación: los
  modelos se derivan del **controlador**, no de la clase DTO, porque
  `SnakeCaseResponseInterceptor` reescribe la respuesta y sólo la forma del wire obliga.
- **R2 — Profundidad del árbol.** Si `geo_zones` crece más allá de unos pocos miles
  de nodos, cargar todo deja de ser razonable. Se fija un umbral explícito y una
  salida de emergencia en el diseño.
