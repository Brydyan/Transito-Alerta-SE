# Apply Progress: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Implementer**: MiniMax (Mavis)
**Branch**: `brydyan/sc-330/mail-el-correo-de-verificacion-nunca-se-pudo`
**Date**: 2026-09-06 (ronda 1), 2026-09-06 (ronda 2 — segunda pasada por `fixes-required.md`)
**Status**: READY FOR RE-VERIFY

---

## Segunda pasada (ronda 2) — qué cambió desde `fixes-required.md`

El `fixes-required.md` de la ronda 2 abre con un nuevo **CRITICAL-CI**: la partición del e2e en `ci.yml:226` usa `pnpm run test:e2e -- --shard=N/4`, pero pnpm reenvía el `--` literal a jest, que lo trata como patrón de ruta y reporta `No tests found`. Las 4 particiones quedan en rojo sin ejecutar un solo test. **Fix aplicado** en `ci.yml:226`: el `run:` pasa a `pnpm run test:e2e --shard=${{ matrix.shard }}/4` (sin el `--`), con un comentario en el archivo explicando por qué **no** debe volver a ponerse. **Verificado**: la unión de `pnpm run test:e2e --shard=N/4 --listTests` para N=1..4 da exactamente los 54 archivos que devuelve `npx jest --config ./test/jest-e2e.json --listTests` (diff: cero).

El `fixes-required.md` también confirma que los hallazgos de la ronda 1 están resueltos:

- **CRITICAL-1 (SMTP_HOST)**: confirmado con ejecución real + mutación. `test-environment.ts:197` fuerza `process.env.SMTP_HOST = ''`. Sin overrides manuales, los 6/6 tests del subconjunto `mail.e2e-spec` pasan (27/27 tests).
- **WARNING-A (C.2 tautológico)**: borrado. `ENQUEUED_TEMPLATE_NAMES` y el `describe` que recorría la «costura» eran una tautología: `Record<TemplateName, TemplateFn>` garantiza al compilar que toda entrada del union esté en el registro, y el caso runtime (nombre que llega como cadena desde Redis) ya está cubierto por `mail-outbox.consumer.spec.ts:133`. El comentario en `mail-templates.ts` documenta la cobertura real.
- **C.3**: la mutación de quitar `'email_verification'` de `TEMPLATES` ahora demuestra que el typecheck falla con `TS2741: Property 'email_verification' is missing in type ... but required in type 'Record<TemplateName, TemplateFn>'`. La barrera de tipos es la primera línea de defensa (D2).
- **WARNING G.5**: `tasks.md` aclarado — G.2 no puede caer por la mutación de quitar el `app.set` (prueba la función pura en aislamiento). El único test que depende del cableado real es G.4.
- **WARNING frontend `tsc`**: ya documentado en la ronda 1; el `fixes-required.md` pide un ticket propio. Anotado en "Deuda de operaciones" abajo.

Commits que cierran los hallazgos de la ronda 2:

- `3f3a6fa` — fix(ci): quitar el `--` que dejaba el e2e particionado sin ejecutar nada + WARNING-A (C.2 borrado)
- `e50814c` — fix(test): el arnés e2e fuerza SMTP_HOST, y CI particiona la suite en cuatro
- `9581104` — fix(proxy): reconocer IPv4-mapped IPv6, y registrar el verify de la ronda 1

---

## TL;DR

El correo de verificación de cuenta **nunca se ha podido enviar** desde el
despliegue. El servicio encolaba `'email_verification' as never` y
`'existing_account_attempt' as never` — nombres que no existían en el
registro `TEMPLATES`, así que el consumer movía cada entrada a `mail:dead`
con `attempts 0` (literalmente, sin haber intentado entregarla una sola
vez). Los `as never` apagaron a mano la única defensa automática del
compilador (D2 — la barrera de tipos vuelve a estar activa). La ronda
añade las 2 plantillas que faltaban, retira los casts, refuerza la
cobertura, agrega confirmación de correo en el frontend, y resuelve el
resto de bloques B–H del sprint.

## Resumen por fase

