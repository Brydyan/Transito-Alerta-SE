# Specification: Citizen Registration

**Capability**: `citizen-registration` — auto-registro del ciudadano, verificación de
correo y la barrera que separa entrar de publicar

Origen: change `2026-09-02-reg-citizen-self-registration` (sc-325).
Ampliado por `2026-09-06-mail-missing-verification-templates` (sc-330) — el correo de
verificación, la confirmación del alta, la IP real del cliente y el nombre de la
aplicación.

---

### Requirement: El auto-registro crea siempre un `reporter`
`POST /auth/register` DEBE crear una cuenta con el rol `reporter` y NO DEBE permitir que
la petición influya en el rol asignado.

- Scenario: Alta correcta — GIVEN una petición con correo, contraseña y nombre válidos
  THEN se crea el usuario con rol `reporter` y `email_verified_at` en nulo
- Scenario: Rol inyectado — GIVEN una petición que incluye `role: 'master'`
  THEN el usuario creado tiene rol `reporter`
- Scenario: Rol inyectado por otro nombre — GIVEN una petición con `roleName`,
  `role_id` o `permissions` THEN esos campos se ignoran y el usuario creado es `reporter`
- Scenario: Organización inyectada — GIVEN una petición con `organization_id`
  THEN se ignora: un ciudadano no pertenece a una organización
- Scenario: Permisos correctos — GIVEN el usuario recién creado THEN su
  `users.permissions` es la copia de `roles.permissions` de `reporter`, sin añadidos
- Scenario: Ya no es lápida — GIVEN `POST /auth/register` THEN no responde 410 Gone

### Requirement: La invitación sigue siendo el único camino al personal
El auto-registro NO DEBE poder producir ninguna cuenta con rol distinto de `reporter`.

- Scenario: Ningún rol de personal — GIVEN cualquier combinación de campos en la petición
  THEN no existe entrada que produzca `operador_org`, `admin_org`, `operador_sistema` ni
  `master`
- Scenario: El flujo de invitación intacto — GIVEN el alta por invitación
  THEN sigue funcionando y sigue siendo la vía para los roles de personal

### Requirement: Publicar exige correo verificado
Un `reporter` con `email_verified_at` en nulo DEBE poder entrar y leer, y NO DEBE poder
crear incidencias ni comentarios.

- Scenario: Entrar sin verificar — GIVEN un `reporter` no verificado THEN puede iniciar
  sesión y obtiene sus tokens
- Scenario: Leer sin verificar — GIVEN un `reporter` no verificado THEN puede consultar
  el feed y el detalle de incidencias
- Scenario: Publicar sin verificar — GIVEN un `reporter` no verificado que crea una
  incidencia THEN se rechaza con 403 y un motivo que indica que falta verificar el correo
- Scenario: Comentar sin verificar — GIVEN un `reporter` no verificado que crea un
  comentario THEN se rechaza con 403
- Scenario: Publicar tras verificar — GIVEN un `reporter` que completa el OTP
  THEN `email_verified_at` queda establecido y puede crear incidencias y comentarios
- Scenario: El personal no se ve afectado — GIVEN un `operador_org` o `admin_org`
  THEN esta restricción no aplica: su alta la respalda una invitación

### Requirement: El alta no revela si un correo ya está registrado
La respuesta a un correo ya existente DEBE ser indistinguible de la respuesta a uno nuevo.

- Scenario: Correo nuevo — GIVEN un correo sin cuenta THEN la respuesta indica que se
  envió un correo de verificación
- Scenario: Correo existente — GIVEN un correo con cuenta THEN la respuesta es idéntica
  en código de estado, cuerpo y forma a la del correo nuevo
- Scenario: Sin cuenta duplicada — GIVEN un correo con cuenta THEN no se crea una segunda
  cuenta ni se modifica la existente
- Scenario: Aviso al titular — GIVEN un correo con cuenta THEN su titular recibe un aviso
  de intento de alta, no un código de verificación
- Scenario: Tiempos comparables — GIVEN ambos casos THEN la diferencia de tiempo de
  respuesta no permite distinguirlos

