# Requerimientos: Módulo de Autenticación Angular

## 1. Gestión de Sesión y Autenticación
- El sistema DEBE proveer un `AuthService` inyectable globalmente que orqueste las operaciones de autenticación.
- El sistema DEBE consumir el endpoint `/api/auth/login` enviando el `device_uuid` para autenticar la aplicación y obtener los tokens de sesión (`access_token` y `refresh_token`).
- El sistema DEBE almacenar el `access_token` y `refresh_token` de forma segura en el cliente (ej. `localStorage`) para persistir la sesión entre recargas.
- El sistema DEBE consumir el endpoint `/api/auth/me` para obtener el perfil del usuario actual (que incluye `user_id`, `device_uuid` y `permissions`) y mantener este estado sincronizado en memoria para el resto de la aplicación.
- Durante el cierre de sesión, el sistema DEBE llamar a `/api/auth/logout`, limpiar los tokens del almacenamiento local, resetear el estado de la sesión en memoria y redirigir a la vista de login o vista pública predeterminada.

## 2. Interceptor HTTP y Rotación de Tokens
- El sistema DEBE proveer un `HttpInterceptor` que adjunte automáticamente el `access_token` como un Bearer token en el encabezado `Authorization` para todas las peticiones HTTP salientes hacia la API.
- Cuando una petición HTTP retorne un error `401 Unauthorized`, el sistema DEBE interceptar dicho error, pausar las peticiones subsecuentes y ejecutar una llamada a `/api/auth/refresh` utilizando el `refresh_token`.
- Tras una rotación de tokens exitosa, el sistema DEBE actualizar los tokens almacenados, reanudar las peticiones pausadas y reintentar la petición original que falló.
- Si el proceso de rotación de tokens falla (ej. `refresh_token` expirado o inválido), el sistema DEBE desautenticar al usuario forzando un logout.

## 3. Protección de Rutas (Guards)
- El sistema DEBE proveer un `AuthGuard` que evalúe si existe una sesión activa y válida antes de permitir la navegación hacia rutas protegidas.
- Cuando un usuario no autenticado intente acceder a una ruta protegida, el `AuthGuard` DEBE denegar el acceso y redirigir al usuario a la página de login.
- El sistema DEBE proveer un `PermissionGuard` análogo a la implementación previa de GeoReporta, que evalúe si el usuario autenticado posee los permisos específicos (obtenidos en `/api/auth/me`) requeridos por los metadatos de la ruta (`data.permissions`).
- Cuando un usuario autenticado carezca de los permisos necesarios para una ruta, el `PermissionGuard` DEBE denegar el acceso y redirigir hacia una página de acceso denegado o no encontrado (fail closed).

## 4. Estado Reactivo
- El sistema DEBE exponer el estado actual del usuario (autenticado, cargando, permisos) como un flujo de datos unidireccional utilizando Signals de Angular 17 o Observables (RxJS), permitiendo que los componentes de la interfaz reaccionen en tiempo real.
