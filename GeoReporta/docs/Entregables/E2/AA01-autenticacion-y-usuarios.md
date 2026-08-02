# U4_AA01 — Implementación de autenticación y gestión de usuarios

**Proyecto:** Sistema de Incidencias Georreferenciadas
**Stack:** Laravel 13 (API REST) + SPA propia (Vanilla JS, hash-router)

---

## 1. Mecanismo de autenticación implementado

La autenticación es **stateless basada en JWT** (librería `lcobucci/jwt`), con sesiones respaldadas en base de datos para poder revocarlas server-side. No se usa Laravel Sanctum ni Breeze.

**Flujo de login** (`POST /api/login`, `AuthController::login`):
1. `AuthService` valida credenciales (`email` + `password` con `Hash::check`).
2. Se emite un **access token** JWT (TTL 900 s / 15 min) firmado con `JwtService`.
3. Se crea un registro de sesión en BD (`SessionRepository`) y se emite un **refresh token** opaco, entregado como cookie `HttpOnly`, `Secure` (en producción), `SameSite=Strict`, con path restringido a `/api/auth` y expiración de 30 días.
4. El cliente recibe `access_token` en el body (Bearer) y usa el refresh token vía cookie para renovar sesión en `POST /api/auth/refresh` sin reenviar contraseña.
5. `POST /api/logout` revoca la sesión en BD (`revokeSession`) e invalida las cookies (refresh token y Mercure).

**Autenticación alternativa:** login con Google vía Firebase (`GoogleAuthController`, dominio `App\Domains\Auth\Firebase`), reutiliza el mismo `AuthService`/emisión de JWT una vez validado el token de Google.

**Contraseñas:** hasheadas con `Hash::make` (bcrypt), nunca almacenadas ni logueadas en texto plano.

---

## 2. Middleware utilizados

| Middleware | Ubicación | Función |
|---|---|---|
| `jwt` (alias) → `JwtAuthenticate` | `App\Domains\Sessions\Http\Middleware\JwtAuthenticate` | Extrae el Bearer token (o cookie `access_token` para EventSource), lo valida con `JwtService`, verifica que la sesión exista, no esté revocada/expirada y coincida con el `user_id` del claim. Carga el `User` y lo inyecta en el request (`setUserResolver`) y en el facade `Auth` (`auth()->setUser()`), habilitando Gates/Policies. Responde `401` en cualquier fallo. |
| `throttle:register`, `throttle:google`, `throttle:feed` | `routes/api.php` | Rate limiting sobre endpoints públicos/sensibles (registro, login social, feed) para mitigar fuerza bruta y abuso. |
| `can:claim,incident` / `can:release,incident` | `routes/api.php` | Autorización a nivel de ruta vía Policies de Laravel para acciones puntuales sobre incidentes. |
| `InstrumentHttpRequests` | `app/Http/Middleware` | Añadido globalmente al grupo `api` (`bootstrap/app.php`) para observabilidad/logging de requests. |

Registro central en `bootstrap/app.php`:
```php
$middleware->alias(['jwt' => JwtAuthenticate::class]);
$middleware->api(append: [InstrumentHttpRequests::class]);
```

Todas las rutas protegidas están agrupadas bajo `Route::middleware('jwt')->group(...)` en `routes/api.php`; las públicas (`/login`, `/register`, `/auth/refresh`, `/auth/google`, `/health`) quedan explícitamente fuera del grupo.

**Autorización fina (RBAC):** además del middleware `jwt`, `UserController` usa `authorizeResource(User::class, 'user')`, que aplica `UserPolicy` en cada acción del CRUD (`viewAny`, `view`, `create`, `update`, `delete`). La policy discrimina por rol: `admin_sistema` accede a todo; `admin_organizacion`/operador solo a usuarios de su misma `organization_id` y con el permiso explícito (`users.view`, `users.update`, `users.delete`); un usuario común solo accede a su propio registro.

**Guards en el frontend** (SPA con router hash-based, `frontend/app/core/router.js`), equivalentes a `canActivate` de Angular:
- `authGuard`: exige `access_token` presente; si no, redirige a `/login`.
- `roleGuard(roles)`: exige token + rol permitido; si no corresponde, redirige a `/feed`.
- `permissionGuard`: consulta el menú/permisos reales del usuario (`GET /api/permissions/my`) contra la ruta solicitada; si no está autorizado, redirige a `/not-found` (fail-closed, no revela si la ruta existe).

---

## 3. Estructura del módulo de usuarios

Organización por dominio (`App\Domains\Users`), no MVC plano:

```
app/Domains/Users/
├── Models/User.php
├── Http/
│   ├── UserController.php          # apiResource: index/store/show/update/destroy/formData
│   ├── Requests/StoreUserRequest.php
│   ├── Requests/UpdateUserRequest.php
│   ├── Resources/UserResource.php
│   ├── Resources/UserCollection.php
│   └── Policies/UserPolicy.php     # RBAC (extends PermissionPolicy)
└── Repositories/
    ├── UserRepository.php          # interfaz
    └── EloquentUserRepository.php  # implementación
```

- **Controller** delgado: delega persistencia al `UserRepository` (patrón repositorio) y validación a `FormRequest`s dedicados.
- **CRUD expuesto** vía `Route::apiResource('users', UserController::class)`: `GET /api/users` (listado paginado + filtros), `POST /api/users` (crear), `GET /api/users/{id}` (detalle), `PUT/PATCH /api/users/{id}` (editar), `DELETE /api/users/{id}` (eliminar).
- `GET /api/users/form-data` entrega catálogos (roles, organizaciones) para el formulario, protegido con `authorize('viewAny', User::class)`.
- En frontend, módulo `frontend/app/usuarios` (listado, formulario) consumido desde rutas `/usuarios` y `/usuarios/crear`.

---

## 4. Evidencia de rutas protegidas

**Backend** (`routes/api.php`):
- Fuera del grupo `jwt` (públicas): `/login`, `/register`, `/auth/refresh`, `/auth/google`, `/health`.
- Dentro de `Route::middleware('jwt')->group(...)`: `/logout`, `/me`, `/auth/profile`, `/operator/*`, `/incidents/*`, `/notifications/*`, `/locations/*`, `/organizations/*`, `/incident-categories/*`, **`/users/*`**, `/roles/*`, `/permissions/*`, `/menus/my`. Cualquier request sin JWT válido recibe `401` antes de llegar al controlador.
- Autorización adicional por policy en `/users/*` (RBAC por rol/organización) y por middleware `can:` en acciones de incidentes.

**Frontend** (`frontend/app/app.js`):
- Rutas públicas: `/login` (sin guard).
- Rutas protegidas por sesión: `/feed`, `/feed/crear`, `/feed/:id`, `/configuracion/perfil` (`authGuard`).
- Rutas administrativas (incluye gestión de usuarios): `/usuarios`, `/usuarios/crear`, `/dashboard`, `/mapa`, `/organizaciones`, etc. protegidas con `permissionGuard`, que valida sesión **y** permiso específico (`users.view`, `users.create`, `users.update`) contra el backend antes de renderizar.
- Sin token → redirección a `/login`. Con token pero sin permiso → redirección a `/not-found` (no se filtra la existencia de la ruta).

---

**Conclusión:** el sistema combina autenticación JWT con sesiones revocables en BD (backend) y guards de ruta declarativos (frontend), reforzados por un modelo RBAC granular (permisos por recurso + alcance por organización) aplicado tanto a nivel de middleware/policy como de UI.
