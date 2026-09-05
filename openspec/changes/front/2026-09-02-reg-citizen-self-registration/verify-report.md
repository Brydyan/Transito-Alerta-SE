# Verify Report — REG: Auto-registro del ciudadano (sc-325) — Ronda 4

**Change**: `2026-09-02-reg-citizen-self-registration`
**Fecha**: 2026-09-05
**Auditor**: sdd-verify (ronda 4)
**Modo**: Standard (Strict TDD activo per tasks.md, verificado vía TDD en fixes previos)

---

## Veredicto

**FAIL — 1 CRITICAL nuevo.** Los 3 CRITICAL de la ronda 3 (C1 guard fail-open, C2 test 410
Gone contradictorio, C3 casilla B.5 falsa) están **cerrados y re-verificados por ejecución
real**. Pero la propia corrección de C1 introdujo una **regresión nueva no detectada**: el
default `emailVerified: true` agregado a `provisionUser()` rompe 3 tests preexistentes de
`email-verification.e2e-spec.ts` porque ese archivo nunca pasa `emailVerified: false` y ahora
provisiona cuentas ya-verificadas contra un endpoint que devuelve 422 si el correo ya está
verificado. `pnpm run test:e2e` termina en exit 1 por causa de REG, no de ANON.

**No listo para archivar.**

---

## Resultado de las 3 decisiones de la ronda 3

### C1 — Allow-list del `EmailVerifiedGuard`: CORRECTO Y EXHAUSTIVO

`backend/src/common/guards/email-verified.guard.ts:51-56` — `STAFF_ROLES = {'operador_org',
'admin_org', 'operador_sistema', 'master'}`.

Verificado contra las migraciones reales:
- `database/migrations/0015_organizations_scoping.sql:61,74,85,98` siembra
  `admin_sistema`, `operador_sistema`, `admin_organizacion`, `operador_organizacion`
  (más `reporter` desde `0009_roles_permissions.sql:45`).
- `database/migrations/0040_rename_roles.sql:16-18` renombra `admin_sistema→master`,
  `admin_organizacion→admin_org`, `operador_organizacion→operador_org`. `operador_sistema`
  no se renombra.
- Total de roles reales en el sistema: `reporter` + 4 de staff. `STAFF_ROLES` los cubre
  exactamente — ninguno de más, ninguno de menos. **Exhaustiva, confirmada.**

`roles.name` tiene `UNIQUE` (`database/migrations/0001_initial_schema.sql:18`), lo que
además cierra por completo el vector "renombrar `reporter` a `master`" que hubiera sido el
siguiente paso lógico del ataque: la migración a un nombre ya usado por un rol de staff
fallaría por violación de unicidad mientras ese rol de staff exista. El allow-list, sumado
a esta restricción de esquema, deja la vía de renombrado sin ningún bypass viable conocido.

**El test que separa las dos políticas (renombrar `reporter` vía `PATCH /api/roles/:id` real,
no soft-delete) SIGUE SIN EXISTIR como e2e.** Lo que sí existe es un test unitario con un
objeto de usuario mockeado (`email-verified.guard.spec.ts:75-89`, `roleName: 'civic_hero'`)
que prueba la misma propiedad a nivel de guard aislado, correctamente por renombrado y no por
soft-delete. Es una prueba válida de la lógica del guard, pero no ejercita
`RolesService.update()` ni el cache de permisos reales — ver WARNING W1.

`email-verified.guard.spec.ts` (8 tests) cubre: los 4 staff roles pasan sin tocar la BD,
`roleName: null` exige verificación, `'civic_hero'` (renombre simulado) exige verificación,
`'reporter'` verificado pasa, `'reporter'` sin verificar 403, usuario sin fila en BD 403, sin
`user` en el request 403 explícito. Ejecutado: **8/8 PASS**. No es relleno — cubre las
fronteras reales de la decisión D2.

### `test-environment.ts::provisionUser()` — el default se agregó, pero incompleto (ver CRITICAL nuevo)

`backend/test/support/test-environment.ts:338-345` — `emailVerified = overrides.emailVerified
?? true`; si es `true` (default), inserta `email_verified_at = now()`. El flag opt-out
(`emailVerified: false`) existe y SIGUE siendo posible provisionar una cuenta sin verificar.

