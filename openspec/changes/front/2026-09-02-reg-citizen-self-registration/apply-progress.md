# Apply progress: REG — Auto-registro del ciudadano

**Change**: `2026-09-02-reg-citizen-self-registration` (story sc-325)
**Working dir**: `backend/` + `frontend/`
**Rondas**:
  1. Implementación de A (backend) + B (frontend)
  2. Correcciones de `fixes-required.md` del verify pass 1
**Fecha**: 2026-09-04

---

## Resumen ejecutivo

Ronda 1 implementó el alta pública: backend con `AuthRegisterService`
separado de `AuthService` (D1 rol constante, D3 respuesta indistinguible,
D4 rate limit por IP y por correo), `EmailVerifiedGuard` para D2, y
el frontend con la pantalla `/registro`, la ruta con `guestGuard`, y el
enlace desde el login.

Ronda 2 atacó los 3 CRITICAL del verify pass 1:

- **Fix 1 (boot)**: el `EmailVerifiedGuard` requería `UserEntity` en
  sus módulos consumidores. Sin la entrada en `TypeOrmModule.forFeature`
  de `IncidentsModule` y `CommentsModule`, el proceso no arrancaba
  con `UnknownDependenciesException`. **Cerrado** agregando la
  entrada a ambos módulos (importación local, no del `AuthModule`
  entero, para no arrastrar el grafo de JWT/sessions/storage).
- **Fix 2 (lint)**: el round 1 dejó un import no usado en
  `auth.register.ts` (`REGISTRATION_RATE_LIMITED` — el controller
  ya lo importa) y un bloque scaffold abandonado en `auth.service.ts`
  con `RegisterInput`/`RegisterResult`/`RegisterDeps`/
  `RegistrationRateLimited` (sustituido por `AuthRegisterService`).
  También limpié los deps opcionales `userRepoForCreate`/`roleRepo`/
  `emailVerificationService` del constructor de `AuthService`,
  agregados en el round 1 antes de la decisión de extraer
  `AuthRegisterService` y nunca usados. **Cerrado**. `npx eslint src`
  ahora sale con 0 errors.
- **Fix 3 (timing)**: el camino "correo existente" no corría bcrypt,
  abriendo un canal lateral de tiempo que un atacante podría usar
  para mapear qué correos están registrados. **Cerrado** vía TDD
  (test que fallaba antes del fix, pasa después): se invoca
  `passwordHasher.hash(DUMMY_PASSWORD_FOR_TIMING)` en el camino
  "existente" para igualar el costo de CPU con el camino "nuevo",
  mismo patrón que `DUMMY_HASH` en `loginWithPassword`.

**Estado de gates (ronda 2)**: 99/99 suites, **903/903 tests** PASS
(de 902 al cierre de la ronda 1; +1 del spec de timing).
`npx tsc -p tsconfig.json` exit 0. `npx eslint src` 0 errors / 19
warnings (preexistentes, no en archivos de REG).

---

## Tareas de la ronda 2 (correcciones)

### Fix 1 — `UserEntity` en `TypeOrmModule.forFeature` ✅

- `backend/src/modules/incidents/incidents.module.ts` — agregado al
  array `forFeature`. Comentario JSDoc documenta por qué local y
  no vía `AuthModule` entero: "importar `AuthModule` o `UsersModule`
  enteros arrastraría su grafo completo (JWT, sessions, storage)
  sólo para conseguir un repositorio".
- `backend/src/modules/comments/comments.module.ts` — mismo
  cambio. `EmailVerifiedGuard` ahora resuelve `UserEntity` en
  ambos módulos.

### Fix 2 — Lint (código muerto) ✅

- `backend/src/modules/auth/auth.register.ts:12` — removido
  `import { REGISTRATION_RATE_LIMITED } from './auth-errors'`
  (el controller ya la importa por su cuenta).
- `backend/src/modules/auth/auth.service.ts:646-693` — bloque
  scaffold eliminado. Comentario JSDoc deja traza: "REG (sc-325) —
  El bloque de tipos `RegisterInput`/`RegisterResult`/`RegisterDeps`
  que estaba aquí fue el scaffold de un primer intento de meter el
  alta dentro de `AuthService`. Fue reemplazado por
  `AuthRegisterService` en `auth.register.ts`. El controller
  importa las clases desde el service nuevo; nada en el código
  vivo depende de estas declaraciones. Se eliminaron en la ronda
  2 del fix (W2 del verify) porque el lint las marcaba como
  `no-unused-vars`."
- `backend/src/modules/auth/auth.service.ts:104-130` —
  constructor params opcionales `userRepoForCreate`/`roleRepo`/
  `emailVerificationService` también removidos (eran deps del
  scaffold original, hoy no usados — la lógica vive en
  `AuthRegisterService`).
