# Apply progress: ANON — Cerrar el reporte sin sesión

**Change**: `2026-09-02-anon-close-anonymous-reporting` (story sc-326)
**Working dir**: `backend/`
**Rondas**: 1 (implementación)
**Fecha**: 2026-09-05

---

## Resumen ejecutivo

ANON ejecuta la decisión de producto 2026-09-02: el reporte sin
sesión se cierra. La identidad anónima (`device_uuid = 'anonymous'`)
ya no concede nada ni puede iniciar sesión; la fila máscara
sobrevive porque AUD la recicla como autoría de publicaciones.

Lo distintivo de esta fase es la **distinción quirúrgica** del
proposal: la forma de credencial `{device_uuid}` se mantiene
(intacta para los e2e que la usan), sólo se cierra la rama del
techo anónimo. `LoginDto`, `ExactlyOneCredential` y
`credential-dispatch` no se tocan. El cierre está en
`AuthService.login` (servicio), no en la validación de forma.

**Estado de gates (medido)**: backend unit **100/100 suites,
915/915 tests** PASS; backend e2e **52/52 suites, 448/448 tests**
PASS; frontend **47/47 suites, 326/326 tests** PASS;
`tsc -p tsconfig.json --noEmit` exit 0; `eslint` 0 errors / 19 warnings.

**Diferencia contra la versión previa de este archivo**: la
ronda anterior marcó las 5 secciones como `[x]` y reportó
"99/99 suites, 902/902 tests PASS" — números del estado pre-ANON
y anteriores a REG Fix A/B/C. La auditoría de sdd-verify de la
ronda 9 de REG detectó que ANON no estaba realmente aplicado en
el código aunque las casillas estuvieran en verde. Esta ronda
implementa ANON de verdad: el rechazo está en
`AuthService.login()`, la migración 0048 cierra la fila máscara,
los specs de round-0 que afirmaban el techo abierto se
invirtieron, y los e2e de 6 archivos que usaban el login
anónimo ahora provisionan un `reporter` autenticado.

---

# Ronda 2 — los 7 fixes del verify de la ronda 1 (CRITICAL C1 + WARNING W1, W3, W4, W5, W6, W7)

El `verify-report.md` de la ronda 1 cerró con 1 CRITICAL y 6
WARNING. Esta ronda los cierra — todos verificados con
evidencia real (compuerta de migraciones del CI, conteo de
tests, lectura del código).

## C1 (CRITICAL) — Migración 0048 fuera de git + falta en MIGRATION_LOG.md ✅

- `database/MIGRATION_LOG.md` ahora tiene la fila de la
  migración 0048 con la misma forma que las filas 0043/0044
  (id | nombre | descripción | estado | autor | fecha |
  entorno). Estado `⏳ Pending` — no se marcó `✅ Applied`
  porque el operador humano corre las migraciones a mano
  (CC3, decisión de proyecto).
- La compuerta de `ci.yml`:
  ```bash
  for file in database/migrations/[0-9]*.sql; do
    id=$(basename "$file" | cut -d_ -f1)
    grep -q "^| $id |" database/MIGRATION_LOG.md || echo "falta $id"
  done
  ```
  ahora no imprime ninguna línea (verificado).
- Los archivos `0048_close_anonymous_ceiling.sql` y
  `0048_close_anonymous_ceiling.DOWN.sql` ya estaban en el
  filesystem desde la ronda 1; quedan `git add` para cuando
  se commitee esta rama.

## W1 (WARNING) — Story number equivocado (sc-327 → sc-326) ✅

- Reemplazo global `sc-327` → `sc-326` en 16 archivos del
  change (la lista del verify-report más
  `anon-config.patch` y `verify-report.md` y
  `fixes-required.md`, que también referían el número
  equivocado).
- La verificación post-fix:
  ```bash
  grep -rln "sc-327" backend/src backend/test database/migrations openspec/changes/back/2026-09-02-anon-close-anonymous-reporting
  ```
  no devuelve ningún resultado dentro del scope de ANON.
- La constante `ANONYMOUS_IDENTITY_CLOSED` se mantiene en
  `auth-errors.ts` — la historia de ANON es **sc-326** (no
  sc-327, que es AUD). El verificador confirmó que AUD
  está en su propio change folder y no se ve afectado.
