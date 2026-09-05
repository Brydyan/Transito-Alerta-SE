# Fixes Required — REG: Auto-registro del ciudadano (sc-325) — actualizado tras verify ronda 3

Los fixes 1-4 de rondas 1-2 (boot, lint, timing, 7/12 fallos de `regressions.e2e-spec.ts`) están
**cerrados y re-verificados por ejecución real** en esta ronda (100/100 suites backend, 12/12
`regressions.e2e-spec.ts`, incluidos SQLi y XSS). No requieren más acción — quedan como referencia
histórica al final.

Ronda 3 introdujo un fix nuevo (deny-list en `EmailVerifiedGuard`) que cierra el problema anterior pero
abre uno nuevo, y dejó dos hallazgos abiertos sin cerrar. **3 CRITICAL nuevos**, ninguno relacionado con
lo ya cerrado. No los apliqué — soy auditor.

---

## Fix 5 (nuevo, el más importante) — El deny-list del guard es fail-open ante borrado/renombrado del rol `reporter`

**Archivo**: `backend/src/common/guards/email-verified.guard.ts:70-90`

**Síntoma** (no reproducible con un test existente — es un análisis de código, no un test roto):
un `admin_org`/`master` que **renombra** el rol `reporter` (`PATCH /api/roles/:id`, ruta
administrativa normal) hace que TODA la base de ciudadanos con ese rol deje de necesitar
`email_verified_at` para publicar, de forma permanente y silenciosa.

**Corrección del orquestador — el borrado NO es la vía.** El reporte de verify listaba el
soft-delete junto al renombrado; verificado contra el código, no lo es.
`auth.service.ts:596-601` hace `permissions = roleDeleted ? [] : (row.permissions ?? [])`,
así que un rol borrado deja al ciudadano **sin permisos**, y el `PermissionGuard` de clase
(`incidents.controller.ts:52`) lo rechaza en `@RequirePermission('CREATE')` antes de que el
fail-open del `EmailVerifiedGuard` sirva de algo: no publica sin verificar, no publica nunca.

El **renombrado** sí funciona, y es peor justamente porque no rompe nada visible:
`role_deleted_at` sigue en `null`, los permisos se conservan íntegros, y lo único que cambia
es que `roleName` deja de ser `'reporter'`. Un cambio cosmético en el panel de administración
desactiva un control de seguridad, sin error, sin log y sin usuarios bloqueados que avisen.
Encima `RolesService.update()` (`roles.service.ts:125-134`) no invalida el cache de permisos
—a diferencia de `delete()`, que sí lo hace—, así que el efecto entra por goteo a medida que
expira el TTL, lo que lo vuelve aún más difícil de correlacionar con su causa.

**Por qué pasa**: `user.roleName` en el guard viene de `AuthService.getAuthContextByUserId()`
(`auth.service.ts:544-620`), que colapsa a `null` tanto "nunca tuvo rol" (patrón legítimo de
`UsersService.adminCreate()` y de los fixtures de test) como "tenía un rol que ahora está
soft-deleted" (`role_deleted_at`, ya consultado en `auth.service.ts:569-573` pero descartado). El guard
no puede distinguir ambos casos con la información que recibe hoy.

**Opción recomendada (menor riesgo, consistente con D1 del propio design.md — fail-closed sobre
imposibilidad, no sobre validación)**:

1. Revertir el guard a allow-list explícito de los 4 roles de staff (`operador_org`, `admin_org`,
   `operador_sistema`, `master`); cualquier otra cosa (incluido `null`) vuelve a exigir verificación.
2. Arreglar la causa raíz real de los 7 fallos que motivaron el cambio en ronda 3: agregar un default
   `email_verified_at = now()` (o un flag `overrides.emailVerified`) a
   `test/support/test-environment.ts::provisionUser()` cuando no se pide explícitamente lo contrario.
   Es un cambio aditivo a una función usada sólo por tests — menor blast radius real que invertir una
   política de seguridad de producción para toda la base de usuarios.

**Alternativa** (si el equipo prefiere conservar el deny-list): agregar `roleWasDeleted: boolean` (o
similar) a `AuthContext`, poblado desde el `role_deleted_at` que la query ya trae, y hacer que el guard
exija verificación cuando `roleName === null && roleWasDeleted === true` — eximiendo sólo el caso
"nunca tuvo rol". Además arreglar `RolesService.update()` (`roles.service.ts:125-134`) para que
invalide el cache al renombrar un rol, igual que ya hace `delete()`.

**Test que debería existir tras el fix** (falta hoy en ambas direcciones):
```ts
it('un reporter sin verificar sigue bloqueado aunque su rol se renombre', async () => {
  // Provisionar un reporter SIN `email_verified_at`, renombrar el rol `reporter`
  // (PATCH /api/roles/:id), invalidar el cache de permisos, y confirmar que
  // POST /incidents SIGUE devolviendo 403 EMAIL_VERIFICATION_REQUIRED.
  //
  // Es el test que separa las dos políticas: con allow-list pasa, con el
  // deny-list actual falla. No sirve escribirlo con soft-delete en vez de
  // renombrado: ahí el PermissionGuard devuelve 403 por permisos vacíos y el
  // test pasaría sin ejercitar el EmailVerifiedGuard — verde por el motivo
  // equivocado, que es el defecto que este change ya cometió cuatro veces.
});
```