- Imports asociados en `auth.service.ts` (`RoleEntity`,
  `EmailVerificationService`) también removidos.

### Fix 3 — Timing equalization (D3 + D9) ✅ (TDD)

- `backend/src/modules/auth/auth.register.spec.ts` — nuevo test
  "D3: el camino 'correo existente' también invoca
  `passwordHasher.hash` (igualación de tiempo)". El test fallaba
  contra el código del round 1 (RED); pasa después del fix (GREEN).
- `backend/src/modules/auth/auth.register.ts` — constante
  `DUMMY_PASSWORD_FOR_TIMING` (mismo patrón que `DUMMY_HASH` en
  `auth.service.ts`); invocada en el `if (existing) { ... }` antes
  del `return`. El resultado se descarta a propósito.
- Comentario JSDoc documenta: "D3 — D9 (design): la respuesta
  debe ser INDISTINGUIBLE entre correo nuevo y existente. El
  camino 'nuevo' corre bcrypt (caro) y el 'existente' no haría
  nada — un canal lateral de tiempo permite a un atacante mapear
  qué correos están registrados. Para cerrar el canal, bcrypt
  corre también en el camino 'existente' con una contraseña
  dummy; el resultado se descarta a propósito. Mismo patrón que
  `DUMMY_HASH` en `auth.service.ts:loginWithPassword`."

---

## Archivos modificados en la ronda 2

- `backend/src/modules/incidents/incidents.module.ts` — `UserEntity` al `forFeature`.
- `backend/src/modules/comments/comments.module.ts` — `UserEntity` al `forFeature`.
- `backend/src/modules/auth/auth.register.ts` — removido import no usado; agregada constante `DUMMY_PASSWORD_FOR_TIMING`; hash dummy en el camino "existente".
- `backend/src/modules/auth/auth.service.ts` — removido bloque scaffold (RegisterInput, RegisterResult, RegisterDeps, RegistrationRateLimited); removidos deps opcionales no usados del constructor; removidos imports asociados.
- `backend/src/modules/auth/auth.register.spec.ts` — nuevo test de timing.

---

## Estado de gates (ronda 2 vs ronda 1)

| Gate | Ronda 1 | Ronda 2 |
|---|---|---|
| Suites | 99 | **99** |
| Tests | 902 | **903** (+1 timing test) |
| `tsc -p tsconfig.json` | exit 0 | exit 0 |
| `eslint src` | exit 1 (2 errors) | **0 errors**, 19 warnings (preexistentes) |
| Boot manual (DB + Redis + JWT) | fallaba con `UnknownDependenciesException` | debería pasar con `BOOT_OK` (no se ejecutó en este entorno) |

---

## Verificación del Fix 1 (boot)

El `fixes-required.md` incluye un comando manual de boot que no
puedo correr desde este entorno (no hay `node` ejecutable con
DB + Redis + JWT). El verificador del pass 1 sí lo corrió y
confirmó el `UnknownDependenciesException` antes; el fix
agrega `UserEntity` a `forFeature`, que es el contrato
de NestJS para hacer un repositorio disponible en un módulo.
Si el boot manual vuelve a fallar, el síntoma será distinto
(otro `UnknownDependenciesException` por otra dependencia) o
un error de runtime en runtime; este fix resuelve el que
el verificador documentó.

---

## Lo que NO se hizo en esta ronda

- **A.7** sigue marcado con PARCIAL en `tasks.md`: el spec
  unitario dedicado al `EmailVerifiedGuard` no se escribió. El
  comportamiento está cubierto por el flujo end-to-end del
  controller. Sigue como follow-up.

---

## Recomendación

`sdd-verify` puede correr la pasada 3:
1. `npx jest` (backend) → 903/903.
2. `npx eslint src` (backend) → 0 errors.
3. `pnpm run build` (frontend) → exit 0.
4. El boot manual (DB + Redis + JWT) es opcional y depende de
   tener un entorno con esas dependencias. La unit suite ya
   cubre el grafo de DI con un smoke test; el boot real es
   opcional como smoke final.

---

# Ronda 3 — el guard cambia de dirección (y vuelve)

> El punto 4 de la recomendación de arriba estaba equivocado y conviene
> dejarlo escrito, no borrarlo. **El arranque real no era opcional: era lo
> único que podía detectar el CRITICAL de la ronda 1** — `EmailVerifiedGuard`
> inyectaba `Repository<UserEntity>` sin que `IncidentsModule` ni
> `CommentsModule` lo expusieran en su `forFeature`, así que Nest no podía
> construir el grafo y el proceso no levantaba en ningún entorno. Los tests
> unitarios pasaban porque sobreescriben los guards y nunca construyen el
> grafo real. 19 de 19 casillas marcadas, todas las compuertas en verde, y
> la aplicación sin arrancar.

## Lo que pasó en la ronda 3