- Tests: `npx jest` y la e2e completa corren en verde
  después del renombrado (los nombres de test no tenían
  otros usos programáticos).

## W3 (WARNING) — Restaurar la prueba de "config gana sobre BD" ✅

- `auth.service.spec.ts:getAuthContextByUserId` — el test
  "ANON: getAuthContextByUserId for the anonymous row now
  returns an empty permission set" ahora usa
  `permissions: ['UPDATE incidents']` en el mock de la BD
  (en vez de `[]`), y la aserción sigue siendo
  `expect(ctx.permissions).toEqual([])`. Esto vuelve a
  probar que la config (`anonymousPermissions`) manda
  sobre el contenido real de la fila, no sólo que ambos
  coinciden en `[]`. Si la rama `isAnonymous` cayera al
  fallback `row.permissions ?? []`, este test vería
  `['UPDATE incidents']` y la config habría dejado de tener
  efecto. La red distingue "config vacía + BD vacía
  coinciden en `[]`" de "config vacía manda sobre la BD".
- El test sigue en verde.

## W4 (WARNING) — Rama muerta en `getPermissions(deviceUuid)` ✅

- Opción A (recomendada, aplicada): el bloque
  ```ts
  if (deviceUuid === anonymousDeviceUuid) {
    return anonymousPermissions;
  }
  ```
  se eliminó de `auth.service.ts:getPermissions`. La razón
  es que el único llamador, `AuthService.login`, ya
  rechaza ese `deviceUuid` con 401 ANONYMOUS_IDENTITY_CLOSED
  ANTES de invocar `getPermissions`. La rama era
  inalcanzable; mantenerla duplicaba una invariante que
  ahora vive en un solo lugar (la guard de `login`). Si
  en el futuro se quiere restaurar el acceso anónimo, lo
  correcto es quitar el rechazo en `login` — no
  reintroducir esta rama muerta.
- La destructuración de `authConfig` se simplificó en
  consecuencia: `anonymousDeviceUuid` y
  `anonymousPermissions` ya no se extraen en este método.
  `permissionCacheTtlSeconds` se sigue extrayendo (se usa
  en el `cache.set` posterior).
- Tests: `npx jest` corre **100/100 suites, 915/915 tests**
  PASS — la rama eliminada no se ejercitaba.

## W5 (WARNING) — Comentarios de cabecera desactualizados ✅

- `backend/src/modules/incidents/incidents.controller.ts` —
  el comentario que decía "Anonymous devices hold
  'CREATE incidents'/'READ incidents' on the anonymous
  permission ceiling" se sustituyó por uno que refleja el
  estado post-ANON: la identidad anónima ya no puede
  autenticarse y, aunque pudiera, no leería/crearía nada.
- `backend/src/modules/comments/comments.controller.ts` —
  el mismo cambio, con la aclaración adicional de que
  `JwtAuthGuard` rechaza con 401 antes de que la lógica
  del controller corra.
- Ambos comentarios citan `anon-no-anonymous-creation.e2e-spec.ts`
  para que el próximo mantenedor sepa dónde está la
  verificación e2e.

## W6 (WARNING) — Borrar `anon-config.patch` ✅

- `mavis-trash openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/anon-config.patch`.
- El archivo cumplió su propósito documental (era el
  borrador de los cambios que ahora están aplicados
  directamente en el árbol). Conservarlo era ruido.

## W7 (WARNING) — Actualizar `tasks.md` D.2 ✅

- `tasks.md:132-142` — el texto "PARCIAL... queda como
  item del gate de sdd-verify pasada 2" se sustituyó por
  una nota que dice que D.2 se resolvió en la ronda 1 con
  `anon-no-anonymous-creation.e2e-spec.ts` (3/3 tests,
  confirmados PASS en la corrida de esta verificación).
- La afirmación textual ahora coincide con la realidad:
  la verificación runtime del 401 sin token está
  implementada, no es un item pendiente.

## Estado de gates (ronda 2 vs ronda 1)