### Requirement: El alta está limitada en tasa
El endpoint DEBE limitar los intentos por IP y por correo.

- Scenario: Ráfaga desde una IP — GIVEN más altas desde una misma IP que el límite
  configurado en su ventana THEN las siguientes se rechazan con 429
- Scenario: Insistencia sobre un correo — GIVEN varios intentos sobre el mismo correo
  THEN se rechazan con 429 aunque provengan de IP distintas
- Scenario: Ciudadano legítimo — GIVEN un alta aislada THEN no se ve afectada

### Requirement: El ciudadano tiene una pantalla de registro
La aplicación DEBE ofrecer `/registro`, pública, y enlazarla desde los dos puntos donde
el ciudadano la necesita.

- Scenario: Ruta pública — GIVEN un visitante sin sesión que navega a `/registro`
  THEN ve el formulario y no se le redirige al login
- Scenario: Enlace desde el login — GIVEN la pantalla de login THEN ofrece un enlace a
  `/registro`
- Scenario: Enlace tras reportar — GIVEN el final del asistente de reporte usado sin
  cuenta THEN se ofrece registrarse o iniciar sesión (cierra F4/B.2.12)
- Scenario: Al OTP — GIVEN un alta correcta THEN se navega al componente `verify-email`
  existente
- Scenario: Sin filtrar existencia — GIVEN un correo ya registrado THEN la pantalla
  muestra el mismo mensaje que ante uno nuevo
- Scenario: Errores de validación — GIVEN correo inválido o contraseña que no cumple la
  política THEN el formulario los señala sin llamar al servidor

### Requirement: El ciudadano puede verificar su correo desde la aplicación
La aplicación DEBE ofrecer una pantalla donde el ciudadano ingrese el código que recibió,
y DEBE llevarlo hasta ella sin que tenga que buscarla.

Sin esto el auto-registro no sirve de nada: la cuenta se crea, el código llega al correo,
y no hay dónde escribirlo. El ciudadano queda registrado y sin poder publicar — que es
para lo que quería la cuenta.

El backend expone los dos endpoints del OTP detrás de `JwtAuthGuard`
(`email-verification.controller.ts`), así que la verificación ocurre **después** de
iniciar sesión. Esto es coherente con la decisión D2: se puede entrar sin verificar, lo
que no se puede es publicar.

- Scenario: Saber si falta verificar — GIVEN una sesión iniciada THEN `GET /auth/me`
  informa si el correo está verificado
- Scenario: Llegar sin buscar — GIVEN un `reporter` sin verificar que inicia sesión
  THEN se lo lleva a la pantalla de verificación
- Scenario: El personal no pasa por ahí — GIVEN un `operador_org`, `admin_org`,
  `operador_sistema` o `master` que inicia sesión THEN entra al panel como siempre
- Scenario: Código correcto — GIVEN el código que llegó al correo THEN se acepta,
  `email_verified_at` queda establecido, y el ciudadano puede publicar
- Scenario: Código vencido o equivocado — GIVEN un código que no corresponde THEN la
  pantalla lo señala y permite reintentar, sin cerrar la sesión
- Scenario: Reenviar — GIVEN un ciudadano que no recibió el código THEN puede pedir uno
  nuevo
- Scenario: Reenviar demasiado pronto — GIVEN un reenvío dentro de los 60 segundos
  THEN la pantalla lo dice y no lo presenta como un fallo
- Scenario: Ya verificado — GIVEN un ciudadano que llega a la pantalla con el correo ya
  verificado THEN no se lo deja en un callejón: se lo lleva a la aplicación
- Scenario: El ciclo completo — GIVEN un ciudadano que se registra, entra, verifica y
  publica THEN cada paso lo habilita el anterior, sin intervención manual

---

## Ampliación de sc-330 — el correo de verificación nunca se pudo enviar

Los siete requisitos siguientes entran con `2026-09-06-mail-missing-verification-templates`.
El hueco que cubren: el spec exigía que **la respuesta diga** que se envió un correo de
verificación, pero nunca que el correo **se pueda enviar**.

---