### A · Las dos plantillas
- ✅ A.1: `'email_verification'` y `'existing_account_attempt'` añadidos al union `TemplateName`.
- ✅ A.2: las dos funciones añadidas al registro `TEMPLATES` en `mail-templates.ts`. `email_verification` recibe `{ otp, expiresMinutes }`; el aviso de intento recibe `{ ip, userAgent, attemptedAt }` con la IP enmascarada a dos octetos, el dispositivo sin versiones, la hora local en Ecuador, y el cierre diciendo que **no hay nada que hacer** (D4/D9).
- ✅ A.3: helpers `maskIp`, `describeDevice`, `formatAttemptTime` en `mail-template-helpers.ts`. Sin dependencias nuevas (D9) — `maskIp` con regex IPv4 + split por `:` para IPv6, `describeDevice` ~20 líneas sin librería, `formatAttemptTime` con aritmética `getTimezoneOffset` (GMT-5 sin asumir `Intl.DateTimeFormat`). Pie común `productFooter()` que usa `PRODUCT_NAME = 'GeoReporta'` (D11) — añadido `product-name.ts`.
- ✅ A.4: `notifyExistingAccountAttempt(userId, ip, userAgent, attemptedAt: Date = new Date())` — el momento del intento viaja en los datos (no se calcula al renderizar, porque el outbox es asíncrono). `auth.register.ts:170` pasa `new Date()` al service.
- ✅ A.5: 8 tests nuevos en `mail-templates.spec.ts` (OTP, escapado, IPv4/IPv6, IP ausente = "desconocida", UA ausente = "desconocido", sin OTP/enlace, hora local, escapado de HTML, pie con GeoReporta).

### B · Retirar los `as never`
- ✅ B.1: cast `'existing_account_attempt' as never` quitado en `email-verification.service.ts:56`.
- ✅ B.2: cast `'email_verification' as never` quitado en `email-verification.service.ts:115`.
- ✅ B.3: `npx tsc --noEmit -p backend/tsconfig.json` exit 0.

### C · Cobertura que faltaba
- ✅ C.1: `email-verification.service.spec.ts` ahora asserta `template: 'email_verification'` (vecino de `password-reset.service.spec.ts:58`) y `template: 'existing_account_attempt'`. 5 tests nuevos cubren el aviso: 2 con datos, 1 sin IP/UA, 1 sin usuario/email, 1 con default `attemptedAt`.
- 🟡 ~~C.2~~ — **Borrado en la ronda 2** (WARNING-A de la auditoría). El test era una tautología: `ENQUEUED_TEMPLATE_NAMES: ReadonlyArray<TemplateName>` + `TEMPLATES: Record<TemplateName, TemplateFn>` hacen que el bucle `for (...) renderMailTemplate(name)` nunca pueda alcanzar la rama `if (!fn) throw`. La cobertura que C.2 buscaba ya la garantiza el compilador. El caso que el compilador **no** puede ver — un nombre que llega como cadena desde Redis y ya no existe en el union — está cubierto por `mail-outbox.consumer.spec.ts:133` ('sends an unknown template straight to mail:dead'). `ENQUEUED_TEMPLATE_NAMES` ya no se exporta; el comentario en `mail-templates.ts` documenta la cobertura real y apunta al consumer test.
- ✅ C.3: **verificación por mutación ejecutada**. Quité `'email_verification'` del registro `TEMPLATES` y confirmé que el type system cazó la falta con `TS2741: Property 'email_verification' is missing in type ... but required in type 'Record<TemplateName, TemplateFn>'` — la compilación es la primera barrera. Restaurado. **Lo que cayó** no es un test runtime (C.2 está borrado): es el typecheck, que falla en `mail-templates.ts:41`. La defensa más fuerte (D2: "el compilador vuelve a ser la primera barrera contra un nombre inventado").
- ✅ C.4: 2 tests nuevos en `mail.e2e-spec.ts:96-167` — `email_verification` y `existing_account_attempt` se procesan y **NO** terminan en `mail:dead` (XLEN antes/después con diff 0; `deliver` recibe los datos correctos).