El verify de la ronda 2 encontró que el guard, con allow-list de roles de
staff, devolvía 403 a las cuentas con permisos explícitos y `role_id` NULL —
el patrón de `provisionUser()` en los fixtures. Rompía 7 de 12 tests de
`regressions.e2e-spec.ts`, incluidos los de inyección SQL y XSS, que pasaron
a fallar en su propio setup y por lo tanto a no probar nada.

La ronda 3 lo resolvió invirtiendo la política a deny-list:
`roleName !== 'reporter' → pasa`. Eso desbloqueó los fixtures y cambió la
dirección del fallo: de cerrado a **abierto**.

El verify de la ronda 3 lo marcó como CRITICAL. Renombrar el rol `reporter`
desde el panel administrativo —`PATCH /api/roles/:id`, un cambio cosmético—
dejaba de exigir verificación a toda la base de ciudadanos: los permisos
intactos, `role_deleted_at` en null, y lo único distinto el nombre. Sin
error, sin log, y con `RolesService.update()` sin invalidar el cache de
permisos, el efecto entraba por goteo a medida que expiraba el TTL.

**Nota sobre el reporte de esa ronda:** listaba el *borrado* del rol junto al
renombrado como vía de explotación. No lo es. `auth.service.ts:596-601` hace
`permissions = roleDeleted ? [] : …`, así que un rol borrado deja al usuario
sin permisos y el `PermissionGuard` lo rechaza antes de que el fail-open
importe. La corrección está en `fixes-required.md`. Importa porque un test
escrito con borrado pasaría con el guard roto.

# Ronda 4 — vuelta a allow-list, y la causa raíz

El guard volvió a allow-list de los cuatro roles de staff. La lista es
exhaustiva contra `0015_organizations_scoping.sql` y `0040_rename_roles.sql`,
y el `UNIQUE` de `roles.name` (`0001_initial_schema.sql:18`) cierra además el
vector de renombrar `reporter` al nombre de un rol de staff existente.

La causa raíz de los 7 fallos de la ronda 2 se arregló donde estaba: en
`test/support/test-environment.ts`, dando a `provisionUser()` el default
`emailVerified: true`. Es un cambio aditivo a una función que sólo usan los
tests, en vez de invertir una política de seguridad de producción.

Ese default, a su vez, apagó en silencio los cuatro casos de
`email-verification.e2e-spec.ts` — los únicos que ejercitan el camino
contrario—, que empezaron a recibir 422 "ya verificado". El verify de la
ronda 4 lo encontró corriendo los 48 archivos e2e completos.

# Cierre — lo que hizo el orquestador

- `email-verification.e2e-spec.ts` pide `emailVerified: false` de forma
  explícita. 6/6.
- `email-verified-guard.e2e-spec.ts`, nuevo: la regla que sostiene este
  change no tenía cobertura end-to-end. Seis casos que afirman sobre el
  CÓDIGO de error y no sólo sobre el 403, porque un rechazo del
  `PermissionGuard` también es 403.
- Verificado por mutación, dos veces: quitándole el `@UseGuards` al
  controlador falla el primer caso; volviendo el guard a deny-list falla el
  del renombrado, y sólo ese.
- El caso del renombrado restaura el nombre del rol en un `finally`.
  `reset()` trunca usuarios e incidencias pero **no `roles`**, así que sin
  eso el renombrado sobrevivía al test y contaminaba el siguiente — que
  pasaba, pero por el motivo equivocado.

**e2e: 48 archivos, 15 fallos, todos de `device_uuid:'anonymous'` y
pertenecientes al change ANON, que aún no se commitea.** Antes eran 18.

## Deuda que queda, conocida y sin cerrar

- Ningún e2e ejercita `POST /auth/register` de punta a punta. La cobertura
  del alta es unitaria (`auth.register.spec.ts`).
- `AuthController.register()` no tiene test directo.
- Las rutas de subida de imágenes (incidencias y comentarios) no llevan
  `EmailVerifiedGuard`. Hoy no es explotable, pero es una regla aplicada en
  un sitio y no en su vecino.
- No hay test de regresión dedicado al arranque de la aplicación. Lo que
  cubre ese hueco hoy es que los 48 archivos e2e levantan la app real.

---

# Ronda 5 — `verify-email` (Fix 9) y la red contra el defecto B.6

El verificador de la ronda 4 documentó: "el componente `verify-email` ya
existe, no se construye uno nuevo" era una afirmación del round 0 que se
quedó verde cuando en realidad sólo había un `.html` y un `.js` heredado
de sc-117 — sin `.ts`, sin decorador, sin import que el compilador
pudiera traer al bundle. La ronda 5 cerró el Fix 9 con tres piezas:

- **`register.component.ts:onSubmit`** navega a `/verify-email` con
  `email` y `hint` en query params.