### Requirement: Todo correo que el sistema encola se puede renderizar
Cada nombre de plantilla que el código entrega a la cola de correo DEBE existir en el
registro de plantillas. El sistema NO DEBE poder encolar un correo que no se pueda
construir.

- Scenario: Verificación de correo — GIVEN un alta que genera un OTP THEN la plantilla
  `email_verification` existe en el registro y se renderiza sin error
- Scenario: Aviso de intento sobre cuenta existente — GIVEN un alta contra un correo ya
  registrado THEN la plantilla `existing_account_attempt` existe en el registro y se
  renderiza sin error
- Scenario: Cobertura de todos los emisores — GIVEN el conjunto de nombres de plantilla que
  los servicios encolan THEN todos son renderizables: ninguno queda sin entrada en el
  registro
- Scenario: Un nombre inventado no compila — GIVEN código que encola una plantilla
  inexistente THEN la comprobación de tipos lo rechaza, sin necesidad de ejecutar ninguna
  prueba
- Scenario: Nombre desconocido en tiempo de ejecución — GIVEN una entrada en la cola cuya
  plantilla no está en el registro THEN se trata como defecto de datos y NO se reintenta

---

### Requirement: El correo de verificación llega con el código y su vigencia
El cuerpo del correo de verificación DEBE contener el OTP y el tiempo que le queda de
validez, y DEBE escapar todo dato interpolado.

- Scenario: Cuerpo con código — GIVEN un OTP generado THEN el cuerpo del correo lo contiene
  junto a los minutos de vigencia
- Scenario: Datos escapados — GIVEN datos que contienen marcado HTML THEN aparecen
  escapados en el cuerpo, nunca interpretados
- Scenario: El asunto no lleva el código — GIVEN un correo de verificación THEN el OTP no
  aparece en la línea de asunto, que es lo que queda visible en una notificación de
  pantalla bloqueada

---

### Requirement: El aviso de intento informa sin dar nada que pulsar
Cuando alguien intenta registrarse con un correo ya existente, el titular DEBE recibir un
aviso informativo, y ese aviso NO DEBE contener un OTP ni un enlace de acción.

- Scenario: Aviso sin código — GIVEN un intento de alta sobre un correo con cuenta THEN el
  correo al titular no contiene ningún OTP
- Scenario: Aviso sin enlace de acción — GIVEN ese mismo aviso THEN no incluye enlace que
  ejecute ninguna operación sobre la cuenta: un tercero provoca el envío, así que un botón
  convertiría el aviso en un vector
- Scenario: Contexto del intento — GIVEN un intento con IP y user-agent conocidos THEN el
  aviso muestra dispositivo, dirección IP y momento, todos escapados, para que el titular
  reconozca si fue suyo
- Scenario: Dispositivo sin versiones — GIVEN un user-agent completo THEN el aviso muestra
  el navegador y el sistema («Chrome en Linux») y NO la cadena completa ni números de
  versión
- Scenario: IP enmascarada — GIVEN una IPv4 THEN el aviso muestra sólo los dos primeros
  octetos (`190.15.x.x`); GIVEN una IPv6, los dos primeros grupos
- Scenario: Momento del intento, no de la entrega — GIVEN un aviso que se entrega minutos
  después THEN la hora mostrada es la del intento, que viaja en los datos del encolado
- Scenario: Hora local — GIVEN un intento THEN la hora se muestra en hora de Santa Elena
  (Ecuador continental, `America/Guayaquil`, UTC−5), no en UTC
- Scenario: La hora no depende del servidor — GIVEN el mismo instante renderizado en
  máquinas con distinta zona horaria THEN el resultado es idéntico: un dato que es parte
  del producto no puede cambiar según dónde se calcule
- Scenario: Dato ausente — GIVEN un intento sin IP o sin user-agent THEN el aviso dice
  «desconocida» / «desconocido», nunca un hueco vacío
- Scenario: La respuesta HTTP sigue siendo indistinguible — GIVEN un alta contra un correo
  existente y otra contra uno nuevo THEN ambas respuestas son idénticas en código de
  estado, cuerpo y forma; la diferencia viaja sólo por el buzón del titular

---

