# Verify Report: MAIL — Las plantillas de verificación que nunca existieron

**Change**: `2026-09-06-mail-missing-verification-templates` (sc-330)
**Ronda**: 1
**Rama verificada**: `brydyan/sc-330/mail-el-correo-de-verificacion-nunca-se-pudo`
**Fecha**: 2026-09-06
**Modo**: Standard (Strict TDD no confirmado para este change vía sdd-init; se verificó igual con ejecución real + mutación, exigencia explícita del usuario)

**Nota de discrepancia de entorno**: al empezar esta ronda el árbol NO estaba limpio como se afirmaba. `git status` mostraba `backend/src/common/proxy-trust.ts` y `.spec.ts` modificados (soporte de IPv4-mapped IPv6, `::ffff:127.0.0.1`, no documentado en tasks.md pero sí en apply-progress.md bajo G.1), `tasks.md` con checkboxes recién marcados, y `apply-progress.md` sin trackear. Se verificó el árbol de trabajo tal cual estaba, sin comittear. Todas las mutaciones de esta ronda respetaron la regla `cp`/`.bak` y el árbol quedó exactamente en el mismo estado sucio en el que se encontró.

---

## Veredicto

**FAIL** — 2 CRITICAL bloquean el archivado.

1. Los e2e C.4 (el entregable central del bloque C — "la prueba que habría detectado el defecto el primer día") **fallan en ejecución real**, tanto en el subconjunto como en la suite completa.
2. El test C.2 ("el test que recorre la costura") **no cierra la costura**: es un array enumerado a mano (`ENQUEUED_TEMPLATE_NAMES`), exactamente el anti-patrón que la propia tarea prohibía. La mutación demuestra que **ningún test runtime cae** — sólo el compilador — que es la condición que tasks.md/C.3 define textualmente como "decorativo, hay que rehacerlo".

Todo lo demás verificado (D10/trust proxy, E.2/validador de grupo, E.4/campo que no viaja, H.5/sin literales, H.1-H.7, B.1/B.2, D.1) está correctamente implementado y probado por mutación con evidencia real.

---

## Respuestas a las preguntas que decidían esta ronda

### 1 — C.2, ¿cierra la costura o la vuelve a partir? → **La vuelve a partir. CRITICAL.**

`ENQUEUED_TEMPLATE_NAMES` en `backend/src/modules/mail/templates/mail-templates.ts:117-126` es un array **literal, escrito a mano**:

```ts
export const ENQUEUED_TEMPLATE_NAMES: ReadonlyArray<TemplateName> = [
  'incident.created', 'incident.assigned', 'incident.status_changed',
  'comment.created', 'invitation', 'password-reset',
  'email_verification', 'existing_account_attempt',
];
```

El propio comentario del código (líneas 110-116) lo admite: *"Si el código añade un nombre y olvida el registro, este array NO se actualiza automáticamente... La protección real contra 'nombre inventado' es el tipo."* Eso es exactamente lo que la tarea C.2 prohibía: *"No vale enumerar los nombres a mano en el test — eso vuelve a partir la costura en dos."*

**Mutación ejecutada** (yo mismo, no confío en lo anotado): quité la entrada `email_verification` de `TEMPLATES` en `mail-templates.ts` y corrí:

```
npx tsc --noEmit -p tsconfig.json
  → error TS2741: Property 'email_verification' is missing in type '...' but required in type 'Record<TemplateName, TemplateFn>'.

npx jest src/modules/mail/templates/mail-templates.spec.ts --silent
  → Test suite failed to run (0 tests ejecutados) — el archivo no compila.
```

**Ningún test cayó.** El test C.2 (`renderMailTemplate — todos los nombres encolados están cubiertos (MAIL C.2) > todos los ENQUEUED_TEMPLATE_NAMES se renderizan sin error`) nunca llegó a ejecutarse — ts-jest abortó la compilación del archivo antes de correr un solo `it()`. Lo que realmente detiene la mutación es `Record<TemplateName, TemplateFn>` (D2), no el test C.2.

Esto coincide con la propia definición de fallo que tasks.md pone en C.3: *"Si no cae ninguno, C.2 es decorativo y hay que rehacerlo antes de seguir."* Es exactamente lo que ocurrió, y el ítem se marcó `[x]` de todas formas.

