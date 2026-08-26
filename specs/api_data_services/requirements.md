# Requirements - Servicios de Entidades de API (Feature 10)

## R1
El sistema DEBE proveer un `IncidentService` que utilice el `HttpService` para comunicarse con la API de incidencias (`/incidents`), permitiendo operaciones CRUD completas (listar con filtros, obtener por ID, crear, actualizar estado y eliminar).

## R2
El `IncidentService` DEBE mantener un estado reactivo local (`BehaviorSubject`) de las incidencias obtenidas, y cada operación de mutación (crear, actualizar, eliminar) DEBE actualizar automáticamente este estado en memoria para reflejarse instantáneamente en los componentes suscritos.

## R3
El sistema DEBE proveer un `CommentService` que consuma los endpoints de comentarios anidados a una incidencia (`/incidents/:id/comments` y `/comments/:id`).

## R4
El sistema DEBE proveer un `NotificationService` con una interfaz `Notification` que respete el formato de la API (`snake_case`). Este servicio DEBE permitir obtener la lista de notificaciones (`/notifications`) y marcar una en específico como leída (`PATCH /notifications/:id/read`).