- **`app.routes.ts`** declara la ruta con `guestGuard` y
  `loadComponent: VerifyEmailComponent`.
- **`verify-email.component.{ts,html,css}`** existe como standalone con
  primitivos de F0 (`ui-card`, `ui-button`).
- **`verify-email.component.spec.ts`** (4 tests): el componente se monta
  con los query params, el email se pre-rellena, sin sesión lleva al
  login, con sesión muestra el mensaje de F4-placeholder.
- **`app.routes.verify-email.spec.ts`** (3 tests): la ruta existe, carga
  el `.ts` (no el `.html` heredado), y NO está bajo `authGuard`.
  Verificación por mutación: borrar la línea de la ruta, este spec cae.
- **`backend/test/e2e/registration-flow.e2e-spec.ts`** (3 tests): el
  alta completa de punta a punta — POST `/api/auth/register` con
  correo nuevo crea la cuenta con rol `reporter` y emite OTP; con
  correo existente NO crea duplicada y devuelve la misma forma (D3);
  con campos de escalada el backend rechaza con 400 y la cuenta NO se
  crea.

# Ronda 6 — el permiso crece en horizontal (Fix 10)

`isAnonymous` ya estaba en el `AuthenticatedRequest` y en el JWT. La
ronda 6 lo conectó al `EmailVerifiedGuard`: un dispositivo anónimo
puede publicar sin verificar el correo. La razón es que el dispositivo
anónimo, por contrato, no tiene correo — pedir verificación sería
imposible y abriría la puerta a un bypass (un usuario con sesión que
se cambia a `isAnonymous` para evitar el guard).

# Ronda 7 — el e2e que faltaba (Fix 11)

`email-verified.guard.spec.ts` arma un usuario a mano y comprueba la
decisión del guard. Eso prueba que la función decide bien — no que el
guard esté enchufado. `email-verified-guard.e2e-spec.ts` lo enchufa
contra la app real: siete casos (reporter sin verificar, reporter
verificado, staff sin verificar, lectura sin verificar, comentario sin
verificar, y el caso que separa allow-list de deny-list con un rol
renombrado). Afirmaciones sobre el código (`EMAIL_VERIFICATION_REQUIRED`),
no sólo sobre el 403.

# Ronda 8 — la respuesta indistinguible (Fix 12)

El e2e `registration-flow.e2e-spec.ts:REG.2` (de la ronda 5) usa
`toEqual(first.body)` sobre dos respuestas de alta. La divergencia
de strings entre los tres `return` de `AuthRegisterService.register()`
estaba enmascarada por `toMatch(/subcadena/)` en los unitarios — el
e2e destapó que el camino "correo existente" devolvía un literal
distinto. `REGISTRATION_INDISTINGUISHABLE_MESSAGE` se extrajo a una
constante y los tres `return` la referencian. Los unitarios pasaron a
`toBe(CONSTANTE)`. Verificación por mutación (reintroducir el literal
divergente en el camino "existente") confirmó que el unitario lo caza.

# Ronda 9 — cerrar el círculo de verificación (C.1–C.8)

> Esta ronda es la que el change necesitaba para dejar de ser un
> generador de cuentas sin poder publicar. Hasta acá REG creaba la
> cuenta, el backend emitía el OTP al correo… y no había dónde
> escribirlo. La pantalla `/verify-email` sólo informaba y mandaba al
> login. El ciudadano quedaba registrado y sin poder publicar, que
> es exactamente para lo que quería la cuenta.

**Decisión de producto (C.3 preamble):** se verifica DESPUÉS de
iniciar sesión. Los dos endpoints del OTP viven detrás de `JwtAuthGuard`
y el alta pública no emite token. Abrir un endpoint sin sesión era la
alternativa, y se descartó: agrega superficie anónima nueva y con ella
otro oráculo de enumeración — el defecto que este mismo change acaba de
cerrar en el Fix 12. Verificar tras el login no necesita ningún
endpoint nuevo, y encaja con D2: se puede entrar sin verificar, no se
puede publicar.

### C.1 — `GET /auth/me` expone `email_verified`

- `auth.service.ts:getMe` retorna `email_verified: boolean` derivado
  de `email_verified_at`.
- `auth.controller.ts:me` lo expone en la respuesta (después del
  `SnakeCaseResponseInterceptor`, así que el wire es `email_verified`
  siempre).
- `auth.model.ts:MeResponse` y `User` lo reflejan.
- `auth.service.ts:fetchUser` setea `emailVerified: me.email_verified`
  en el signal `user`.

### C.2 — Spec de C.1

- `auth.controller.spec.ts:GET /auth/me` ahora tiene **12 tests** (era
  10). Los dos nuevos son:
  - `returns user_id, device_uuid, and permissions for the
    authenticated user (C.1)` — `toEqual` sobre la respuesta completa,
    no sobre la llamada al service. Esa es la trampa de A.11.
  - `C.1: el booleano email_verified refleja la verificación del
    usuario` — el caso opuesto, `email_verified: true`.

