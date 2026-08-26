# Design - Servicios de Entidades de API (Feature 10)

## Arquitectura y Decisiones Técnicas

### 1. Inyección de Dependencias
**Decisión:** Todos los servicios (`IncidentService`, `CommentService`, `NotificationService`) serán marcados con `@Injectable({ providedIn: 'root' })`.
**Justificación:** Al ser servicios que manejan estado de negocio global o actúan como proxies de red compartidos, deben existir como Singletons a lo largo del ciclo de vida de la aplicación.

### 2. Manejo de Estado (IncidentService)
**Decisión:** Se utilizará RxJS (`BehaviorSubject`) para almacenar en caché las incidencias.
**Justificación:** T2 exige explícitamente el uso de observables y `BehaviorSubject` para el estado (`incidents$`). Aunque Angular 17 introduce Signals, la especificación de T2 pide adherirse al paradigma asíncrono con RxJS para estos servicios core, facilitando flujos de datos donde componentes múltiples comparten y reaccionan al mismo arreglo de incidencias.

### 3. Delegación al HttpService
**Decisión:** Se inyectará el `HttpService` (Feature 9) en los 3 servicios.
**Justificación:** Esto nos garantiza que los tokens JWT, manejo de errores y parametrización de query params (para los filtros en `getIncidents`) sean procesados adecuadamente, manteniendo los servicios limpios de configuración HTTP nativa.

## Archivos a Crear / Modificar
- `[MOD] src/app/core/services/incident.service.ts`: (Se creó un mock en la Feature 5, ahora se implementará de forma completa).
- `[NEW] src/app/core/services/comment.service.ts`.
- `[NEW] src/app/core/services/notification.service.ts`.
