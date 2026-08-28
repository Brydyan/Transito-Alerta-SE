# Tasks - Modelos Base y HTTP Wrapper (Feature 9)

- [x] T1 — Modificar el archivo existente `src/app/core/models/auth.model.ts` para integrar las interfaces de la nueva API en `snake_case` (como `AuthResponse`, el nuevo `User` con `device_uuid`, etc.) garantizando R1.
- [x] T2 — Crear el archivo `src/app/core/models/incident.model.ts` y definir las interfaces `Incident` y `CreateIncidentDto`, asegurándose de utilizar las propiedades geográficas `lat` y `lng`. Cubre: R1, R2.
- [x] T3 — Crear el archivo `src/app/core/models/comment.model.ts` y definir las interfaces `Comment` y `CreateCommentDto`. Cubre: R1.
- [x] T4 — Crear el servicio `HttpService` en `src/app/core/services/http.service.ts` marcado con `@Injectable({ providedIn: 'root' })` e inyectar `HttpClient`. Cubre: R3.
- [x] T5 — Implementar el método `get<T>(endpoint: string, params?: any): Observable<T>` en `HttpService`, integrando un loop que construya una instancia válida de `HttpParams` si existen parámetros, y que concatene la URL base (ej. `/api`). Cubre: R4, R5.
- [x] T6 — Implementar los métodos genéricos `post<T>`, `patch<T>` y `delete<T>` en `HttpService`, concatenando también la URL base. Cubre: R3, R5.
- [x] T7 — Escribir el archivo de pruebas `src/app/core/services/http.service.spec.ts`, utilizando `HttpTestingController` para verificar que el método `get` procesa y envía correctamente el objeto de parámetros (Query Params) y que la URL destino es correcta. Cubre: R3, R4, R5.