---

## Fix 6 (nuevo) — Test e2e propio de REG en rojo por contrato contradictorio

**Archivo**: `backend/test/e2e/t6-aliases-gdpr.e2e-spec.ts:217-224`

**Síntoma reproducible**:
```bash
cd backend
npx jest --config ./test/jest-e2e.json --testPathPattern='t6-aliases-gdpr'
# "T6.8.D2: POST /api/auth/register → 410 Gone" — expected 410 "Gone", got 400 "Bad Request"
```

**Causa**: este test afirma el contrato de la lápida T6.8.C1, que la tarea A.2 de este mismo change
revirtió intencionalmente en la ronda 1. Nadie actualizó ni borró el test en 3 rondas.

**Qué cambiar**: borrar este `it()` (y el bullet `T6.8.D2` del comentario de cabecera del `describe`,
línea ~10) — el contrato que describía ya no existe por decisión explícita de este change. Si se
quiere mantener cobertura de que la ruta responde razonablemente a un body vacío/malformado, un test
nuevo que afirme el contrato ACTUAL (200 con OTP enviado / 400 por validación / 429 por rate limit,
según el caso) sería el reemplazo correcto — pero eso es una mejora, no un requisito de este fix.

---

## Fix 7 (nuevo) — `tasks.md` B.5: casilla marcada sobre un escenario del spec sin implementar

**Archivo**: `openspec/changes/front/2026-09-02-reg-citizen-self-registration/tasks.md:102-109`

**Síntoma**: la casilla es `[x]` pero el texto que la acompaña dice *"NO HECHO en esta ronda"*. El
escenario correspondiente SÍ existe en `specs/citizen-registration/spec.md`
("Scenario: Enlace tras reportar — cierra F4/B.2.12") y no está implementado — confirmado por grep en
`frontend/src/app/features/citizen-report/` (sin ninguna referencia a "registro"/"register").

**Qué hacer** (dos caminos válidos, a elección del equipo):
1. Implementar el enlace al final del asistente de reporte ciudadano (la pantalla `citizen-report`
   existe; falta la transición post-envío que ofrezca "registrate o iniciá sesión"), o
2. Si se decide diferir a F4 como dice el texto, **destildar la casilla** (`[ ]`) y mover el escenario
   correspondiente del spec a un "Fuera de alcance de esta ronda, cerrado por F4" explícito — no
   dejarla marcada como hecha.

Lo que no es aceptable es el estado actual: casilla en verde, texto y código en rojo.

---

## Orden sugerido

1. Fix 5 primero — es la decisión de seguridad con mayor impacto y la más costosa de revertir después
   de archivar (agujero permanente, sin restore).
2. Fix 6 — mecánico, un test a borrar/actualizar.
3. Fix 7 — mecánico, una casilla a destildar o un enlace a implementar.
4. Correr de nuevo la suite completa de 48 archivos e2e (no una muestra) para confirmar que Fix 5 no
   introduce una regresión nueva sobre los tests de la ronda 2 (`regressions.e2e-spec.ts` 12/12).
5. Actualizar `tasks.md` (A.6/A.7) y `apply-progress.md` para que documenten la ronda 3 real, en vez de
   quedar congelados en el estado de ronda 2.
6. Recién ahí pedir un nuevo `sdd-verify`.

---

## Referencia histórica — Fixes 1-4 (rondas 1-2, CERRADOS, no requieren acción)

- ~~Fix 1 — boot roto por `UserEntity` faltante en `forFeature`~~ — cerrado y re-verificado: `nest build`
  exit 0, 100/100 suites unitarias pasan (el DI graph se ejercita indirectamente). Sigue pendiente el
  test de regresión de boot dedicado (`*.module.boot.spec.ts`) — ver WARNING W3 en `verify-report.md`.
- ~~Fix 2 — lint (código muerto)~~ — cerrado, re-verificado: `pnpm run lint` → 0 errors, 19 warnings
  preexistentes sin relación con REG.
- ~~Fix 3 — canal lateral de tiempo~~ — cerrado, re-verificado vía el test de timing en
  `auth.register.spec.ts`.
- ~~Fix 4 — `EmailVerifiedGuard` bloqueaba cuentas con `role_id` NULL~~ — cerrado, re-verificado:
  `regressions.e2e-spec.ts` 12/12, incluidos los tests de inyección SQL y XSS. **Pero el mecanismo
  elegido para cerrarlo (deny-list) es el Fix 5 de esta ronda** — no es un cierre limpio, cambió la
  naturaleza del problema.
