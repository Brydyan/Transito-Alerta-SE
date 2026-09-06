# Verify report — ronda 10 (grupo C, cierre de los 3 CRITICAL de la ronda 9)

**Change**: `2026-09-02-reg-citizen-self-registration` (story sc-325)
**Fecha**: 2026-09-05
**Alcance auditado**: los tres Fix (A, B, C) de `fixes-required.md` (ronda 9) +
recorrido completo del grupo C. Fuera de alcance por instrucción explícita:
`0048_close_anonymous_ceiling.sql`, su rollback, `anon-config.patch`,
`apply-progress.md`/`tasks.md` de `back/2026-09-02-anon-close-anonymous-reporting`.

---

## Método

Todo lo reportado abajo es de **ejecución real**, no lectura de código:
- Las 5 compuertas de `ci.yml` corrieron completas (backend lint/typecheck/build/test,
  frontend test/build/tsc, e2e backend íntegro — 51 archivos).
- Dos mutaciones reales sobre archivos sin commitear, restauradas por copia desde
  `.bak` (nunca con `git checkout`), verificadas con `git status --short` +
  `git diff --stat` al terminar (árbol idéntico al de partida, sólo con los diffs
  legítimos de la ronda 10).

---

## CRITICAL 1 — el desvío del login (verificado: CERRADO)

- **Wire real**, no el tipo TypeScript: `auth.controller.ts:166-195` (`GET /auth/me`)
  devuelve `role_name` ya en snake_case — no pasa por reescritura del
  `SnakeCaseResponseInterceptor` porque el controlador ya lo emite así. Confirmado
  leyendo el cuerpo de `createBody`/`BaseExceptionFilter` no aplica aquí (esto es
  una respuesta 200 normal, no una excepción) — el objeto que retorna `controller.me`
  es el body final.
- **Origen del valor**: `auth.service.ts:getMe` llama a `getAuthContextByUserId`
  (línea 453/458), que hace `LEFT JOIN roles` y cachea el contexto bajo
  `perm:v3:uid:{userId}` con el TTL configurado. Es la misma cache de permisos que ya
  usa `PermissionGuard`; no es infraestructura nueva de REG. Puede quedar
  desincronizado sólo por el TTL general del sistema (ya existente, ya mitigado por
  `invalidatePermissionCache` en `RolesService.assignRole`) — no es un riesgo nuevo
  introducido por este change.
- **Duplicación de la regla — hallazgo real (ver WARNING 1)**: `LoginComponent`
  compara `roleName === 'reporter'` (positivo, un solo rol) mientras que
  `EmailVerifiedGuard.STAFF_ROLES` es un allow-list de 4 roles de staff (negativo:
  todo lo que no es staff exige verificación). Hoy coinciden en efecto porque sólo
  existen esos 5 roles. No son la misma lista ni la misma forma de regla.
- **Test real, no over-mockeado**: `login.component.spec.ts` (8 tests) monta el
  `LoginComponent` real contra un `AuthService` stub y hace `fireSubmit` real sobre
  el componente. **Verificación por mutación ejecutada por mí**: cambié la condición
  a `current?.roleName === 'nonexistent_role'` → el test
  `Fix A: reporter sin verificar → navega a /verificar` **cayó** (esperaba
  `['/verificar']`, recibió `['/app/dashboard']`). Archivo restaurado por copia desde
  `.bak`; `git diff --stat` confirma el árbol igual al de antes de mutar.
- **Veredicto**: CERRADO. El wire, el origen del dato, y el test están correctos y
  con red real.

## CRITICAL 2 — el 422 y su código (verificado: CERRADO)