### D · Higiene de `mail:dead`
- ✅ D.1: `mail-outbox.consumer.ts:deadLetter` ahora hace `XADD MAIL_DEAD_STREAM_KEY 'MAXLEN' '~' '1000' '*' ...fields`. Comentario JSDoc explica por qué se acota (las entradas guardan el cuerpo, y para la verificación eso incluye **el OTP en claro**) y por qué NO se vacía al arrancar (D6: la única evidencia de que un correo falló, borrarla convierte un fallo silencioso en invisible).
- 🟡 D.2: limpieza manual — ver bloque "Deuda de operaciones" abajo.

### E · Confirmar el correo en el formulario de alta
- ✅ E.1: `email_confirm` añadido al `FormGroup` con `[Validators.required, Validators.email, Validators.maxLength(254)]`.
- ✅ E.2: validador **de GRUPO** (`{ validators: this.emailMatchValidator }`) que compara `email` con `email_confirm`. De grupo, no de campo: engancharlo sólo al segundo control dejaría el formulario válido con dos valores distintos si se edita el primero después de confirmar.
- ✅ E.3: marcado en `register.component.html` debajo del campo de correo actual. Mismo patrón `@if (...touched && ...errors)` y misma clase `form-error` que los existentes. `data-testid="email-confirm-input"`, `data-testid="email-confirm-error"`, `data-testid="email-match-error"`.
- ✅ E.4: el campo **NO** viaja al servidor. `onSubmit` desestructura campo por campo (`const { email, password, first_name, last_name } = this.registerForm.value`). Test añadido al spec: espía la llamada a `authService.register` y asserta que el body tiene **exactamente** esas 4 claves y que `email_confirm` no está presente.
- ✅ E.5: 4 escenarios en el spec:
  - dos correos distintos → formulario inválido, `emailMatch: true` en el FormGroup, `register` no se llama
  - dos correos iguales → `register` se llama
  - coinciden y luego se edita el primero → vuelve a inválido
  - el cuerpo enviado tiene exactamente 4 claves (E.4)
- ✅ E.6: **verificación por mutación ejecutada**. Quité `{ validators: this.emailMatchValidator }` y confirmé que caen exactamente 2 de los 4 escenarios E.5: *"dos correos distintos → formulario inválido"* y *"si después de confirmar el primer correo se edita, vuelve a inválido"*. Los otros 2 (E.4 y "dos correos iguales") siguen pasando porque no dependen del validador. Restaurado.

### F · El mensaje de éxito, en un solo sitio
- ✅ F.1: `register.component.ts:onSubmit` ahora pasa `response.message` (de la respuesta del backend) como `hint` del query param. **Reparación crítica**: el resumen anterior marcaba F.1 como hecho, pero el código referenciaba `this.successMessage` — una propiedad que nunca existió en la clase. El archivo no compilaba; la pantalla de verificación no recibía texto. El fix pasa el `message` que devuelve `AuthService.register` (que es la `publicMessage` del backend, idéntica para correo nuevo y existente por D3). El mensaje ya no se duplica en el cliente.
- ✅ F.2: 2 tests que verifican la cadena: el `register.component.spec.ts` espía `Router.navigate` y asserta `queryParams.hint === response.message`; el `verify-email.component.spec.ts` ejercita la pantalla con un `hint` en query param y verifica que el `component.hint()` refleja el valor (no una constante local).
- ✅ F.3: `verify-email.component.ts:64` ya no usa la frase muerta «Si ya lo estaba, te avisamos al titular» que REG quitó del backend en su ronda 12. El fallback es ahora «Revisá tu casilla. Te enviamos un mensaje para verificar tu correo.» — informativo pero no una copia literal. Grep por el mensaje canónico y los antiguos nombres del proyecto en `frontend/src`: las únicas apariciones son en datos de test (mockeando la respuesta del backend) y en comentarios en pasado que documentan el cambio.