Pero **ningún archivo e2e de los 48 usa `overrides.emailVerified: false`** — confirmado por
grep (`grep -rn "emailVerified" backend/test/e2e/*.ts` → 0 resultados). Esto significa que,
tras este cambio, **ningún e2e ejercita el camino "reporter sin verificar" de punta a punta**
(sólo lo hace el unitario `email-verified.guard.spec.ts` con mocks). No es tan grave como "el
fixture hace pasar a todos" (la ruta SÍ sigue existiendo y es utilizable), pero sí es una
regresión de cobertura de facto: antes del cambio, cualquier cuenta con `role_id = NULL`
provista sin overrides pasaba por el camino "sin verificar"; ahora ninguna lo hace por
default. Ver WARNING W1.

El default rompió un test real que SÍ dependía del comportamiento anterior —
`email-verification.e2e-spec.ts`. Ver CRITICAL C1 (ronda 4) abajo.

### C2 y C3 — CERRADOS, verificados por ejecución

- **C2**: `backend/test/e2e/t6-aliases-gdpr.e2e-spec.ts` — el `it()` de "410 Gone" se borró;
  el comentario de cabecera (líneas 11-18) documenta la reversión. Ejecutado:
  `t6-aliases-gdpr.e2e-spec.ts` **PASS** (11.0s) en la corrida completa de 48 archivos. El
  comentario nuevo afirma que el coverage del endpoint real vive "en el spec e2e que REG
  agregó" — **esto es falso**, ver WARNING W2.
- **C3**: `tasks.md` B.5 ahora es `[ ]` con el texto "FUERA DE ALCANCE DE ESTA RONDA — DIFERIDO
  A F4", coherente con `specs/citizen-registration/spec.md:78-79` que ya decía "cierra
  F4/B.2.12" (sin cambios, ya lo decía antes). Casilla y texto y spec ahora coinciden.
  **Cerrado correctamente.**

---

## CRITICAL (ronda 4, nuevo) — bloquea archivar

### C1(r4) — El default de `provisionUser()` rompe 3 tests preexistentes de `email-verification.e2e-spec.ts`

**Archivo**: `backend/test/support/test-environment.ts:344` (causa) /
`backend/test/e2e/email-verification.e2e-spec.ts:36-39` (síntoma)

**Reproducible**:
```
cd backend && npx jest --config ./test/jest-e2e.json --testPathPattern='email-verification'
```
Resultado real de esta corrida:
```
● T6.5.D3a: POST /email/resend-verification → 202 + verification_otp set in DB
  expected 202 "Accepted", got 422 "Unprocessable Entity"
● T6.5.D3b: verify correct OTP → 200 + email_verified_at IS NOT NULL
  expected 202 "Accepted", got 422 "Unprocessable Entity"
● T6.5.D3d: resend twice within 60s → second resend returns 429
  expected 202 "Accepted", got 422 "Unprocessable Entity"
```
(T6.5.D3c y T6.5.D3e (x2) sí pasan — no dependen de `resend-verification` sobre una cuenta
recién provista.)

**Causa exacta**: `provisionEmailUser()` (`email-verification.e2e-spec.ts:36-40`) llama
`env.provisionUser([], { email })` sin `emailVerified: false`. Con el nuevo default
(`test-environment.ts:344`, `emailVerified ?? true`), la cuenta nace con `email_verified_at`
ya poblado. `EmailVerificationService.resendVerification()`
(`backend/src/modules/auth/email-verification.service.ts:89-90`) rechaza con 422
`"Email is already verified"` a una cuenta ya verificada — el comportamiento es correcto y
preexistente; lo que cambió es que ahora TODAS las cuentas de este spec llegan
pre-verificadas, así que el 202 esperado nunca ocurre.

**Por qué es CRITICAL y no un detalle**: `pnpm run test:e2e` termina con **exit code 1**
por esta causa — es el mismo comando que corre el job `integration` de `ci.yml`. Es una
regresión 100% atribuible a REG (el archivo que cambió es `test-environment.ts`, tocado
sólo por este change; `email-verification.e2e-spec.ts` no se tocó y no depende de nada de
ANON). Es exactamente la pregunta que `fixes-required.md` planteaba sin responder
("¿Se rompió algún test que dependiera del comportamiento anterior?") — la respuesta es
sí, y nadie lo verificó antes de esta ronda.

**Corrección** (no aplicada — soy auditor): agregar `emailVerified: false` al llamado de
`provisionEmailUser()` en `email-verification.e2e-spec.ts:38`. Cambio de una línea. Antes de
declarar cerrado, correr la suite completa de 48 archivos de nuevo — no sólo este archivo —
por si hay otro caso similar que este verify no haya encontrado por casualidad de orden de
ejecución.

