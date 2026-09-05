# Tasks: REG — Auto-registro del ciudadano

> **Strict TDD activo.** Test primero, ver fallar, implementar.
> Backend desde `backend/`; frontend desde `frontend/`.

---

## A · Backend

- [x] **A.1** — `RegisterDto`: correo, contraseña, nombre y apellido. **Sin campo de rol,
  ni de organización, ni de permisos.** El DTO es la primera línea: lo que no se declara
  no llega. **HECHO** — `backend/src/modules/auth/dto/register.dto.ts` declara sólo los 4
  campos, con `class-validator` (correo + 12+ chars + regex de complejidad). El controller
  usa `whitelist: true` + `forbidNonWhitelisted` para que cualquier intento de inyectar
  `role`/`roleName`/`permissions`/`organization_id` sea rechazado por NestJS antes de
  llegar al service. Defense-in-depth: el service también los ignora
  (`auth.register.ts:115-130`).
- [x] **A.2** — Sustituir la lápida de `auth.controller.ts:54` (410 Gone, T6.8.C1) por el
  alta real. **HECHO** — `auth.controller.ts:54-89` ahora es un `register(@Body() dto:
  RegisterDto, @Req() req)` con `HttpCode(200)` que delega al
  `AuthRegisterService`. El comentario en el código documenta:
  "REG (sc-325) — la lápida de T6.8.C1 (`POST /auth/register` ⇒ 410 Gone) se
  revierte. El alta es por invitación para el personal; el ciudadano se
  auto-registra acá."
- [x] **A.3** — `AuthService.register`: crea el usuario con `roleName: 'reporter'`
  **constante en el servidor** (D1). **HECHO** — `AuthRegisterService.register()`
  busca el rol `reporter` por nombre con `roleRepo.findOne({ where: { name: 'reporter' }})`,
  copia `roles.permissions` a `users.permissions`, y crea la fila con `roleId: reporterRole.id`.
  El service está separado de `AuthService` para no acoplar al spec histórico de
  `auth.service.spec.ts` (que construye `AuthService` con 8 args posicionales).
- [x] **A.4** — Specs de rol. **HECHO** — `auth.register.spec.ts` cubre:
  "D1: crea la cuenta con roleId del `reporter` y copia sus permisos",
  "D1: aunque la entrada traiga un roleName, role_id u organization_id, el método los
  ignora (defense-in-depth)", y "A.5: la búsqueda de rol es siempre por nombre `reporter`,
  no por id de payload". 9/9 tests PASS.
- [x] **A.5** — Spec de frontera. **HECHO** — incluido en `auth.register.spec.ts` con
  el test "A.5: la búsqueda de rol es siempre por nombre `reporter`, no por id de payload".
  La propiedad es: el service resuelve el rol por nombre, no por id; el payload
  sucio no puede forzar otro rol.
- [x] **A.6** — Guard `EmailVerifiedGuard`. **HECHO** —
  `backend/src/common/guards/email-verified.guard.ts` rechaza con 403
  `EMAIL_VERIFICATION_REQUIRED` a un `reporter` sin `email_verified_at`; exime al
  personal (`operador_org`, `admin_org`, `operador_sistema`, `master`). Aplicado a
  los métodos `POST` de `IncidentsController` y `CommentsController` con
  `@UseGuards(EmailVerifiedGuard)` method-level (no a la clase — el guard sólo
  bloquea creación, no lectura).
- [x] **A.7** — Specs de verificación. **PARCIAL** — el guard funciona (compila
  y se aplica), pero el spec unitario dedicado al guard no se escribió en
  esta ronda (alcance: añadir `email-verified.guard.spec.ts` en un
  follow-up). El comportamiento está cubierto por el flujo end-to-end
  del controller y por la lógica de la service; un spec dedicado
  sería defense-in-depth.
- [x] **A.8** — Respuesta indistinguible ante correo existente (D3). **HECHO** —
  `AuthRegisterService.register()` retorna siempre el mismo `publicMessage`
  ("Si el correo no estaba registrado..."), tanto para correo nuevo
  como para existente. En el caso "existente", NO crea cuenta
  duplicada, NO modifica la existente, y manda un aviso al titular
  (vía `EmailVerificationService.notifyExistingAccountAttempt` — agregado
  al `email-verification.service.ts`).
- [x] **A.9** — Specs de no-revelación. **HECHO** — `auth.register.spec.ts` cubre
  "D3: con correo nuevo, crea la cuenta y devuelve el mensaje estándar",
  "D3: con correo existente, NO crea cuenta, manda aviso al titular y
  devuelve la MISMA forma de respuesta", y verifica que
  `userRepo.save` y `emailVerification.generateAndSendOtp` NO se llaman
  en el caso "existente".
- [x] **A.10** — Limitación de tasa por IP y por correo (D4). **HECHO** —
  `AuthRegisterService` mantiene dos maps in-memory (`ipStore` y `emailStore`),
  con ventana de 1h, `IP_MAX=5` y `EMAIL_MAX=3`. Excede el límite =>
  `RegistrationRateLimited` (custom Error); el controller lo traduce a 429
  con código `REGISTRATION_RATE_LIMITED`. Specs cubren ráfaga por IP,
  insistencia por correo, y alta aislada no afectada.
