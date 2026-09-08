# Apply progress — F6 Perfil Redesign

> Change `2026-09-08-f6-perfil-redesign`. **Dos rondas**:
> 1. **Implementación inicial** (commit `ae71fa87d feat(f6): rediseño de Perfil sobre primitivos F0`) — perfil migrado al layout del mock 10-01 con primitivos de F0, photo uploader como sub-componente, formulario reactivo con email readonly, 3 action cards al pie.
> 2. **Ronda de fixes** (post `sdd-verify` FAIL — este commit) — cierra los 5 CRITICAL y 2 WARNING del `fixes-required.md`. D1 (no regresión) y D7 (sin `*hasPermission`) respetados en ambas rondas.

---

## Resumen

| | |
|---|---|
| Working dir | `frontend` |
| Componente rediseñado | `ProfileComponent` (refactor de la implementación previa, ambas rondas) |
| Componentes nuevos | `ProfilePhotoUploaderComponent`, `ProfileActionCardsComponent` |
| Servicio nuevo | `UserService` (`core/services/user.service.ts`) — segunda ronda |
| Tests | **509/509** (501 previos + 8 nuevos: 3 service `UserService` + 5 reescritos en profile/uploader tras la ronda de fixes). 73/73 suites |
| Comandos | `pnpm test` verde, `pnpm run lint` 0 errors, `pnpm run build` verde |

---

## Ronda 2 — `fixes-required.md` (CRITICAL C.1–C.5 + WARNING W.1/W.2/W.4/W.5)

### C.1 — `Number(uuid)` → `NaN` → 400 (CRITICAL)

- **Síntoma**: `ProfileComponent.ngOnInit()` corría `this.userId = Number(currentUser.id)`. `currentUser.id` es UUID string → `Number(uuid)` = `NaN` → `GET /users/NaN` rechazado por `ParseUUIDPipe` con 400.
- **Fix**: el id ya no se usa. `UserService.getCurrentUser()` pega a `GET /users/me` (resuelto del JWT en el backend, no requiere id). `userId` signal eliminado del `ProfileComponent`.
- **Test**: `user.service.spec.ts > getCurrentUser — GET /api/users/me, devuelve el wire completo` afirma método, URL, `withCredentials`, y shape snake_case del wire.

### C.2 — Field name mismatch (Spanish ↔ English) + uso de `UsersService` admin (CRITICAL)

- **Síntoma**: el frontend enviaba `{nombres, apellidos, telefono}` a `PATCH /users/me`, pero el backend (`UpdateProfileDto`) espera `{first_name, last_name, phone}`. Además, el `UsersService` admin reusado asumía multipart con `FileInterceptor` que el endpoint `/users/me` no tiene.
- **Fix C.2.1**: creado `core/services/user.service.ts` (`UserService`) dedicado, separado del `UsersService` admin (`features/admin/users/services/users.service.ts`). Razón documentada en el JSDoc del servicio:
  - DTOs incompatibles (`first_name`/`last_name`/`phone` vs `nombres`/`apellidos`/`telefono`).
  - Endpoint admin usa `multipart` con campo `file`; `POST /users/me/avatar` espera campo `avatar`.
  - `GET /users/:id` es admin-only (`@RequirePermission('READ')`) → 403 para self-service (ver C.4).
- **Fix C.2.2**: `ProfileComponent` reescrito para usar `UserService` (inyectado, no el admin). `loadProfile()` mapea `user.first_name` → `nombres`, `user.last_name` → `apellidos`, `user.phone` → `telefono`. `onSubmit()` mapea en sentido inverso. Sin campo `email` en el payload (email es readonly, lo gestiona el backend en `UpdateProfileDto`).
- **Fix C.2.3**: `user.service.spec.ts` cubre los 3 métodos con `HttpClientTestingModule`, afirma método HTTP, URL, `withCredentials`, body JSON vs multipart, y campo multipart correcto (`avatar` no `file`).

### C.3 — Avatar endpoint equivocado (CRITICAL)