---

## WARNING (deberían resolverse, no bloquean per se)

**W1 — Test recomendado en Fix 5 sigue sin existir; cobertura e2e de "reporter sin verificar" quedó en cero.**
El test "un reporter sin verificar sigue bloqueado aunque su rol se renombre" que
`fixes-required.md` (Fix 5) pedía explícitamente como resultado del fix nunca se escribió
como e2e (sólo existe la versión unitaria con mocks, `email-verified.guard.spec.ts:75-89`).
Además, como ningún e2e usa `overrides.emailVerified: false` (ver arriba), **ningún test
end-to-end ejercita hoy el 403 `EMAIL_VERIFICATION_REQUIRED` contra una cuenta real
provisionada** — sólo el unitario del guard con objetos armados a mano. El riesgo de
seguridad en sí está cerrado (allow-list exhaustiva + `UNIQUE` en `roles.name`), pero la
propiedad "el flujo real de principio a fin sigue bloqueando" no tiene evidencia de
ejecución end-to-end.

**W2 — Comentario falso en `t6-aliases-gdpr.e2e-spec.ts:17-18`.**
Dice: *"El coverage del endpoint real vive en `auth.register.spec.ts` (unit) y en el spec
e2e que REG agregó."* — no existe ningún spec e2e que ejercite `POST /auth/register`;
confirmado por `grep -rln "auth/register" backend/test/` → sólo aparece en este mismo
archivo (el test borrado). Es una afirmación falsa en un comentario de un archivo de test,
la misma clase de defecto (afirmar cobertura que no existe) que ya se dio en `apply-progress.md`
de sc-303 y que el propio prompt de esta ronda pidió vigilar.

**W3 — `apply-progress.md` sigue congelado en la ronda 2.**
`openspec/changes/front/2026-09-02-reg-citizen-self-registration/apply-progress.md` no
documenta nada de las rondas 3 (deny-list) ni 4 (allow-list, fix de test-environment, fix de
t6-aliases-gdpr, destildado de B.5) pese a que `fixes-required.md` (Orden sugerido, punto 5)
lo pedía explícitamente después de la ronda 3. Es la segunda ronda consecutiva en la que esta
instrucción se ignora.

**W4 — `tasks.md` A.7 desactualizado (subestima trabajo real).**
`tasks.md:47-52` sigue diciendo "PARCIAL — ... el spec unitario dedicado al guard no se
escribió en esta ronda", pero `email-verified.guard.spec.ts` SÍ existe (archivo sin trackear
en git, 8 tests, todos referenciando explícitamente "Fix 5" — evidencia de que se escribió en
esta ronda). Es el error inverso al de rondas anteriores (casilla en verde sobre trabajo no
hecho): acá el texto no refleja trabajo que sí se hizo. Mismo síntoma de fondo — tasks.md no
se sincroniza con el código real ronda a ronda.

**W5 — `email-verified.guard.spec.ts` tiene un docstring de cabecera contradictorio.**
Líneas 10-19 dicen: *"Cubre las decisiones de la ronda 3 (Fix 4): la política es
**deny-list puntual** sobre `reporter`, no allow-list de staff."* — Esto describe la política
VIEJA (la que causó el fail-open, C1 de ronda 3). El código del guard que este mismo archivo
testea, y los propios tests debajo de ese comentario (`"Fix 5: la allow-list cubre..."`),
implementan la política nueva. Confuso para cualquiera que audite este archivo después.

**W6 — Deuda abierta de rondas previas, sin cambios en ronda 4** (ninguna es nueva; ninguna se cerró):
- `AuthController.register()` sigue sin test directo — `auth.controller.spec.ts:44` mockea
  `AuthRegisterService` completo ("el spec del controller no la ejercita").
- Ningún e2e ejercita `POST /auth/register` de punta a punta (ni éxito, ni rate-limit HTTP,
  ni la forma de la respuesta post-`SnakeCaseResponseInterceptor`).