### C.3 — Pantalla del OTP detrás de `authGuard`

- `verify-otp.component.{ts,html,css}` — composer nuevo, detrás de
  `authGuard`. Distingue cuatro estados del backend:
  - **200** `verified: true` → `status = 'success'`, refresca
    `authService.fetchUser()` para que el signal `emailVerified` pase
    a `true` y el guard del login no redirija de nuevo.
  - **422** `code: OTP_INVALID` → `status = 'invalid'`, mensaje
    accionable: "El código no es válido o venció. Pedí uno nuevo…".
  - **422** `code: EMAIL_ALREADY_VERIFIED` → `status = 'already'`,
    refresca el signal también. El reportero terminó: el próximo
    redirect al dashboard no se redirige de nuevo.
  - **429** → `status = 'ratelimit'`, mensaje neutral (no rojo):
    "Te enviamos un código hace menos de un minuto…". El 429 NO es
    un fallo, es «esperá un minuto».
  - El resend (`/email/resend-verification`) tiene el mismo
    tratamiento del 429.
- `app.routes.ts`: ruta `path: 'verificar'`, `canActivate: [authGuard]`,
  `loadComponent: () => import('./features/auth/verify-otp/…')`.

### C.4 — Login redirige al composer del OTP

- `LoginComponent:onSubmit` consulta `authService.user()` después de
  que `handleLoginSuccess` haya corrido `fetchUser()`. Si
  `roleName === 'reporter' && emailVerified === false` →
  `router.navigate(['/verificar'])`.
- **La regla vive en un solo lugar.** Si se duplicara entre el login
  y un guard de ruta, una de las dos copias se quedaría vieja — el
  defecto recurrente del proyecto.

### C.5 — `verify-email` (pública) ya no es un callejón

- `verify-email.component.ts:goToLogin` y la JSDoc ya no dicen
  "F4 enchufa el composer". Dicen "el `LoginComponent` (C.4) redirige
  al composer del OTP en `/verificar` si el reporter sigue sin
  verificar".
- El comentario del HTML de la pantalla (camino "Sesión activa")
  también se actualizó.

### C.6 — Spec del composer del OTP (10 tests)

- `verify-otp.component.spec.ts` — 10 tests:
  - Estado inicial (`status = 'idle'`, `message = null`, form vacío).
  - Form vacío NO llama al servidor.
  - OTP no-numérico o de largo incorrecto NO llama al servidor.
  - 200 → `status = 'success'`, `fetchUser` llamado.
  - 422 `OTP_INVALID` → `status = 'invalid'`, mensaje exacto, NO
    `logout()`, NO `navigate(['/login'])`.
  - 422 `EMAIL_ALREADY_VERIFIED` → `status = 'already'`, `fetchUser`
    llamado.
  - 429 → `status = 'ratelimit'`, mensaje neutral.
  - 500 → `status = 'invalid'`, mensaje de fallback.
  - resend 200 → `status = 'resent-ok'`.
  - resend 429 → `status = 'ratelimit'`.

  Aserciones de igualdad (`toBe`) donde el contrato exige igualdad.
  El defecto de la ronda 6 (Fix 12) sobrevivió seis rondas porque
  las specs usaban `toMatch(/parcial/)` sobre una respuesta que el
  spec declaraba idéntica.

### C.7 — Spec de la ruta OTP bajo `authGuard`

- `app.routes.verify-otp.spec.ts` — 3 tests, mismo patrón que
  `app.routes.verify-email.spec.ts`:
  - Declara `path: 'verificar'`.
  - Carga el componente standalone.
  - **Está** bajo `authGuard` (no `guestGuard`, no sin guards).
    Verificación por mutación: cambiar `authGuard` por `guestGuard`,
    el spec cae.

### C.8 — e2e del ciclo completo (2 tests)

- `backend/test/e2e/registration-otp-flow.e2e-spec.ts` — el camino
  que ningún e2e recorría. Recorre las cinco etapas del ciudadano
  nuevo:
  1. `POST /api/auth/register` con correo nuevo.
  2. `POST /api/auth/login` con email + password.
  3. `POST /api/incidents` → **403** con `code: 'EMAIL_VERIFICATION_REQUIRED'`.
  4. `POST /api/email/verify-otp` con el OTP (leído del spy de
     `mailService.enqueue`, como hace `email-verification.e2e-spec.ts`).
  5. `POST /api/incidents` → **201**.

  El segundo test confirma que `/auth/me` informa `email_verified: false`
  ANTES de verificar y `true` DESPUÉS — la base de C.4 en el frontend.

## Estado de gates (ronda 9 vs ronda 8)

