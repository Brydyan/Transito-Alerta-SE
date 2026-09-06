# Proposal: MAIL — Las plantillas de verificación que nunca existieron

## Intent

El correo de verificación de cuenta **nunca se ha podido enviar**. Ni una vez, desde
que REG (sc-325) se dio por cerrada.

`EmailVerificationService` encola dos correos nombrando plantillas que no están en el
registro:

```ts
template: 'email_verification' as never,        // email-verification.service.ts:115
template: 'existing_account_attempt' as never,  // email-verification.service.ts:56
```

`TemplateName` declara seis, y ninguna es ésa:

```
incident.created · incident.assigned · incident.status_changed
comment.created · invitation · password-reset
```

`renderMailTemplate` lanza `Unknown mail template`, y `MailOutboxConsumer` clasifica eso
como **defecto de datos: directo a `mail:dead`, sin reintentar**. Como `MailService.deliver`
renderiza *antes* de abrir la conexión, el servidor SMTP nunca se entera de que había un
correo que mandar.

Verificado en staging el 2026-09-06, con Resend configurado y su DNS propagado:

```
$ redis-cli XRANGE mail:dead - + COUNT 1
subject    Your email verification code
template   email_verification
data       {"otp":"408736","expiresMinutes":15}
attempts   0
```

**`attempts 0`** es el dato: no falló al entregar, nunca intentó entregar.

## El nombre correcto de lo que se construye

No es «arreglar el correo». El correo está bien: las credenciales, el dominio verificado y
los registros DNS funcionan. Lo que falta son **dos plantillas y la barrera de tipos que
debía haberlas exigido**.

Y hay una tercera cosa, que es la que importa a futuro: hoy nada impide volver a encolar un
nombre inexistente. El `as never` que oculta el defecto es reproducible — cualquiera que
añada un correo nuevo y se tope con el error del compilador tiene el mismo atajo a mano.

## Por qué sobrevivió diez rondas de verify

Dos causas, y las dos son patrones ya vistos en este proyecto.

**El cast apagó el único control automático que existía.** `'email_verification'` no es
asignable a `TemplateName`; el compilador lo rechazaba. `as never` lo calla. Sin el cast,
esto nunca habría compilado, y no habría hecho falta ningún test.

**El test del vecino sí lo comprueba, y éste no.** Los dos servicios que encolan correo
tienen test, y hacen cosas distintas:

```ts
// password-reset.service.spec.ts:58  — sí asserta la plantilla
expect.objectContaining({ to: 'a@b.com', template: 'password-reset' })

// email-verification.service.spec.ts:99 — no la asserta
expect.objectContaining({ to: 'test@example.com' })
```

Es literalmente el defecto recurrente del proyecto: *una regla aplicada en un sitio y no en
su vecino*. Y por encima de los dos, nadie recorre el camino entero: el lado que encola se
prueba con un `MailService` simulado, el lado que renderiza se prueba con sus seis
plantillas, y nada junta ambos extremos.

**El spec tampoco lo pedía.** `citizen-registration` exige que *la respuesta diga* que se
envió un correo de verificación. No exige que el correo **se pueda enviar**. Un sistema que
responde «te enviamos un mensaje» y no envía nada cumple el spec al pie de la letra.

## Scope

### In Scope — A · Las dos plantillas

- `email_verification` — cuerpo con el código OTP y su vigencia. Datos: `{ otp,
  expiresMinutes }`.
- `existing_account_attempt` — aviso al titular de que alguien intentó registrarse con su
  correo. Datos: `{ ip, userAgent }`. Sin OTP y sin enlace de acción: el titular no pidió
  nada, y darle un botón sería convertir un aviso en un vector.

Ambas se suman a `TemplateName` y al registro `TEMPLATES`, con el mismo escapado de datos
que las seis existentes (R13 — nada se interpola sin pasar por `field()`).

### In Scope — B · Retirar los `as never`

Los dos casts de `email-verification.service.ts` se quitan. Con las plantillas en la unión,
el código compila sin ellos; y a partir de ahí el compilador vuelve a ser la primera
barrera contra un nombre inventado.

### In Scope — C · La cobertura que faltaba

