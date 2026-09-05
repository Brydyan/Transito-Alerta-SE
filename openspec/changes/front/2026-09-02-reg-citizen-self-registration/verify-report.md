# Verify Report — REG: Auto-registro del ciudadano (sc-325) — Ronda 3

**Fecha**: 2026-09-05
**Modo**: Standard (no Strict TDD forwarding recibido; unit tests sí siguen patrón TDD documentado en apply-progress.md)
**Verificador**: sdd-verify, auditoría de seguridad

---

## 0. Resumen de rondas previas

- **Ronda 1 (FAIL)**: boot roto, lint en rojo, canal lateral de tiempo. Los 3 CRITICAL — **cerrados y
  re-verificados por ejecución real en esta ronda** (build/typecheck/lint/tests todos en verde, ver §2).
- **Ronda 2 (FAIL)**: los 3 CRITICAL de ronda 1 cerraron, pero el guard (allow-list de staff) rompía
  7/12 tests de `regressions.e2e-spec.ts`, incluidos los de inyección SQL y XSS.
- **Ronda 3 (esta)**: el guard se invirtió a deny-list puntual sobre `reporter`. Cierra el CRITICAL de
  ronda 2 (12/12 `regressions.e2e-spec.ts` pasan). Pero introduce un nuevo riesgo de seguridad de
  dirección opuesta (fail-open) que se detalla en el CRITICAL #1 más abajo, y deja dos hallazgos más
  sin cerrar de rondas anteriores.

---

## 1. La pregunta central: ¿el guard invertido es correcto?

**Veredicto: NO tal como está. Recomiendo revertir a allow-list (fail-closed) y arreglar la causa
raíz real (el fixture de test), o — si el equipo insiste en el deny-list — cerrar el agujero de
eliminación/renombrado de rol antes de archivar.**

### D2 no exige un deny-list

`design.md` D2 dice literalmente:
```
registrarse         → libre
entrar y leer        → libre
publicar / comentar → exige email_verified_at
```
No dice "sólo el rol `reporter`". El comentario en `email-verified.guard.ts:12-38` cita a D2 como
justificación de la inversión, pero D2 no especifica el mecanismo (allow-list vs deny-list) — sólo la
intención de negocio. La implementación de ronda 3 no "cumple" D2 más que la de rondas 1-2; **reinterpreta**
una decisión de diseño silenciosa (qué hacer ante un rol desconocido o ausente) que ninguna de las dos
versiones del guard tenía escrita explícitamente en el spec. `spec.md` tampoco contempla el caso
"cuenta sin rol" en ninguno de sus escenarios de "Publicar exige correo verificado" — sólo habla de
`reporter` y de "el personal" (`operador_org`/`admin_org`/etc). El deny-list amplía silenciosamente el
conjunto de cuentas exentas a "cualquier cosa que no sea literalmente la cadena `reporter`", que es
una superficie mucho más amplia que "el personal", y el spec nunca la aprobó.

### El camino de `role_id` NULL — recorrido completo

`user.roleName` en el guard viene de `request.user`, poblado por `JwtStrategy.validate()`
(`jwt.strategy.ts:42-47`) que llama a `AuthService.getAuthContextByUserId()` en **cada request** — no
es un claim fijo del JWT. Esa función (`auth.service.ts:544-620`) cachea el resultado en Redis bajo
`perm:v3:uid:{userId}` con TTL `permissionCacheTtlSeconds`, pero la consulta SQL de origen
(`auth.service.ts:569-573`) hace `LEFT JOIN roles r ON r.id = u.role_id` y trae `r.deleted_at AS
role_deleted_at`; si el rol está soft-deleted, `roleName` se fuerza a `null`
(`auth.service.ts:596-603`) **antes** de que el guard lo vea.