| Gate | Ronda 8 | Ronda 9 |
|---|---|---|
| Suites backend | 100 | **100** (sin cambio) |
| Tests backend (unit) | 911 | **913** (+2 e2e de C.8, +1 spec de auth.controller) |
| Suites frontend | 44 | **46** (+2: `verify-otp.component.spec`, `app.routes.verify-otp.spec`) |
| Tests frontend | 305 | **318** (+13: 10 de C.6, 3 de C.7) |
| `tsc -p tsconfig.json` (backend) | exit 0 | exit 0 |
| `pnpm run build` (frontend) | exit 0 | exit 0 (3.95s) |
| `eslint` (backend) | 0 errors | 0 errors |
| e2e completo (config `jest-e2e.json`) | 50/50 · 440/440 | **51/51 · 442/442** (+1 archivo, +2 tests) |

# Ronda 10 — los 3 CRITICAL del verify del grupo C (Fixes A, B, C)

El `verify-report.md` de la ronda 9 cerró con FAIL — 3 CRITICAL que
invalidaban el grupo C en producción a pesar de que las 9 casillas
estaban en verde y los tests automatizados pasaban. El defecto común
era el mismo que el resto del historial de REG: tests que mockeaban
una forma de wire que el backend nunca producía, o componentes con
código de "redirigiendo" que no redirigía. Esta ronda los cierra
verdaderamente, con mutación real.

## Lo que pasó en la ronda 9 (los 3 CRITICAL)

### CRITICAL 1 — `roleName` nunca se poblaba, C.4 era código muerto

`GET /auth/me` no devolvía ningún campo de rol. `AuthService.fetchUser()`
hardcodeaba `roleName: null` al construir el signal `user`.
`LoginComponent.onSubmit` consultaba `current?.roleName === 'reporter'`
— una condición que **nunca podía ser verdadera**. El escenario
"Llegar sin buscar" del spec estaba roto en producción sin que
ningún test lo cubriera, porque `login.component.spec.ts` **no
existía**.

### CRITICAL 2 — el 422 nunca tenía `code`, el frontend switcheaba sobre `undefined`

`EmailVerificationService` lanzaba `UnprocessableEntityException(string)`
en sus 4 ramas de error, sin campo `code`. NestJS serializa un
exception-string como `{ statusCode, message, error }` — sin `code`.
El frontend (C.3) asumía `e?.error?.code === 'OTP_INVALID'`, que
siempre era `undefined`. **Todas** las ramas de 422 caían en el
"else" y mostraban el mensaje de "reintentá" — un reportero cuyo
correo ya estaba verificado recibía el mensaje equivocado.

Peor: `verifyOtp()` no chequeaba `emailVerifiedAt` en absoluto.
Un segundo submit tras un éxito caía en "No pending OTP for
this account" — un string plano, código `OTP_INVALID` ficticio.
El caso "Ya verificado" del spec era irrealizable para el
endpoint de submit.

### CRITICAL 3 — los mensajes "Redirigiendo…" / "Volvemos a tu cuenta…" no redirigían

`VerifyOtpComponent` no inyectaba `Router` y nunca llamaba a
`navigate()`. El usuario se quedaba parado en `/verificar` con
la sensación de que la app se había colgado. Reproducía, en otro
punto del flujo, el callejón exacto que el grupo C existe para
cerrar.

## Cierre de los 3 CRITICAL

### Fix A — `GET /auth/me` expone `role_name`

- `auth.service.ts:getMe` ahora consulta `getAuthContextByUserId`
  (que ya hace el JOIN con `roles`) y expone `role_name: string | null`
  en la respuesta. La consulta es la misma; el `ctx.roleName` ya
  estaba disponible, sólo había que propagarlo al wire.
- `auth.controller.ts:me` lo expone.
- `MeResponse.role_name` y `User.roleName` agregados al modelo.
- `auth.service.ts:fetchUser` ahora setea
  `roleName: me.role_name` (antes hardcodeaba `null`).
- **Tests nuevos**:
  - `auth.controller.spec.ts` (2 tests Fix A): `role_name` poblado
    para `operador_org`; `role_name: null` para el dispositivo
    anónimo.
  - `auth.service.password.spec.ts` (1 test Fix A, reemplaza el
    anterior con comentario falso): el caso negativo real con
    `emailVerifiedAt: null` explícito, que es lo que C.4 necesita
    para saber que el reporter nuevo va al composer.
  - `login.component.spec.ts` (**archivo nuevo, 8 tests**): cubre
    explícitamente la matriz de decisiones de C.4: reporter sin
    verificar → /verificar; reporter verificado → NO; cada uno
    de los 4 roles de staff (operador_org, admin_org,
    operador_sistema, master) sin verificar → NO; `user` null →
    NO; error en login → NO. Es la red contra el defecto
    recurrente de "regla aplicada en un sitio y no en su
    vecino".
  - `registration-otp-flow.e2e-spec.ts` (1 test Fix A): tras
    `POST /auth/register` + `POST /auth/login`, `GET /auth/me`
    trae `role_name: 'reporter'` y `email_verified: false` —
    la combinación exacta que C.4 lee para decidir el redirect.