`apply-progress.md` (C.3) documenta el mismo resultado con honestidad ("el test que 'cayó' fue la compilación de 10 specs, no un test runtime") — no hay engaño, pero la conclusión ("C.2 quedó confirmado por derivación") no es correcta: C.2 no quedó confirmado, quedó demostrado decorativo, y la tarea decía que en ese caso había que rehacerlo.

**Riesgo real que deja abierto**: si algún día `TEMPLATES` deja de tipar como `Record<TemplateName, TemplateFn>` (p.ej. alguien lo relaja a `Record<string, TemplateFn>` para agregar una entrada dinámica), la única defensa que queda es un array manual que nadie está obligado a mantener sincronizado con lo que los servicios realmente encolan.

**Fix sugerido** (no aplicado — sólo reporto): derivar la cobertura estructuralmente, p.ej. `Object.keys(TEMPLATES) as TemplateName[]` recorrido en el test, o un `satisfies` combinado con `Exclude<TemplateName, keyof typeof TEMPLATES>` que sea `never` — de forma que el test falle en runtime (o el propio archivo de producción falle a compilar con un mensaje decodificable) sin depender de un array mantenido a mano y sincronizado por convención.

---

### 2 — G, trust proxy: ¿por dirección o por saltos? → **Por dirección. Correcto.**