- `email-verification.service.ts` — confirmado línea por línea: las 5 ramas
  (`generateAndSendOtp` ×2, `verifyOtp` ×3) lanzan
  `new UnprocessableEntityException({ code, message })`. Verifiqué en
  `node_modules/@nestjs/common` cómo NestJS serializa esto: `HttpException.createBody`
  con un objeto como `arg0` retorna el objeto **tal cual** (no le agrega
  `statusCode`), y `BaseExceptionFilter` lo manda como body sin envolver. El wire
  real es `{ code: 'OTP_INVALID', message: '...' }` — sin `statusCode` embebido en
  el body (el status HTTP sí es 422). Confirmé que **el mismo patrón exacto**
  (sin `statusCode` en el body) ya lo usan `email-verified.guard.ts` y
  `token-codec.ts`, con e2e propios pasando desde rondas anteriores — no es una
  forma nueva ni inconsistente con el proyecto.
- `verifyOtp()` ahora chequea `user.emailVerifiedAt` **antes** de mirar si hay OTP
  pendiente (línea 156, antes de línea 163) — el submit repetido tras un éxito, o un
  OTP viejo reenviado, cae en `EMAIL_ALREADY_VERIFIED` y no en `OTP_INVALID`.
- **e2e real, no mock**: `backend/test/e2e/email-verification.e2e-spec.ts` corrido
  contra Testcontainers real. Tres asserts sobre `res.body.code` (no sólo
  `.expect(422)`): `EMAIL_ALREADY_VERIFIED` con usuario ya verificado, `OTP_INVALID`
  con OTP vencido, `OTP_INVALID` con OTP no-vencido pero incorrecto. Las tres
  pasaron en la corrida completa (51/51 suites, 445/445 tests, ver sección de
  compuertas).
- **429**: `assertRateLimit` sigue lanzando `HttpException` simple (no
  `UnprocessableEntityException`) con mensaje "Please wait 60 seconds…" y status 429
  — el frontend lo distingue por `e.status === 429`, no por `code`, lo cual es
  correcto porque el 429 es un status distinto, no ambiguo como el 422.
- **Veredicto**: CERRADO. El contrato de wire está fijado por tests reales contra la
  app real, carácter por carácter (`OTP_INVALID`, `EMAIL_ALREADY_VERIFIED`).

## CRITICAL 3 — la navegación tras verificar (verificado: CERRADO, con una salvedad — ver WARNING 2)

- `VerifyOtpComponent` inyecta `Router` (línea 53) y `ActivatedRoute` (línea 58).
  Tras el 200 (`success`, línea 123) y tras el 422 `EMAIL_ALREADY_VERIFIED`
  (`already`, línea 139) llama `router.navigateByUrl(this.returnUrl)`, con
  `returnUrl` leído de la query param (si empieza con `/app/`) o `/app/dashboard`
  por defecto.
- **Verificación por mutación ejecutada por mí**: comenté las dos líneas
  `this.router.navigateByUrl(this.returnUrl);` (una en `success`, otra en
  `already`) y corrí `verify-otp.component.spec.ts`. **Cayeron exactamente los 2
  tests que afirman sobre `navigateByUrl`** (`C.6: 200 ... navega al dashboard` y
  `C.6: 422 con code EMAIL_ALREADY_VERIFIED ... navega al dashboard`), los otros 8
  pasaron. Archivo restaurado por copia desde `.bak`; confirmado con
  `git status --short` que quedó como `A` (nuevo, sin diff local).
- **Salvedad real (WARNING 2)**: la navegación sólo ocurre en el camino reactivo
  (tras un submit que resulta en 200 o en 422-ya-verificado). El escenario del spec
  "Ya verificado — GIVEN un ciudadano que llega a la pantalla con el correo ya
  verificado THEN no se lo deja en un callejón" no tiene cobertura para el caso en
  que el ciudadano **llega** a `/verificar` ya verificado y **no envía nada**
  (bookmark, botón atrás, refresh tras verificar en otra pestaña): `ngOnInit` no
  consulta `authService.user()?.emailVerified` ni redirige proactivamente. El
  ciudadano ve el formulario vacío del OTP hasta que envía algo (válido o no) que
  dispare la rama `already`.