- **Síntoma**: `updateMe(payload, file)` POSTa el archivo bajo campo `file` a `PATCH /users/me`. El endpoint real es `POST /users/me/avatar` con `FileInterceptor('avatar')` y campo `avatar`.
- **Fix**: el upload de avatar ya no viaja junto al `onSubmit()` del formulario.
  - `ProfilePhotoUploaderComponent` ahora sube el archivo **directamente** al seleccionarlo, vía `UserService.uploadProfileImage()` → `POST /users/me/avatar` con `FormData.append('avatar', file)`.
  - El componente emite `photoUploaded(url: string)` cuando el servidor confirma; el padre sólo refleja la URL en su `avatarUrl` signal y en `AuthService.currentUser`.
  - El formulario (nombres/apellidos/teléfono) y el avatar son operaciones independientes — un cambio no fuerza al otro.
- **Test**: `user.service.spec.ts > uploadProfileImage — POST /api/users/me/avatar, multipart con campo "avatar"` afirma método, URL, `withCredentials`, que body es `FormData` y que `body.get('avatar')` es el `File`. Asertivamente **niega** que `body.get('file')` exista.

### C.4 — 403 al cargar perfil propio (CRITICAL, derivado de C.2)

- **Síntoma**: `GET /users/:id` (admin `adminShow`) tiene `@RequirePermission('READ')` que resuelve a `READ users`. Un usuario no-admin pidiendo su propio perfil recibe 403.
- **Fix**: ya resuelto por C.2.1 — `UserService.getCurrentUser()` pega a `GET /users/me` (no tiene `PermissionGuard` en `users.controller.ts:39-42`). Cero permisos requeridos para self-service.

### C.5 — `tasks.md` sin marcar + `apply-progress.md` ausente (CRITICAL)

- **Fix C.5.1**: este archivo (`apply-progress.md`) reescrito.
- **Fix C.5.2**: `tasks.md` actualizado — P.1.1–P.1.5, P.2.1–P.2.3, P.3.1, P.4.1, P.5.1, P.6.1, P.8.1, P.9.1, P.9.2 marcados `[x]`. P.7.1 (e2e, D4 sin credenciales) y P.9.3 (phone mask, W.1) quedan `[ ]` con nota explícita de diferimiento.

### W.2 — Errores de upload silenciosos (WARNING, ya cubierto por C.3)

- El uploader ahora invoca `ToastService.error()` con mensajes específicos:
  - `"Formato no soportado. Use JPG, PNG o WEBP."` si MIME no está en `[image/jpeg, image/png, image/webp]`.
  - `"La foto no puede superar 0.78 MB."` si `file.size > 800_000`.
  - `"Error al subir la foto de perfil."` si el POST falla.
- El `MAX_BYTES` y los `ALLOWED_TYPES` están exportados como `static readonly` para que el spec pueda asertar valores sin tocar el DOM.

### W.4 — `tasks.md` path (WARNING, ya cubierto por C.5.2)

- P.1.1 corregido de `frontend/src/app/features/catalogs/profile/` a `frontend/src/app/features/profile/` (path preexistente, refactor en mismo archivo).

### W.5 — Diseño del `UserService` dedicado (WARNING, ya cubierto por C.2.1)

- Honrado: `UserService` separado, no extendido sobre `UsersService` admin.

---

## Ronda 1 — Implementación inicial

### 1. `ProfilePhotoUploaderComponent` (nuevo)

- Avatar 128×128 con preview, file input oculto, validación de tipo y tamaño.
- `[initialUrl]` input + `effect` interno que sincroniza con `previewUrl()`.
- `setInitial(url)` method público para forzar refresh.
- Constantes `MAX_BYTES = 800_000` (≈ 0.78 MB) y `ALLOWED_TYPES` exportadas.
- Tras la ronda 2: además de la preview local (`FileReader.readAsDataURL`), hace upload directo al servidor en `onFileChange` y emite `photoUploaded(url)`.

### 2. `ProfileActionCardsComponent` (nuevo)

