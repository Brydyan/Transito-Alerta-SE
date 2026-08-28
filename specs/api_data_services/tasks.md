# Tasks - Servicios de Entidades de API (Feature 10)

- [x] T1 — Refactorizar el archivo existente `src/app/core/services/incident.service.ts` para que inyecte `HttpService` e incluya un `BehaviorSubject` para manejar el estado reactivo (`incidents$`). Cubre: R1, R2.
- [x] T2 — Implementar en `IncidentService` los métodos CRUD (`getIncidents`, `getIncident`, `createIncident`, `updateIncidentStatus`, `deleteIncident`), asegurando que las mutaciones (crear, actualizar, borrar) afecten al `BehaviorSubject` interno al retornar el éxito. Cubre: R1, R2.
- [x] T3 — Crear `src/app/core/services/comment.service.ts` definiendo la clase `CommentService` provista en root. Debe poseer métodos para obtener (`getComments`), crear (`createComment`) y eliminar (`deleteComment`) utilizando el `HttpService`. Cubre: R3.
- [x] T4 — Crear `src/app/core/services/notification.service.ts` definiendo la interfaz interna `Notification` (usando `snake_case`). Implementar los métodos `getNotifications` y `markAsRead`. Cubre: R4.
- [x] T5 — Generar o añadir pruebas unitarias simples que validen que estos servicios sean inyectables (instanciación básica) para satisfacer el flujo de validación.