- **Veredicto**: CERRADO para el camino que el fix atacó (post-submit). El camino
  de llegada-ya-verificado-sin-submit no está cerrado — ver WARNING 2.

---

## `node-test-globals.d.ts` (punto 4 del encargo)

- **No usa `any`.** Declara firmas concretas: `readFileSync(path: string, encoding:
  'utf8'): string`, `join/resolve/basename/relative(...): string`,
  `readdirSync(path: string): string[]`, y los equivalentes `node:`.
- **No contamina el build de la app en la práctica**: aunque `tsconfig.app.json`
  incluye `src/**/*.ts` (que técnicamente matchea `.d.ts`) y por tanto el archivo
  entra al grafo de `tsc -b` del proyecto `app`, ningún archivo de `src/app/**`
  fuera de los specs importa `fs`/`path` — el `pnpm run build` (esbuild/Angular
  CLI, que no usa este `tsconfig.app.json` para type-check estricto de la build de
  producción) salió en verde (ver compuertas).
- **Conteo real, ejecutado por mí**: `npx tsc -b --noEmit` → **10 errores**, exacto a
  lo declarado en `tasks.md`. Los 10 son: 1 en `auth.service.spec.ts` (tipo
  `InvitationPreview`, nada que ver con REG ni con este `.d.ts`), 4 en
  `placeholder.component.spec.ts` (`@ts-expect-error` no usados), y **5 en
  `layout-tokens.regression.spec.ts`** por `readdirSync(dir, { withFileTypes: true
  })` — el `.d.ts` declara `readdirSync` con **un solo parámetro**, así que esa
  llamada de 2 argumentos con `Dirent[]` no compila contra la firma declarada.