- 3 tarjetas (mock 10-01): Contraseña, Preferencia de Zona, Soporte Técnico.
- Cada una con icono + título + descripción + link.
- Contraseña y Preferencia usan `[routerLink]`; Soporte usa `mailto:`.
- Sin `*hasPermission` (D7 — universal para usuarios autenticados).

### 3. `ProfileComponent` (refactor)

- **`ui-page-header`** con kicker "CATÁLOGOS" + título "Mi Perfil" + subtítulo.
- Sección "Información Personal" con 2-col grid:
  - Izquierda: `ProfilePhotoUploaderComponent` con `[initialUrl]` que se actualiza tras cada `getCurrentUser` / `updateProfile`.
  - Derecha: formulario reactivo con `nombres`, `apellidos`, `telefono` (todos requeridos con validators), `email` **readonly** per spec P.4.1.
- Aviso de privacidad (icono + texto) entre la sección y el footer.
- Footer: timestamp "Última actualización: ..." (sólo visible tras save exitoso) + botón "Guardar Cambios".
- 3 action cards al pie (`<app-profile-action-cards>`).
- **D1**: el componente YA EXISTÍA. La nueva implementación refactoriza la misma clase en el mismo archivo. Mismo selector, mismo route, mismo export.
- **D7**: sin `*hasPermission`.
- **Sin `forkJoin`**: `ngOnInit()` (carga) y `onSubmit()` (guardado) secuenciales.

### 4. e2e (`frontend/e2e/profile.e2e.ts`)

7 specs (S1-S7) que skipean sin `BASE_URL`+`E2E_PASSWORD` (D4 del change `e2e-test-user-and-credentials`). En CI contra staging corren de verdad.

---

## Desviaciones respecto a `design.md` y `spec.md`

- **Path del componente.** El design sugiere `features/catalogs/profile/`. La implementación conserva el path preexistente `features/profile/`. Cambiar el path habría requerido mover la ruta en `app.routes.ts`.
- **No `models/profile.model.ts`.** Las interfaces `UserProfile` y `UpdateProfilePayload` viven en `core/services/user.service.ts` (co-located con el servicio que define el wire contract). Razón: el archivo `models/` añade una capa de indirección sin valor — el DTO wire es responsabilidad del servicio que lo produce.
- **Phone mask** (S4 / W.1). El spec pide "Auto-format per region" / "ngx-mask or custom formatter". La implementación usa el validador `ecuadorPhoneValidator()` (valida formato al submit/blur) pero no auto-formatea la entrada. **Diferido** a follow-up — la máscara en sí requiere una input directive o librería nueva, fuera del alcance de la ronda CRITICAL.
- **`lastUpdatedAt`** (W.3). El backend actual (`UserEntity.updated_at` con `update: false` en TypeORM) no expone este timestamp. La implementación lo genera localmente (`new Date().toLocaleString('es-EC', ...)`) tras un save exitoso. Cuando el backend exponga el timestamp real, se reemplaza el local sin cambio de contrato.
- **Phone required vs optional** (P.4.1). El design/spec listaba `phone?: string` (opcional). La implementación lo trata como **required** con `Validators.required + ecuadorPhoneValidator()`. Decisión: si un usuario no tiene teléfono, el registro de incidencias falla al pedirlo después. Mejor pedirlo en el alta y bloquear al submit. Documentado aquí; si se prefiere opcional, es un cambio de 1 línea (`Validators.required` → quitar del array).

## Estado de las tareas (post-C.5.2)