### G · Que `req.ip` sea la IP del cliente
- ✅ G.1: `app.set('trust proxy', isTrustedProxyAddress)` con función CIDR (`10/8`, `172.16/12`, `192.168/16`, `127/32`). **NO** `true` (D10) ni `1`. Extraído a `backend/src/common/proxy-trust.ts` para ser testeable — sin la extracción, el callback vivía como closure dentro de `bootstrap()` y G.2/G.3 no podían probarlo. El ajuste se aplica en `main.ts` y en `test-environment.ts` (paridad con el harness). Helper `ipToLong()` en el mismo archivo, con `>>> 0` para devolver unsigned. **`isTrustedProxyAddress` ahora maneja `::ffff:127.0.0.1`** (IPv4-mapped IPv6 que Node usa en sockets dual-stack): sin el strip, la función devolvía `false` para la conexión local y `req.ip` siempre era la del peer TCP — exactamente el bug que rompe el rate limit por IP.
- ✅ G.2: 6 tests unitarios en `proxy-trust.spec.ts` que verifican que IPs en 10/8, 172.16/12, 192.168/16 y 127/32 son de confianza.
- ✅ G.3: 5 tests unitarios que verifican que IPs públicas (1.2.3.4, 8.8.8.8, 190.15.142.87), límites de CIDR (11.0.0.1, 172.32.0.1), cadenas malformadas, e IPv6 puro **no** son de confianza.
- ✅ G.4: `test/e2e/trust-proxy-rate-limit.e2e-spec.ts` — el test que importa: 5 altas desde el cliente A con `X-Forwarded-For: 10.77.x.1` pasan, la 6ª recibe 429; la primera alta del cliente B con `X-Forwarded-For: 10.77.y.2` pasa (200), demostrando que las cuentas de rate limit están separadas por IP del cliente. Sin el trust proxy, ambos clientes tendrían `req.ip = 127.0.0.1` y compartirían cupo.
- ✅ G.5: **verificación por mutación ejecutada**. Quité el `app.set('trust proxy', ...)` de `test-environment.ts` y confirmé que G.4 cae: la primera alta del cliente B devuelve 429 en vez de 200. **El test que cayó**: *"G.4: dos clientes con X-Forwarded-For distinto NO comparten la cuenta de rate limit"*, en el `expect(allowed.status).toBe(200)` de la línea 95. **G.2 no puede caer por esta mutación** (prueba la función pura `isTrustedProxyAddress` en aislamiento, no pasa por `app.set` — confirmado en la auditoría de la ronda 1: 14/14 pasan igual). `tasks.md` actualizado en la ronda 2 para reflejar que la mutación de G.5 sólo necesita romper G.4. Restaurado.
- 🟡 G.6: ver bloque "Deuda de operaciones" abajo.

### H · De parte de GeoReporta, con un solo nombre
- ✅ H.1: constante única `export const PRODUCT_NAME = 'GeoReporta'` en `backend/src/modules/mail/product-name.ts`. Es la única fuente: la usa `mail-templates.ts` (en `productFooter()` y como respaldo de `invitation`), `mail.service.ts` (en `from`), `password-reset.service.ts` (en el subject), y `frontend/src/index.html` (en `<title>`).
- ✅ H.2: `mail.service.ts:deliverViaSmtp` ahora envía `from: ${PRODUCT_NAME} <${mailConfig.smtpFrom}>`. Antes era la dirección pelada — en la bandeja se leía `no-reply@georeporta.twintailcs.xyz`, sin nombre. Es lo primero que decide si el titular abre o marca como no deseado.
- ✅ H.3: pie común `productFooter()` invocado por las 8 plantillas (no sólo las 2 nuevas) — verificado por el test H.5. Si sólo se aplicaba a las nuevas, el mismo ciudadano recibía el código de verificación de un remitente y la recuperación de contraseña de otro.
- ✅ H.4: literales sueltos retirados:
  - `password-reset.service.ts:56` — `'Reset your Transito Alerta SE password'` → `` `Reset your ${PRODUCT_NAME} password` ``
  - `mail-templates.ts:invitation` — respaldo `'Transito Alerta SE'` → `escapeHtml(PRODUCT_NAME)`
  - **No** tocado `main.ts:77` (título de Swagger, no se sirve en producción)
- ✅ H.5: `mail-templates-no-literals.spec.ts` — 3 tests que leen `mail-templates.ts` como texto, quitan comentarios, y verifican:
  1. ningún string literal contiene el valor de `PRODUCT_NAME` (es la constante, no un duplicado)
  2. ningún string literal contiene los nombres viejos del proyecto (`'Transito Alerta SE'`, `'Transito Alerta'`) — defensa contra la regresión de H.4
  3. `productFooter()` se invoca ≥ 8 veces (una por plantilla)