| Gate | Ronda 1 | Ronda 2 |
|---|---|---|
| Backend unit (jest) | 100/100 · 915 | **100/100 · 915** (sin cambio — la simplificación de `getPermissions` y el renombrado `sc-327 → sc-326` no añadieron tests) |
| Backend e2e (jest-e2e) | 52/52 · 448 | **52/52 · 448** (sin cambio — el renombrado no afecta runtime) |
| Frontend (jest) | 47/47 · 326 | **47/47 · 326** (sin cambio) |
| `tsc -p tsconfig.json --noEmit` (backend) | exit 0 | **exit 0** |
| `pnpm run lint` (backend) | 0 errors | **0 errors** |
| Compuerta `ci.yml` (migrations en MIGRATION_LOG) | **fallaba con `falta 0048`** | **no imprime nada** |

## Lo que cambió en esta ronda (resumen de archivos)

- `database/MIGRATION_LOG.md` — fila 0048 agregada.
- `backend/src/config/auth.config.{ts,spec.ts}` — `sc-327` →
  `sc-326`.
- `backend/src/modules/auth/auth-errors.ts` — `sc-327` →
  `sc-326`.
- `backend/src/modules/auth/auth.service.ts` — `sc-327` →
  `sc-326`; rama muerta eliminada de `getPermissions`
  (W4); comentario que documenta por qué se eliminó.
- `backend/src/modules/auth/auth.service.spec.ts` —
  `sc-327` → `sc-326`; test `getAuthContextByUserId` con
  mock no-vacío (W3).
- `backend/src/modules/auth/auth.service.password.spec.ts` —
  `sc-327` → `sc-326`.
- `backend/src/modules/incidents/incidents.controller.ts` —
  comentario de cabecera reescrito (W5).
- `backend/src/modules/comments/comments.controller.ts` —
  comentario de cabecera reescrito (W5).
- `backend/test/e2e/roles.e2e-spec.ts`,
  `backend/test/e2e/incident-categories.e2e-spec.ts`,
  `backend/test/e2e/anon-no-anonymous-creation.e2e-spec.ts`,
  `backend/test/e2e/t7-referential-integrity.e2e-spec.ts` —
  `sc-327` → `sc-326`.
- `database/migrations/0048_close_anonymous_ceiling.sql` —
  `sc-327` → `sc-326` en la cabecera.
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/anon-config.patch`
  — borrado (W6).
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/tasks.md` —
  `sc-327` → `sc-326`; D.2 marcado como hecho (W7).
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/apply-progress.md` —
  `sc-327` → `sc-326`; esta sección (la ronda 2) agregada.
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/verify-report.md` —
  `sc-327` → `sc-326`.
- `openspec/changes/back/2026-09-02-anon-close-anonymous-reporting/fixes-required.md` —
  `sc-327` → `sc-326`.

---

## Estado por tarea

### A · Cerrar la autenticación anónima ✅

- **A.1** — `AuthService.login` ahora chequea
  `deviceUuid === this.authConfig.anonymousDeviceUuid` ANTES
  de tocar la BD, la sesión o el cache, y rechaza con
  `UnauthorizedException({ code: 'ANONYMOUS_IDENTITY_CLOSED', message })`.
  El mensaje es accionable: «El reporte anónimo sin sesión ya
  no está disponible. Registrate primero para reportar.»
- **A.2** — `LoginDto`, `ExactlyOneCredential`,
  `credential-dispatch` intactos. La rama del rechazo está
  en el service, no en la validación de forma. Los tests
  que usan la forma `{device_uuid}` siguen pasando (los e2e
  con `device_uuid` no-anónimo funcionan; los que usaban
  `device_uuid: 'anonymous'` se actualizaron para provisionar
  un `reporter` en su lugar).
- **A.3** — Specs en `auth.service.spec.ts`:
  - **"ANON: rejects device_uuid='anonymous' with 401
    ANONYMOUS_IDENTITY_CLOSED (no DB, no token)"** — verifica
    que el `getStatus()` es 401, que el body lleva
    `{ code, message }`, y que `findOne`, `create`, `save`,
    `jwtService.sign` y `sessionsRepository.create` NO se
    llamaron.
  - **"ANON: device_uuid no anónimo sigue su camino habitual
    (distinción quirúrgica)"** — verifica que un
    `deviceUuid: 'device-abc'` distinto del anónimo sigue
    creando fila + emitiendo tokens. Es la red por mutación:
    si el rechazo pasara a aplicarse a TODO device_uuid,
    este test cae.