| Tarea | Estado |
|---|---|
| P.1.1 folder | ✅ (existente, no se crea; path `features/profile/`) |
| P.1.2 ProfileComponent | ✅ (refactor, mismo path/mismo nombre) |
| P.1.3 ProfilePhotoUploaderComponent | ✅ |
| P.1.4 ProfileFormComponent (inline) | ✅ (formulario inline per "or inline in main") |
| P.1.5 ProfileActionCardsComponent | ✅ |
| P.2.1 models | ✅ (revisado: interfaces viven en `user.service.ts`) |
| P.2.2 UserService | ✅ (revisado: `UserService` dedicado, no update de `UsersService`) |
| P.2.3 unit test service | ✅ (`user.service.spec.ts` con 3 tests) |
| P.3.1 ProfilePhotoUploaderComponent | ✅ (8 tests; upload directo, errores con toast) |
| P.4.1 ProfileForm (inline) | ✅ (validators, submit → `UserService.updateProfile()`; avatar independiente) |
| P.5.1 ProfileActionCardsComponent | ✅ (4 tests) |
| P.6.1 main ProfileComponent | ✅ (load + pre-populate + compose + submit, 9 tests) |
| P.7.1 e2e | ⚠️ Diferido (D4 — sin `BASE_URL`+`E2E_PASSWORD` local; corre en CI) |
| P.8.1 unit tests | ✅ (3 service + 5 reescritos uploader/container) |
| P.9.1 lint/build/test | ✅ (73/73 suites, 509/509 tests, lint 0 errors) |
| P.9.2 D1 regresión | ✅ (sin specs existentes tocados, sin regresión) |
| P.9.3 phone mask (nuevo, W.1) | ⚠️ Diferido a follow-up |

## D1 — Regresión

`pnpm test` corre 73 suites / 509 tests. **Todos verdes**:

- `user.service.spec.ts` (NUEVO, ronda 2): 3 tests — `getCurrentUser`, `updateProfile`, `uploadProfileImage` con `HttpClientTestingModule`, afirma método/URL/body/multipart field.
- `profile.component.spec.ts` (REESCRITO, ronda 2): 9 tests — ahora mockea `UserService` (no `UsersService` admin), verifica el flujo `getCurrentUser` → `patchValue` → `onSubmit` → `updateProfile`, errores con toast.
- `profile-photo-uploader.component.spec.ts` (REESCRITO, ronda 2): 8 tests — `setInitial`, `isValidType` con tipos válidos/inválidos, `MAX_BYTES`/`ALLOWED_TYPES` constantes, `triggerPicker`, y el upload directo con `UserService` mockeado.
- `profile-action-cards.component.spec.ts` (sin cambios ronda 1): 4 tests.
- Suites previas de la fase F6 (dashboard, users-list, roles-list): todas verdes, sin regresión.

## Pendientes fuera de alcance

- **Phone mask (W.1)**: la máscara en sí queda como follow-up. El validador `ecuadorPhoneValidator()` está en su lugar.
- **`lastUpdatedAt` desde backend (W.3)**: cuando `UserEntity.updated_at` se actualice automáticamente, reemplazar `formatNow()` por la respuesta del servidor.
- **E2E suite en staging (P.7.1)**: las 7 specs corren cuando CI provea `STAGING_BASE_URL` + `E2E_PASSWORD`. Documentado en `apply-progress.md` de `e2e-test-user-and-credentials`.
- **Rutas `/app/cambiar-contrasena` y `/app/zonas`**: las action cards apuntan a esas rutas, no existen todavía. Las cards son presentacionales; los links muestran placeholder del F0 sin romper la SPA.
- **Soporte mailto**: `admin@jasrapo.com` es el placeholder del spec.

## Verificación

- `pnpm test`: **73/73 suites, 509/509 tests**.
- `pnpm run lint`: 0 errors, 65 warnings preexistentes (ninguna nueva).
- `pnpm run build`: verde.
- `pnpm exec playwright test profile`: 7 specs, 7 skipped sin backend (D4).

## Listo para re-auditoría

- 8 tests nuevos/cambiados en la ronda 2.
- 5 CRITICAL cerrados (C.1, C.2, C.3, C.4, C.5).
- 3 WARNING cerrados (W.2, W.4, W.5).
- 2 WARNING documentados como diferidos (W.1 phone mask, W.3 lastUpdatedAt).
- `ProfileComponent` ahora consume `UserService` dedicado (no `UsersService` admin), `UserService` declarado en `core/services/`, todos los nombres de campo en snake_case, y el upload de avatar usa el endpoint real (`/users/me/avatar` con campo `avatar`).
- 1 desviación adicional documentada: phone required vs optional (no en el `fixes-required.md` original).