- El test de `email-verification.service.spec.ts` pasa a assertar **la plantilla**, igual
  que hace el de `password-reset`.
- Un test que recorre el camino completo: por cada nombre que el código encola,
  `renderMailTemplate` lo acepta. Es el test que no existía y que habría detectado esto el
  primer día.

### In Scope — D · Higiene de `mail:dead`

Las entradas muertas guardan el OTP **en claro** y no caducan solas. Hoy hay una; con el
alta funcionando y cualquier fallo de transporte, se acumulan. Se acota el crecimiento del
stream.

### In Scope — E · Confirmar el correo antes de enviarlo

El formulario de alta pide el correo **una sola vez**. Un dedazo crea una cuenta cuyo OTP
viaja a un buzón que no es el del usuario: la cuenta queda inservible y el desconocido
recibe un código.

Se añade un segundo campo de confirmación. Mientras los dos no coincidan, el formulario no
se envía y se dice por qué.

Es el arreglo que estaba faltando en el orden correcto: hasta ahora no importaba, porque el
correo no salía. Con el correo funcionando, importa desde el primer alta.

### In Scope — F · El mensaje de éxito, en un solo sitio

`register.component.ts:64` mantiene su propia copia del mensaje de alta, y conserva una
frase que el backend ya quitó:

```
backend   'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.'
frontend  '...verificar tu cuenta. Si ya lo estaba, te enviamos un aviso al titular.'
```

La copia del frontend es la que el usuario ve — se pasa como `hint` a la pantalla de
verificación. No es un oráculo (la frase es constante, no depende de si el correo existe),
pero es la misma regla aplicada en un sitio y no en su vecino. El frontend pasa a mostrar
el mensaje que devuelve el backend en vez de mantener su gemelo.

### Out of Scope

- **Rediseñar las plantillas.** Son HTML mínimo, como las seis que ya existen. Darles
  formato de marca es trabajo de otra fase.
- **Un campo de confirmación en el DTO del backend.** La confirmación es una defensa contra
  el dedazo humano, y sólo tiene sentido donde hay dedos. Un cliente que llame al API manda
  los dos campos iguales y la comprobación no dice nada. Ver D8.
- **Rediseñar la pantalla de alta.** Se añade un campo y se corrige un mensaje; el resto
  del formulario queda como está. El rediseño visual es F6.
- **Cambiar de proveedor de correo.** Resend funciona; el problema nunca estuvo ahí.
- **El `as never` de `incidents.service.ts:269`.** Es otro cast, en otro contexto, y no
  toca el correo. Merece revisión propia, no un arreglo de pasada.
- **Reintentar los correos ya muertos.** El OTP de la entrada actual caduca en 15 minutos;
  reinyectarlo no sirve de nada. El ciudadano vuelve a pedir el código.

## Capabilities

- `citizen-registration` (MODIFIED) — se añade el requisito de que el correo de
  verificación sea efectivamente enviable, no sólo prometido en la respuesta.

## Dependencias

Ninguna hacia adelante. Hacia atrás depende de REG (sc-325), archivada, cuyo defecto
corrige.

**Bloquea a F4**: la pantalla del ciudadano no sirve de nada si el ciudadano no puede
verificar su cuenta.

## Trampas verificadas que esta fase pisa

- **`nest build` usa `tsconfig.build.json`, que excluye `test/`.** Quitar los `as never`
  puede romper un test sin romper el build. Hay que correr `typecheck`, no sólo `build`.
- **`rtk tsc` da falsos negativos.** Usar `npx tsc` crudo.
- **En un pipe, `$?` es el exit del último comando, no el de jest.**
- **`MailService.deliver` renderiza antes de abrir SMTP.** Un test que simule el transporte
  y no el renderizado no prueba nada de este defecto.

## Preguntas abiertas

- ¿El aviso de `existing_account_attempt` debe incluir la IP y el user-agent tal cual? Se
  le está diciendo al titular desde dónde intentaron usar su correo, lo cual ayuda a
  reconocer un intento propio, pero también expone datos del tercero. La decisión previa
  (REG) ya los pasa al servicio; esta fase los renderiza tal como llegan y deja la pregunta
  anotada para quien defina la política de privacidad.