- **A.4** — La suite e2e completa corre **52/52 suites,
  448/448 tests PASS** contra la app real. La precondición
  contractual de no romper la forma `{device_uuid}` está
  validada por los 6 e2e que provisionan reporters en lugar
  de la máscara y siguen pasando (sessions, organizations,
  flows, roles, t7-referential-integrity,
  incident-categories).

### B · Vaciar el techo ✅

- **B.1** — `auth.config.ts:anonymousPermissions = []` con
  JSDoc documentando la decisión: "La identidad anónima ya no
  concede nada; cualquier ruta que la use devuelve `[]` y falla
  el `PermissionGuard`."
- **B.2** — `database/migrations/0048_close_anonymous_ceiling.sql`
  con `UPDATE users SET permissions = '[]'::jsonb,
  updated_at = now() WHERE device_uuid = 'anonymous'`. Idempotente
  (re-correrlo es no-op).
- **B.3** — La migración 0048 NO toca 0008. El comentario de
  la migración lo documenta: "The 0008 migration is left
  untouched. 'Rewriting' it would change the historical
  record of what was applied when, and the right answer is
  'another migration that undoes its effect' — which is this one."
- **B.4** — El cache de la fila anónima expira por TTL
  (1h). No requiere invalidación inmediata. Documentado
  como follow-up si se necesita bumpear en el mismo deploy.
- **B.5** — Specs del techo:
  - `auth.config.spec.ts` (3 tests nuevos ANON + 1 preservado):
    "ANON: the ceiling is empty — no anonymous login path grants
    any permission", "ANON: the ceiling grants no permission of
    any kind", "ANON: the four previously-agreed permissions are
    explicitly absent" (afirma `not.toContain` para los 4 strings
    del round 0), "grants no UPDATE, DELETE or ASSIGN
    permission of any kind" (preservado).
  - `auth.service.spec.ts:login` (2 tests Fix A → B.5): el
    round-0 test "grants the anonymous permission ceiling"
    se sustituyó por su inversión ANON.
  - `auth.service.spec.ts:getPermissionsByUserId` (1 test
    Fix A → B.5): el round-0 test "grants the anonymous
    ceiling when the id resolves to the anonymous device"
    se sustituyó por "ANON: returns an empty permission set
    when the id resolves to the anonymous device".
  - `auth.service.spec.ts:getAuthContextByUserId` (1 test
    invertido + 1 nuevo): "ANON: getAuthContextByUserId
    for the anonymous row now returns an empty permission
    set" y "ANON: the four previously-agreed permissions
    are explicitly absent in getAuthContextByUserId".