`backend/src/common/proxy-trust.ts` exporta `isTrustedProxyAddress`, una función que compara la IP contra CIDRs fijos (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1/32`) y la pasa como callback a `app.set('trust proxy', isTrustedProxyAddress)` en `main.ts` y en el harness (`test-environment.ts`). No usa `true` ni un entero. Cumple D10 al pie de la letra, incluyendo el manejo de IPv4-mapped IPv6 (`::ffff:127.0.0.1`, necesario para Node en modo dual-stack — trabajo adicional no comiteado que encontré en el árbol, ver nota de discrepancia arriba).

**G.3 (cabecera falsificada desde fuera) existe**: `proxy-trust.spec.ts` tiene 5+ tests bajo "fuera de la red de confianza" que verifican que IPs públicas (`1.2.3.4`, `8.8.8.8`, `190.15.142.87`), límites de CIDR y entradas malformadas devuelven `false`. No hay un test e2e que simule una conexión TCP real desde fuera de la red (imposible en este harness: todas las conexiones de Supertest llegan por loopback, dentro de `127.0.0.1/32`), así que la verificación de "fuera de la red" vive correctamente a nivel de función pura, no de request HTTP completo. Es una limitación de diseño razonable, no un hueco.

**Mutación ejecutada**: quité el `app.set('trust proxy', isTrustedProxyAddress)` de `test-environment.ts` y corrí:

- `proxy-trust.spec.ts` (G.2, unitario) → **14/14 pasan, ninguno cae**. Es esperado: G.2 prueba la función pura `isTrustedProxyAddress` directamente, sin pasar por `app.set`; la mutación no la toca.
- `trust-proxy-rate-limit.e2e-spec.ts` (G.4) → **cae**: `expect(allowed.status).toBe(200)` recibe `429` — el cliente B hereda el cupo agotado del cliente A porque `req.ip` vuelve a ser `127.0.0.1` para ambos.

**WARNING, no CRITICAL**: `tasks.md` G.5 pide literalmente *"comprobar que caen G.2 y G.4"* — ambos. Eso es estructuralmente imposible con el diseño actual: G.2 es (correctamente) un test de la función pura, desacoplado de si está cableada en `app.set`. `apply-progress.md` sólo reporta la caída de G.4 (correcto y honesto), pero no señala que el criterio de aceptación de la tarea, tal como está escrito, no se puede cumplir al 100%. No es un defecto de la protección real (D10 funciona), es un desajuste entre lo que el texto de la tarea pide y lo que es verificable.

---

### 3 — E.4, ¿el campo de confirmación viaja? → **No viaja. Correcto y probado.**

`onSubmit` sigue desestructurando campo por campo (`const { email, password, first_name, last_name } = this.registerForm.value`), no `...this.registerForm.value`. Test `E.4: el cuerpo enviado al servidor tiene exactamente cuatro claves` en `register.component.spec.ts:151` asserta `Object.keys(req.request.body).sort()` **exactamente** `['email', 'first_name', 'last_name', 'password']` y `'email_confirm' in req.request.body === false`. Backend: `RegisterDto` no tiene `email_confirm` (grep confirmado, cero resultados) — D7 respetado, la confirmación no cruza la red.

---

### 4 — E.2, ¿el validador es de grupo? → **Sí, y el escenario de "editar después de confirmar" existe.**

`{ validators: this.emailMatchValidator }` está en el segundo argumento de `formBuilder.group(...)` — a nivel de `FormGroup`, no enganchado a un control. Test `E.5: si después de confirmar el primer correo se edita, vuelve a inválido` en `register.component.spec.ts:197` existe y ejercita exactamente ese escenario.

**Mutación ejecutada**: quité `{ validators: this.emailMatchValidator }`. Resultado — **exactamente 2 de 13 tests caen**:
- `email_confirm (MAIL E.4/E.5) > E.5: dos correos distintos → formulario inválido y register no se llama`
- `email_confirm (MAIL E.4/E.5) > E.5: si después de confirmar el primer correo se edita, vuelve a inválido`

Coincide al 100% con lo que `apply-progress.md` (E.6) reporta. Restaurado y confirmado: 13/13 vuelven a pasar.

---

### 5 — H.5, ¿el test de "sin literales sueltos" cae con un literal a mano? → **Sí, cae.**

**Mutación ejecutada**: inyecté `De parte de GeoReporta.` a mano en el body de la plantilla `incident.assigned`. Resultado:

```
FAIL mail-templates-no-literals.spec.ts
● ... > H.5: ningún string literal del archivo contiene el valor de PRODUCT_NAME
  - Expected: Array []
  + Received: Array [ "`<p>...${productFooter()}</p><p>De parte de GeoReporta.</p>`" ]
```

Cayó exactamente el test esperado. Restaurado; 3/3 vuelven a pasar.

---

### 6 — Mutaciones anotadas en `apply-progress.md`

`tasks.md` y `design.md` sólo definen **3** tareas explícitas de "verificación por mutación": **C.3, E.6, G.5**. No existe una tarea de mutación formal para bloque A ni bloque H en ninguno de los dos artefactos (grep de "mutaci" en ambos confirma sólo 2 apariciones en design.md y 3 en tasks.md — las mismas tres). El enunciado de esta ronda las menciona como "seis", pero no encontré una cuarta, quinta o sexta tarea de mutación declarada en los artefactos de esta fase — si el usuario tiene en mente una lista distinta, no proviene de `tasks.md`/`design.md` tal como están.

Repetí las tres explícitas yo mismo, de forma independiente:

| Tarea | Mutación | Test(s) que cayeron (verificado por mí) | Coincide con apply-progress.md |
|-------|----------|------------------------------------------|--------------------------------|
| C.3   | Quitar `email_verification` de `TEMPLATES` | **Ninguno** — sólo error de compilación TS2741; `mail-templates.spec.ts` no llega a ejecutar ningún `it()` | Sí (mismo hallazgo, honestamente documentado, pero conclusión de "confirmado por derivación" es incorrecta — ver punto 1) |
| E.6   | Quitar `{ validators: emailMatchValidator }` | `E.5: dos correos distintos → inválido`, `E.5: editar después de confirmar → inválido` | Sí, exacto |
| G.5   | Quitar `app.set('trust proxy', ...)` del harness | `G.4: dos clientes con X-Forwarded-For distinto NO comparten rate limit` (G.2 NO cae — ver punto 2) | Parcial: coincide en lo que reporta, pero tasks.md pedía que también cayera G.2, y eso no es alcanzable por diseño |

Adicionalmente ejercité H.5 (no formalmente etiquetada como mutación en tasks.md, pero es una prueba de invariante clásica) — cae correctamente, ver punto 5.

No encontré ninguna evidencia de mutación ejecutada para bloques A o D más allá de lo ya cubierto arriba.

---

## Compuertas

| Compuerta | Resultado | Detalle |
|-----------|-----------|---------|
| backend `npx tsc --noEmit` | ✅ exit 0 | Sin errores |
| backend `pnpm run lint` | ✅ exit 0, 24 warnings | Coincide exactamente con la línea base preexistente (24 `no-explicit-any`, mismos 5 archivos) |
| backend `nest build` | ✅ exit 0 | |
| backend unit (jest) | ✅ **111 suites / 1024 tests**, 0 fallos | Línea base sc-327: 109/989. Delta: +2 suites, +35 tests — los tests nuevos SÍ se ejecutan |
| backend e2e SUBCONJUNTO (6 archivos) | ❌ **1 suite falla / 5 pasan** — **2 tests fallan / 25 pasan** (27 total) | `mail.e2e-spec.ts`: ambos tests C.4 fallan (ver CRITICAL #2) |
| backend e2e COMPLETO (54 archivos) | ❌ **1 suite falla / 53 pasan** — **2 tests fallan / 468 pasan** (470 total) | Mismo fallo, reproducido en la corrida completa. Línea base sc-327: 53/465. Delta: +1 suite, +5 tests |
| frontend `npx tsc -b --noEmit` | ❌ exit 2 (preexistente, no introducido por este change) | 3 archivos de spec rotos desde antes de esta rama (`auth.service.spec.ts:227`, `placeholder.component.spec.ts`, `layout-tokens.regression.spec.ts`) — confirmado con `git log`/`git diff` contra la base: ninguno de los tres fue tocado por los commits de este change |
| frontend unit (jest) | ✅ **60 suites / 415 tests**, 0 fallos | |
| frontend build (`ng build`) | ✅ exit 0 | El `tsc -b` roto no bloquea el build de Angular CLI, tal como documenta `apply-progress.md` |

### Tiempo de e2e: subconjunto vs. completo

- **Subconjunto (6 archivos)**: ~125 s (2 min 5 s)
- **Completo (54 archivos)**: ~687 s (11 min 27 s) — reportado por Jest como 686.947 s, confirmado por timestamps externos (688 s)

**La estrategia vale la pena y hay que mantenerla.** El completo tarda ~5.5× más que el subconjunto. Cada iteración de mutación en el subconjunto cuesta ~2 min; la misma iteración contra el completo habría costado ~11-12 min. Con 3 mutaciones e2e-relevantes ejecutadas en esta ronda, usar el subconjunto ahorró aproximadamente 30 minutos frente a correr la suite completa cada vez. Confirmado además que el fallo de `mail.e2e-spec.ts` es el mismo en ambas corridas — el subconjunto no dio ningún falso negativo/positivo frente al completo en esta ronda.

---

## Issues Found

### CRITICAL (bloquean el archivado)

**CRITICAL-1 — Los e2e C.4 fallan en ejecución real.** `backend/test/e2e/mail.e2e-spec.ts`, tests *"C.4: una entrada con `email_verification` se procesa y NO termina en mail:dead"* y *"C.4: una entrada con `existing_account_attempt` se procesa y NO termina en mail:dead"* — ambos fallan, tanto en el subconjunto como en la suite completa.

Causa raíz confirmada: `backend/.env` (el archivo real del repo, no `.env.example`) trae `SMTP_HOST=localhost` y `SMTP_PORT=1025` — un catcher SMTP local (tipo MailHog) que no forma parte de `compose.yaml` y no está corriendo en este entorno. `backend/src/core/core.module.ts:83` carga `envFilePath: ['.env']` incondicionalmente, incluso en el harness e2e. `test-environment.ts` normalmente sobreescribe explícitamente cada variable de infraestructura no determinista (`DB_HOST`, `REDIS_URL`, etc. — ver líneas 136-190), pero **nunca toca `SMTP_HOST`**. El comentario del propio test (`mail.e2e-spec.ts:24`, `108`) asume *"SMTP_HOST is unset in this harness"* — eso es falso frente al `.env` real del proyecto.

Verificado el diagnóstico de forma aislada: `SMTP_HOST= npm run test:e2e -- --testPathPattern='mail\.e2e-spec'` (forzando la variable vacía) → **6/6 pasan**. Con el `.env` real (sin overrides) → **2/6 fallan**, siempre los mismos dos.

Esto significa que la prueba que tasks.md describe como *"la prueba que habría detectado el defecto el primer día"* — el entregable central del bloque C — **no pasa out-of-the-box** con el `.env` que el propio repositorio trae. Cualquiera que clone el repo y corra `npm run test:e2e` sin levantar manualmente un MailHog en el puerto 1025 ve estos dos tests en rojo. `apply-progress.md` reporta "✅ C.4: ... NO terminan en mail:dead" sin matiz — no refleja esta fragilidad.

**Fix sugerido** (no aplicado): `test-environment.ts` debe sobreescribir `process.env.SMTP_HOST = ''` explícitamente, igual que hace con el resto de variables de infraestructura, para que el harness sea determinista sin depender del `.env` ambiental.

**CRITICAL-2 — C.2 no cierra la costura; es decorativo por la propia definición de la tarea.** Ver punto 1 arriba. `ENQUEUED_TEMPLATE_NAMES` es un array enumerado a mano; la mutación de C.3 demuestra que ningún test runtime cae, sólo el compilador. `tasks.md` define textualmente esa condición como el criterio de "hay que rehacerlo", y no se rehizo.

### WARNING (deberían atenderse)

- **G.5 no puede cumplir literalmente su propio criterio de aceptación.** `tasks.md` pide que la mutación haga caer G.2 y G.4; G.2 es un test de función pura desacoplado del cableado `app.set`, así que estructuralmente no puede caer por esa mutación. No es un defecto de la protección (D10 funciona, confirmado por G.4), sino un desajuste de redacción entre la tarea y lo verificable. Sugerencia: reformular G.5 en tasks.md para pedir sólo la caída de G.4, o agregar un test de integración de `main.ts`/`bootstrap()` que sí dependa del cableado y pueda caer junto a G.4.
- **`frontend npx tsc -b --noEmit` sigue en rojo** (exit 2) por 3 specs preexistentes no relacionados con este change (confirmado con `git log`/`git diff`: ninguno fue tocado por los commits de MAIL). No es una regresión de esta fase, pero la compuerta declarada en `tasks.md` línea 311 (*"frontend npx tsc -b --noEmit exit 0"*) no se cumple hoy, con o sin este change. Merece su propio ticket de limpieza — ya está anotado en `apply-progress.md` como deuda conocida.

### SUGGESTION

- El comentario en `ENQUEUED_TEMPLATE_NAMES` (mail-templates.ts:110-116) es honesto sobre su propia limitación pero deja la puerta abierta a que la próxima persona confíe en él como si cerrara la costura. Vale la pena que el comentario en el propio test C.2 (no sólo en el array) advierta explícitamente que la protección real es el tipo `Record<TemplateName, TemplateFn>`, no el `for` del test.
- Conteo de tests en `apply-progress.md` reporta "111 suites / 1023 tests" — la ejecución real de esta ronda dio 111/1024 (off-by-one, sin impacto práctico, probablemente un test agregado/quitado entre el momento del reporte y el commit final).

---

## Completeness

37/37 tareas marcadas `[x]` en `tasks.md`. Todas tienen evidencia estructural en el código. Las discrepancias no son de tareas incompletas sino de **tareas marcadas completas cuya evidencia de ejecución real contradice el criterio de aceptación** (C.2/C.3, ver CRITICAL-2) o cuya ejecución real falla por una razón de entorno no capturada en el diseño del test (C.4, ver CRITICAL-1).

---

## Spec Compliance Matrix (resumen — 7 requisitos, 33 escenarios)

| Requirement | Escenarios cubiertos | Estado |
|-------------|----------------------|--------|
| Todo correo que el sistema encola se puede renderizar (5) | Render de las 2 plantillas: ✅ COMPLIANT (unit, pasan). Cobertura de todos los emisores (C.2): ⚠️ PARTIAL — test pasa pero es decorativo (CRITICAL-2). Nombre inventado no compila: ✅ COMPLIANT (demostrado con mutación TS2741). Nombre desconocido en runtime → dead-letter sin reintento: ✅ COMPLIANT (`mail-outbox.consumer.spec.ts` preexistente, sigue pasando) | 4/5 ✅, 1/5 ⚠️ |
| El correo de verificación llega con OTP y vigencia (3) | Cuerpo con código, datos escapados, asunto sin OTP: ✅ COMPLIANT — `mail-templates.spec.ts`, subject verificado por grep (`'Your email verification code'`, sin interpolar OTP) | 3/3 ✅ |
| El aviso de intento informa sin dar nada que pulsar (9) | Sin OTP, sin enlace, contexto (dispositivo/IP/hora), sin versiones, IP enmascarada, hora del intento no de entrega, hora local, dato ausente → "desconocida/o", indistinguibilidad HTTP: ✅ COMPLIANT — 8 tests unitarios en `mail-templates.spec.ts` cubren cada uno explícitamente; indistinguibilidad HTTP no tocada (D5 respetado, sin diff en respuesta) | 9/9 ✅ |
| El alta pide el correo dos veces antes de enviarlo (5) | No coinciden, coinciden, editar tras confirmar, campo no viaja, confirmación no existe en servidor: ✅ COMPLIANT — los 5 tienen test (`register.component.spec.ts` E.4/E.5) y pasan; mutación E.2 confirma que 2 de ellos realmente dependen del validador de grupo | 5/5 ✅ |
| El mensaje del alta tiene un solo dueño (2) | Mensaje mostrado desde backend, sin gemelos divergentes: ✅ COMPLIANT — `verify-email.component.spec.ts`/`register.component.spec.ts` F.2, grep confirma que la única frase vieja vive en comentarios/mocks de test | 2/2 ✅ |
| La IP registrada es la del cliente, no la del proxy (4) | Petición por proxy, cabecera falsificada descartada, límite por cliente, sin dirección resoluble: ✅ COMPLIANT — `proxy-trust.spec.ts` + `trust-proxy-rate-limit.e2e-spec.ts` (G.4 mutation-tested); "sin dirección resoluble" cubierto por `assertRateLimit`/`registerIpHit` preexistente (`if (!key) return`) | 4/4 ✅ |
| La aplicación se identifica como GeoReporta (5) | Remitente con nombre, pie del mensaje, un solo nombre, título del navegador, sin literales sueltos: ✅ COMPLIANT — `mail.service.spec.ts` (H.6), `mail-templates-no-literals.spec.ts` (H.5, mutation-tested), `index.html` (H.7) | 5/5 ✅ |

**Compliance summary**: 32/33 escenarios COMPLIANT por evidencia de ejecución real; 1/33 PARTIAL (cobertura de todos los emisores — pasa pero es decorativo).

Nota: el fallo de C.4 (CRITICAL-1) no corresponde a un escenario específico del spec de `citizen-registration` — es un test de integración adicional del bloque C de tasks.md, no uno de los 33 escenarios enumerados en `specs/citizen-registration/spec.md`. Se reporta como CRITICAL igualmente porque es el entregable central de la fase.

---

## Coherence (Design)

| Decisión | ¿Se siguió? | Notas |
|----------|-------------|-------|
| D1 — dos entradas en el registro, sin motor de plantillas | ✅ Sí | |
| D2 — quitar los `as never` | ✅ Sí | Confirmado, y es la defensa real que funciona (ver CRITICAL-2) |
| D3 — test que recorre el camino, no dos puntas | ⚠️ Deviated | El test existe pero no recorre nada que el tipo no garantice ya; ver CRITICAL-2 |
| D4 — aviso sin OTP ni enlace | ✅ Sí | |
| D5 — indistinguibilidad se conserva | ✅ Sí | Sin cambios en la respuesta HTTP |
| D6 — mail:dead se acota, no se vacía | ✅ Sí | `MAXLEN ~ 1000` |
| D7 — confirmación sólo en cliente | ✅ Sí | |
| D8 — mensaje con un solo dueño | ✅ Sí | |
| D9 — aviso recortado (dispositivo/IP/hora) | ✅ Sí | |
| D10 — trust proxy por dirección | ✅ Sí | Mutation-tested |
| D11 — GeoReporta en un solo sitio | ✅ Sí | |
| D12 — qué no se toca | ✅ Sí | Nada de lo marcado "fuera de alcance" fue tocado |

---

## Qué queda abierto

1. **CRITICAL-1**: agregar `process.env.SMTP_HOST = ''` (o equivalente) en `test-environment.ts` para que `mail.e2e-spec.ts` sea determinista sin depender del `.env` ambiental. Sin esto, la fase no se puede dar por cerrada: el propio entregable central falla en ejecución real.
2. **CRITICAL-2**: rehacer C.2 para que derive la cobertura estructuralmente (no con un array a mano), o aceptar explícitamente en el design/tasks que la defensa real es el tipo `Record<TemplateName, TemplateFn>` y renombrar/reencuadrar la tarea en consecuencia — pero tal como está redactada hoy, no se cumplió.
3. WARNING G.5: ajustar la redacción de la tarea o agregar un test que sí pueda caer junto a G.2.
4. WARNING frontend tsc -b: deuda preexistente, no bloqueante para este change, pero sigue sin ticket propio más allá de la nota en `apply-progress.md`.

**Next recommended**: `sdd-apply` para atender CRITICAL-1 y CRITICAL-2 antes de reintentar `sdd-verify`. No archivar.
