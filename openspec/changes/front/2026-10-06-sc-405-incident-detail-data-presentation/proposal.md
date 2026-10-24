# Propuesta: Presentación de datos del detalle de incidencia

## Intención
Mejorar la experiencia de usuario en la vista de detalle de incidencia, garantizando que los datos se presenten de forma amigable y útil. Esto implica reemplazar identificadores técnicos por nombres reales, dar contexto geográfico y enriquecer la visualización del historial y adjuntos.

## Alcance
- **Identidad y zona:** Resolución de datos para mostrar nombres legibles en lugar de UUIDs crudos.
- **Ubicación:** Visualización de ubicación legible acompañada de un mini-mapa interactivo con Leaflet.
- **Galería de imágenes:** Integración del componente `incident-images` para la gestión visual.
- **Historial de estados:** Asignación del permiso `READ status-history` con denormalización de datos. Requiere un *bump* de `permission_version` replicando el precedente de las migraciones 0052, 0055 y 0056.
- **Comentarios:** Visualización del hilo de comentarios sin bloqueos en la interfaz.

## Fuera de alcance
- **Feed con parámetro `limit`:** `GET /api/incidents/feed?limit=5` devuelve **400** porque `FeedQueryDto` no declara `limit` (usa `per_page`) y el `ValidationPipe` global con `forbidNonWhitelisted: true` lo rechaza. Es independiente del detalle y queda como hallazgo fuera de alcance; no se toca en esta iteración.
- Actualizaciones en tiempo real del detalle (sincronización vía WebSockets).

## Enfoque
- Renderizar el mini-mapa (Leaflet) de forma segura, omitiendo el contenedor si la incidencia carece de coordenadas válidas.
- Aprovechar los datos denormalizados servidos para zona y autor, evitando peticiones en cascada desde el frontend.
- Crear una nueva migración SQL siguiendo el patrón exacto de las versiones 0052/0055/0056 para asegurar la propagación correcta del permiso `READ status-history` y el correspondiente incremento de versión.
- Desplegar la galería reutilizando el componente estándar `incident-images`.

## Riesgos
- **Migración de permisos:** Un error en la asignación del `permission_version` podría bloquear el acceso al historial de estados para los usuarios legítimos.
- **Performance de carga:** Cargar el mapa de Leaflet y la galería simultáneamente requiere cuidado para no penalizar el tiempo inicial de renderizado del detalle.
