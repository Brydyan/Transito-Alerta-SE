# Diseño: Módulo de Autenticación Angular

Este documento describe las decisiones de diseño y arquitectura para el módulo de autenticación en el nuevo frontend de Transito-Alerta-SE (Angular 17+ Standalone).

## 1. Estructura de Directorios

Se utilizará una arquitectura basada en características transversales ubicadas en el directorio `core`. El módulo se estructurará de la siguiente manera:

```text
src/app/core/auth/
├── models/
│   └── auth.models.ts        # Interfaces: User, AuthTokens, LoginDto, RefreshDto
├── services/
│   └── auth.service.ts       # Lógica central, manejo de estado reactivo y llamadas HTTP
├── interceptors/
│   └── auth.interceptor.ts   # Inyección de Bearer y rotación de tokens en caso de HTTP 401
└── guards/
    ├── auth.guard.ts         # Protección de rutas por estado de sesión
    └── permission.guard.ts   # Protección de rutas basándose en claims/permissions del usuario
```

## 2. Paradigma Funcional (Angular 17+)

Dado que el proyecto utiliza componentes standalone y APIs modernas de Angular 17+:
- **Guards**: `authGuard` y `permissionGuard` se implementarán utilizando `CanActivateFn` (funciones en lugar de clases que implementan interfaces).
- **Interceptors**: Se implementará como un `HttpInterceptorFn`, el cual se registrará en el `app.config.ts` usando `provideHttpClient(withInterceptors([authInterceptor]))`.
- **Estado Reactivo**: `AuthService` expondrá el estado del usuario mediante Angular `Signal` (ej. `user = signal<User | null>(null)`). Esto simplifica el consumo en los componentes y evita problemas de desuscripción de RxJS (`Observables`) para el simple renderizado de UI dependiente del estado del usuario.

## 3. AuthService y Estado

El `AuthService` es la única fuente de verdad (Single Source of Truth) para la identidad del usuario. 
- Mantiene las variables de estado reactivas.
- Actúa como fachada para los métodos de la API (`login`, `refresh`, `me`, `logout`).
- Al realizar `login` o cuando se hidrata la aplicación (ej. `APP_INITIALIZER`), el servicio lee el `localStorage`, y si existen tokens válidos, despacha la petición `/api/auth/me` para obtener los roles y permisos desde la base de datos (siguiendo el Security Principle de GeoReporta: no cachear roles permanentemente para evitar obsolescencia, validando contra `/me`).

## 4. AuthInterceptor y Refresh Rotation (Mutex)

La rotación del `refresh_token` debe manejar la concurrencia. Si hay múltiples peticiones en vuelo que retornan `401 Unauthorized` al mismo tiempo:
1. El interceptor captura el error.
2. Si ya hay una operación de refresco en progreso (mutex activado por una bandera `isRefreshing`), la petición se encola usando un `Subject`.
3. Si no hay refresco en progreso, bloquea, hace la petición a `AuthService.refresh()` e intenta obtener nuevos tokens.
4. Al éxito: actualiza los tokens, libera el mutex, y reintenta las peticiones encoladas.
5. Al fallo: libera el mutex, limpia tokens y redirecciona al login forzoso.

## 5. PermissionGuard (Route Guards)

El `PermissionGuard` leerá la propiedad `data.permissions` configurada en la definición de la ruta. Por ejemplo:
```typescript
{
  path: 'admin',
  component: AdminComponent,
  canActivate: [authGuard, permissionGuard],
  data: {
    permissions: ['admin.dashboard.view']
  }
}
```
El guard verificará si el array de permisos del usuario (obtenido y mantenido en memoria por el `AuthService` vía `/api/auth/me`) contiene al menos uno de los permisos requeridos (o todos, dependiendo de la política acordada). Si falla la verificación, derivará silenciosamente a un componente genérico `/not-found` para fallar de manera cerrada (Fail Closed), idéntico al comportamiento en el viejo GeoReporta.
