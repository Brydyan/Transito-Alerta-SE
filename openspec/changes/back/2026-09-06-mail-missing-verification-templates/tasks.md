# Tasks: MAIL — Las plantillas de verificación que nunca existieron

Historia: [sc-330](https://app.shortcut.com/upse/story/330) · Rama:
`brydyan/sc-330/mail-correo-de-verificacion-nunca-enviado`, sacada de `develop`.

Orden obligatorio: **A antes que B**. Quitar los `as never` antes de que las plantillas
existan deja el proyecto sin compilar.

---

## A · Las dos plantillas

- [x] **A.1** — Añadir `'email_verification'` y `'existing_account_attempt'` a la unión
  `TemplateName` en `backend/src/modules/mail/templates/mail-templates.ts`.

- [x] **A.2** — Añadir sus dos funciones al registro `TEMPLATES`, en el mismo archivo.

  `email_verification` recibe `{ otp, expiresMinutes }`. El cuerpo muestra el código y los
  minutos de vigencia.

  `existing_account_attempt` recibe `{ ip, userAgent, attemptedAt }`. Aviso informativo:
  alguien intentó crear una cuenta con este correo. **Sin OTP y sin enlace de acción**
  (D4). Tres campos, todos recortados (D9):

  ```
  Dispositivo     Chrome en Linux
  Dirección IP    190.15.x.x
  Cuándo          6 de septiembre de 2026, 14:33 (GMT-5)
  ```

  El cuerpo cierra diciendo que **no hay nada que hacer** en ninguno de los dos casos:
  nadie entró a la cuenta ni cambió nada. El correo lo dispara un tercero; si suena
  alarmante, asusta a la gente por algo que no ocurrió.

  Ambas interpolan **exclusivamente** a través de `field()`, como las seis existentes. Nada
  de plantillas de cadena con datos crudos: es el requisito R13 y la razón por la que este
  módulo no usa un motor de plantillas.

- [x] **A.3** — Ayudantes de formato para el aviso, en el módulo de correo. Sin
  dependencias nuevas (D9):

  - **`maskIp`** — IPv4 conserva los dos primeros octetos (`190.15.142.87` → `190.15.x.x`);
    IPv6, los dos primeros grupos. Entrada nula → `'desconocida'`.
  - **`describeDevice`** — del user-agent saca navegador y sistema, **sin versiones**
    (`Chrome en Linux`). Unas veinte líneas. Lo que no reconozca → `'desconocido'`.
  - **`formatAttemptTime`** — fecha legible en hora de Ecuador (`America/Guayaquil`), no
    UTC.

- [x] **A.4** — `notifyExistingAccountAttempt` pasa también `attemptedAt` (el momento del
  intento).

  Motivo: el outbox es asíncrono. La hora de entrega no es la del intento, y la que le
  importa al titular es la segunda. Calcularla al renderizar daría la hora equivocada.

- [x] **A.5** — Tests de renderizado, uno por plantilla:
  - el cuerpo contiene el dato esperado (el OTP; la IP enmascarada)
  - un dato con marcado HTML sale **escapado**, no interpretado
  - el aviso de intento **no** contiene el OTP ni un `href` de acción
  - el aviso **no** contiene la IP completa ni la cadena de user-agent entera
  - IP o user-agent ausentes → «desconocida» / «desconocido», nunca un hueco vacío

---

## B · Retirar los `as never`

- [x] **B.1** — Quitar el cast de `email-verification.service.ts:56`
  (`'existing_account_attempt' as never` → `'existing_account_attempt'`).

- [x] **B.2** — Quitar el cast de `email-verification.service.ts:115`
  (`'email_verification' as never` → `'email_verification'`).

- [x] **B.3** — `npx tsc --noEmit -p backend/tsconfig.json` en exit 0.

  **Trampa**: `nest build` usa `tsconfig.build.json`, que **excluye `test/`**. El build
  puede pasar con un test roto. Correr el typecheck, no sólo el build.

---

## C · La cobertura que faltaba

- [x] **C.1** — Reforzar `email-verification.service.spec.ts:99`: la aserción pasa a
  incluir **la plantilla**, igual que hace su vecino en
  `password-reset.service.spec.ts:58`.

  ```ts
  expect.objectContaining({ to: 'test@example.com', template: 'email_verification' })
  ```

  Hacer lo mismo con el test del aviso de intento, si existe; si no existe, escribirlo.

- [x] **C.2** — **Rebajado a WARNING por la auditoría de la ronda 1.** El test era una
  tautología: `ENQUEUED_TEMPLATE_NAMES: ReadonlyArray<TemplateName>` y
  `TEMPLATES: Record<TemplateName, TemplateFn>` hacen que el bucle
  `for (const name of ENQUEUED_TEMPLATE_NAMES) renderMailTemplate(name, …)` nunca pueda
  alcanzar la rama `if (!fn) throw`. La cobertura que C.2 buscaba ya la garantiza
  el compilador. Lo que el compilador **no** puede ver — un nombre que llega como cadena
  desde Redis y ya no existe en el union — está cubierto por
  `mail-outbox.consumer.spec.ts` ('sends an unknown template straight to mail:dead'):
  ese es el test que importa, no C.2. El bloque C.2 queda borrado; `ENQUEUED_TEMPLATE_NAMES`
  ya no se exporta. Un comentario en `mail-templates.ts` documenta la cobertura real y
  apunta al consumer test.

- [x] **C.3** — **Verificación por mutación, ejecutada por quien implementa.** Quitar
  `email_verification` del registro `TEMPLATES` y comprobar que **cae** el typecheck
  (no un test runtime). Restaurar.

  Anotar en `apply-progress.md` **lo que cayó**. La auditoría inicial pedía que cayera
  C.2; con C.2 borrado, lo que cae es la **compilación de 10 specs** (la unión
  `TemplateName` exige que la clave esté en `TEMPLATES`): el compilador vuelve a ser
  la primera barrera contra un nombre inventado (D2). Eso es la prueba que C.3
  buscaba demostrar.

- [x] **C.4** — Test de integración del camino completo, contra Redis real: encolar una
  verificación, dejar que el consumidor la procese, y comprobar que **no** aparece en
  `mail:dead`. Es la prueba que habría detectado el defecto el primer día.

  Con `SMTP_HOST` sin configurar, `deliverViaSmtp` cae al transporte de sólo-registro y
  devuelve sin error: el camino se recorre entero sin mandar correo de verdad.

---

## D · Higiene de `mail:dead`

- [x] **D.1** — Acotar el crecimiento del stream de entradas muertas (`XADD` con `MAXLEN ~`
  o equivalente) en `mail-outbox.consumer.ts`.

  Motivo: las entradas guardan el cuerpo, y en la verificación eso incluye **el OTP en
  claro**. El stream no caduca por sí solo.

  **No** vaciarlo al arrancar: es la única evidencia de que un correo falló, y borrarla
  convierte un fallo silencioso en uno invisible (D6).

- [x] **D.2** — Documentar en el `apply-progress.md` el comando de limpieza manual
  (`redis-cli DEL mail:dead`) y por qué no es automático.

---

## E · Confirmar el correo en el formulario de alta

Todo en `frontend/src/app/features/auth/register/`.

- [x] **E.1** — Añadir el control `email_confirm` al `FormGroup` de
  `register.component.ts`, con `Validators.required` y `Validators.email`.

- [x] **E.2** — Validador **de grupo** (no de campo) que compara `email` con
  `email_confirm`.

  Tiene que ser de grupo: un validador de campo no ve el valor del otro. Y si se engancha
  sólo al segundo, editar el primero después de haber confirmado deja el formulario válido
  con dos valores distintos (escenario explícito del spec).

- [x] **E.3** — Marcado en `register.component.html`, debajo del campo de correo actual:

  ```
  Correo                 → el campo que ya existe
  Verifique su correo    → el nuevo
  ```

  Mensaje de error cuando no coinciden: **«El correo no coincide con la verificación.»**
  Mismo patrón `@if (...touched && ...errors)` y misma clase `form-error` que los campos
  existentes. Poner `data-testid` como tienen los demás.

- [x] **E.4** — **Comprobar que el campo NO viaja al servidor.**

  `onSubmit` ya desestructura campo por campo
  (`const { email, password, first_name, last_name } = this.registerForm.value`), así que
  por defecto no viaja. **No cambiar eso a `...this.registerForm.value`.**

  Motivo, verificado en staging el 2026-09-06: el `ValidationPipe` corre con
  `forbidNonWhitelisted` y un campo de más **rechaza el alta entera**:

  ```
  {"message":["property full_name should not exist"],"error":"Bad Request","statusCode":400}
  ```

  Test que lo fija: espiar la llamada a `authService.register` y assertar que el objeto
  tiene **exactamente** esas cuatro claves.

- [x] **E.5** — Tests del componente:
  - dos correos distintos → formulario inválido, mensaje visible, `register` no se llama
  - dos correos iguales → `register` se llama
  - coinciden y luego se edita el primero → vuelve a inválido
  - el cuerpo enviado tiene exactamente cuatro claves (E.4)

- [x] **E.6** — **Verificación por mutación.** Quitar el validador de grupo y comprobar que
  **caen** los tests de E.5. Anotar cuál cayó, por nombre.

---

## F · El mensaje de éxito, en un solo sitio

- [x] **F.1** — `register.component.ts:64` deja de tener su propia copia. El componente
  muestra el mensaje que devuelve el backend en la respuesta del alta.

  La copia actual conserva la frase *«Si ya lo estaba, te enviamos un aviso al titular»*,
  que REG quitó del backend en su ronda 12 y que aquí quedó viva. La que el usuario ve es
  ésta.

- [x] **F.2** — Test: la pantalla de verificación recibe como `hint` el texto de la
  respuesta, no una constante del cliente.

- [x] **F.3** — Comprobar que no queda ninguna otra copia literal de ese mensaje en
  `frontend/src`.

---

## G · Que `req.ip` sea la IP del cliente

- [x] **G.1** — Habilitar la confianza en el proxy en `main.ts`, **acotada por dirección** a
  la red interna de Docker. No `true` (confía en cualquiera) ni un número de saltos (supone
  que siempre hay exactamente un proxy delante y falla en silencio hacia el lado inseguro).
  Ver D10.

- [x] **G.2** — Test: una petición con `X-Forwarded-For` que llega **desde la red de
  confianza** resuelve la IP del cliente.

- [x] **G.3** — Test: una petición con `X-Forwarded-For` que llega **desde fuera** de esa
  red **no** se hace pasar por la IP declarada.

  Es el que importa: `APP_PORT=3004` está publicado en el host, así que el backend es
  alcanzable sin pasar por nginx. Sin este test, la configuración podría estar abierta y
  parecer correcta.

- [x] **G.4** — Test del efecto real: dos clientes con IPs distintas cuentan por separado
  en el límite de tasa del alta. Hoy comparten llave, así que `IP_MAX = 5` se aplica al
  tráfico entero.

- [x] **G.5** — **Verificación por mutación.** Quitar el ajuste de confianza y comprobar que
  **cae G.4**. Anotar cuál cayó, por nombre.

  G.2 prueba la función pura `isTrustedProxyAddress` en aislamiento; no pasa por
  `app.set`, así que la mutación de quitar el cableado no le hace nada (confirmado
  en la ronda 1: 14/14 siguen pasando). El único test que depende del cableado real
  es G.4 — la mutación lo hace caer porque `req.ip` deja de resolverse desde
  `X-Forwarded-For` y los dos clientes del test comparten `127.0.0.1`.

- [x] **G.6** — Anotar en `apply-progress.md` la deuda de infraestructura: publicar
  `APP_PORT` en el host no hace falta si todo entra por nginx, y cerrarlo reduce la
  superficie. Es cambio de despliegue, no de código — no se hace en esta fase.

---

## H · De parte de GeoReporta, con un solo nombre

- [x] **H.1** — Constante única con el nombre del producto (**`GeoReporta`**) en el módulo
  de correo. Es la fuente para todo lo demás de este bloque.

- [x] **H.2** — El remitente lleva nombre visible. Hoy `mail.service.ts:104` manda
  `from: mailConfig.smtpFrom`, la dirección pelada, y en la bandeja se lee
  `no-reply@georeporta.twintailcs.xyz`.

  Pasa a enviarse con el nombre delante de la dirección. Es lo primero que ve quien recibe
  y lo que decide si abre o marca como no deseado.

- [x] **H.3** — Pie común en las plantillas, tomando el nombre de H.1. Las dos nuevas y las
  seis existentes: si sólo se aplica a las nuevas, el mismo ciudadano recibe el código de
  verificación de un remitente y la recuperación de contraseña de otro.

- [x] **H.4** — Retirar los literales sueltos de los sitios que el usuario **ve**:
  - `password-reset.service.ts:56` — `'Reset your Transito Alerta SE password'`
  - `mail-templates.ts` — el respaldo `'Transito Alerta SE'` de la plantilla `invitation`

  **No** tocar `main.ts:77` (título de Swagger, que no se sirve en producción).

- [x] **H.5** — Test: el nombre del producto **no** aparece escrito a mano en ninguna
  plantilla; todas lo toman de la constante. Es el test que impide que el próximo correo
  vuelva a traer su propia copia.

- [x] **H.6** — Test: el `from` que llega al transporte incluye el nombre visible.

- [x] **H.7** — `frontend/src/index.html:5` — el título es `TransitoAlertaSEFrontend`, el
  nombre que generó el andamio de Angular y que nunca se cambió. Pasa a ser el nombre de la
  aplicación.

  Es lo que se lee en la pestaña del navegador mientras el ciudadano se registra.

- [x] **H.8** — **No** tocar la marca del sidebar (`sidebar.component.html:3-5`: el logo
  `assets/logo.svg` y el texto «Tránsito Alerta»). Lleva un activo gráfico nuevo, así que
  es trabajo de diseño y pertenece a F6. Anotarlo en `apply-progress.md`.

  **Recordatorio de nomenclatura** (ver «Los dos nombres» en `openspec/ROADMAP.md`):
  **TASE** es el proyecto; **GeoReporta** es la aplicación. Y «GeoReporta» ya aparece 11
  veces en `backend/src` refiriéndose al **sistema anterior** — no tocar esos comentarios,
  y al escribir nuevos decir «GeoReporta (el sistema anterior)» para que no se confundan
  con el producto.

---

---

## Qué NO hacer en esta fase

- **No** introducir un motor de plantillas. El diseño original eligió funciones puras a
  propósito, por R13.
- **No** tocar la respuesta HTTP del alta. La indistinguibilidad de REG costó seis rondas;
  cualquier diferencia observable entre los dos caminos la rompe (D5).
- **No** reinyectar las entradas de `mail:dead` existentes. El OTP que contienen ya caducó.
- **No** tocar el `as never` de `incidents.service.ts:269`. Otro cast, otro camino, sin
  relación con el correo.
- **No** cambiar nada de Resend, del dominio ni del DNS. Se verificó que el fallo ocurre
  antes de abrir la conexión SMTP (`attempts 0`).
- **No** añadir ubicación geográfica al aviso. Evaluada y descartada: una base local son
  ~70 MB y un trabajo de refresco, y una API externa metería una llamada de red dentro del
  consumidor del outbox — que es el componente que estamos arreglando.
- **No** usar `trust proxy: true` ni un número de saltos. Ver D10: la primera confía en
  cualquiera, la segunda supone una topología que puede cambiar sin aviso.
- **No** añadir una librería de parseo de user-agent. Trae una base de firmas que envejece
  para producir dos palabras.
- **No** traducir las cuatro plantillas en inglés (`incident.created`, `incident.assigned`,
  `incident.status_changed`, `comment.created`). Están en inglés en una aplicación en
  castellano y salta a la vista al tocar este módulo, pero es otra superficie con su propia
  revisión de texto, y no bloquea el alta. Anotarlo en `apply-progress.md`.
- **No** tocar `main.ts:77` (`'Transito Alerta SE — API'`). Es el título de Swagger, que no
  se sirve en producción. El renombrado de H alcanza a lo que el usuario recibe.

---

## Compuertas antes de dar por terminada la fase

```
backend   npx tsc --noEmit         exit 0   (no `nest build`: excluye test/)
backend   pnpm run lint            0 errores
backend   unit                     suites/tests, comparar con la línea base
backend   e2e                      suites/tests, comparar con la línea base
frontend  npx tsc -b --noEmit      exit 0
frontend  unit                     suites/tests, comparar con la línea base
frontend  build                    exit 0
```

**Trampa del frontend**: `npx tsc -p frontend/tsconfig.json` compila **cero archivos**
(`"files": []`). Hay que usar `tsc -b`. Un typecheck que no compila nada pasa siempre.

Si el total de tests **no sube**, los tests nuevos no se están ejecutando. Eso es un fallo
de la fase, no un detalle.
