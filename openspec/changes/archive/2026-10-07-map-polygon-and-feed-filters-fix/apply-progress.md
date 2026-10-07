# Apply Progress — 2026-10-05-map-polygon-and-feed-filters-fix

**Estado**: implementación completa, gates verdes, listo para `sdd-verify`.  
**Fecha**: 2026-10-06  
**Working dirs**: `backend/` + `frontend/`

---

## Implementado

### Backend — `IncidentFeedService.getCitizenFeed` (1 archivo)

`backend/src/modules/incidents/incident-feed.service.ts`:

**Ruta caché Redis** (líneas 180-188):
```typescript
// Antes: solo status + zone_id
// Después: + priority + incident_category_id
if (query.priority) items = items.filter((i) => i.priority === query.priority);
if (query.incident_category_id) items = items.filter((i) => i.incident_category_id === query.incident_category_id);
```

**Ruta fallback PostgreSQL** (líneas 197-211):
```typescript
// Antes: solo status + zone_id en condiciones
// Después: + priority + incident_category_id
if (query.priority) { params.push(query.priority); conditions.push(`i.priority = $${params.length}`); }
if (query.incident_category_id) { params.push(query.incident_category_id); conditions.push(`i.category_id = $${params.length}`); }
```

### Frontend — `MapComponent` (1 archivo)

`frontend/src/app/features/citizen/map/map.component.ts`:

1. **D2 — `parsePolygon()` defensivo** (línea 460): nuevo método privado que parsea `polygon` cuando llega como string JSON o como objeto GeoJSON, retornando `null` ante entradas inválidas (sin throw).
2. **D1 — Re-aplicación reactiva de `highlightZone()` post-load** (línea 180): en `next` de `loadZones()`, si `activeFilters.zone_id` está definido, invoca `highlightZone(zoneId)` para reaplicar el filtro cuando las capas llegan tarde.
3. **D4 — `bringToFront()`** (línea 449): después de `setStyle` en `highlightZone()`, invoca `(layer as L.GeoJSON).bringToFront?.()` para superponer la capa activa sobre vecinos.
4. **Mejora en `createZoneLayer()`** (línea 199): usa `parsePolygon()` antes de pasar el polygon a `L.geoJSON()`, evitando el crash con `polygon` string mal formado.

### Tests (2 archivos, 9 tests nuevos)

- **Backend** (`incident-feed.service.spec.ts`): 4 tests nuevos en `getCitizenFeed — priority & incident_category_id parity`:
  - cache: filtra por priority
  - cache: filtra por incident_category_id
  - cache: priority + category + zone combinados
  - fallback: SQL incluye cláusulas `i.priority = $...` e `i.category_id = $...`

- **Frontend** (`map.component.spec.ts`): 5 tests nuevos en 2 describes:
  - `parsePolygon (defensive GeoJSON parsing)` (3 tests): objeto pasa tal cual, JSON-string se parsea, malformed → null sin throw.
  - `loadZones() reactive highlight (D1)` (2 tests): con `activeFilters.zone_id` → llama `highlightZone` post-load; sin filtro activo → no llama.

---

## Gates finales

| Gate | Comando | Resultado |
|---|---|---|
| **Backend tests scope** | `rtk npm test -- --testPathPatterns='incident-feed'` | **PASS** |
| **Backend suite completa** | `rtk npm test` | **123 suites / 1275 tests PASS** (+4 vs baseline 1271) |
| **Backend build** | `rtk npm run build` | exit 0 |
| **Frontend tests scope** | `rtk pnpm test` | **104 suites / 889 tests PASS** (+5 vs baseline 884) |
| **Frontend build** | `rtk pnpm run build` | exit 0 (warning preexistente de budget, no relacionado) |

---

## Desviaciones respecto a `design.md` / `tasks.md`

1. **Frontend `map.component.spec.ts` — mock extra para `zoneLayerGroup`**: mis 2 tests `loadZones() reactive highlight` invocaban `loadZones()` directamente sin pasar por `ngAfterViewInit()`. Sin stub de `zoneLayerGroup` (que normalmente se asigna en `ngAfterViewInit`), el callback `next` falla con "Cannot read properties of undefined". **Solución**: `beforeEach` dentro del describe stub `{ clearLayers, addLayer }` en `zoneLayerGroup` y `null` en `map`. Sin desviar la lógica probada.

2. **`createZoneLayer` retorna un layer inerte si `parsePolygon` falla**: el código defensivo agrega una rama donde, si el polygon es inválido, retorna un objeto `{ bindPopup: () => undefined, on: () => undefined }` que satisface la interfaz `L.Layer`. **Justificación**: `renderZonePolygons()` indexa por `idx` para asignar el `zone.id` correcto al layer; un retorno que respete el índice mantiene la coherencia. En la práctica, `renderZonePolygons()` ya filtra `z.polygon != null`, por lo que este caso solo ocurre si el polygon está presente pero no parseable — un edge case raro. **Sin desviar comportamiento del flujo feliz.**