Esto es la vía real, no la hipotética de un `DELETE FROM roles` crudo (que sólo existe en scripts de
rollback de migración, `database/rollback/0009_roles_permissions.DOWN.sql:17` y
`0015_organizations_scoping.DOWN.sql:12` — no en código de aplicación). La vía real de producción es
`RolesService.delete()` (`roles.service.ts:150-163`), expuesta como `DELETE /api/roles/:id`
(`roles.controller.ts:84`, gateado por `PermissionGuard` con un permiso de rol normal, no un permiso
especial). Es una **soft delete** normal — no borra `role_id` de `users`, sólo pone `roles.deleted_at`.
`delete()` **invalida el cache de cada usuario afectado en la misma request**
(`invalidatePermissionCache`), así que el efecto es **inmediato**, no depende de que expire el JWT ni
el TTL del cache.

**Escenario concreto**: un `admin_org` (o `master`) con permiso para administrar roles borra
(soft-delete) el rol `reporter` — por limpieza, por error, o con una sesión comprometida. En la
siguiente request de CUALQUIER ciudadano que tuviera ese rol, `roleName` resuelve a `null` (no hace
falta esperar nada). `EmailVerifiedGuard.canActivate` evalúa `null !== 'reporter'` → `true` → **pasa
sin verificar el correo**. Esto neutraliza D2 para TODA la base de ciudadanos existentes, de forma
permanente: no existe endpoint de "restore" de un rol soft-deleted (revisé `roles.controller.ts` — sólo
hay `assign`, `create`, `update` (`PATCH`), `delete`, `recalculate-permissions`; ninguno limpia
`deletedAt`). El único remedio es una intervención manual en la base.

**Segundo camino, más silencioso**: `RolesService.update()` (`roles.service.ts:125-134`) permite
renombrar el rol `reporter` a cualquier otra cadena vía `PATCH /api/roles/:id`, y **no invalida el
cache ni bumpea `permission_version`** (a diferencia de `delete()` y
`recalculateEffectivePermissions()`, que sí lo hacen). El efecto es el mismo — `roleName` deja de ser
literalmente `'reporter'` — pero tarda hasta `permissionCacheTtlSeconds` en propagarse (por la falta
de invalidación), lo cual es un bug de caché independiente de REG que además hace este camino más
difícil de razonar (silencioso y demorado en vez de inmediato).

### ¿Otro camino además de eliminar/renombrar el rol?

Sí: `UsersService.adminCreate()` (`users.service.ts:224-235`) permite crear una cuenta con
`role_id: dto.role_id ?? null` — un admin puede crear cuentas de staff con `role_id = NULL` y
permisos otorgados a mano después (patrón real de producción, no sólo de test: esto es lo que
`provisionUser()` imita). Esto es legítimo y es la razón por la que un deny-list ciego a "sin rol"
tiene sentido de negocio en principio — pero es exactamente esa misma señal (`roleName = null`) la que
también produce el rol borrado/renombrado. El guard no puede distinguir HOY entre "nunca tuvo rol,
cuenta de staff con permisos directos" y "tenía `reporter`, alguien borró o renombró el rol debajo de
sus pies". Son indistinguibles con la información que le llega al guard, aunque **la información SÍ
existe una consulta más arriba**: `getAuthContextByUserId` ya trae `role_deleted_at` y lo descarta al
colapsarlo a `roleName: null`.

### Recomendación propia (no la implementada)

**Opción (b), con una corrección real de la causa raíz — no la implementada, la (a):**

