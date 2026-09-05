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
- [x] **A.6** — Guard `EmailVerifiedGuard`. **HECHO (ronda 1, ronda 4
  Fix 5, ronda 6 Fix 10, ronda 7 D3).** Estado consolidado:
  `backend/src/common/guards/email-verified.guard.ts` rechaza con 403
  `EMAIL_VERIFICATION_REQUIRED` a un `reporter` sin `email_verified_at`;
  exime al personal (`operador_org`, `admin_org`, `operador_sistema`,
  `master`) por **allow-list exhaustivo** (Fix 5, ronda 4) — el deny-list
  del Fix 4 era fail-open ante renombrado del rol. Fix 10 (ronda 6)
  añadió la exención para `user.isAnonymous === true` (el dispositivo
  anónimo no tiene correo que verificar). Aplicado a los métodos
  `POST` de `IncidentsController` y `CommentsController` con
  `@UseGuards(EmailVerifiedGuard)` method-level (no a la clase — el guard
  sólo bloquea creación, no lectura).
- [x] **A.7** — Specs de verificación. **HECHO** — dos niveles:
  `backend/src/common/guards/email-verified.guard.spec.ts` (7 tests,
  unitario) prueba que el guard DECIDE bien: cada rol de staff, `reporter`
  con y sin verificar, `roleName` nulo, usuario ausente, y el caso
  de seguridad (Fix 5): un `roleName` renombrado a `'civic_hero'`
  sigue exigiendo verificación (fail-closed).
  `backend/test/e2e/email-verified-guard.e2e-spec.ts` (6 tests) prueba que
  está ENCHUFADO, contra la app real: sin él, borrar el `@UseGuards` del
  controlador deja el unitario en verde porque la función que examina no
  cambió. Incluye el caso que distingue allow-list de deny-list — un rol
  renombrado sigue exigiendo verificación — verificado por mutación: con la
  política de la ronda 3, ese test y sólo ese falla.
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
- [x] **B.6** — Al completar el alta, navegar a la pantalla de verificación.
  **HECHO (ronda 6, Fix 9) — vía parcial.** `register.component.ts:onSubmit`
  navega a `/verify-email` con `email` y `hint` en query params.
  `app.routes.ts` ahora declara la ruta con `guestGuard` y
  `loadComponent: VerifyEmailComponent`. El componente existe
  (`verify-email.component.ts`, standalone, primitivos de F0).
  El composer del OTP (lo que hacía el `.js` heredado de sc-117
  con las 6 celdas y el autoadvance) NO está implementado: el
  endpoint `/api/email/resend-verification` exige JWT, y el
  alta pública no emite tokens. La pantalla lleva al login
  con el correo pre-rellenado; tras autenticarse, el composer
  entra cuando F4 lo enchufe. **El fix es parcial porque la
  afirmación original — "el componente `verify-email` ya
  existe, no se construye uno nuevo" — era falsa en el
  round 0 (sólo había un `.html`/`.js` heredado).** Specs:
  - `verify-email.component.spec.ts` (4 tests): el componente
    se monta con los query params, el email se pre-rellena, sin
    sesión lleva al login, con sesión muestra el mensaje de
    F4-placeholder.
  - `app.routes.verify-email.spec.ts` (3 tests): la ruta
    existe, carga el `.ts` (no el `.html` heredado), y NO está
    bajo `authGuard` (verificación por mutación).
- [x] **B.7** — Validación en el cliente: correo y política de contraseña, sin llamar
  al servidor. **HECHO** — el `FormBuilder` del componente declara
  `Validators.required`, `Validators.email`, `Validators.maxLength(254)`,
  `Validators.minLength(12)`, `Validators.maxLength(128)` y un `Validators.pattern`
  con la regex de complejidad sincronizada con `PasswordHasher.assertStrongEnough`.
  `onSubmit` valida con `if (this.registerForm.invalid) return` antes de
  llamar al servicio. El spec cubre los 5 patrones de contraseña débil
  que se rechazan.
- [x] **B.8** — Specs de pantalla. **HECHO (ronda 6, Fix 9).**
  `register.component.spec.ts` tiene 8 tests reales: validación
  de cliente (formulario vacío, contraseña débil en 5 variantes,
  contraseña válida, email inválido), POST a `/auth/register`
  con body correcto, rate limit 429 y error 500. **Se mantienen.**
  La afirmación rota del round 0 — "el test «navega al verify-email»
  prueba que el destino existe" — se corrige con:
  - `app.routes.verify-email.spec.ts` (3 tests): la ruta
    existe, carga el `.ts` (no el `.html` heredado), y NO está
    bajo `authGuard`. **Verificación por mutación**: borrar la
    ruta, este spec cae. Esa es la red que faltaba.
  - `verify-email.component.spec.ts` (4 tests): el componente
    se monta con los query params, el email se pre-rellena,
    sin sesión lleva al login, con sesión muestra el mensaje
    de F4-placeholder.
  - `backend/test/e2e/registration-flow.e2e-spec.ts` (3
    tests): el alta completa de punta a punta — POST
    `/api/auth/register` con correo nuevo crea la cuenta con
    rol `reporter` y emite OTP; con correo existente NO crea
    duplicada y devuelve la misma forma (D3); con campos de
    escalada (`role`, `permissions`, `organization_id`) el
    backend rechaza con 400 y la cuenta NO se crea.

## C · Cerrar el círculo de verificación