- **Hallazgo real**: el comentario del propio `node-test-globals.d.ts` (líneas
  15-18) dice que "también cubre" `layout-tokens.regression.spec.ts` — **es falso**:
  ese archivo sigue con sus 5 errores, sin cambios, porque usa una firma de
  `readdirSync` que el `.d.ts` no declaró. La lista de errores restantes en
  `tasks.md`/`apply-progress.md` ("10 errores, todos preexistentes y fuera del
  alcance de REG") es **correcta en el número**, pero el comentario interno del
  archivo nuevo sobre-promete su propia cobertura.
- **Confirmado por git log**: `layout-tokens.regression.spec.ts`,
  `placeholder.component.spec.ts` y `auth.service.spec.ts` no fueron tocados en
  ningún commit de REG (`git log` los muestra sólo en commits de sc-303/F0) — los
  10 errores restantes son genuinamente preexistentes, no encubiertos por REG.
- **Veredicto**: legítimo (no es un `any` que apaga el compilador), pero con un
  comentario interno inexacto. SUGGESTION, no bloquea.

---

## El camino completo (punto 5 del encargo)

**Sí existe una prueba de punta a punta — a nivel de backend.**
`backend/test/e2e/registration-otp-flow.e2e-spec.ts`, test
`C.8: el ciudadano nuevo NO puede publicar hasta verificar, y verificar lo
habilita`, corrido contra Testcontainers real (DB + Redis reales, no mocks):
`POST /auth/register` → `POST /auth/login` → `POST /incidents` (403
`EMAIL_VERIFICATION_REQUIRED`) → `POST /email/verify-otp` (con el OTP leído del
espía de `MailService.enqueue`, no inventado) → `POST /incidents` (201) →
verificación final contra la fila real de `users.email_verified_at`. **Un solo
test, sin mocks del propio dominio, recorre las cinco etapas.** PASA.

**No existe una prueba equivalente a nivel de UI (frontend).** El proyecto tiene
Playwright (`frontend/e2e/*.e2e.ts`, job `frontend-e2e` en `ci.yml`), pero
`auth-flow.e2e.ts` no menciona registro, OTP, ni `/verificar`. Lo que hoy prueba
el recorrido en el frontend son piezas separadas, cada una con test propio:
- `register.component.spec.ts` — llega hasta el `POST /auth/register`.
- `verify-email.component.spec.ts` — pantalla pública, botón a `/login`.
- `login.component.spec.ts` (nuevo, ronda 10) — decide el redirect a `/verificar`.
- `verify-otp.component.spec.ts` — decide y (ahora) navega tras verificar.
- `app.routes.verify-otp.spec.ts` / `app.routes.verify-email.spec.ts` — las rutas
  existen y tienen el guard correcto.

Cada eslabón está soldado y **verificado por mutación** (hice dos mutaciones reales
en esta auditoría y ambas cayeron en el test correspondiente), pero **nadie hace
clic de una pantalla a la siguiente en un solo test de UI**. Es la misma
arquitectura de riesgo que produjo los 3 CRITICAL de la ronda 9 — mitigada ahora
por: (a) un e2e de backend que prueba que el contrato de wire es real y consistente
extremo a extremo, y (b) specs de componente con aserciones reales sobre
navegación/condiciones que un mutante rompe. No es la misma garantía que un
Playwright que atraviese las pantallas, pero ya no es "cada pieza verde por su
lado sin que el conjunto se sostenga" — el conjunto SÍ se sostiene, a nivel de
contrato HTTP+DB. Ver WARNING 3.

---

## Compuertas — ejecutadas por mí, números reales

### Backend (`backend/`)
| Gate | Comando | Resultado |
|---|---|---|
| lint | `pnpm run lint` | **0 errors, 19 warnings** (idéntico a ronda 9, todos preexistentes) |
| typecheck | `pnpm run typecheck` (`tsc --noEmit -p tsconfig.json`) | **exit 0** |
| build | `pnpm run build` (`nest build`) | **exit 0** |
| test (unit) | `npx jest` | **100/100 suites, 915/915 tests PASS** |
| test:e2e | `npx jest --config ./test/jest-e2e.json` (51 archivos, corrida completa, ~596s) | **51/51 suites, 445/445 tests PASS, 0 fallos** |

`install --frozen-lockfile` no se re-corrió (el `node_modules` ya estaba instalado
y consistente con el lockfile; los comandos de arriba habrían fallado en la
resolución de módulos si no lo estuviera).

### Frontend (`frontend/`)
| Gate | Comando | Resultado |
|---|---|---|
| test | `npx jest` | **47/47 suites, 326/326 tests PASS** |
| build | `pnpm run build` (Angular CLI) | **exit 0** |
| `tsc -b --noEmit` | `npx tsc -b --noEmit` (crudo, no `rtk tsc`) | **exit 2, 10 errores** — todos preexistentes (ver sección del `.d.ts` arriba); ninguno de los 5 que había introducido la ronda 9 sobrevive |
| eslint | condicional por `ci.yml` | **sin config** (`.eslintrc*`/`eslint.config.*` no existen en `frontend/`) → gate no-op, gap preexistente no de REG |

### Integración (backend e2e — "todos los archivos")
Incluido arriba: **51/51 suites, 445/445 tests**. El total subió de 442 (ronda 9) a
445 (+3: 1 de `registration-otp-flow` Fix A, 2 de `email-verification` Fix B) — el
total SÍ sube al agregar tests, así que no hay indicio de un archivo que no esté
corriendo (la trampa de la ronda 7).

---

## Tareas (`tasks.md`) — grupo C

9/9 casillas marcadas `[x]`. Verificadas contra el código, no sólo leídas:
C.1–C.9 tienen evidencia real (código + test + ejecución) descrita arriba y en
`apply-progress.md`. Sin `TODO`/`stub`/`placeholder`/`pendiente`/`not implemented`
en ningún archivo tocado por el grupo C (grep ejecutado, único hallazgo son
placeholders de HTML de formulario y comentarios de "OTP pendiente" que describen
estado de dominio, no código sin terminar).

`B.5` (grupo B) sigue `[ ]`, explícitamente diferida a F4 con justificación —
correcto, no es una casilla falsa.

---

## Los 9 escenarios de "El ciudadano puede verificar su correo desde la aplicación"

| # | Escenario | Cobertura |
|---|---|---|
| 1 | Saber si falta verificar (`GET /auth/me`) | **Real** — `auth.controller.spec.ts` C.1/C.2 + e2e `registration-otp-flow` (antes/después) |
| 2 | Llegar sin buscar (login redirige) | **Real** — `login.component.spec.ts` Fix A, mutación verificada por mí |
| 3 | El personal no pasa por ahí | **Real** — 4 tests dedicados en `login.component.spec.ts` (uno por rol de staff) |
| 4 | Código correcto → publica | **Real** — e2e `registration-otp-flow` C.8 (OTP real, DB real, 403→201) |
| 5 | Código vencido o equivocado, sin cerrar sesión | **Real** — `email-verification.e2e-spec.ts` (código `OTP_INVALID`) + `verify-otp.component.spec.ts` (no-logout, no-redirect) |
| 6 | Reenviar | **Real** — `verify-otp.component.spec.ts` (resend 200) |
| 7 | Reenviar demasiado pronto (429, no es fallo) | **Real** — `verify-otp.component.spec.ts` (status `ratelimit`, mensaje neutral) + `assertRateLimit` backend |
| 8 | Ya verificado → no lo deja en un callejón | **Parcial** — cubierto sólo en el camino reactivo (submit → `EMAIL_ALREADY_VERIFIED` → navega); **no** cubierto si el ciudadano llega a `/verificar` ya verificado y no envía nada (ver WARNING 2) |
| 9 | El ciclo completo | **Real a nivel backend** (e2e C.8); **por piezas, mutation-tested, no por un solo test** a nivel de UI (ver WARNING 3) |

7/9 completos, 2/9 parciales (8 y 9) — ninguno vacío.

---

## Issues encontrados

### CRITICAL
Ninguno. Los tres CRITICAL de la ronda 9 están cerrados con evidencia de ejecución
real y verificación por mutación hecha por mí en esta auditoría.

### WARNING

**WARNING 1 — La regla del redirect (login) y la del guard (`EmailVerifiedGuard`)
no son la misma lista, sólo coinciden hoy por casualidad de que hay 5 roles.**
`LoginComponent.onSubmit` (`frontend/src/app/features/auth/login/login.component.ts:71-74`)
redirige sólo si `roleName === 'reporter'` (positivo, un rol). `EmailVerifiedGuard`
(`backend/src/common/guards/email-verified.guard.ts:51-55,102`) exige verificación
a todo lo que **no** esté en el allow-list de 4 roles de staff (negativo). Si en el
futuro se agrega un rol nuevo que no sea `reporter` ni esté en `STAFF_ROLES` (p.ej.
un rol intermedio), el guard seguirá exigiéndole verificar (seguro, fail-closed),
pero `LoginComponent` no lo mandará a `/verificar` — se enterará recién al
publicar y recibir un 403, exactamente el callejón que el grupo C existe para
evitar. Es el defecto recurrente del proyecto ("regla en un sitio y no en su
vecino"), documentado como riesgo evitado en el JSDoc de C.4 pero en realidad sólo
evitado para los 5 roles que existen hoy, no como invariante estructural.
Sugerencia: exportar `STAFF_ROLES` (o su complemento) desde un solo lugar que
ambos consuman, o que `GET /auth/me` devuelva un booleano `requires_verification`
calculado en el backend con la misma función que usa el guard.

**WARNING 2 — El escenario "Ya verificado" del spec no está cubierto quan el
ciudadano llega a `/verificar` sin enviar nada.** `VerifyOtpComponent.ngOnInit`
(`verify-otp.component.ts:84-92`) no consulta `authService.user()?.emailVerified`.
Un ciudadano que verificó en otra pestaña, usa el botón atrás, o refresca la
página tras verificar, ve el formulario de OTP vacío en vez de ser llevado a la
app de inmediato — tiene que enviar algo (correcto o no) para que la rama
`already` dispare la navegación. No es el callejón original (CRITICAL 3, donde
NADA navegaba nunca), pero es el mismo escenario del spec sin cerrar del todo.

**WARNING 3 — Ningún test de UI recorre el camino completo; el camino completo
sólo está probado a nivel de contrato HTTP+DB (backend) y por piezas
mutation-tested (frontend).** Ver sección "El camino completo" arriba. No bloquea
por sí solo — el backend prueba que el contrato es sólido de punta a punta y cada
pieza de frontend tiene una red real — pero es la misma arquitectura de riesgo que
produjo los 3 CRITICAL que este verify acaba de cerrar, y sigue sin una respuesta
definitiva. Dejarlo así una décima ronda más sin decisión explícita del equipo
(¿se justifica un Playwright de este flujo, dado que el job `frontend-e2e` ya
existe y sólo le falta el spec?) es, en mi juicio, aceptable para archivar — pero
debe quedar en el registro, no descubrirse en la ronda 15.

### SUGGESTION

**SUGGESTION 1 — El comentario de `node-test-globals.d.ts` sobre-promete.**
Dice cubrir `layout-tokens.regression.spec.ts`; no lo hace (esa firma de
`readdirSync` sigue sin declarar `{withFileTypes}`/`Dirent`). No afecta los
números de gate reportados (10 errores es el número correcto), sólo la precisión
del comentario interno del archivo.

---

## Verdict

**PASS WITH WARNINGS.**

Los 3 CRITICAL de la ronda 9 están genuinamente cerrados: verifiqué wire real
(no el tipo TypeScript), corrí las 5 compuertas completas con números reales
(backend 100/100·915 unit + 51/51·445 e2e; frontend 47/47·326 + build OK + tsc
10 errores preexistentes), y ejecuté dos mutaciones reales sobre código sin
commitear — restauradas por copia, árbol de trabajo verificado idéntico al final
— que confirman que las redes existen donde el reporte de la ronda 10 dice que
existen. El e2e `registration-otp-flow.e2e-spec.ts` es la primera prueba en nueve
rondas que recorre el ciclo completo contra la app real, sin mocks del propio
dominio.

Quedan 3 WARNING, ninguno CRITICAL: la duplicación implícita de la regla de
verificación entre login y guard (hoy inofensiva, estructuralmente fràgil), el
escenario "ya verificado sin submit" sin cerrar del todo, y la ausencia de un
test de UI que una las piezas del frontend en un solo recorrido. Ninguno de los
tres reproduce el patrón "marcado hecho y no funciona" — los tres son gaps
conocidos, documentados, con evidencia real de lo que SÍ funciona y lo que
todavía no.

## ¿Se puede archivar?

**Sí.** A diferencia de las dos veces anteriores en que este change se archivó
por error, esta vez los CRITICAL que bloqueaban (los 3 de la ronda 9) fueron
cerrados con evidencia de ejecución que yo mismo generé en esta auditoría —
mutaciones reales, no lectura de comentarios. Los 3 WARNING que quedan son
mejoras de robustez estructural (blindar contra un rol futuro, cerrar el último
sub-caso de "ya verificado", y decidir conscientemente si vale la pena un
Playwright del flujo), no defectos de comportamiento actual. Ninguno dejaría a
un ciudadano real varado hoy, con los roles y el código que existen en este
árbol. Recomiendo archivar y trasladar los 3 WARNING a un follow-up explícito
(no a un nuevo `fixes-required.md` que vuelva a bloquear el archivado).
