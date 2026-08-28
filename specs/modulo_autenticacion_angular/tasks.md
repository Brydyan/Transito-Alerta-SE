# Tareas: Módulo de Autenticación Angular

A continuación, se listan las tareas incrementales y atómicas requeridas para implementar esta característica. Deben ser ejecutadas en orden.

- [x] 1. Crear el directorio `src/app/core/auth/` con sus subdirectorios `models/`, `services/`, `interceptors/`, y `guards/`.
- [x] 2. Crear el archivo `auth.models.ts` definiendo las interfaces para `AuthTokens`, `User`, `LoginDto` y `RefreshDto`.
- [x] 3. Crear el servicio base `auth.service.ts` utilizando la inyección raíz (`providedIn: 'root'`) y configurando un `Signal` (o `BehaviorSubject`) para almacenar el estado del `currentUser`.
- [x] 4. Implementar los métodos `login`, `refresh`, `me` y `logout` dentro del `AuthService`, asegurando que llamen correctamente a los endpoints de la API (`/api/auth/...`) usando el `HttpClient`.
- [x] 5. Implementar el almacenamiento de tokens (`access_token`, `refresh_token`) usando `localStorage` en los flujos de éxito de login y refresh, y su respectiva limpieza en el logout.
- [x] 6. Crear el archivo `auth.interceptor.ts` definiendo un `HttpInterceptorFn` que extraiga el `access_token` del `localStorage` y lo inyecte como un header `Authorization: Bearer <token>`.
- [x] 7. Extender `auth.interceptor.ts` para capturar respuestas con estado `401 Unauthorized`, pausar la ejecución de las peticiones fallidas, y lanzar el proceso de refresco invocando `authService.refresh()`.
- [x] 8. Terminar el flujo del interceptor para que reintente las peticiones originales encoladas en caso de refresco exitoso, o bien ejecute un logout forzado en caso de fallo del refresco.
- [x] 9. Registrar el `authInterceptor` en el `app.config.ts` utilizando `provideHttpClient(withInterceptors([authInterceptor]))`.
- [x] 10. Crear el archivo `auth.guard.ts` como `CanActivateFn`, el cual verifique de manera síncrona/asíncrona si el usuario está autenticado, redirigiendo a la ruta `/login` en caso contrario.
- [x] 11. Crear el archivo `permission.guard.ts` como `CanActivateFn`, adaptando la lógica del viejo `permissionGuard.js` (GeoReporta). Debe cruzar los permisos expuestos en la definición de ruta (`route.data['permissions']`) contra los del `currentUser` en el `AuthService`.
- [x] 12. Escribir pruebas unitarias (o de integración) básicas para `AuthService` comprobando los flujos de login y logout.
- [x] 13. Escribir pruebas para `authInterceptor` simulando el caso de éxito, el error 401 y el reintento.
- [x] 14. Escribir pruebas para `permission.guard.ts` asegurando que falla de forma cerrada (Fail Closed) al derivar a un NotFound cuando los permisos no coinciden.