> **Por qué existe este grupo.** Hasta la ronda 8, REG creaba la cuenta, el backend
> emitía el OTP al correo… y no había dónde escribirlo. `verify-email` sólo informaba y
> mandaba al login. El ciudadano quedaba registrado y sin poder publicar, que es
> exactamente para lo que quería la cuenta.
>
> **Decisión de producto (2026-09-05): se verifica DESPUÉS de iniciar sesión.** Los dos
> endpoints del OTP viven detrás de `JwtAuthGuard`
> (`email-verification.controller.ts`, guard a nivel de clase) y el alta pública no emite
> token. Abrir un endpoint sin sesión era la alternativa, y se descartó: agrega
> superficie anónima nueva y con ella otro oráculo de enumeración — el defecto que este
> mismo change acaba de cerrar en el Fix 12. Verificar tras el login no necesita ningún
> endpoint nuevo, y encaja con D2: se puede entrar sin verificar, no se puede publicar.

- [ ] **C.1** — `GET /auth/me` informa si el correo está verificado.
  Hoy devuelve `{ user_id, device_uuid, permissions }` (`auth.controller.ts:166-173`).
  El frontend **no tiene forma de saberlo**: ni el login ni `/auth/me` lo exponen, y el
  guard sólo lo revela negando un 403 cuando ya intentaste publicar.
  Agregar un booleano derivado de `email_verified_at`. Es el único cambio de backend de
  este grupo, y va en un endpoint que ya exige sesión: sin superficie nueva.
  Nombre en snake_case — `SnakeCaseResponseInterceptor` reescribe la respuesta, así que
  verificá la forma que **emite el controlador**, no la del tipo TypeScript. Es la
  trampa de A.11 y la que produjo cuatro defectos en el change hermano sc-303.

- [ ] **C.2** — Spec de C.1 en `auth.controller.spec.ts`: un usuario verificado y uno
  sin verificar devuelven valores distintos. Afirmar sobre la **respuesta**, no sobre la
  llamada al service.

- [ ] **C.3** — Pantalla del OTP, detrás de `authGuard`.
  Contrato real, leído del controlador — **no del `.js` heredado, que ya no existe**:
  - `POST /api/email/verify-otp`, body `{ otp: string }` → **200** `{ verified: true }`
  - `POST /api/email/resend-verification`, sin body → **202** `{ queued: true }`
  - **422** código inválido o vencido, y también correo ya verificado
  - **429** reenvío dentro de los 60 segundos
  - **401** sin token
  Los cuatro códigos tienen que distinguirse en pantalla. El 429 **no es un fallo**: es
  «esperá un minuto», y presentarlo como error rojo enseña a desconfiar de la pantalla.
  El 422 tiene dos causas distintas y el mensaje debe separarlas: código equivocado se
  reintenta, correo ya verificado significa que terminaste.
  Primitivos de F0, como el resto de `features/auth/`.

- [ ] **C.4** — Tras iniciar sesión, el `reporter` sin verificar llega a la pantalla de
  C.3 sin buscarla. El personal (`operador_org`, `admin_org`, `operador_sistema`,
  `master`) entra al panel como siempre — la verificación no le aplica, igual que en
  `EmailVerifiedGuard`.
  **La regla vive en un solo lugar.** Si la decisión se duplica entre el login y un
  guard de ruta, una de las dos copias se va a quedar vieja: es el defecto recurrente de
  este proyecto, una regla aplicada en un sitio y no en su vecino.

- [ ] **C.5** — `verify-email` (la pantalla pública que ya existe) sigue siendo el
  destino tras el alta, pero deja de ser un callejón: enlaza al login explicando que hay
  que entrar para ingresar el código. Actualizar su JSDoc, que hoy dice que el composer
  «entra cuando F4 lo enchufe» — F4 ya no es el dueño de esto.

- [ ] **C.6** — Spec del componente de C.3: los cuatro códigos (200, 422 × 2 causas,
  429), el estado inicial, y que un código vencido **no** cierra la sesión.
  Aserciones de igualdad donde el contrato exige igualdad. `.toMatch(/parcial/)` sobre
  una respuesta que el spec declara idéntica es una aserción que no puede fallar cuando
  importa: así sobrevivió el Fix 12 durante seis rondas.

- [ ] **C.7** — Spec de ruta, como `app.routes.verify-email.spec.ts`: la ruta de C.3
  existe y **está** bajo `authGuard`. **Verificación por mutación**: borrala y este spec
  tiene que caer. Si no cae, no prueba nada — es lo que dejó pasar el Fix 9.

- [ ] **C.8** — e2e del ciclo completo, en `backend/test/e2e/`: registrar → iniciar
  sesión → `POST /incidents` **rechazado con 403** → verificar el OTP → `POST /incidents`
  **aceptado con 201**.
  **Es la tarea más importante del grupo.** Los cuatro defectos que obligaron a
  desarchivar este change vivían en el tramo que ningún e2e recorría. Este lo recorre
  entero. Afirmá sobre el **código** de error y no sólo sobre el estado: un 403 del
  `PermissionGuard` y uno del `EmailVerifiedGuard` son indistinguibles por número.
  El OTP se lee de la BD (`users.verification_otp`), como ya hace
  `email-verification.e2e-spec.ts`.

- [ ] **C.9** — Actualizar `apply-progress.md`, que sigue congelado en la ronda 2 y no
  documenta las rondas 5 a 8. Y la sección «Estado de gates» del final de este archivo,
  con números de la ronda 2.

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
