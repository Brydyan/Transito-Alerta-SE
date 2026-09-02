# Design: F2 — Catálogos

## Technical Approach

Tres catálogos con la misma forma. Se implementa Categorías primero para fijar el
patrón (servicio → modelo → listado → formulario → tests), Organizaciones lo copia,
y Ubicaciones va al final porque es el único con complejidad propia: el árbol.

El patrón se materializa como **convención repetida, no como abstracción genérica**.
Ver D1.

## Architecture Decisions

**D1 — Repetir la estructura, no generalizarla.**
Se rechaza un `AbstractCrudComponent<T>` o un `CrudService<T>` genérico. Con tres
consumidores, la abstracción cuesta más de lo que ahorra: Ubicaciones es un árbol
con filtro por nivel y selector de padre acotado, Organizaciones tiene campos
propios, y toda generalización terminaría con banderas de configuración. Lo que sí
se comparte son los primitivos de F0 (`ui-table`, `ui-page-header`, `ui-badge`,
`ui-button`) y los componentes ya existentes (`pagination`, `confirm-dialog`,
`empty-state`, `table-skeleton`, `toast`).

**D2 — Los modelos se derivan del wire, no del DTO.**
`SnakeCaseResponseInterceptor` (registrado en `backend/src/main.ts:45`) reescribe
toda respuesta a snake_case. La clase DTO del backend está en camelCase y **no** es
el contrato observable. Los modelos frontend se escriben leyendo el controlador y
aplicando mentalmente el interceptor.

Precedente que obliga a esta regla: SC-209 encontró que el modelo declaraba
`size_bytes` mientras el wire emitía `file_size`, y el error sobrevivió porque el
test afirmaba sobre la URL en vez de sobre la carga.

```ts
// frontend/src/app/core/models/geo-zone.model.ts
export type GeoZoneLevel = 'pais' | 'provincia' | 'canton' | 'parroquia';

export interface GeoZone {
  id: string;
  name: string;
  code: string;
  level: GeoZoneLevel;
  parent_id: string | null;
  created_at: string;
}

/** Nodo derivado en cliente — no existe en el wire. */
export interface GeoZoneNode extends GeoZone {
  children: GeoZoneNode[];
  depth: number;
}
```

**D3 — Árbol: carga completa y construcción en cliente.**
`GET /api/geo-zones` devuelve la lista plana; el cliente la convierte en árbol por
`parent_id` en una pasada. Alternativa rechazada: cargar hijos por demanda al
expandir. Motivo: la jerarquía territorial de Ecuador es acotada y estable
(migración `0041` sembró Santa Elena; el orden de magnitud son cientos de nodos, no
cientos de miles), y la carga por demanda introduce estado de expansión asíncrono,
spinners por fila y coordinación con la búsqueda.

**Umbral explícito**: si `geo_zones` supera ~5.000 filas, esta decisión deja de ser
válida y hay que pasar a carga por demanda. Se deja anotado aquí para que el cambio
sea deliberado y no un descubrimiento en producción.

Construcción — una pasada, sin recursión sobre el arreglo completo:

```ts
function buildTree(rows: GeoZone[]): GeoZoneNode[] {
  const byId = new Map<string, GeoZoneNode>(
    rows.map(r => [r.id, { ...r, children: [], depth: 0 }]),
  );
  const roots: GeoZoneNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) { node.depth = parent.depth + 1; parent.children.push(node); }
    else { roots.push(node); }
  }
  return roots;
}
```

`depth` asignado en el bucle sólo es correcto si los padres se visitan antes que los
hijos. No se puede asumir: se calcula en un segundo recorrido descendente desde las
raíces. Esta trampa se anota porque es exactamente el tipo de error que pasa los
tests con datos ordenados y falla con datos reales.

**D4 — Búsqueda en el árbol: filtrar preservando ancestros.**
Un nodo coincide si su nombre o código casa con el término. El árbol resultante
conserva los ancestros de cada coincidencia, expandidos. Filtrar sin ancestros dejaría
parroquias huérfanas sin contexto territorial, que es justamente lo que el usuario
necesita ver.

**D5 — Búsqueda en servidor para Categorías y Organizaciones; en cliente para Ubicaciones.**
Los dos primeros pagan paginación de servidor con `debounceTime(300)` +
`distinctUntilChanged()` + `switchMap`. Ubicaciones ya tiene el árbol completo en
memoria por D3, así que filtra localmente. Es asimétrico a propósito y se documenta
para que no se lea como descuido.

**D6 — Permisos en la UI vía directiva, con guard como respaldo.**
`frontend/src/app/shared/directives/` ya existe. Se añade `*hasPermission` para
ocultar acciones de escritura, y las rutas de alta/edición llevan un guard de
permiso. La directiva es ergonomía; el guard es la garantía. Ocultar un botón no es
control de acceso.

