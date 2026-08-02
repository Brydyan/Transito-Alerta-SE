# ADR-0007: PostGIS para geolocalización

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

El sistema se llama "incidencias **georreferenciadas**". Cada incidencia tiene una ubicación que importa para el producto: dispatch de operadores, mapas, queries de proximidad, filtros geográficos. La BD debe soportar queries geoespaciales eficientes, no solo almacenar lat/lng como dos columnas de tipo FLOAT.

## Considered Options

1. **Dos columnas `lat` y `lng` como FLOAT** + queries calculadas en PHP.
2. **Columna `geom` (Point) con extensión PostGIS** + índice GIST + queries SQL espaciales. **Elegido.**
3. **Servicio externo de geocoding/maps** (Google Maps, Mapbox) que mantenga el índice.
4. **Sin geolocalización** — solo mantener la dirección normalizada País/Provincia/Ciudad.

## Decision Outcome

**Opción 2: PostGIS con columna `geom` Point SRID 4326.** La tabla `incidents` tiene una columna `geom` (Point, PostGIS) además de la FK `location_id` (que apunta a la jerarquía País/Provincia/Ciudad). La tabla `locations` también puede tener `geom` opcional para puntos de referencia. Índice GIST sobre `geom` para queries de bounding box y proximidad. SRID 4326 = WGS84, el estándar GPS.

**Razones:**

- **Queries eficientes de proximidad**: `ST_DWithin(geom, point, 1000)` es O(log n) con el índice GIST. Hacerlo en PHP con cálculo de distancia Haversine sobre todas las filas sería O(n) y prohibitivo a escala.
- **Bounding boxes**: `ST_MakeEnvelope(lat_min, lng_min, lat_max, lng_max)` y `ST_Within(geom, envelope)` es trivial en PostGIS.
- **Ecosistema maduro**: PostGIS es la extensión geográfica más usada del mundo, con 20+ años de madurez.
- **Una sola fuente de verdad**: la columna `geom` es la representación canónica; el Eloquent spatial package la convierte a GeoJSON automáticamente.
- **Compatible con Eloquent**: el paquete `matan-yadaev\EloquentSpatial` provee el cast `Point::class` y trait `HasSpatial` para integración limpia con Eloquent.

## Consequences

### Positive

- **Performance de queries geoespaciales**: índice GIST da O(log n) en lugar de O(n) para proximity y bounding-box.
- **API estándar**: PostGIS es la implementación de referencia de SQL/MM Spatial.
- **Funcionalidades avanzadas sin esfuerzo**: distance, intersects, contains, nearest-neighbor, todo en SQL.
- **Visualización fácil**: el frontend usa Leaflet (ver [docs/Pendientes/08-vista-mapa.md](../Pendientes/08-vista-mapa.md)) que consume GeoJSON directamente.
- **Sincronización en tiempo real lista**: `RedisIncidentSync` ya serializa el `geom` como GeoJSON para push a clientes.

### Negative

- **Acoplamiento a PostgreSQL**: PostGIS es específico de PostgreSQL. Si en el futuro se quisiera portar a MySQL o SQLite, hay que reimplementar las queries espaciales.
- **No es trivial para devs sin experiencia geoespacial**: conceptos como SRID, sistemas de coordenadas, geodésica vs planar requieren aprendizaje. Mitigación: usar siempre SRID 4326 y dejar que PostGIS haga el resto.
- **Tests más pesados**: para tests con queries geoespaciales, se necesita una BD de test con PostGIS habilitado. SQLite no soporta PostGIS, así que los tests usan PostgreSQL (vía Docker).
- **Backups más grandes**: la columna `geom` requiere 16 bytes mínimo por Point (más metadatos), vs 8 bytes de dos FLOAT.

## Implementation

**Archivos clave:**

- `backend/database/migrations/2026_06_15_000001_enable_postgis.php` — `CREATE EXTENSION postgis;`.
- `backend/database/migrations/2026_06_15_000002_create_locations_table.php` — `locations.geom` Point nullable.
- `backend/database/migrations/2026_06_15_000005_create_incidents_table.php` — `incidents.geom` Point nullable.
- `backend/app/Domains/Incidents/Models/Incident.php` — cast `'geom' => Point::class`, trait `HasSpatial`.
- `backend/app/Domains/Incidents/Http/Resources/IncidentResource.php` — expone `geom` como GeoJSON serializado.
- `backend/app/Domains/Incidents/Listeners/RedisIncidentSync/RedisIncidentSync.php` — serializa `geom` a GeoJSON en el payload.
- `composer.json` — dependencia `matan-yadaev/laravel-eloquent-spatial`.

**Ejemplo de uso:**

```php
// Crear incidencia con geom
Incident::create([
    'title' => 'Bache en calle X',
    'geom' => new Point(-0.9537, -80.7286, SRID: 4326),  // lng, lat
    // ...
]);

// Query: incidencias dentro de 1km de un punto
$nearby = Incident::query()
    ->whereDistanceSphere('geom', $point, 1000)
    ->get();

// Query: bounding box
$inBounds = Incident::query()
    ->whereWithin('geom', $envelope)
    ->get();
```

**Convenciones:**
- Siempre SRID 4326 (WGS84) — el estándar GPS.
- `geom` es **opcional**: una incidencia puede existir sin coordenadas (e.g. creada con solo dirección normalizada).
- En el JSON de salida, `geom` se serializa como GeoJSON Point (`{type: "Point", coordinates: [lng, lat]}`).

## References

- [SRS v2.0 §3.2 RF-FUNC-015, 016 Ubicación georreferenciada](../Requisitos/SRS.md#ubicación-georreferenciada)
- [SRS v2.0 §4.1.3 Incident model](../Requisitos/SRS.md#413-incident) — columna `geom` documentada.
- [docs/Pendientes/08-vista-mapa.md](../Pendientes/08-vista-mapa.md) — feature futura que aprovecha este ADR.
- [PostGIS docs](https://postgis.net/documentation/)
- [matan-yadaev/laravel-eloquent-spatial](https://github.com/MatanYadaev/laravel-eloquent-spatial)
- ADR-0004 Multitenant — el scope por organización se aplica también a queries geoespaciales.
- ADR-0002 Auditoría — el trigger de status no toca el `geom`, así que no hay interacción.
