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
  correo. Datos: `{ ip, userAgent, attemptedAt }`. Sin OTP y sin enlace de acción: el
  titular no pidió nada, y darle un botón sería convertir un aviso en un vector.

  Muestra tres campos: **dispositivo** («Chrome en Linux», derivado del user-agent sin
  versiones), **dirección IP enmascarada** (`190.15.x.x`) y **cuándo**, en hora local de
  Ecuador. Sin ubicación geográfica — ver «Fuera de alcance».

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

### In Scope — G · Que `req.ip` sea la IP del cliente

Hoy no lo es, y nadie lo había notado.

nginx manda las cabeceras correctamente (`nginx.conf:56`), pero Express corre **sin
`trust proxy`** —no aparece en ninguna parte del backend— así que las ignora y devuelve la
dirección del socket: **la IP del contenedor de nginx, idéntica para todo el tráfico web**.

Dos consecuencias, y la segunda es la grave:

**El aviso al titular mostraría `172.18.0.4`**, un dato interno que no dice nada. El bloque
A no tiene sentido sin esto.

**La limitación de tasa del alta es global.** `auth.register.ts:146` limita por IP con
`IP_MAX = 5` en una ventana de una hora, y todas las peticiones comparten la misma llave:

```
5 registros por hora — para todo internet
```

El sexto ciudadano que intente darse de alta en esa hora recibe un rechazo por límite de
tasa sin haber hecho nada, y cualquiera lo dispara con cinco intentos. Justo el camino que
este change existe para poner en marcha.

Se configura la confianza en el proxy **por dirección, no por número de saltos**, y se fija
con un test.

### In Scope — H · De parte de GeoReporta, con un solo nombre

Los correos no dicen de quién vienen. `mail.service.ts:104` manda `from: mailConfig.smtpFrom`
—la dirección pelada— así que en la bandeja se lee `no-reply@georeporta.twintailcs.xyz`, no
un remitente con nombre. Es lo primero que ve quien recibe, y lo que decide si abre o marca
como no deseado.

Y el producto está nombrado de dos maneras en el código: `'Reset your Transito Alerta SE
password'` en `password-reset.service.ts:56`, `'Transito Alerta SE'` como respaldo en la
plantilla de invitación. Poner «GeoReporta» sólo en las dos plantillas nuevas haría que el
mismo ciudadano reciba su código de verificación de un remitente y la recuperación de
contraseña de otro.

Una constante única, usada en el nombre visible del remitente y en el pie de las ocho
plantillas.

### Out of Scope

- **Rediseñar las plantillas.** Son HTML mínimo, como las seis que ya existen. Darles
  formato de marca es trabajo de otra fase.
- **Un campo de confirmación en el DTO del backend.** La confirmación es una defensa contra
  el dedazo humano, y sólo tiene sentido donde hay dedos. Un cliente que llame al API manda
  los dos campos iguales y la comprobación no dice nada. Ver D8.
- **Rediseñar la pantalla de alta.** Se añade un campo y se corrige un mensaje; el resto
  del formulario queda como está. El rediseño visual es F6.
- **Ubicación geográfica en el aviso.** Evaluada y descartada para esta fase. Las dos vías
  tienen un coste que no compensa una línea de un correo informativo:

  Una **base local** (GeoLite2) son ~70 MB en la imagen, una cuenta y clave de MaxMind, y
  un trabajo de refresco — una base de geolocalización que no se actualiza empieza a
  mentir.

  Una **API externa** manda la IP del ciudadano a un tercero en cada intento, y —peor— mete
  una llamada de red **dentro del consumidor del outbox**. Si el tercero tarda o falla, la
  entrada se reintenta o acaba en `mail:dead`: exactamente el fallo que este change existe
  para arreglar.

  Si más adelante se quiere, la vía correcta es la base local, que no entrega la IP de los
  usuarios a nadie. Queda como bloque separable, sin tocar lo demás.
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

## Decisión de producto — 2026-09-06

**Qué muestra el aviso al titular.** La pregunta era si mostrar la IP y el user-agent tal
cual, nada, o una versión recortada. Un intento no es necesariamente un ataque: el caso más
común es que alguien se equivoque al escribir su propio correo, y entonces se le estaría
enviando a un desconocido la dirección IP de una persona de buena fe.

**Decidido: versión recortada.** Dispositivo sin versiones, IP enmascarada a dos octetos,
hora local. Alcanza para que el titular distinga «eso fui yo anoche» de «eso no es mío»,
que es lo único que necesita para decidir, y no entrega la dirección exacta de nadie.

**Sin ubicación geográfica.** Se evaluó y se descartó para esta fase: ver «Fuera de
alcance».

## Preguntas abiertas

Ninguna. Las dos que había —qué mostrar en el aviso, y si incluir ubicación— quedaron
resueltas arriba.