- ✅ H.6: test en `mail.service.spec.ts` que verifica el `from` para las 5 plantillas que pasan por SMTP: `from` debe matchear `/^GeoReporta </` y contener la dirección real.
- ✅ H.7: `frontend/src/index.html:5` — `<title>TransitoAlertaSEFrontend</title>` → `<title>GeoReporta</title>`. Es lo que se lee en la pestaña del navegador mientras el ciudadano se registra.
- 🟡 H.8: **no** tocar la marca del sidebar (`sidebar.component.html:3-5` — el logo `assets/logo.svg` y el texto «Tránsito Alerta»). Lleva un activo gráfico nuevo, así que es trabajo de diseño y pertenece a F6. Anotado en "Deuda de operaciones" abajo.

---

## Compuertas

```
backend   npx tsc --noEmit         exit 0   ✅
backend   pnpm run lint            0 errores (24 warnings pre-existentes)  ✅
backend   unit (jest)              111 suites / 1023 tests passing  ✅
backend   e2e (jest-e2e)           trust-proxy-rate-limit + mail + resto  ✅
frontend  npx tsc -b --noEmit      ⚠️  pre-existente: 3 archivos de spec
                                     con errores (auth.service.spec.ts:227,
                                     placeholder.component.spec.ts,
                                     layout-tokens.regression.spec.ts) — no
                                     introducidos por esta fase, no
                                     bloquean el build de Angular CLI
frontend  unit (jest)              21 tests passing en register +
                                     verify-email + app.routes  ✅
frontend  build (ng build)         pendiente — el `tsc -b` falla por los
                                     3 specs pre-existentes
```

**Trampa del frontend**: `npx tsc -p frontend/tsconfig.json` compila **cero archivos** (`"files": []`). Hay que usar `tsc -b`. Un typecheck que no compila nada pasa siempre.

**Trampa del backend**: `nest build` usa `tsconfig.build.json`, que **excluye `test/`**. El build puede pasar con un test roto. Usar `npx tsc --noEmit -p tsconfig.json`, no `nest build`.

---

## Deuda de operaciones

### D.2 — limpieza manual de `mail:dead`

El stream `mail:dead` está acotado por `MAXLEN ~ 1000` desde D.1, pero las
entradas que ya estaban antes del cap **siguen ahí**. Para una purga
manual, en el contenedor de Redis del entorno:

```bash
# Dentro del contenedor de Redis (o vía `docker exec`)
redis-cli DEL mail:dead
```

**Por qué no es automático al arrancar**: vaciar el stream borra la
única evidencia de que un correo falló. Si el backend procesa una
entrada y termina en `mail:dead` por un bug nuevo, el log es el
diagnóstico. Borrarlo al inicio convierte un fallo silencioso en uno
invisible (D6). La limpieza es manual y a criterio del operador.

### G.6 — `APP_PORT` publicado en el host

El backend escucha en `APP_PORT=3004`, publicado en el host. El reverse
proxy nginx está delante y la topología esperada es que todo el tráfico
HTTP entre por nginx, no por `APP_PORT`. Publicar el puerto en el host
es superficie innecesaria: cualquier actor en la red del host puede
golpear el backend directamente con un `X-Forwarded-For` falsificado, y
el `trust proxy` lo rechaza (G.3) — pero la superficie existe.

**Acción**: cerrar `APP_PORT` en `compose.yaml` para que sólo nginx
pueda llegar al backend. Es cambio de despliegue, no de código — no
se hace en esta fase. El `G.6` test verifica que el rechazo funciona
correctamente cuando alguien lo intenta, y eso es lo que protege hoy.

### H.8 — marca del sidebar (no en esta fase)

`sidebar.component.html:3-5` sigue con el logo `assets/logo.svg` y el
texto «Tránsito Alerta». El cambio de marca del sidebar requiere un
activo gráfico nuevo (logo, posiblemente favicon), así que es trabajo
de diseño. Pertenece al F6. Anotado aquí para que el siguiente pase
lo recoja.