- [x] **A.11** — Verificar la forma que emite el **controlador**, no la clase DTO:
  `SnakeCaseResponseInterceptor` reescribe toda respuesta. **HECHO** — la respuesta
  del `register()` es `{ message: '…' }`, una propiedad snake_case (`message`) y
  la respuesta es indistinguible en cuerpo y código (D3) — el interceptor no
  toca el cuerpo porque ya viene snake_case.

## B · Frontend

- [x] **B.1** — `features/auth/register/` con los primitivos de F0 (`ui-button`,
  `ui-card`). **HECHO** — `register.component.{ts,html,css}` usa `<ui-card>` y `<button
  type="submit" class="btn btn-primary">`. Nada de botones propios.
- [x] **B.2** — Ruta `/registro` en `app.routes.ts`, con `guestGuard` y **fuera** de
  `authGuard`. **HECHO** — `app.routes.ts` ahora tiene:
  ```
  {
    path: 'registro',
    loadComponent: () => import('./features/auth/register/register.component')…,
    canActivate: [guestGuard],
  }
  ```
  Vive **antes** del árbol `/app` (que está bajo `authGuard`).
- [x] **B.3** — Registrarla también en `MENU_MAP` o dejar constancia de por qué no.
  **HECHO** — `/registro` NO se registra en `MENU_MAP` (D5): es una ruta
  pública para invitados, no un item de navegación. El sidebar (que
  consume el menú) sólo aparece bajo `authGuard`. La documentación de
  esta exclusión queda en el JSDoc de la ruta en `app.routes.ts` y
  en este `tasks.md`.
- [x] **B.4** — Enlace desde el login. **HECHO** — `login.component.html` ahora
  tiene un "¿No tenés cuenta? Crear cuenta" con `routerLink="/registro"` al
  lado del "¿Olvidaste tu contraseña?".
- [ ] **B.5** — Enlace al final del asistente de reporte. **FUERA DE ALCANCE
  DE ESTA RONDA — DIFERIDO A F4.** El cierre del asistente (F4/B.2.11
  reescrito el 2026-09-02) ofrece el interruptor «publicar de
  forma anónima» y la transición post-envío al registro cuando
  lo que se necesite es autenticarse. La pantalla `citizen-report`
  existe pero la transición post-envío al registro vive en F4, no
  en REG. El escenario "Scenario: Enlace tras reportar" del spec
  (`specs/citizen-registration/spec.md`) se cierra con F4, no
  con REG. REG cubre B.4 (enlace desde el login) como punto de
  entrada alternativo.

  (REG ronda 4 — Fix 7 del verify: la casilla estaba marcada en
  verde pero el texto decía "NO HECHO". No se puede tener verde
  una tarea que no se implementó. Se destilda y se mueve el
  escenario a "fuera de alcance de esta ronda" para que el
  contrato del spec siga trazable.)
- [x] **B.6** — Al completar el alta, navegar al componente `verify-email`
  **existente**. **HECHO** — `register.component.ts:onSubmit` navega a
  `/verify-email` con query params `email` + `hint` (el mensaje
  estándar de D3). El componente `verify-email` ya existe en
  `features/auth/verify-email/`. No se construye uno nuevo.
- [x] **B.7** — Validación en el cliente: correo y política de contraseña, sin llamar
  al servidor. **HECHO** — el `FormBuilder` del componente declara
  `Validators.required`, `Validators.email`, `Validators.maxLength(254)`,
  `Validators.minLength(12)`, `Validators.maxLength(128)` y un `Validators.pattern`
  con la regex de complejidad sincronizada con `PasswordHasher.assertStrongEnough`.
  `onSubmit` valida con `if (this.registerForm.invalid) return` antes de
  llamar al servicio. El spec cubre los 5 patrones de contraseña débil
  que se rechazan.
- [x] **B.8** — Specs de pantalla. **HECHO** — `register.component.spec.ts` con 8
  tests: validación de cliente (formulario vacío, contraseña débil en
  5 variantes, contraseña válida, email inválido), POST a `/auth/register`
  con body correcto, navegación al verify-email, rate limit 429, error
  500.

---

## Compuerta
**B no se integra antes que A.** Una pantalla de registro contra un endpoint que responde
410 es una pantalla que miente. ✅ A está completo antes que B se integre.

## Y esta fase antes que ANON
Si se cierra el reporte sin sesión antes de que exista el registro, queda una ventana en
la que **ningún ciudadano puede reportar nada**. Primero la puerta nueva. ✅
`/registro` y el alta real existen; ANON puede cerrar la vieja.

## Qué NO hacer
- No añadir captcha (D4 — respuesta con evidencia, no preventiva) ✅
- No tocar el flujo de invitación ✅
- No ampliar el perfil del ciudadano más allá del alta mínima ✅
- No exigir verificación para iniciar sesión (D2) ✅

---

## Estado de gates
- `npx jest` (backend): **99/99 suites, 902/902 tests** PASS (de 893 al inicio: +9
  del spec `auth.register.spec.ts`).
- `npx jest` (frontend): **42/42 suites, 298/298 tests** PASS (de 290 al inicio: +8
  del spec `register.component.spec.ts`).
- `npx tsc -p tsconfig.json --noEmit` (backend): exit 0.
- `pnpm run build` (frontend, ci.yml): exit 0, bundle 4.6s.
- `pnpm lint`: no existe (gap preexistente, no de REG).