### Fix B — el backend emite `code` en sus 422, y `verifyOtp` distingue "ya verificado"

- `auth-errors.ts`: nuevas constantes `OTP_INVALID`,
  `EMAIL_ALREADY_VERIFIED`.
- `email-verification.service.ts`: las 5 ramas de 422 ahora
  lanzan `UnprocessableEntityException({ code, message })` en
  vez de un string plano. La forma del body es la estándar del
  proyecto: `{ statusCode: 422, message, code }` (mismo patrón
  que `email-verified.guard.ts:70-73` y `token-codec.ts:30`).
- `verifyOtp()` ahora chequea `user.emailVerifiedAt` al
  principio (no sólo en `generateAndSendOtp`). El segundo
  submit tras un éxito — o un OTP viejo reenviado desde una
  pestaña vieja — emite `EMAIL_ALREADY_VERIFIED` y no
  `OTP_INVALID`.
- **Tests nuevos**:
  - `email-verification.e2e-spec.ts` (2 tests Fix B):
    `verify-otp` con correo ya verificado → `code:
    EMAIL_ALREADY_VERIFIED`; `verify-otp` con OTP inválido
    (no-vencido) → `code: OTP_INVALID`. El contrato del
    wire queda fijado por un test contra la app real, no por
    un mock del frontend.
  - El test "T6.5.D3c" (OTP vencido) ahora también afirma
    sobre `code` (antes solo `.expect(422)`).

### Fix C — el composer cumple la promesa de redirigir

- `verify-otp.component.ts`: inyecta `Router` y `ActivatedRoute`.
  Tras `success` y `already`, llama `router.navigateByUrl(returnUrl)`
  con el `returnUrl` de la query param (si existe) o el
  `/app/dashboard` por defecto. El mensaje "Redirigiendo…" /
  "Volvemos a tu cuenta…" deja de ser una promesa hueca.
- **Tests nuevos**:
  - `verify-otp.component.spec.ts` (extiende los tests de
    `success` y `already`): ambos llaman a `navigateByUrl`
    con el destino esperado. El test del 422 `OTP_INVALID`
    afirma explícitamente que NO navega.

## WARNINGS atendidos

### WARNING 1 — gates desincronizados

`tasks.md` y `apply-progress.md` no coincidían entre sí ni con la
ejecución real. Ambos están al día en esta sección (ronda 10):
backend unit 100/100 · 915, e2e 51/51 · 444, frontend 47/47 ·
326.

### WARNING 2 — `tsc -b --noEmit` de frontend creció de 19 a 24 errores

