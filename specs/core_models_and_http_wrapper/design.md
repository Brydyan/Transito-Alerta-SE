# Design - Modelos Base y HTTP Wrapper (Feature 9)

## Arquitectura y Decisiones Técnicas

### 1. Definición de Modelos (Interfaces)
**Decisión:** Se emplearán interfaces puras de TypeScript (`export interface`) alojadas en la capa `src/app/core/models/`.
**Justificación:** A diferencia de las clases, las interfaces en TypeScript desaparecen tras la transpilación (cero peso en el bundle final). No es necesario hidratar objetos en clases complejas para una aplicación de presentación, manteniendo el estado simple e inmutable.

### 2. Convención `snake_case`
**Decisión:** Las claves de las propiedades se escribirán obligatoriamente en `snake_case` dentro de los modelos (ej. `created_at`, `device_uuid`).
**Justificación:** Según las reglas establecidas en `T2_ANGULAR_SERVICES.md`, el interceptor del lado del backend (`SnakeCaseResponseInterceptor`) devuelve todos los datos en este formato. Apegarse a esta norma en el frontend elimina la necesidad de serializadores adicionales en cada capa de los servicios Angular. Para archivos preexistentes como `auth.model.ts`, se adaptarán sus propiedades para cumplir con el estándar y con los requerimientos de la PWA.

### 3. Patrón Wrapper para HttpClient
**Decisión:** Encapsular `HttpClient` en una clase `HttpService`.
**Justificación:** Centralizar las operaciones base (`get`, `post`, `patch`, `delete`) otorga un único punto de control. Si a futuro es necesario integrar lógicas globales para peticiones, re-intentos de bajo nivel o cambiar de `HttpClient` a otra tecnología (como `fetch` nativo), el impacto será mínimo en los servicios de negocio de la aplicación. 
Además, el `HttpService` asume de entrada que la autorización y el manejo de errores se delegará a los interceptores (`AuthInterceptor`, `ErrorInterceptor`) desarrollados en features anteriores, delegándole únicamente la construcción limpia de las peticiones.

## Archivos a Crear / Modificar
- `[MOD] src/app/core/models/auth.model.ts`: Se adaptará para agregar propiedades necesarias (`device_uuid`, `role` estructurado, etc.) en `snake_case` respetando campos requeridos.
- `[NEW] src/app/core/models/incident.model.ts`: Declarará `Incident` y `CreateIncidentDto`.
- `[NEW] src/app/core/models/comment.model.ts`: Declarará `Comment` y `CreateCommentDto`.
- `[NEW] src/app/core/services/http.service.ts`: Abstracción HTTP inyectable.
- `[NEW] src/app/core/services/http.service.spec.ts`: Suite de pruebas unitarias para el wrapper.