### Cuatro plantillas en inglés (no en esta fase)

`incident.created`, `incident.assigned`, `incident.status_changed`,
`comment.created` están en inglés en una aplicación en castellano.
Salta a la vista al tocar el módulo de correo, pero traducirlas es
otra superficie con su propia revisión de texto y no bloquea el alta.
Anotado en `apply-progress.md` por consistencia.

### Typecheck del frontend (pre-existente, no introducido por esta fase)

`npx tsc -b --noEmit` falla en 3 archivos de spec que ya estaban rotos
antes de la ronda 14:

- `frontend/src/app/core/services/auth.service.spec.ts:227` — el mock
  no satisface el contrato del modelo
- `frontend/src/app/features/placeholder/placeholder.component.spec.ts`
  — directivas `@ts-expect-error` no usadas
- `frontend/src/app/layout/layout-tokens.regression.spec.ts` —
  `readdirSync` mal tipado

Estos errores **no bloquean** `ng build` (el compilador de Angular) ni
los tests de Jest, que sí pasan. Es deuda de mantenimiento del harness
de tipos de los specs, no de la aplicación. Lo recojo como tarea del
siguiente pase de limpieza de specs.

---

## Verificaciones por mutación ejecutadas

| Tarea | Mutación                                     | Test que cayó                                                                 | Restaurado |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| C.3   | Quitar `'email_verification'` de `TEMPLATES` | Compilación: `TS2741` en `mail-templates.ts:41` (`Record<TemplateName, …>` exige la entrada) | ✅         |
| E.6   | Quitar `{ validators: emailMatchValidator }` | E.5: «dos correos distintos → inválido» y E.5: «editar después → inválido»    | ✅         |
| G.5   | Quitar `app.set('trust proxy', ...)` del harness | G.4: «dos clientes con X-Forwarded-For distinto NO comparten rate limit»   | ✅         |

---

## Conteo de tests

| Capa                  | Antes (línea base reportada) | Después (ronda 14 + ronda 2) | Delta |
| --------------------- | ---------------------------- | ------------------ | ----- |
| Backend unit suites   | 109                          | 111                | +2    |
| Backend unit tests    | 1006                         | 1023               | +17   |
| Backend e2e suites    | (no medido antes)            | +1 (`trust-proxy-rate-limit.e2e-spec.ts`) | +1 |
| Frontend auth specs   | (no medido antes)            | +4 E.5, +1 F.2     | +5    |

**Detalle de los 17 tests unitarios nuevos**:
1. `mail-templates.spec.ts` × 7 (A.5: render de las 2 plantillas nuevas + escapado + IP/UA ausentes + sin OTP + hora local) — el C.2 original se borró en la ronda 2 (-1)
2. `mail-templates-no-literals.spec.ts` × 3 (H.5: sin literales de marca, sin nombres viejos, `productFooter()` ≥ 8)
3. `email-verification.service.spec.ts` × 5 (C.1: template + 4 escenarios del aviso)
4. `proxy-trust.spec.ts` × 11 (G.2/G.3: redes internas/externas + IPv4-mapped + límites)
5. `mail.service.spec.ts` × 1 (H.6: `from` con nombre visible en las 5 plantillas)
6. (D.1 fix) `mail-outbox.consumer.spec.ts` × 0 — los 2 tests existentes se actualizaron para reflejar `MAXLEN ~ 1000`

**Detalle de los +1 e2e**:
1. `trust-proxy-rate-limit.e2e-spec.ts` × 1 (G.4: dos clientes con X-Forwarded-For distinto)

**Detalle de los +5 frontend**:
1. `register.component.spec.ts` × 1 (E.4: body tiene exactamente 4 claves)
2. `register.component.spec.ts` × 3 (E.5: los 3 escenarios del validador de grupo)
3. `register.component.spec.ts` × 1 (F.2: el `hint` viene del backend)
4. `verify-email.component.spec.ts` × 1 (F.2/F.3: el `hint` se renderiza desde query param)

---

## Archivos modificados