**D7 — Orden de implementación: Categorías → Organizaciones → Ubicaciones.**
Contra la intuición de empezar por el mock más vistoso. Categorías fija el patrón
con el mínimo de variables; cuando llega Ubicaciones, lo único no resuelto es el árbol.

## Data Flow

**Listado plano** (Categorías, Organizaciones):
input de búsqueda → `debounceTime(300)` → `switchMap` →
`GET /api/<recurso>?search=&page=&limit=` → wire snake_case → modelo tipado →
signal → `ui-table` → `pagination`

**Árbol** (Ubicaciones):
`GET /api/geo-zones` (una vez) → `GeoZone[]` → `buildTree()` → `GeoZoneNode[]` →
signal → filtro en cliente preservando ancestros (D4) → aplanado a filas visibles
según estado de expansión → `ui-table` con sangría por `depth`

**Escritura**: formulario → validación cliente → `POST`/`PATCH` → 2xx: toast + volver
al listado · 422: errores por campo · 409: motivo de integridad, el registro permanece

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `frontend/src/app/core/models/geo-zone.model.ts` | Nuevo (D2) | `GeoZone`, `GeoZoneLevel`, `GeoZoneNode` |
| `frontend/src/app/core/models/incident-category.model.ts` | Nuevo (D2) | Modelo alineado al wire |
| `frontend/src/app/core/models/organization.model.ts` | Nuevo (D2) | Modelo alineado al wire |
| `frontend/src/app/core/services/geo-zone.service.ts` | Nuevo | Listado, alta, edición, borrado |
| `frontend/src/app/core/services/incident-category.service.ts` | Nuevo | Ídem |
| `frontend/src/app/core/services/organization.service.ts` | Nuevo | Ídem |
| `frontend/src/app/features/catalogs/categories/` | Nuevo (D7) | Listado + formulario — fija el patrón |
| `frontend/src/app/features/catalogs/organizations/` | Nuevo | Listado + formulario |
| `frontend/src/app/features/catalogs/locations/` | Nuevo (D3/D4) | Árbol + formulario |
| `frontend/src/app/features/catalogs/locations/tree.util.ts` | Nuevo (D3) | `buildTree`, cálculo de `depth`, filtro con ancestros |
| `frontend/src/app/shared/directives/has-permission.directive.ts` | Nuevo (D6) | Oculta acciones sin permiso |
| `frontend/src/app/core/guards/permission.guard.ts` | Nuevo (D6) | Guard de ruta por permiso |
| `frontend/src/app/app.routes.ts` | Modificar | Sustituye los tres placeholders de F1 por las pantallas reales |

## Redis Caching Strategy

No aplica — F2 no toca backend. La caché `perm:v3:uid:*` sigue sirviendo permisos
sin cambios.

## Testing Strategy

- **Unit de servicios**: construcción de URL con búsqueda y paginación; mapeo del
  wire snake_case al modelo. Aserción sobre los **campos mapeados**, no sobre la URL
  — el modo exacto en que SC-209 dejó pasar la deriva.
- **Unit de `tree.util.ts`**: es el núcleo algorítmico de la fase. Casos: entrada
  desordenada (hijo antes que padre), `depth` correcto en cuatro niveles, nodo huérfano
  con `parent_id` inexistente, filtro que preserva ancestros, árbol vacío.
- **Componentes**: listado renderiza filas, muestra `empty-state` sin resultados,
  `table-skeleton` en carga; formulario bloquea envío inválido y asocia el 422 a su campo.
- **Permisos**: con permisos de sólo lectura, las acciones de escritura no están en
  el DOM; con acceso directo a la ruta, el guard bloquea.
- **e2e (Playwright)**: por catálogo, el ciclo alta → búsqueda → edición → borrado.
  Para Ubicaciones, además: expandir hasta parroquia y verificar la sangría.
- Comandos: `pnpm lint && pnpm test` y `pnpm test:e2e` desde `frontend/`.

## Open Questions

- **Q1 — RESUELTA** (equipo, 2026-08-29). El `Colombia` del mock 06-01 era relleno de
  maqueta. El caso real es **Ecuador**: la jerarquía de interés es provincia → cantón →
  parroquia, y el resto de provincias del país se cargaron como datos de relleno.
  Consecuencia para el diseño: el volumen esperado se mantiene en el orden de cientos
  de nodos, lo que **confirma D3** (carga completa y árbol en cliente) y deja el umbral
  de 5.000 filas holgadamente lejos. El nivel `pais` se conserva administrable —cuesta
  lo mismo y evita un caso especial en el formulario— pero en la práctica es un nodo raíz.
- **Q2** — El pie del mock dice «1 localización visible» con diez filas en pantalla.
  Se interpreta como error de la maqueta; se implementa el conteo real de filas visibles.