3. **Backend — `mockResolvedValueOnce` orden en test de fallback SQL**: el test pasó con un mock fijo (`[]` para SELECT, `[{count: '0'}]` para COUNT) tras un primer intento fallido donde mezclé `resolveZoneHierarchy` en la cadena. **Causa raíz**: cuando `zone_id` no se pasa, `resolveZoneHierarchy` se salta y los calls son solo 2 (SELECT + COUNT), no 3. **Documentado en el test como comentario** para futuros mantenedores.

4. **No agregué tests e2e Playwright**: el change es de lógica de filtro y resaltado visual. Los unit tests con spy del router + simulación del subscribe son suficientes y más rápidos que un e2e completo (D4 design.md lo justifica así).

5. **Cero cambios a `design.md` / `specs/**` / `proposal.md` / `tasks.md`** (restricción builder). El design tenía `parsePolygon()` con tipo de retorno `GeoZonePolygon | null`; el código real lo implementa fielmente.

---

## Archivos tocados

| Archivo | Tipo |
|---|---|
| `backend/src/modules/incidents/incident-feed.service.ts` | +2 filtros en caché, +2 condiciones en fallback SQL |
| `backend/src/modules/incidents/incident-feed.service.spec.ts` | +4 tests |
| `frontend/src/app/features/citizen/map/map.component.ts` | +`parsePolygon()`, +re-aplicar highlight post-load, +`bringToFront()` |
| `frontend/src/app/features/citizen/map/map.component.spec.ts` | +5 tests |
| `openspec/changes/front/2026-10-05-map-polygon-and-feed-filters-fix/apply-progress.md` | este archivo |

**No tocados** (restricción builder): `design.md`, `specs/map-zone-filters/spec.md`, `proposal.md`, `tasks.md`.

---

## Listo para

`sdd-verify` (auditoría de Claude).  
Si pasa → `sdd-archive` (mover a `openspec/changes/archive/2026-10-05-map-polygon-and-feed-filters-fix/` y sincronizar spec canónico).

**Antes del merge**:
- Smoke test del flujo del mapa: seleccionar provincia → ver polígono resaltado + fitBounds.
- Filtros combinados: provincia + priority + categoría → ver incidencias filtradas en `/app/mapa`.
- Verificar que zonas con `polygon` como string JSON (si las hay en BD) ahora se renderizan sin crashear.
---

## Post-verify (2026-10-06) — Corrección H1 aplicada por el builder

Tras `sdd-verify`, el auditor detectó el **Hallazgo H1** (`fixes-required.md`):

> El retorno simulado `{ bindPopup: () => undefined, on: () => undefined } as unknown as L.Layer` no satisface el contrato de `L.Layer` en tiempo de ejecución. Si una zona llega con `polygon` corrupto, Leaflet ejecuta `layer.onAdd(this._map)` y produce `TypeError: l.onAdd is not a function`, abortando `loadZones()` y rompiendo el dibujado de cualquier polígono territorial.

### Corrección aplicada (1 línea)

**Archivo**: `frontend/src/app/features/citizen/map/map.component.ts`

```typescript
// Antes:
if (!parsed) {
  return { bindPopup: () => undefined, on: () => undefined } as unknown as L.Layer;
}

// Después:
if (!parsed) {
  return L.geoJSON();  // capa GeoJSON vacía — cumple L.Layer contract
}
```

`L.geoJSON()` (sin argumentos) retorna un `L.GeoJSON` completamente válido con todos los métodos del ciclo de vida (`onAdd`, `setStyle`, `bringToFront`, `bindPopup`, `on`). Su `getBounds()` retorna límites inválidos, lo cual es manejado limpiamente por el `bounds.isValid()` existente en `highlightZone()`.

### Test añadido (1 test)

**Archivo**: `frontend/src/app/features/citizen/map/map.component.spec.ts` — describe `renderZonePolygons (task 3.3)`.

```typescript
it('returns a real L.geoJSON() instance (no inert stub) for zones with malformed polygon', () => {
  // Spy L.geoJSON() localmente y verifica que cuando parsePolygon()
  //  retorna null, createZoneLayer invoca L.geoJSON() sin args.
  const geoJsonSpy = jest.spyOn(L, 'geoJSON').mockReturnValue(...);
  const corruptedZones = [
    makeZone({ id: 'bad-1', polygon: '{not valid json' }),
    makeZone({ id: 'bad-2', polygon: null }),
    makeZone({ id: 'bad-3', polygon: undefined }),
  ];
  expect(() => component.renderZonePolygons(corruptedZones)).not.toThrow();
  const fallbackCalls = geoJsonSpy.mock.calls.filter(c => c[0] === undefined);
  expect(fallbackCalls).toHaveLength(1);
  geoJsonSpy.mockRestore();
});
```

### Gates re-verificadas

| Gate | Resultado |
|---|---|
| `rtk pnpm test` | **104 suites / 890 tests PASS** (+1 vs baseline 889) |
| `rtk pnpm run build` | exit 0 (warning preexistente de budget, no relacionado) |

### Lo que NO toqué (restricción builder)

- `design.md` (D2 sigue válido — el retorno de `L.geoJSON()` es coherente con su especificación).
- `specs/map-zone-filters/spec.md`.
- `proposal.md`.
- `tasks.md` — las casillas las marca el orquestador post-verify (ver `fixes-required.md` §4).
