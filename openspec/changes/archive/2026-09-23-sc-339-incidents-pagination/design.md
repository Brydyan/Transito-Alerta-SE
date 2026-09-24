# Design: Paginación de Incidencias (sc-339)

Este documento registra las decisiones arquitectónicas y de diseño implementadas para resolver la paginación de incidencias y la refactorización de controles de tamaño de página a lo largo del frontend.

## 1. Backend (NestJS)

### 1.1 DTO de Consulta Whitelisted
**Decisión**: Se introdujo el `IncidentListQueryDto` con `forbidNonWhitelisted: true`.
**Motivación**: Evita parámetros residuales u obsoletos que estaban causando problemas en la capa de datos. Ahora la API solo acepta `zone_id`, `status`, `page`, y `limit`.
**Comportamiento**: Cualquier parámetro ajeno (como `search`, `priority`, `category_id`, `per_page`) generará automáticamente un Bad Request (400). Los valores por defecto son `page=1` y `limit=20`.

### 1.2 Estrategia de Paginación en BD
**Decisión**: Uso de `COUNT(*)` + `LIMIT / OFFSET` parametrizados desde el Repository.
**Motivación**: Se estandariza el patrón con el de `Users` (`findAndCount`). Esto permite devolver un envelope `{ items, total }`, necesario para calcular el número total de páginas en el frontend.

### 1.3 Caché de Resultados
**Decisión**: Las llaves de caché toman el formato `incidents:list:{zone}:{status}:{scope}:{page}:{limit}`.
**Motivación**: Permite almacenar fragmentos de la vista paginada de forma atómica y ser invalidados de forma grupal mediante el tag de la zona cuando se detectan mutaciones.

## 2. Frontend (Angular)

### 2.1 Modelo y Servicio Envelope
**Decisión**: `IncidentListResult` ahora se tipea como `{ items, total }` y `IncidentService` sólo envía los 4 parámetros permitidos por el backend.
**Motivación**: Ajustar el cliente estrictamente al contrato actualizado de la API para prevenir errores 400.

### 2.2 Remoción del Patrón "Ver más datos" (Load-more)
**Decisión**: Se elimina completamente la estrategia de "Load-more" (carga acumulativa).
**Desviación de Proposal**: Aunque la propuesta inicial mencionaba reparar controles "load-more", la decisión real implementada fue **eliminar el código muerto y transicionar a paginación tradicional** con `<app-pagination>`, determinando `shouldShowPagination = total > pageSize`.
**Motivación**: Simplificación del DOM, mejora de la accesibilidad, reducción de estado acumulativo en memoria y homogeneidad con otros listados del sistema.

### 2.3 Refactorización de `pageSizeChange` (Señal y Estado)
**Decisión**: Estructurar los listados usando Signals (`pageSize`, `currentPage`, `total`, `items`) y alinearlos al patrón utilizado en `users-list`.
**Comportamiento Global**: Para todos los componentes que exponen `(pageSizeChange)` (incluyendo ahora `department-list`, `roles`, y el nuevo `incident-list`), al emitirse el evento:
1. Se actualiza el `pageSize()`.
2. Se **resetea** `currentPage()` a `1`.
3. Se invoca de nuevo la obtención de datos (`fetch()` o análogo).
**Motivación**: Consistencia global. El cambio de límite por página siempre debe devolver a la primera página para evitar offsets fuera de límite o estados de interfaz incongruentes.
