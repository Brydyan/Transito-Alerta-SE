# Fixes Required — REG: Auto-registro del ciudadano (sc-325) — actualizado tras verify ronda 4

Los Fixes 5, 6 y 7 de la ronda 3 (allow-list del `EmailVerifiedGuard`, test 410 Gone
contradictorio, casilla B.5 falsa) están **cerrados y re-verificados por ejecución real**
en esta ronda. No requieren más acción — quedan como referencia histórica al final.

La propia corrección del Fix 5 introdujo **1 CRITICAL nuevo**, no detectado antes de esta
ronda. No lo apliqué — soy auditor.

---

## Fix 8 (nuevo, bloquea archivar) — El default de `provisionUser()` rompe `email-verification.e2e-spec.ts`

**Archivo causa**: `backend/test/support/test-environment.ts:344`
**Archivo síntoma**: `backend/test/e2e/email-verification.e2e-spec.ts:36-39`

**Síntoma reproducible**:
```bash
cd backend
npx jest --config ./test/jest-e2e.json --testPathPattern='email-verification'
# T6.5.D3a: expected 202 "Accepted", got 422 "Unprocessable Entity"
# T6.5.D3b: expected 202 "Accepted", got 422 "Unprocessable Entity"
# T6.5.D3d: expected 202 "Accepted", got 422 "Unprocessable Entity"
```

**Causa**: la ronda 4 agregó `emailVerified = overrides.emailVerified ?? true` a
`provisionUser()`, con default `true` (cuenta ya verificada) salvo que un test pida
explícitamente lo contrario. `provisionEmailUser()` en `email-verification.e2e-spec.ts:38`
llama `env.provisionUser([], { email })` sin `emailVerified: false`, así que ahora las
cuentas de ese archivo nacen YA verificadas. `EmailVerificationService.resendVerification()`
(`email-verification.service.ts:89-90`) rechaza con 422 "Email is already verified" a una
cuenta que ya lo está — comportamiento preexistente y correcto; lo nuevo es que este archivo
ahora SIEMPRE cae en esa rama.

**Por qué bloquea archivar**: `pnpm run test:e2e` (el comando exacto del job `integration` de
`ci.yml`) termina con exit code 1 por esta causa. Es 100% atribuible a REG: el archivo que
cambió es `test-environment.ts` (tocado sólo por este change), y `email-verification.e2e-spec.ts`
no depende de nada del change hermano ANON.

**Qué cambiar**: en `email-verification.e2e-spec.ts:38`, pasar `{ email, emailVerified: false }`
a `provisionUser()`. Cambio de una línea. **Después del fix, correr los 48 archivos e2e
completos de nuevo** (no sólo este archivo) — el objetivo es confirmar que no hay otro
archivo con el mismo patrón (`provisionUser()` sin `emailVerified: false` esperando la rama
"no verificado") que este verify no haya encontrado por casualidad del orden de ejecución de
Jest. `grep -rn "emailVerified" backend/test/e2e/*.ts` da 0 resultados hoy — ningún otro
archivo pide explícitamente el override, así que vale la pena revisar uno por uno cuáles
dependen de un estado "no verificado" que el nuevo default pudo haber apagado en silencio.

---

## Recomendados (no bloquean archivar, pero el equipo debería decidir conscientemente)

- **W1** — Escribir el test e2e que el Fix 5 original pedía y que sigue sin existir: un
  `reporter` provisionado con `emailVerified: false`, cuyo rol se renombra vía
  `PATCH /api/roles/:id` (ruta real, no soft-delete), sigue recibiendo 403
  `EMAIL_VERIFICATION_REQUIRED` en `POST /incidents`. Hoy sólo hay una versión unitaria con
  un objeto de usuario armado a mano (`email-verified.guard.spec.ts:75-89`).
- **W2** — Corregir el comentario de `t6-aliases-gdpr.e2e-spec.ts:17-18`: afirma que existe
  "el spec e2e que REG agregó" para `/auth/register`. No existe ninguno — sólo
  `auth.register.spec.ts` (unit).
- **W3** — Actualizar `apply-progress.md`: sigue congelado en el estado de la ronda 2; no
  documenta nada de las rondas 3 ni 4.
- **W4** — Corregir `tasks.md` A.7: dice "el spec unitario dedicado al guard no se escribió
  en esta ronda", pero `email-verified.guard.spec.ts` sí existe (8 tests, ronda 4).
- **W5** — Corregir el docstring de cabecera de `email-verified.guard.spec.ts:10-19`: describe
  la política vieja (deny-list, ronda 3) que el propio archivo ya no testea.

Ver `verify-report.md` (ronda 4) para el detalle completo, incluyendo SUGGESTION S1/S2 y el
análisis de por qué el allow-list del Fix 5 es exhaustivo y correcto (confirmado contra
`0009_roles_permissions.sql` + `0040_rename_roles.sql`, y reforzado por el `UNIQUE` en
`roles.name` de `0001_initial_schema.sql:18`, que cierra el vector de colisión de nombres).

---

## Orden sugerido

1. Fix 8 primero — es lo único que bloquea archivar (compuerta de CI en rojo).
2. Correr de nuevo la suite completa de 48 archivos e2e (no una muestra) tras el Fix 8.
3. W1-W5 a discreción del equipo — ninguno reabre el agujero de seguridad ya cerrado; son
   deuda de cobertura y de higiene documental.
4. Recién ahí pedir un nuevo `sdd-verify` (o archivar directamente si el equipo decide que
   W1-W5 son aceptables como deuda conocida y documentada).

---

## Referencia histórica — Fixes 1-7 (rondas 1-3, CERRADOS, no requieren acción)

- ~~Fix 1 — boot roto por `UserEntity` faltante en `forFeature`~~ — cerrado, re-verificado en
  ronda 4 además: los 48 archivos e2e arrancan la app real (Nest + Postgres + Redis) sin
  fallos de boot.
- ~~Fix 2 — lint (código muerto)~~ — cerrado, re-verificado: `pnpm run lint` → 0 errors, 19
  warnings preexistentes sin relación con REG.
- ~~Fix 3 — canal lateral de tiempo~~ — cerrado, re-verificado.
- ~~Fix 4 — `EmailVerifiedGuard` bloqueaba cuentas con `role_id` NULL~~ — cerrado; el mecanismo
  final (allow-list, Fix 5) reemplazó el deny-list que lo cerraba en la ronda 3.
- ~~Fix 5 — deny-list fail-open ante renombrado del rol `reporter`~~ — cerrado con allow-list
  exhaustivo, re-verificado contra las migraciones reales de roles.
- ~~Fix 6 — test e2e propio de REG en rojo por contrato contradictorio (410 Gone)~~ — cerrado,
  el test se borró y el comentario documenta por qué (aunque con una afirmación falsa sobre
  cobertura de reemplazo — ver W2 arriba).
- ~~Fix 7 — `tasks.md` B.5 marcada `[x]` sobre un escenario sin implementar~~ — cerrado,
  casilla destildada y consistente con el spec.
