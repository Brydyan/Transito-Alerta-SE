# Tasks: Paginación de Incidencias (sc-339)

Todas las tareas listadas han sido implementadas y verificadas.

## Backend
- [x] Crear `IncidentListQueryDto` permitiendo solo `zone_id`, `status`, `page`, y `limit`.
- [x] Aplicar `forbidNonWhitelisted: true` en la validación del DTO.
- [x] Modificar `incidents.repository.ts` para usar `COUNT(*)` + `LIMIT/OFFSET`.
- [x] Ajustar `findAll` en `incidents.service.ts` para devolver `{ items, total }`.
- [x] Actualizar llave de caché en servicio a `incidents:list:{zone}:{status}:{scope}:{page}:{limit}`.
- [x] Modificar `incidents.controller.ts` para aceptar y rutear el nuevo DTO.

## Frontend
- [x] Actualizar `IncidentListResult` en `incident.model.ts` para coincidir con la respuesta `{ items, total }`.
- [x] Modificar `getIncidents()` en `incident.service.ts` para enviar solo parámetros permitidos.
- [x] Eliminar funcionalidad de "Load-more" (Ver más datos) de la lógica y la plantilla de `incident-list.component`.
- [x] Integrar `<app-pagination>` en el listado de incidencias.
- [x] Implementar handlers `onPageChange` y `onPageSizeChange` usando Signals en `incident-list.component.ts`.
- [x] Estandarizar `pageSizeChange` (reiniciando `page=1`) en `department-list`.
- [x] Estandarizar `pageSizeChange` (reiniciando `page=1`) en `roles`.

## Tests y Validación
- [x] Refactorizar pruebas frontend para reflejar la eliminación de "Load-more".
- [x] Agregar pruebas frontend cubriendo el comportamiento de `pageSizeChange` y la paginación.
- [x] Validar que las suites de Backend pasan exitosamente sin romper endpoints preexistentes.
