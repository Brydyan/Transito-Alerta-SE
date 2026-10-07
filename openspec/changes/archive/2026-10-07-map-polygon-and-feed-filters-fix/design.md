# Design: Map Polygon Reflection & Citizen Feed Parity

**Change**: `front/2026-10-05-map-polygon-and-feed-filters-fix`  
**Fecha**: 2026-10-05  
**Autor**: Arquitecto SDD

---

## Decisiones Técnicas

### D1: Re-aplicación reactiva de zona activa al completar `loadZones()`
- **Decisión**: Al completarse la suscripción de `geoZoneService.listAll()` dentro de `MapComponent.loadZones()`, verificar si existe un `this.activeFilters.zone_id` activo e invocar de inmediato `this.highlightZone(this.activeFilters.zone_id)`.
- **Alternativa rechazada**: Bloquear el formulario de filtros `MapFiltersComponent` (deshabilitar el dropdown de provincia) hasta que el padre emita un evento indicando que las zonas del mapa han terminado de renderizarse.
- **Motivo del rechazo**: Acopla fuertemente el componente de filtros al mapa Leaflet, genera bloqueos artificiales de la interfaz de usuario en conexiones lentas y rompe el patrón unidireccional de datos (`@Output() filtersChange`).

### D2: Parseo defensivo local en `MapComponent` (`parsePolygon`)
- **Decisión**: Introducir una función utilitaria privada `parsePolygon(raw: unknown): GeoZonePolygon | null` que inspeccione si el atributo `polygon` es un objeto o una cadena de texto (ejecutando `JSON.parse` en bloque `try/catch`).
- **Alternativa rechazada**: Crear un interceptor HTTP global que inspeccione recursivamente todas las respuestas de la API en busca de strings que parezcan GeoJSON para deserializarlos.
- **Motivo del rechazo**: Introduce sobrecarga de procesamiento innecesaria en cada petición de la aplicación (incluyendo payloads grandes de reportes o dashboards) y distribuye la responsabilidad de una particularidad de representación de PostGIS fuera de su consumidor directo.

### D3: Paridad simétrica en `IncidentFeedService.getCitizenFeed` (Caché + SQL)
- **Decisión**: Replicar de manera exacta los filtros aplicados en `getStaffFeed` (`priority` e `incident_category_id`) en ambas ramas de `getCitizenFeed`: en el filtrado de arrays de la caché Redis (`items.filter(...)`) y en las cláusulas dinámicas de la consulta PostgreSQL (`conditions.push(...)`).
- **Alternativa rechazada**: Deshabilitar el almacenamiento en caché de Redis para `getCitizenFeed` cuando existan filtros avanzados (prioridad/categoría) y enviar siempre la petición a PostgreSQL.
- **Motivo del rechazo**: Viola el principio de alta concurrencia y bajo consumo de base de datos establecido para la vista pública/ciudadana. El objeto `FeedItemDto` almacenado en caché ya contiene los campos `priority` e `incident_category_id`, por lo que el filtrado en memoria es instantáneo y trivial.

### D4: Elevación de z-index de la capa resaltada con `bringToFront()`
- **Decisión**: Invocar `(layer as L.FeatureGroup).bringToFront?.()` al aplicar los estilos de realce en `highlightZone()`.
- **Alternativa rechazada**: Crear Leaflet Custom Panes con valores de `zIndex` específicos para provincias, cantones y parroquias.
- **Motivo del rechazo**: Añade complejidad innecesaria al ciclo de vida de capas de Leaflet. `bringToFront()` es una primitiva nativa estándar de Leaflet diseñada específicamente para superponer la capa enfocada sin alterar la jerarquía de DOM del mapa.

---

## Contratos de TypeScript y Estructuras de Datos

### 1. DTO de Consulta del Feed (`FeedQueryDto`)
Ubicación: `backend/src/modules/incidents/dto/feed-query.dto.ts`
```typescript
export class FeedQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsUUID() zone_id?: string;
  @IsOptional() @IsUUID() incident_category_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) per_page?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
}
```

### 2. Estructura de Elemento en Caché (`FeedItemDto`)
Ubicación: `backend/src/modules/incidents/dto/stats-response.dto.ts`
```typescript
export interface FeedItemDto {
  id: string;
  incident_category_id: string | null;
  organization_id: string | null;
  user_id: string;
  location_id: string | null; // Corresponde al zone_id de la incidencia
  title: string;
  status: string;
  priority: string;
  resolution_date: Date | null;
  created_at: Date;
  updated_at: Date;
  geom: object | null;
  category: { id: string; name: string } | null;
  organization: { id: string; name: string } | null;
  user: { id: string };
  location: { id: string; name: string } | null;
}
```

### 3. Modelo de Filtros Activos en Frontend (`MapActiveFilters`)
Ubicación: `frontend/src/app/features/citizen/map/services/map-data.service.ts`
```typescript
export interface MapActiveFilters {
  status?: string;
  priority?: string;
  incident_category_id?: string;
  zone_id?: string;
}
```

---

## Estrategia de Implementación en Backend

En `IncidentFeedService.getCitizenFeed(query: FeedQueryDto)`:

1. **Ruta Caché Redis (`feed:incidents`)**:
   ```typescript
   if (cached) {
     let items = cached;
     if (query.status) items = items.filter((i) => i.status === query.status);
     if (query.priority) items = items.filter((i) => i.priority === query.priority);
     if (query.incident_category_id) items = items.filter((i) => i.incident_category_id === query.incident_category_id);
     if (query.zone_id) {
       const zoneIds = await this.resolveZoneHierarchy(query.zone_id);
       const zoneIdSet = new Set(zoneIds);
       items = items.filter((i) => i.location_id && zoneIdSet.has(i.location_id));
     }
     ...
   }
   ```

2. **Ruta Fallback PostgreSQL**:
   ```typescript
   if (query.status) { params.push(query.status); conditions.push(`i.status = $${params.length}`); }
   if (query.priority) { params.push(query.priority); conditions.push(`i.priority = $${params.length}`); }
   if (query.incident_category_id) { params.push(query.incident_category_id); conditions.push(`i.category_id = $${params.length}`); }
   if (query.zone_id) { ... }
   ```

---

## Estrategia de Implementación en Frontend

En `MapComponent`:

1. **Parseo Defensivo**:
   ```typescript
   private parsePolygon(raw: unknown): GeoZonePolygon | null {
     if (!raw) return null;
     if (typeof raw === 'string') {
       try { return JSON.parse(raw) as GeoZonePolygon; } catch { return null; }
     }
     if (typeof raw === 'object') return raw as GeoZonePolygon;
     return null;
   }
   ```

2. **Re-evaluación Asíncrona en `loadZones()`**:
   ```typescript
   this.geoZoneService.listAll().subscribe({
     next: (zones) => {
       this.zoneLayerGroup?.clearLayers();
       this.zoneLayerById.clear();
       this.highlightedZoneId = null;
       const activeWithPolygon = zones.filter(z => z.active && z.polygon != null);
       const layers = this.renderZonePolygons(zones);
       layers.forEach((l, idx) => {
         this.zoneLayerGroup?.addLayer(l);
         const zone = activeWithPolygon[idx];
         if (zone) {
           this.zoneLayerById.set(zone.id, l);
           this.zoneLevelByLayer.set(l, zone.level);
         }
       });
       if (this.activeFilters.zone_id) {
         this.highlightZone(this.activeFilters.zone_id);
       }
     },
     ...
   });
   ```
