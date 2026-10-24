# Design: Presentación de datos del detalle de incidencia

## Decisiones técnicas y arquitectura

Este documento define la arquitectura y las soluciones técnicas para resolver los requerimientos de presentación de datos y el acceso al historial de estados en el detalle de una incidencia, especificados en `openspec/changes/front/2026-10-06-sc-405-incident-detail-data-presentation/specs/frontend-incidents/spec.md`.

### Resolución de identidad y zona
- **Decisión:** El frontend utilizará los objetos anidados o atributos descriptivos ya devueltos por el backend (por ejemplo, `incident.citizen.full_name` o equivalente y `incident.geo_zone.name`), evitando exponer directamente los campos crudos como `citizen_id` o `zone_id`.
- **Manejo de estados nulos:** Si un dato (ej. el ciudadano) no viene resuelto, se utilizará un fallback textual genérico ("Ciudadano no disponible") definido en la vista.

### Ubicación legible
- **Decisión:** Priorizar el nombre descriptivo (zona geográfica o dirección geocodificada, si existiera) en el bloque de ubicación, relegando las coordenadas decimales a un rol secundario (ej. en un texto atenuado o tooltip).
- **Control de renderizado:** Si no existen coordenadas, se omitirá completamente la sección visual usando condicionales de Angular (`@if`), sin dejar contenedores vacíos.

### Mini-mapa Leaflet
- **Decisión:** Instanciar un mini-mapa interactivo de Leaflet en `IncidentDetailComponent` si la incidencia tiene coordenadas (`lat`, `lng`) válidas.
- **Implementación:** Se manejará la inicialización del mapa en un efecto o en el lifecycle hook correspondiente, asegurando que el contenedor DOM exista. Se limpiará la instancia en el `OnDestroy` para evitar memory leaks.

### Galería de imágenes
- **Decisión:** Integrar el componente reutilizable `<app-incident-images>` dentro de la plantilla del detalle de incidencia, pasándole el ID de la incidencia.
- **Flujo:** Este componente ya maneja sus propios requests al endpoint `GET /api/incidents/:id/images`, encapsulando los estados de carga y error.

### Comentario sin recarga
- **Decisión:** La inserción de comentarios ya sigue un patrón reactivo local (`comments.set([...])` usando signals en Angular) en lugar de una recarga dura (`location.reload()`).
- **Control de 403:** El supuesto "recargo" o bloqueo UX con el toast de permiso faltante al publicar un comentario se origina porque el frontend recarga/vuelve a obtener datos asíncronos en el fondo y falla la ruta de `status-history`. Al solucionar el grant en BD, el 403 desaparece y el flujo de comentarios fluirá naturalmente.

### Estrategia de Migración SQL: READ status-history y Denormalización
- **Nombre de migración:** `database/migrations/0066_status_history_permission.sql` (siguiente número disponible en la secuencia).
- **Contenido conceptual:**
  1. Garantizar la existencia de la tupla `('status-history', 'READ')` en la tabla `permissions` usando `ON CONFLICT DO NOTHING`.
  2. Identificar qué roles poseen actualmente el permiso `('incidents', 'READ')` y concatenar el UUID de `('status-history', 'READ')` a su array `permissions` en formato JSONB.
  3. **Denormalización y propagación:** Realizar un `UPDATE` en la tabla `users` para todos los usuarios activos de los roles afectados, copiando el nuevo array `permissions`.
  4. **Bump de `permission_version`:** Incrementar en `+ 1` la columna `permission_version` de esos mismos usuarios para forzar la invalidación inmediata de la caché de permisos en Redis (`perm:v3:uid:*`).

## Contratos de datos y API involucrados

No se introducen nuevos endpoints ni cambios estructurales en los requests, pues se aprovechan contratos existentes:
- **`GET /api/incidents/:id`**: Provee toda la data base de la incidencia, incluyendo `zone_id`/`citizen_id` y sus objetos anidados correspondientes.
- **`GET /api/incidents/:id/status-history`**: Historial de estados (requiere que el usuario tenga el permiso efectivo validado por la sesión en BD, el cual se corregirá en la migración).
- **`GET /api/incidents/:id/images`**: Provee el listado de imágenes consumido de forma aislada por el componente `<app-incident-images>`.
- **`POST /api/comments/incident/:id`**: Agrega el comentario localmente y en el servidor, sin requerir recarga ni revalidar permisos extraños.

## Estructura de archivos a modificar/crear

- `database/migrations/0066_status_history_permission.sql` (Crear): Script de base de datos para permisos de historial.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.ts` (Modificar): Lógica para inicializar Leaflet y formateo de identidad y ubicación legibles.
- `frontend/src/app/features/incidents/incident-detail/incident-detail.component.html` (Modificar): Reemplazo de UUIDs por nombres, inclusión de `<app-incident-images>` y el layout del mapa Leaflet.
- `frontend/src/app/features/incidents/components/comment-thread/comment-thread.component.ts` (Verificar): Validar que sus emits hacia el padre transicionen sin problemas.

## Tradeoffs
- **Carga de recursos (Leaflet y Galería):** Renderizar ambos componentes al abrir el detalle de una incidencia puede penalizar el tiempo de render inicial.
  - *Mitigación:* Se asume como un costo razonable dado que Leaflet es ligero y las imágenes tienen carga asíncrona encapsulada. 
- **Migración en BD vs Permisos en Código:** Se opta por asignar permisos en DB y propagar denormalizando a la tabla `users` tal como exige el estándar RBAC del sistema.
  - *Tradeoff:* Exige el script `0066` y el barrido masivo a los usuarios (costo en write), pero preserva la coherencia del diseño preestablecido en `permission_version` que invalida en Redis, en contraste con implementar una excepción estática en el código de backend.
- **Payload anidado vs Múltiples fetches:** Se espera y asume que el DTO base traiga la información para resolver UUIDs, reduciendo los roundtrips HTTP. 
  - *Tradeoff:* Aumenta ligeramente el peso de la payload del incidente pero reduce saltos de red, mejorando la latencia percibida de la app.