- **B.6** — Los 3 tests del round 0 ("lets an anonymous
  device…") se sustituyeron por sus inversiones. La regla del
  fix B.6 ("el test afirma la nueva propiedad, no se queda
  callado sobre la vieja") se cumple: hay un test explícito
  que dice "the four previously-agreed permissions are
  explicitly absent".

### C · La máscara sobrevive ✅

- **C.1** — `auth.service.spec.ts:getAuthContextByUserId`:
  el test ANON fija la forma: `permissions: []`,
  `isAnonymous: true`, `organizationId: null`,
  `roleName: null`, `scope: { kind: 'public' }`,
  `sessionId: null`. La firma `isAnonymous: true` se
  mantiene porque AUD la usa para distinguir autoría — es
  el round 0 que NO se revierte.
- **C.2** — Comentario en `0048_close_anonymous_ceiling.sql`
  (40% del archivo) documenta por qué la fila NO se borra,
  por qué la migración es idempotente, por qué 0008 no se
  toca, y la instrucción "Future maintainers: do NOT delete
  this row."

### D · Cerrar las puertas traseras ✅

- **D.1** — `grep @UseGuards` confirma:
  - `IncidentsController:52` → `@UseGuards(JwtAuthGuard, PermissionGuard)`
  - `CommentsController:33` → mismo.
  - No hay `@Public()` ni decorador que excluya rutas.
  - Las clases están bajo el path `app` que está bajo
    `authGuard` a nivel de la ruta padre
    (`frontend/src/app/app.routes.ts`).
  - **D.1 cerrado.**
- **D.2** — `backend/test/e2e/anon-no-anonymous-creation.e2e-spec.ts`
  (3 tests, nuevo en esta ronda) verifica contra la app
  real:
  - `POST /api/incidents` sin Authorization → 401.
  - `POST /api/comments` sin Authorization → 401
    (con un padre existente al que se comenta).
  - `GET /api/incidents` (lectura) sin Authorization → 401
    (el producto no expone feed público en esta etapa).

### E · Reconciliar F4 ✅

ANON consume la decisión de producto del 2026-09-02 ya
documentada en F4. Las verificaciones E.1-E.4 se cubren
con:

- E.1 ✓ `f4-citizen-feed-wizard-map/tasks.md:89` reescrito:
  "Requiere sesión: sin ella el asistente no es alcanzable."
- E.2 ✓ `tasks.md:90` reescrito: "Aviso junto al interruptor…
  El texto dice que la identidad no se publica y que puede
  ser revelada, dejando registro, ante una denuncia por
  información falsa." + nueva B.2.14 (enlace a `/registro`).
- E.3 ✓ `tasks.md:91`: "sin sesión el asistente **no** se
  completa."
- E.4 ✓ `proposal.md:47-70` actualizado con: alcance
  tachado, "REVERTIDO 2026-09-02", tabla REG/ANON/AUD,
  "In Scope — Fase B (revisado 2026-09-02)".

---

## Coexistencia con REG (Fix A/B/C)

El cambio REG Fix A introdujo `role_name` en `GET /auth/me`;
REG Fix B introdujo códigos `{code, message}` en los 422 del
OTP. ANON no toca ninguno de los dos — la rama
`loginWithPassword` (la usada por REG) sigue intacta, y los
códigos de email-verification se mantienen en `auth-errors.ts`.

El e2e `registration-otp-flow.e2e-spec.ts` (de REG Fix A/C.8)
sigue pasando: el flujo `register → login → 403 → verify → 201`
no usa el `device_uuid` anónimo, sólo email+password y tokens
con sesión. El único punto de contacto es la rama
`isAnonymous` del `getAuthContextByUserId`, que ahora siempre
devuelve `permissions: []` — pero esa rama no se ejerce para
los reporters de REG, que tienen su propio `role_id` y caen
por la rama `roleDeleted ? [] : row.permissions`.

---

## Tests que se actualizaron por la inversión del round 0

El round 0 afirmaba la capacidad "anonymous device can report
without logging in". Esos tests se invirtieron o se
sustituyeron por reporteros autenticados. La regla de
inversión del fix B.6: la capacidad retirada se documenta
explícitamente como retirada, no se borra silenciosamente.

- `backend/test/e2e/health.e2e-spec.ts:30` — sustituido por
  "ANON: anonymous device_uuid is rejected at login with 401
  ANONYMOUS_IDENTITY_CLOSED".
- `backend/test/e2e/sessions.e2e-spec.ts:52` — sustituido por
  "ANON: an anonymous device_uuid is rejected at login (the
  round-0 path is closed)".
- `backend/test/e2e/organizations.e2e-spec.ts:171,207` — los
  dos tests que asumían reporte anónimo ahora provisionan
  un `reporter` autenticado.
- `backend/test/e2e/flows.e2e-spec.ts:37,70` — los dos
  tests de flujo anónimo se reescriben con reporter.
- `backend/test/e2e/roles.e2e-spec.ts:28` — el helper
  `createIncidentAnonymously` se sustituye por uno que crea
  un reporter; la firma se mantiene para no tocar las
  assertions de los 6 tests que lo usan.
- `backend/test/e2e/t7-referential-integrity.e2e-spec.ts:47`
  — el helper `anonymousAuth()` ahora devuelve
  `{ auth, userId }` para que R15.4 (la única que necesita
  el `userId` para borrar al usuario y verificar la SET NULL
  del `citizen_id`) pueda operar con el reporter, no con la
  máscara.
- `backend/test/e2e/incident-categories.e2e-spec.ts:204` —
  el incidente del round 0 ahora lo crea un reporter.

---

## Archivos modificados

### Backend
- `backend/src/modules/auth/auth.service.ts:login()` —
  rechazo del device_uuid anónimo con 401 +
  `ANONYMOUS_IDENTITY_CLOSED`.
- `backend/src/modules/auth/auth-errors.ts` — constante
  `ANONYMOUS_IDENTITY_CLOSED`.
- `backend/src/config/auth.config.ts:anonymousPermissions` —
  `[]` con JSDoc explicando la decisión.
- `backend/src/config/auth.config.spec.ts` — 3 tests round-0
  invertidos + 1 preservado.
- `backend/src/modules/auth/auth.service.spec.ts` — 2 tests
  round-0 invertidos (login y getPermissionsByUserId) + 2
  tests ANON (getAuthContextByUserId) + 1 test caso-negativo
  con `emailVerifiedAt: null` explícito.
- `backend/src/modules/auth/auth.service.password.spec.ts` —
  `makeAuthConfig` con `anonymousPermissions: []`.

### Migrations
- `database/migrations/0048_close_anonymous_ceiling.sql` —
  preexistente, con el comentario del 40% que documenta
  por qué la fila NO se borra.
- `database/rollback/0048_close_anonymous_ceiling.DOWN.sql` —
  preexistente, informativo.

### E2E
- `backend/test/e2e/anon-no-anonymous-creation.e2e-spec.ts` —
  **archivo nuevo, 3 tests** (D.2).
- `backend/test/e2e/health.e2e-spec.ts` — 1 test round-0
  invertido (A.1).
- `backend/test/e2e/sessions.e2e-spec.ts` — 1 test round-0
  invertido (A.1).
- `backend/test/e2e/organizations.e2e-spec.ts` — 2 tests
  actualizados para usar `reporter`.
- `backend/test/e2e/flows.e2e-spec.ts` — 2 tests
  reescritos para usar `reporter`.
- `backend/test/e2e/roles.e2e-spec.ts` — helper sustituido.
- `backend/test/e2e/t7-referential-integrity.e2e-spec.ts` —
  helper actualizado a `{ auth, userId }`, 5 call sites
  actualizados, R15.4 corregido.
- `backend/test/e2e/incident-categories.e2e-spec.ts` — 1 test
  actualizado para usar `reporter`.

---

## Estado de gates (medido)

| Gate | Resultado |
|---|---|
| `npx jest` (backend, unit) | **100/100 suites, 915/915 tests** |
| `npx jest --config test/jest-e2e.json` (e2e completo) | **52/52 suites, 448/448 tests** |
| `npx jest` (frontend) | **47/47 suites, 326/326 tests** |
| `tsc -p tsconfig.json --noEmit` (backend) | exit 0 |
| `pnpm run lint` (backend) | 0 errors, 19 warnings (preexistentes) |
| `pnpm run build` (frontend) | exit 0 |

### Distinción entre la versión previa (ficticia) y esta

| | Versión previa (ronda 0) | Esta versión (ronda 1 real) |
|---|---|---|
| Backend unit | "99/99 suites, 902/902 tests" (estado pre-REG) | **100/100 suites, 915/915 tests** |
| Backend e2e | "pendiente — sin DB+Redis" (nunca corrido) | **52/52 suites, 448/448 tests** |
| `auth.config.ts:anonymousPermissions` | 4 permisos | **`[]`** |
| `AuthService.login` para `anonymous` | emitía tokens | **rechaza 401 ANONYMOUS_IDENTITY_CLOSED** |
| Test del round 0 "grants the anonymous ceiling" | en verde (afirmando lo viejo) | **sustituido por su inversión** |
| D.2 e2e | "sin spec que afirme contra la app real" | **3 tests nuevos en `anon-no-anonymous-creation.e2e-spec.ts`** |

---

## Recomendación

`sdd-verify` puede correr la pasada 2:

1. `npx jest` (backend) → 100/100 · 915/915.
2. `npx jest --config test/jest-e2e.json` → 52/52 · 448/448
   (incluye el nuevo `anon-no-anonymous-creation.e2e-spec.ts`
   y los 6 e2e que se actualizaron para usar reporter).
3. `pnpm run lint` (backend) → 0 errors.
4. `pnpm run build` (frontend) → exit 0.

ANON está cerrado y la capacidad retirada está
explícitamente documentada como tal — el requisito del fix B.6.
