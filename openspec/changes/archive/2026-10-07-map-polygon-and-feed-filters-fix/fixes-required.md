# Fixes Required — 2026-10-05-map-polygon-and-feed-filters-fix

> **Para Minimax (Builder)**  
> Este documento contiene las correcciones requeridas tras la auditoría de `sdd-verify`.  
> No re-audites ni alteres el alcance: la mayor parte del cambio está impecable y cumple los contratos funcionales.

---

## 1. Antes de empezar

- **La mayor parte de la fase está en verde y excelente**: El backend (`IncidentFeedService.getCitizenFeed`) tiene paridad perfecta en caché y SQL. La reactividad en `loadZones()` (`highlightZone` post-carga) resuelve la condición de carrera con elegancia.
- Si encuentras alguna discrepancia entre lo descrito aquí y el código real, detén la ejecución y escala de inmediato.
- Solo hay **un ajuste puntual de 1 línea** en frontend para blindar Leaflet ante geometrías malformadas.

---

## 2. Estado de los Gates

| Gate | Estado | Lectura |
|---|---|---|
| **Backend Test & Build** | Certificado en vivo | 123 suites / 1275 tests pasando. Paridad validada. Build exit 0. |
| **Frontend Test & Build** | Certificado en vivo | 104 suites / 890 tests pasando. Build exit 0. |
| **QA Clean Context Gate** | Resuelto en vivo | Gates certificados en vivo con código de salida 0. |

---

## 3. Hallazgos y Correcciones Requeridas

### [H1] Reemplazar stub simulado por `L.geoJSON()` nativo en `createZoneLayer`

- **Archivo**: `frontend/src/app/features/citizen/map/map.component.ts`
- **Líneas**: ~210–217
- **El defecto**:
  ```typescript
  // CÓDIGO ACTUAL:
  const parsed = this.parsePolygon(zone.polygon);
  if (!parsed) {
    // Return an inert no-op layer so renderZonePolygons()' length
    // stays aligned with the active-zones array (we index by `idx`).
    // The caller filters out non-polygon zones anyway, so this is
    // defensive only.
    return { bindPopup: () => undefined, on: () => undefined } as unknown as L.Layer;
  }
  ```
- **Por qué importa**:
  El objeto literal `{ bindPopup: () => undefined, on: () => undefined }` se castea como `unknown as L.Layer`, pero **no es una instancia real de Leaflet Layer**.
  Si por cualquier motivo una zona en base de datos trae un `polygon` como cadena corrupta o inválida (por ejemplo `{invalid json`), Leaflet añadirá este objeto a `zoneLayerGroup`. Durante `zoneLayerGroup.addLayer(l)`, Leaflet ejecuta internamente:
  ```javascript
  layer.onAdd(this._map);
  ```
  Al no tener `onAdd`, JavaScript lanzará un `TypeError: layer.onAdd is not a function`, lo que **crashea inmediatamente `loadZones()`** y evita que se dibuje cualquier polígono territorial. Además, las llamadas posteriores a `setStyle()` o `getBounds()` también fallarán.
- **La corrección**:
  Reemplaza el retorno simulado por una instancia real de `L.geoJSON()` (capa GeoJSON vacía):
  ```typescript
  // CÓDIGO CORREGIDO:
  const parsed = this.parsePolygon(zone.polygon);
  if (!parsed) {
    return L.geoJSON();
  }
  ```
  `L.geoJSON()` sin argumentos crea un `L.GeoJSON` completamente válido con todos los métodos del ciclo de vida (`onAdd`, `setStyle`, `bringToFront`, `bindPopup`, `on`). Su método `getBounds()` retorna límites inválidos, lo que es verificado y protegido de forma nativa por `bounds.isValid()` en la línea 464.

---

## 4. Reparto de Responsabilidades
 
| Responsabilidad | Encargado | Estado |
|---|---|---|
| Corrección de `createZoneLayer` (1 línea) | **Minimax (Builder)** | **COMPLETO**: `L.geoJSON()` aplicado en `map.component.ts:218`. |
| Adición de prueba en `map.component.spec.ts` para `renderZonePolygons` con polígono corrupto | **Minimax (Builder)** | **COMPLETO**: Prueba unitaria añadida y pasando. |
| Desbloqueos de contrato o arquitectura | **Arquitecto SDD** | **Desbloqueado**: No requiere cambio en `spec.md` ni `design.md` (es 100% conforme a D2). |
| Ejecución y certificación de gates en vivo | **Orquestador / QA** | **COMPLETO**: 104 suites / 890 tests frontend PASS, 123 suites / 1275 tests backend PASS, builds exit 0. |

---

## 5. Qué NO Tocar

| Componente / Archivo | Motivo |
|---|---|
| `backend/src/modules/incidents/incident-feed.service.ts` | 100% verificado, paridad estricta y funcional en caché y fallback. |
| `backend/src/modules/incidents/incident-feed.service.spec.ts` | Pruebas completas y válidas. |
| DTOs o Schemas de Base de Datos | Fuera de alcance del change. |
| Lógica de `highlightZone` y `onFiltersChange` en frontend | Correctas y probadas; respetan D1 y D4. |

---

## 6. Estado Final

Todos los hallazgos han sido resueltos satisfactoriamente. El change se encuentra 100% aprobado con veredicto **PASS** y listo para proceder a `sdd-archive`.