1. Revertir el guard a un **allow-list explícito y finito** de roles de staff (fail-closed por
   default, consistente con la filosofía que el propio proyecto adoptó en D1: *"una imposibilidad no
   se puede saltar; una validación se puede escribir mal"* — aquí aplica igual de bien a "quién está
   exento" que a "qué rol se asigna").
2. Arreglar la causa raíz real de los 7 fallos de ronda 2: no es el guard, es que
   `test/support/test-environment.ts::provisionUser()` no setea `email_verified_at` por default. Es
   un cambio aditivo (agregar un default) a una función de test, usada SÓLO por tests — el argumento
   de "blast radius" en `fixes-required.md` (ronda 2) para descartar esta alternativa está invertido:
   tocar un fixture compartido por 31 archivos de test con un default adicional es mucho más barato y
   contenible que cambiar la dirección de una política de seguridad de producción para toda la base de
   usuarios, de forma permanente y sin endpoint de reversión.
3. Si el equipo prefiere mantener el deny-list por su menor blast radius de implementación inmediata,
   como mínimo cerrar el agujero de rol borrado/renombrado: propagar `role_deleted_at` (ya se consulta)
   como un campo separado en `AuthContext` en vez de colapsarlo silenciosamente a `roleName: null`, y
   que el guard exija verificación también cuando `roleName === null && roleWasDeleted === true`, sólo
   eximiendo al caso "nunca tuvo rol" (que es el patrón real de `adminCreate`/fixtures). Y arreglar
   `RolesService.update()` para que invalide el cache al renombrar, igual que `delete()`.

Ninguna de las dos rutas está implementada hoy. Mientras tanto, la implementación actual (deny-list
puro) queda clasificada **CRITICAL** — ver §3.

---

## 2. Compuertas (ejecutadas realmente en esta sesión, no tomadas de apply-progress.md)

### Backend (`backend/`)

| Gate | Comando | Resultado |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | OK, "Already up to date" |
| Lint | `pnpm run lint` | **0 errors**, 19 warnings preexistentes (mismos archivos que ronda 2, ninguno de REG) |
| Typecheck | `pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) | exit 0 |
| Build | `pnpm run build` (`nest build`) | exit 0 |
| Unit tests | `npx jest` | **100 suites / 908 tests — todos PASS** (ronda 2 cerró en 99/903; +1 suite y +5 tests: `email-verified.guard.spec.ts`) |

### Frontend (`frontend/`)

| Gate | Comando | Resultado |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | OK |
| Unit tests | `npx jest` | **42 suites / 298 tests — todos PASS** (coincide con la referencia: 41→42 suites, 290→298 tests con REG) |
| Build | `pnpm run build` (`ng build`) | exit 0, incluye `chunk-MMGNTP32.js — register-component` |
| Typecheck | `npx tsc -b --noEmit` (NO `tsc -p`, que compila 0 archivos) | **14 errores preexistentes, sin cambios** (ninguno en archivos de REG) |
| Lint | — | no existe script `lint` en `frontend/package.json` (gap preexistente, no de REG) |

### Integration (`pnpm run test:e2e`, backend, Testcontainers)

Corrí primero `regressions.e2e-spec.ts` sola, y después **la suite completa: los 48 archivos**, no una
muestra — cerrando el hueco de cobertura que ronda 2 dejó abierto (verificó sólo 3/48).

**`regressions.e2e-spec.ts` sola**: **12/12 PASS**, incluidos los dos que ronda 2 reportó rotos:
- `SQL injection attempt in incident title does not cause 500 or execute SQL (CC1)` ✅
- `XSS payload in title returns 201 or 400, never causes script execution in API response (T4.3b)` ✅

El CRITICAL de ronda 2 (7/12 fallando) está **cerrado y re-verificado por ejecución real**.

**Suite completa (48 archivos, 432 tests)**:

```
Test Suites: 8 failed, 40 passed, 48 total
Tests:       16 failed, 416 passed, 432 total
```

Desglose de los 8 archivos con fallos:

| Archivo | Causa | Atribuible a REG |
|---|---|---|
| `t6-aliases-gdpr.e2e-spec.ts` | `T6.8.D2: POST /api/auth/register → 410 Gone` — espera **410**, recibe **400**. Es la lápida vieja que A.2 revirtió intencionalmente; nunca se actualizó/borró este test en 3 rondas. | **SÍ — REG** |
| `sessions.e2e-spec.ts` | `POST /auth/login {device_uuid:'anonymous'}` espera 200, recibe 401 | NO — ver nota |
| `t7-referential-integrity.e2e-spec.ts` (5 tests) | mismo patrón: login anónimo 401 | NO — ver nota |
| `roles.e2e-spec.ts` (2 tests) | mismo patrón | NO — ver nota |
| `organizations.e2e-spec.ts` (2 tests) | mismo patrón | NO — ver nota |
| `incident-categories.e2e-spec.ts` | mismo patrón | NO — ver nota |
| `flows.e2e-spec.ts` (2 tests) | mismo patrón | NO — ver nota |
| `health.e2e-spec.ts` | mismo patrón | NO — ver nota |

**Nota de atribución** (para no cargarle a REG un fallo ajeno, según se me pidió): los 7 archivos con
patrón "login anónimo devuelve 401" fallan porque `git status` muestra en el mismo árbol de trabajo
cambios SIN COMMITEAR de `back/2026-09-02-anon-close-anonymous-reporting` (`auth.config.ts`:
`anonymousPermissions: []`; migración nueva `database/migrations/0048_close_anonymous_ceiling.sql`,
cuyo propio header dice "Product decision 2026-09-02: an anonymous device cannot authenticate
anymore"). Es el efecto documentado y esperado de ESE cambio, no de REG. REG no toca
`credential-dispatch.ts` ni `auth.config.ts` ni la migración 0048. Si `ANON` se archiva antes o junto
con `REG`, estos 7 archivos necesitan su propia actualización — pero es responsabilidad de `ANON`, no
de este change.

El único fallo real de REG (`t6-aliases-gdpr.e2e-spec.ts`) sí bloquea: `ci.yml` job `integration`
corre `pnpm run test:e2e` sin filtro — si REG se mergea tal cual, ese job rompe con su PROPIO test,
sin necesitar nada de ANON.

---

## 3. Issues encontrados

### CRITICAL (deben cerrarse antes de archivar)

**C1 — `EmailVerifiedGuard` deny-list: agujero de seguridad permanente vía borrado/renombrado del rol `reporter`.**
`backend/src/common/guards/email-verified.guard.ts:70-90` (branch `user.roleName !== RESTRICTED_ROLE
→ return true`). Ver análisis completo en §1. Escenario de explotación: `DELETE /api/roles/:id` sobre
el rol `reporter` (endpoint administrativo normal, `roles.controller.ts:84`) hace que TODOS los
ciudadanos que tenían ese rol dejen de necesitar verificar el correo, de forma inmediata (el cache se
invalida en la misma request de borrado, `roles.service.ts:160`) y permanente (no hay endpoint de
restore). Esto invierte el propósito de D2 (sellar identidad para AUD) para la base entera de
ciudadanos con un solo click administrativo, accidental o no. `RolesService.update()`
(`roles.service.ts:125-134`) abre una segunda vía por renombrado, sin siquiera invalidar el cache.
Recomendación: ver §1 (revertir a allow-list + arreglar `provisionUser()`, o threading de
`role_deleted_at` en `AuthContext`).

**C2 — Test e2e propio de REG en rojo: `t6-aliases-gdpr.e2e-spec.ts:217-224` sigue afirmando el
contrato viejo.** `T6.8.D2: POST /api/auth/register → 410 Gone` — la tarea A.2 revirtió esa lápida a
propósito en ronda 1; nadie tocó este test en 3 rondas. Confirmado con `pnpm run test:e2e` (el mismo
comando que corre `ci.yml`/`integration`) — falla con `expected 410 "Gone", got 400 "Bad Request"`. Si
se archiva así, el job `integration` de CI queda roto por causa de REG, no de ningún change ajeno.

**C3 — `tasks.md` B.5 marcado `[x]` sobre trabajo admitidamente no hecho, y es un escenario del spec sin cubrir.**
`openspec/changes/front/2026-09-02-reg-citizen-self-registration/tasks.md:102-109` — el propio texto
dice *"NO HECHO en esta ronda"* pero la casilla es `[x]`. No es sólo un problema de proceso: el
escenario correspondiente SÍ está en `specs/citizen-registration/spec.md`
("Requirement: El ciudadano tiene una pantalla de registro" → "Scenario: Enlace tras reportar — GIVEN
el final del asistente de reporte usado sin cuenta THEN se ofrece registrarse o iniciar sesión (cierra
F4/B.2.12)"). Confirmé por grep que `frontend/src/app/features/citizen-report/` no tiene ninguna
referencia a "registro"/"register" — el escenario del spec está genuinamente sin implementar. Esto es
exactamente el patrón de mayor gravedad de proceso que se pidió vigilar en esta auditoría (una casilla
marcada sobre trabajo no hecho), y sigue sin corregirse de ronda 2 a ronda 3 pese a haber sido conocido.

### WARNING (deberían arreglarse, no bloquean por sí solas)

**W1 — `tasks.md`/`apply-progress.md` no documentan la ronda 3.** `tasks.md:40-52` (A.6/A.7) sigue
describiendo el modelo allow-list viejo y dice que el spec del guard "no se escribió en esta ronda",
pero `email-verified.guard.spec.ts` (6 tests) SÍ existe y el guard cambió de política — el checkbox A.7
resulta accidentalmente cierto (el archivo existe) pero el texto que lo acompaña es falso/obsoleto.
`apply-progress.md` termina en la "Recomendación" de ronda 2 y no menciona en absoluto el Fix 4 (el
giro del guard), el nuevo archivo de test, ni que se siguieron casi al pie de la letra las
instrucciones de `fixes-required.md`. El rastro de auditoría entre código y documentación de proceso
está roto — exactamente el defecto que esta ronda de verify tenía instrucción explícita de vigilar.

**W2 — `AuthController.register()` sigue sin test directo.** `auth.controller.spec.ts:44` stub-ea
`AuthRegisterService.register` con `jest.fn()` y comenta "el spec del controller no la ejercita". El
único e2e que toca la ruta (`t6-aliases-gdpr.e2e-spec.ts`) está en rojo (ver C2) y afirma el contrato
contrario. Ningún test ejercita hoy la extracción de IP/user-agent, el `HttpCode(200)`, ni el mapeo
`RegistrationRateLimited → 429` a nivel HTTP real. Abierto desde ronda 2.

**W3 — No hay test de regresión de boot** (`*.module.boot.spec.ts`), pedido en ronda 1. `nest build`
+ 100/100 suites unitarias ejercitan el grafo de DI de forma indirecta, pero no hay un smoke test
dedicado que levante `AppModule` completo. `apply-progress.md` ronda 2 lo admite explícitamente.

**W4 — Rutas de subida de imágenes sin `EmailVerifiedGuard`, sin explotación conocida hoy.**
`incident-images.controller.ts:27` y `comment-images.controller.ts:20` sólo tienen `JwtAuthGuard`. Hoy
no son explotables de forma independiente porque `citizen_id` (la vía de "ownership" que las exime de
necesitar el permiso `CREATE *-images`) sólo se asigna dentro del `create()` YA guardado de incidentes
(`incidents.service.ts:81`), así que un `reporter` sin verificar nunca llega a poseer contenido al que
subirle imágenes. `PATCH /incidents/:id`, `PATCH /incidents/:id/status` y `PATCH /comments/:id`
tampoco tienen el guard, pero son inalcanzables para un `reporter` puro porque el rol seed
(`0009_roles_permissions.sql:44-47`) no incluye permiso `UPDATE` — `PermissionGuard` los bloquea antes.
Sigue siendo una regla aplicada de forma inconsistente entre rutas vecinas (el patrón recurrente del
proyecto), aunque hoy no constituye un bypass alcanzable.

**W5 — Ningún e2e ejercita el flujo real de `/auth/register`.** Toda la evidencia positiva del
endpoint es a nivel unitario (`auth.register.spec.ts`, `register.component.spec.ts` con
`HttpClientTestingModule`, que sí valida forma HTTP real aunque sin DB). El único e2e que toca la ruta
está en rojo por C2.

### SUGGESTION

**S1** — Reemplazar el match por nombre de cadena (`RESTRICTED_ROLE = 'reporter'`) por una propiedad
explícita e inmutable (p. ej. columna `requires_email_verification` en `roles`, ya que el guard
consulta esa fila igual) para que un rename no cambie silenciosamente a quién aplica D2.

**S2** — `RolesService.update()` no invalida el cache de permisos ni bumpea `permission_version` al
cambiar el `name` de un rol, a diferencia de `delete()` y `recalculateEffectivePermissions()`. Es un
bug de staleness de cache independiente de REG, pero agrava C1 (ver §1).

**S3** — Si se conserva el deny-list, considerar un código de error distinto para "cuenta sin rol
asignado" vs "reporter sin verificar" (opción c del brief) — da una señal accionable a operaciones
cuando algo produce una cuenta huérfana, en vez de tratarla en silencio como "confiable".

---

## 4. Matriz de cumplimiento del spec (evidencia de ejecución real)

| Requirement | Scenario | Test | Resultado |
|---|---|---|---|
| El auto-registro crea siempre un `reporter` | Alta correcta | `auth.register.spec.ts` (9/9) | ✅ COMPLIANT |
| El auto-registro crea siempre un `reporter` | Rol/organización inyectados | `auth.register.spec.ts` | ✅ COMPLIANT |
| El auto-registro crea siempre un `reporter` | Ya no es lápida (no 410) | ninguno en verde — `t6-aliases-gdpr.e2e-spec.ts` en rojo espera 410 | ❌ FAILING (C2) |
| Publicar exige correo verificado | Reporter no verificado → 403 | `regressions`/unit + `email-verified.guard.spec.ts` | ✅ COMPLIANT |
| Publicar exige correo verificado | Personal no afectado | `email-verified.guard.spec.ts` | ✅ COMPLIANT (para roles nombrados) |
| Publicar exige correo verificado | (no escrito en el spec) cuenta sin rol / rol borrado | — | ⚠️ el spec nunca contempló este caso; la implementación lo decide unilateralmente en dirección fail-open (C1) |
| El alta no revela si el correo ya existe | Correo nuevo / existente / sin duplicado / aviso / tiempos | `auth.register.spec.ts` (D3 + timing) | ✅ COMPLIANT |
| El alta está limitada en tasa | Ráfaga IP / correo / aislado | `auth.register.spec.ts` (A.10) | ✅ COMPLIANT (unit only, sin e2e — W5) |
| El ciudadano tiene una pantalla de registro | Ruta pública / login / OTP / sin filtrar / validación cliente | `register.component.spec.ts` (8/8) | ✅ COMPLIANT |
| El ciudadano tiene una pantalla de registro | Enlace tras reportar (cierra F4/B.2.12) | ninguno — no implementado | ❌ UNTESTED / NO IMPLEMENTADO (C3) |

**Resumen de cumplimiento**: 8/10 escenarios de alto nivel compliant; 2 fallando (C2, C3), 1 caso no
contemplado por el spec que la implementación decidió de forma potencialmente insegura (C1, transversal
a "Publicar exige correo verificado").

---

## 5. Veredicto

**FAIL.** 3 CRITICAL, 5 WARNING, 3 SUGGESTION.

No recomiendo archivar en este estado. El CRITICAL de seguridad (C1) es el más importante: la
ronda 3 resolvió el problema visible (tests rotos) invirtiendo la dirección de fallo del guard sin
notar que la nueva dirección abre un agujero más silencioso y más permanente que el que cerró. C2 y C3
son más simples de cerrar (un test a actualizar/borrar, un enlace a implementar o una casilla a
destildar) pero igual de bloqueantes por regla del proceso (checkbox falso, test propio en rojo).

Se mantiene `fixes-required.md` actualizado con las 3 acciones concretas para la ronda 4.