- `IncidentImagesController` (`backend/src/modules/incidents/incident-images.controller.ts:26-29`)
  y `CommentImagesController` (`backend/src/modules/comments/comment-images.controller.ts:21-23`)
  siguen sin `@UseGuards(EmailVerifiedGuard)` en `POST`. Explotabilidad real: acotada — un
  reporter sin verificar no puede crear una incidencia nueva (bloqueado en `POST /incidents`),
  así que sólo importaría si puede adjuntar imágenes a una incidencia PROPIA ya existente de
  antes de perder la verificación, o a una ajena si el service no valida propiedad. No se
  auditó `incidentImagesService.attachToIncident` a fondo — queda como SUGGESTION S2.
- Sin test de regresión de arranque de la app dedicado (`*.module.boot.spec.ts` no existe).
  Mitigado indirectamente: los 48 archivos e2e arrancan la app real (Nest + Postgres + Redis)
  48 veces en esta misma corrida sin fallos de boot, lo cual es evidencia de arranque más
  fuerte que un smoke test dedicado, aunque no reemplaza su valor documental.

---

## SUGGESTION

**S1** — `RolesService.update()` (`backend/src/modules/roles/roles.service.ts:125-134`) sigue
sin invalidar el cache de permisos al renombrar un rol, a diferencia de `delete()`. Ya no es
una vía de bypass del `EmailVerifiedGuard` (el allow-list es exhaustivo e independiente del
cache), pero sigue siendo una inconsistencia latente en `RolesService` que podría afectar otra
decisión de autorización futura que si dependa de lecturas frescas tras un rename.

**S2** — Auditar `IncidentImagesService.attachToIncident` /
`CommentImagesService.attachToComment` para confirmar si validan que el `userId` del caller
sea el dueño de la incidencia/comentario antes de aceptar el upload. Si no lo hacen, la
ausencia de `EmailVerifiedGuard` en esos dos controllers (W6) sería explotable por cualquier
reporter autenticado (verificado o no) contra contenido ajeno — un problema de autorización
más amplio que el de verificación de correo. Fuera del alcance declarado de REG, pero
señalado porque toca el mismo guard.

---

## Compuertas ejecutadas (números reales)

