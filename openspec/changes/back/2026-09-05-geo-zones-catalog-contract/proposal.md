# Proposal: Contrato de `geo-zones` para el catálogo de Ubicaciones

## Intent

F2 (`front/2026-08-29-f2-catalogos-crud`) construyó el catálogo de Ubicaciones contra
`geo-zones` y chocó con dos límites del backend que **no se pueden resolver desde el
frontend**. El proposal de F2 declara el camino para exactamente este caso:

> *«Cambios de backend. Si aparece deriva de contrato se documenta y se abre change
> aparte.»*

Este es ese change. F2 quedó cerrada con un workaround verificado para el primer punto y
**sin solución** para el segundo, que es el grave.

## Hallazgo 1 — Ningún endpoint sirve el árbol completo con `code`

El catálogo necesita **todas** las zonas, con `code`, sin geometría. Hoy no existe:

| Endpoint | Todas las filas | `code` | Sin `polygon` |
|---|---|---|---|
| `GET /geo-zones` (`findAll`) | ❌ tope 100 | ✅ | ❌ trae `ST_AsGeoJSON(polygon)` |
| `GET /geo-zones/tree` (`listFlat`) | ✅ CTE recursivo | ❌ no proyectado | ✅ |

`geo-zones.repository.ts:215` hace `Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE,
MAX_PAGE_SIZE)` con `MAX_PAGE_SIZE = 100`. Pedir más devuelve **200 con las primeras 100
filas**, sin señal alguna de truncamiento.

Eso no es "faltan filas". `buildTree` promueve a raíz todo nodo cuyo padre quedó fuera de
la ventana, así que el árbol renderiza una **jerarquía incorrecta sin ningún error**.

**Estado actual**: latente, no activo. Hoy hay ~26 zonas sembradas (4 + 11 + 11 entre
`0003_seed_geo_zones`, `0004_seed_parroquias` y `0041`). Rompe al pasar de 100 — que es
justo el volumen objetivo según la Q1 del diseño de F2 (24 provincias + cantones +
parroquias del Ecuador, ~1.700 nodos).

**Workaround aplicado en F2** (`geo-zone.service.ts`): `listAll()` pagina de a 100
usando `total` hasta traerlas todas. Correcto a cualquier volumen y cubierto por
`geo-zone.service.spec.ts`, pero paga el costo de arrastrar el `polygon` de cada fila —
los seeds pesan ~7–20 KB por zona, así que a 1.700 nodos son 17 requests y decenas de MB.

**Propuesta**: proyectar `code` en el CTE de `listFlat`, de modo que
`GET /geo-zones/tree` pase a servir el caso completo — todas las filas, con `code`, sin
geometría, en un request. Es una línea en cada `SELECT` del `WITH RECURSIVE` y en
`GeoZoneTreeRow`. Con eso, F2 revierte el paginado y consume `/tree`.

Alternativa menor si se prefiere no tocar el árbol: excluir `polygon` de `findAll` salvo
pedido explícito (`?include_geometry=true`), y subir `MAX_PAGE_SIZE` para lecturas de
catálogo.

## Hallazgo 2 — `polygon` obligatorio en el alta obliga al frontend a inventar geometría

`CreateGeoZoneDto.polygon` es **requerido** (`@IsGeoJsonPolygon()`, no opcional);
en `UpdateGeoZoneDto` es opcional.

F2 no tiene herramienta de dibujo — el mapa llega en F4, y el mock 06-02 no lo muestra.
Para poder dar de alta una zona, `location-form.component.ts` manda **siempre el mismo**
polígono placeholder: una caja de 1°×1° (~111 km) cerca de Quito.

**Por qué importa**: `GeofencingRepository.findZoneByPoint` resuelve la zona de cada
incidencia con

```sql
SELECT id, name, active, created_at
  FROM geo_zones
 WHERE active = true
   AND ST_Contains(polygon, ST_SetSRID(ST_Point($1, $2), 4326))
 LIMIT 1
```

`LIMIT 1` **sin `ORDER BY`**. El propio comentario del repositorio ya advierte que, desde
que 0034 quitó `uq_organizations_zone`, varias zonas pueden solaparse y el `LIMIT 1` deja
de ser determinista.

Consecuencia: toda zona creada desde la UI comparte el mismo polígono, y cualquier
incidencia reportada dentro de esa caja se rutea a **una zona arbitraria** entre ellas.
No es un defecto cosmético del catálogo — corrompe el ruteo de incidencias, que es el
flujo central del producto.

**Propuesta** — una de estas, es decisión de producto:

1. **`polygon` opcional en el alta** + tratar las zonas sin geometría como
   no-geofencing: `findZoneByPoint` y `findZonesNearby` ya filtran por `active`; añadir
   `AND polygon IS NOT NULL` las deja fuera del ruteo hasta que alguien dibuje la
   geometría real en F4. Es la opción que desbloquea el catálogo sin ensuciar el
   geofencing.
2. **Mantener `polygon` requerido** y que el frontend **no exponga el alta** de zonas
   hasta F4. El catálogo queda en listar / editar / borrar.

Mientras no se decida, el alta de Ubicaciones sigue escribiendo el placeholder.

## Scope

### In Scope
- `code` proyectado en `listFlat` / `GeoZoneTreeRow` (Hallazgo 1)
- Decisión y ejecución sobre `polygon` en el alta (Hallazgo 2)
- Regresión sobre `findZoneByPoint` con zonas sin geometría, si se toma la opción 1

### Out of Scope
- Herramienta de dibujo de polígonos — es F4
- `updated_at` en el wire de `geo-zones` y `organizations`. F2 lo declaraba en sus
  modelos y no existe en ninguno de los dos `SELECT`; ya se corrigió del lado frontend
  quitando el campo. Se anota acá sólo por si el backend quiere exponerlo: la columna
  existe en tabla (`0032_updated_at_columns`) pero no se proyecta.

## Domain Module Dependencies

- `backend/src/modules/geo-zones` — `geo-zones.repository.ts`, `dto/create-geo-zone.dto.ts`
- `backend/src/modules/geofencing` — `geofencing.repository.ts` (Hallazgo 2, opción 1)

## Risks

- **R1 — Cambiar `findZoneByPoint` toca el flujo más caliente del sistema.** El
  comentario `T7.2.B1` documenta que ya se intentó una vez añadir un predicado a esa
  query y se revirtió: cambió el plan y volteó cuál de dos zonas solapadas devolvía el
  `LIMIT 1`, rompiendo e2e de `t6-organizations-notified`, `flows` y `regressions`.
  Cualquier `AND polygon IS NOT NULL` necesita esos e2e en verde antes de mergear.
- **R2 — Subir `MAX_PAGE_SIZE` sin sacar `polygon` empeora el problema**, no lo arregla:
  la respuesta crece linealmente en geometría.