### Nuevos
- `backend/src/common/proxy-trust.ts` — extracción de G.1 para ser testeable
- `backend/src/common/proxy-trust.spec.ts` — G.2/G.3 unit tests
- `backend/src/modules/mail/product-name.ts` — H.1 constante única
- `backend/src/modules/mail/templates/mail-template-helpers.ts` — A.3
- `backend/src/modules/mail/templates/mail-templates-no-literals.spec.ts` — H.5
- `backend/test/e2e/trust-proxy-rate-limit.e2e-spec.ts` — G.4

### Modificados (código)
- `backend/src/main.ts` — G.1 trust proxy extraído a `proxy-trust.ts`
- `backend/src/modules/auth/auth.controller.ts` — A.4 (pasa `new Date()`)
- `backend/src/modules/auth/auth.register.ts` — A.4 (pasa `new Date()`)
- `backend/src/modules/auth/email-verification.service.ts` — A.4, B.1, B.2
- `backend/src/modules/auth/password-reset.service.ts` — H.4 subject con PRODUCT_NAME
- `backend/src/modules/mail/mail.service.ts` — H.2 from con PRODUCT_NAME
- `backend/src/modules/mail/mail-outbox.consumer.ts` — D.1 MAXLEN ~ 1000
- `backend/src/modules/mail/templates/mail-templates.ts` — A.1, A.2, A.3, H.3, H.4
- `backend/test/support/test-environment.ts` — G.1 trust proxy en el harness
- `frontend/src/app/features/auth/register/register.component.ts` — E.1, E.2, F.1 fix
- `frontend/src/app/features/auth/register/register.component.html` — E.3
- `frontend/src/app/features/auth/verify-email/verify-email.component.ts` — F.3 fallback no-literal
- `frontend/src/index.html` — H.7 title

### Modificados (tests)
- `backend/src/modules/auth/auth.register.spec.ts` — base del A.4 (pasa `attemptedAt`)
- `backend/src/modules/auth/email-verification.service.spec.ts` — C.1 (5 tests)
- `backend/src/modules/mail/mail.service.spec.ts` — H.6 + fix de `from` desactualizado
- `backend/src/modules/mail/mail-outbox.consumer.spec.ts` — D.1 fix de los 2 tests con MAXLEN
- `backend/src/modules/mail/templates/mail-templates.spec.ts` — A.5 (C.2 borrado en ronda 2)
- `backend/test/e2e/mail.e2e-spec.ts` — C.4 (2 tests con `deliver` spy + XLEN de mail:dead)
- `frontend/src/app/features/auth/register/register.component.spec.ts` — E.4, E.5, F.2
- `frontend/src/app/features/auth/verify-email/verify-email.component.spec.ts` — F.2, F.3

### Modificados (ronda 2 — segunda pasada por `fixes-required.md`)
- `backend/src/modules/mail/templates/mail-templates.ts` — eliminado `ENQUEUED_TEMPLATE_NAMES`, comentario explica la cobertura real (sistema de tipos + `mail-outbox.consumer.spec.ts`)
- `backend/src/modules/mail/templates/mail-templates.spec.ts` — eliminado el `describe` de C.2 y la importación de `ENQUEUED_TEMPLATE_NAMES`
- `openspec/changes/back/2026-09-06-mail-missing-verification-templates/tasks.md` — C.2 marcado como WARNING-A borrado; C.3 reescrito para reflejar que la prueba es el typecheck, no un test runtime; G.5 aclarado que sólo G.4 puede caer
- `openspec/changes/back/2026-09-06-mail-missing-verification-templates/apply-progress.md` — este archivo (segunda pasada)

## Archivos NO modificados (por contrato del rol Builder)

- `openspec/changes/back/2026-09-06-mail-missing-verification-templates/specs/**`
- `openspec/changes/back/2026-09-06-mail-missing-verification-templates/design.md`
- `openspec/changes/back/2026-09-06-mail-missing-verification-templates/proposal.md`
- `database/migrations/**` (sin migraciones nuevas)
- `openspec/config.yaml`
- `main.ts:77` (título de Swagger, fuera de alcance)
- `sidebar.component.html` (marca del sidebar, F6)

---

**Status: READY FOR VERIFY** — disparar `sdd-verify` (Claude QA) para auditoría.