### Backend (`backend/`)
| Gate | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | ok |
| `pnpm run lint` | **0 errors**, 19 warnings (preexistentes, sin relación con REG — mismos archivos que ronda 3) |
| `pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) | exit 0 |
| `pnpm run build` (`nest build`) | exit 0 |
| `pnpm test` (unit) | **100 suites / 909 tests PASS** (0 failed) |

### Frontend (`frontend/`)
| Gate | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | ok |
| `pnpm test` (jest) | **42 suites / 298 tests PASS** |
| `pnpm run build` (`ng build`) | exit 0, bundle ~4.2s |
| `npx tsc -b --noEmit` (no hay script `typecheck`; `tsc -p tsconfig.json` compila 0 archivos — trampa conocida) | **14 errores preexistentes**, ninguno en archivos de REG (`auth.interceptor.regression.spec.ts`, `layout-tokens.regression.spec.ts`, `sidebar.spec.ts`, `contrast.regression.spec.ts`, `auth.service.spec.ts:227` — todos preexistentes, mismo conteo que ronda 3) |
| eslint | no existe script `lint` en `frontend/package.json` — condicional, no corre (preexistente) |

### Integration (`backend/`, `pnpm run test:e2e`, los 48 archivos completos)
| Métrica | Ronda 3 | Ronda 4 |
|---|---|---|
| Archivos | 48 | 48 |
| Suites failed / passed | 8 / 40 | **8 / 40** |
| Tests failed / passed / total | 16 / 416 / 432 | **18 / 413 / 431** |
| Exit code | 1 | **1** |

Total de tests bajó en 1 (432→431): coherente con el `it()` borrado en `t6-aliases-gdpr.e2e-spec.ts`
(Fix 6). De los 18 tests fallando:
- **15 son de ANON** (`change back/2026-09-02-anon-close-anonymous-reporting`, sin commitear,
  fuera de alcance de esta auditoría por decisión del usuario): `sessions.e2e-spec.ts` (1),
  `organizations.e2e-spec.ts` (2), `health.e2e-spec.ts` (1, smoke test), `roles.e2e-spec.ts` (2),
  `flows.e2e-spec.ts` (2), `incident-categories.e2e-spec.ts` (1),
  `t7-referential-integrity.e2e-spec.ts` (6) — todos con el mismo síntoma:
  `POST /api/auth/login {device_uuid:'anonymous'}` → esperado 200, obtenido 401.
- **3 son de REG, ronda 4** (`email-verification.e2e-spec.ts` — T6.5.D3a/b/d): ver CRITICAL
  C1(r4) arriba.

`regressions.e2e-spec.ts` (12/12, incluye SQLi y XSS del Fix 4/ronda 2): **PASS**.
`t6-aliases-gdpr.e2e-spec.ts` (Fix 6): **PASS**.

**"Una compuerta que no corre se lee igual que una compuerta que pasa"** — las 5 compuertas de
`ci.yml` corrieron completas en esta ronda; `test:e2e` corrió los 48 archivos, no una muestra.

---

## Compliance Matrix (resumen — comportamiento verificado por ejecución real)

| Requirement | Scenario | Test | Resultado |
|---|---|---|---|
| Auto-registro crea `reporter` | Alta correcta / rol inyectado / organización inyectada / permisos correctos | `auth.register.spec.ts` (9 tests, unit) | ✅ COMPLIANT (unit) |
| Auto-registro crea `reporter` | Ya no es lápida (no 410) | `t6-aliases-gdpr.e2e-spec.ts` (verifica que el 410 viejo se borró) + `auth.controller.ts:76-91` (código) | ⚠️ PARTIAL — nada e2e prueba el 200/OTP real de `/auth/register`, sólo que el 410 viejo no está |
| Invitación único camino a staff | Ningún rol de personal por auto-registro | `auth.register.spec.ts` ("A.5", "D1 ignora payload") | ✅ COMPLIANT (unit) |
| Publicar exige correo verificado | Publicar sin verificar → 403 / tras verificar → pasa / staff exento | `email-verified.guard.spec.ts` (8 tests, unit) | ⚠️ PARTIAL — correcto y exhaustivo a nivel de guard aislado; CERO e2e ejercita este 403 contra una cuenta real (ver W1) |
| No revela existencia de correo | Correo nuevo/existente indistinguible, sin duplicado, aviso al titular, tiempos comparables | `auth.register.spec.ts` (D3, D9) | ✅ COMPLIANT (unit) |
| Rate limit | Ráfaga IP / correo / aislado no afectado | `auth.register.spec.ts` (D4, 3 tests) | ✅ COMPLIANT (unit) — sin equivalente e2e vía HTTP real |
| Pantalla de registro | Ruta pública / enlace login / enlace tras reportar / navega a verify-email / no filtra existencia / validación cliente | `register.component.spec.ts` (8 tests) | ✅ COMPLIANT salvo "enlace tras reportar" — ❌ diferido a F4 explícitamente (B.5, ya no marcado hecho) |

**Resumen**: el núcleo de negocio (rol fijo, no-revelación, rate limit, pantalla) está
COMPLIANT a nivel unitario con ejecución real y en verde. El punto débil transversal de todo
el change sigue siendo la ausencia total de un e2e que atraviese `/auth/register` de punta a
punta contra el servidor real — ese hueco es anterior a esta ronda y no se cerró en ninguna.

---

## Tareas (`tasks.md`) — 18/19 casillas `[x]`, 1 `[ ]` correctamente destildada

Backend A.1-A.11: 11/11 `[x]`, código confirmado presente y consistente con el texto, salvo
A.7 (W4 — texto desactualizado, subestima). Frontend B.1-B.8: 7/8 `[x]` + B.5 `[ ]`
(correctamente diferida a F4, ver arriba). Ninguna casilla marcada sobre trabajo no
implementado — el defecto de proceso más grave que este change venía repitiendo (C3 de ronda
3) está cerrado.

---

## Qué falta para poder archivar

1. Arreglar el CRITICAL C1(r4): un override de una línea en
   `email-verification.e2e-spec.ts:38` (`{ email, emailVerified: false }`), y re-correr los
   48 archivos completos para confirmar que no queda ningún otro archivo con el mismo patrón.
2. (Recomendado, no bloqueante) Escribir el test e2e de W1: reporter sin verificar +
   `PATCH /api/roles/:id` renombrando `reporter` + confirmar 403 persiste.
3. (Recomendado) Corregir el comentario falso de W2 y el docstring desactualizado de W5.
4. (Recomendado) Poner `apply-progress.md` al día con las rondas 3 y 4 (W3) y corregir el
   texto de A.7 en `tasks.md` (W4).

Ítems 2-4 no bloquean el archivado por sí solos si el equipo decide asumir el riesgo
documentado; el ítem 1 sí, porque es una compuerta de CI en rojo por causa de este change.