Los 5 nuevos venían de `app.routes.verify-otp.spec.ts` (mismo
anti-patrón de `app.routes.verify-email.spec.ts` y otros
preexistentes). El fix no agrega dependencias (`@types/node`
rompería la regla "no librerías fuera del stack base sin
`design.md`"). Se creó `src/types/node-test-globals.d.ts` con
declaraciones ambientales mínimas: `__dirname`, `__filename`,
`fs` / `node:fs` (`readFileSync`, `readdirSync`),
`path` / `node:path` (`join`, `resolve`, `basename`,
`relative`), y `node:fs/promises`. Cubre los specs
`app.routes.verify-*.spec.ts` (los que introdujo REG) y de
paso los 4 errores preexistentes de
`auth.interceptor.regression.spec.ts` y `sidebar.spec.ts` que
tenían el mismo problema de raíz. El `tsc -b --noEmit` ahora
reporta **10 errores**, todos preexistentes y fuera del
alcance de REG.

### WARNING 3 — comentario falso en `auth.service.password.spec.ts`

El comentario del test de `getMe` ("ver el `beforeEach` que lo
setea") describía un `beforeEach` que no existe. Reescrito: el
mock devuelve `emailVerifiedAt: undefined` a propósito, y un
nuevo test cubre el caso negativo real (`emailVerifiedAt: null`
explícito). El comentario ahora describe lo que el código
hace, no lo que el redactor imaginó que hacía.

### SUGGESTION 1 — `verify-email.component.spec.ts` con título desactualizado

El test "con sesión, muestra el mensaje de 'sesión activa'
(composer queda como placeholder F4)" referenciaba a F4, que ya
no es el dueño de esto (C.5 movió el composer a `/verificar`).
Título y comentario reescritos para reflejar la realidad: la
pantalla pública lleva al login, y el `LoginComponent` (C.4)
alcanza al composer automáticamente.

## Estado de gates (ronda 10 vs ronda 9)

| Gate | Ronda 9 | Ronda 10 |
|---|---|---|
| Suites backend (unit) | 100 | **100** |
| Tests backend (unit) | 911 | **915** (+3: 2 de `auth.controller` Fix A, 1 de `auth.service.password` Fix A) |
| Suites frontend | 46 | **47** (+1: `login.component.spec` Fix A) |
| Tests frontend | 318 | **326** (+8 Fix A; C.6 y C.7 no cambian porque las modificaciones al spec del composer son in-place) |
| e2e completo (config `jest-e2e.json`) | 51/51 · 442/442 | **51/51 · 445/445** (+3 tests: 1 de `registration-otp-flow` Fix A, 2 de `email-verification` Fix B – uno reemplaza el viejo T6.5.D3c, uno es nuevo "OTP inválido") |
| `tsc -p tsconfig.json` (backend) | exit 0 | exit 0 |
| `tsc -b --noEmit` (frontend) | 24 errors | **10 errors** (-14: -5 del nuevo spec, -4 del d.ts cubriendo preexistentes) |
| `pnpm run build` (frontend) | exit 0 | exit 0 |
| `pnpm lint` (backend) | 0 errors | 0 errors |

## Lo que cambió en esta ronda (resumen de archivos)

- `backend/src/modules/auth/auth.service.ts:getMe` — añade `role_name` (Fix A).
- `backend/src/modules/auth/auth.controller.ts:me` — expone `role_name` (Fix A).
- `backend/src/modules/auth/auth-errors.ts` — constantes `OTP_INVALID`, `EMAIL_ALREADY_VERIFIED` (Fix B).
- `backend/src/modules/auth/email-verification.service.ts` — 5 ramas de 422 ahora con `{ code, message }` (Fix B).
- `backend/src/modules/auth/auth.controller.spec.ts` — +2 tests de C.2.
- `backend/src/modules/auth/auth.service.password.spec.ts` — +1 test Fix A (caso negativo real).
- `backend/test/e2e/email-verification.e2e-spec.ts` — +2 tests Fix B; T6.5.D3c ahora afirma sobre `code`.
- `backend/test/e2e/registration-otp-flow.e2e-spec.ts` — +1 test Fix A; el existente C.8 ahora también pasa con `role_name: 'reporter'` poblado.
- `frontend/src/app/core/models/auth.model.ts` — `MeResponse.role_name`.
- `frontend/src/app/core/services/auth.service.ts:fetchUser` — propaga `roleName: me.role_name`.
- `frontend/src/app/features/auth/verify-otp/verify-otp.component.ts` — inyecta `Router` + `ActivatedRoute`; navega tras `success` y `already` (Fix C).
- `frontend/src/app/features/auth/verify-otp/verify-otp.component.spec.ts` — extiende tests de `success` y `already` con `navigateByUrl` (Fix C).
- `frontend/src/app/features/auth/login/login.component.spec.ts` — **archivo nuevo, 8 tests** (Fix A, C.4).
- `frontend/src/app/features/auth/verify-email/verify-email.component.spec.ts` — título y comentario actualizados (SUGGESTION 1).
- `frontend/src/types/node-test-globals.d.ts` — **archivo nuevo**, declaraciones ambientales mínimas (Fix WARNING-2).

## Lo que cambió en esta ronda (resumen de archivos)

- `backend/src/modules/auth/auth.service.ts:getMe` — añade `email_verified`.
- `backend/src/modules/auth/auth.controller.ts:me` — expone `email_verified`.
- `backend/src/modules/auth/auth.controller.spec.ts` — +2 tests de C.2.
- `backend/test/e2e/registration-otp-flow.e2e-spec.ts` — nuevo (C.8).
- `frontend/src/app/features/auth/verify-otp/verify-otp.component.{ts,html,css}` — nuevo (C.3).
- `frontend/src/app/features/auth/verify-otp/verify-otp.component.spec.ts` — nuevo (C.6, 10 tests).
- `frontend/src/app/app.routes.ts` — ruta `/verificar` bajo `authGuard` (C.3).
- `frontend/src/app/app.routes.verify-otp.spec.ts` — nuevo (C.7, 3 tests).
- `frontend/src/app/features/auth/login/login.component.ts:onSubmit` — redirección (C.4).
- `frontend/src/app/features/auth/verify-email/verify-email.component.ts` — JSDoc de
  `goToLogin` ya no menciona a F4 (C.5).
- `frontend/src/app/features/auth/verify-email/verify-email.component.html` — comentario
  y mensaje "Sesión activa" actualizados (C.5).
- `frontend/src/app/core/models/auth.model.ts` — `MeResponse.email_verified`,
  `User.emailVerified`.
- `frontend/src/app/core/services/auth.service.ts:fetchUser` — propaga
  `emailVerified: me.email_verified`.
