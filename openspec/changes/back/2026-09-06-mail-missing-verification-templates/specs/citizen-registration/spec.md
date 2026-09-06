# Spec: MAIL — Las plantillas de verificación que nunca existieron

## Domain: citizen-registration (MODIFIED)

Se añaden cinco requisitos. Los siete existentes no cambian.

El hueco que cubren: el spec vigente exige que **la respuesta diga** que se envió un correo
de verificación, pero nunca que el correo **se pueda enviar**. Un sistema que responde «te
enviamos un mensaje» y no envía nada cumple el spec al pie de la letra — y eso es
exactamente lo que ocurrió desde que REG se dio por cerrada.

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
  aviso los muestra escapados, para que el titular reconozca si fue suyo
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