### Requirement: El alta pide el correo dos veces antes de enviarlo
El formulario de registro DEBE pedir el correo en un campo «Correo» y su repetición en un
campo «Verifique su correo», y NO DEBE enviar el alta mientras los dos no coincidan.

- Scenario: Correos que no coinciden — GIVEN un visitante que escribe dos correos distintos
  THEN el formulario no se envía y se muestra que el correo no coincide con su verificación
- Scenario: Correos que coinciden — GIVEN los dos campos con el mismo valor y el resto del
  formulario válido THEN el alta se envía y el ciudadano recibe su código
- Scenario: Cambiar el primero después de confirmar — GIVEN dos correos que coincidían y
  una edición posterior del primero THEN el formulario vuelve a ser inválido: la
  comparación no se evalúa una sola vez
- Scenario: El campo de confirmación no viaja — GIVEN un alta válida THEN el cuerpo enviado
  al servidor contiene exactamente `email`, `password`, `first_name` y `last_name`. El
  servidor rechaza cualquier propiedad de más, así que enviarla rompería el alta entera
- Scenario: La confirmación no existe en el servidor — GIVEN una llamada directa al API sin
  campo de confirmación THEN el alta procede: la repetición defiende contra un dedazo
  humano, no es una regla del dominio

---

### Requirement: El mensaje del alta tiene un solo dueño
El texto que ve el ciudadano tras registrarse DEBE ser el que devuelve el servidor. El
cliente NO DEBE mantener su propia copia.

- Scenario: Mensaje mostrado — GIVEN un alta correcta THEN la pantalla de verificación
  muestra el mensaje recibido en la respuesta, sin reescribirlo
- Scenario: Sin gemelos divergentes — GIVEN el código del cliente THEN no existe una cadena
  literal que duplique el mensaje de alta del servidor

---

### Requirement: La IP registrada es la del cliente, no la del proxy
El sistema DEBE resolver la dirección del cliente a partir de las cabeceras del proxy de
confianza, y NO DEBE aceptarlas de un origen que no sea ese proxy.

- Scenario: Petición a través del proxy — GIVEN una petición que entra por nginx THEN la IP
  registrada es la del cliente, no la del contenedor del proxy
- Scenario: Cabecera falsificada desde fuera — GIVEN una petición directa al backend que
  incluye un `X-Forwarded-For` inventado THEN esa cabecera se descarta y no se toma como
  origen
- Scenario: Límite de tasa por cliente — GIVEN varios ciudadanos distintos registrándose en
  la misma hora THEN el límite de tasa por IP los cuenta por separado. Con una sola llave
  compartida, el umbral de cinco por hora se aplicaría a todo el tráfico junto
- Scenario: Sin dirección resoluble — GIVEN una petición de la que no se puede derivar
  ninguna dirección THEN el alta procede sin limitación por IP, y el aviso muestra la IP
  como desconocida

---

### Requirement: La aplicación se identifica como GeoReporta, con un solo nombre
Lo que el ciudadano ve DEBE identificar a la aplicación como **GeoReporta**, y ese nombre
DEBE venir de una única definición en cada lado.

`TASE` es el nombre del proyecto —repositorio, ramas, tickets— y NO DEBE aparecer en
ninguna superficie de usuario.

- Scenario: Remitente con nombre — GIVEN un correo enviado THEN la cabecera de remitente
  lleva el nombre visible de la aplicación además de la dirección, no la dirección sola
- Scenario: Pie del mensaje — GIVEN el cuerpo de cualquier plantilla THEN identifica a la
  aplicación que lo envía
- Scenario: Un solo nombre — GIVEN los correos de verificación, de aviso de intento y de
  recuperación de contraseña THEN los tres identifican a la aplicación con el mismo nombre
- Scenario: Título del navegador — GIVEN el ciudadano abre la aplicación THEN la pestaña
  muestra el nombre de la aplicación, no el nombre generado por el andamio del proyecto
- Scenario: Sin literales sueltos — GIVEN el código del módulo de correo THEN el nombre del
  producto no aparece escrito a mano en ninguna plantilla: todas lo toman de la misma
  definición
