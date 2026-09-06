# Design: MAIL — Las plantillas de verificación que nunca existieron

Decisiones de esta fase. Cada una responde a algo que el defecto dejó a la vista.

---

## D1 — El arreglo mínimo es el correcto: dos entradas en el registro

**Decisión**: añadir `email_verification` y `existing_account_attempt` a `TemplateName` y a
`TEMPLATES`, con la misma forma que las seis existentes.

**Alternativa descartada — un motor de plantillas.** Tentador cuando faltan plantillas,
pero el diseño D9 de la fase original eligió a propósito funciones puras sin motor: *«cada
entrada es una función pura de datos ya escapados, así una `{{variable}}` envenenada no
puede llegar sin escapar al cuerpo del correo (R13)»*. Un motor reintroduce exactamente esa
superficie. El defecto de hoy no es que falte un motor; es que faltan dos entradas.

**Alternativa descartada — renombrar los nombres encolados a plantillas existentes.** Sería
mandar el correo equivocado. `invitation` habla de unirse a una organización; el ciudadano
que se registra no se une a ninguna.

---

## D2 — Quitar los `as never` es parte del arreglo, no limpieza opcional

**Decisión**: los dos casts salen en el mismo cambio que introduce las plantillas.

El defecto no fue «faltó un test». Fue que **el control automático que existía se apagó a
mano**. `'email_verification'` no es asignable a `TemplateName`; el compilador lo rechazaba
y alguien silenció el rechazo en vez de atenderlo.

Dejar los casts y añadir sólo las plantillas arregla el síntoma de hoy y conserva el
mecanismo que lo produjo: el próximo correo nuevo se topa con el mismo error del compilador
y tiene el mismo atajo a mano.

**Consecuencia buscada**: con las plantillas en la unión y sin los casts, un nombre
inventado **no compila**. Eso es más fuerte que cualquier test, porque no depende de que
alguien se acuerde de escribirlo.

---

## D3 — Un test que recorre el camino, no dos que cubren las puntas

**Decisión**: además de reforzar el test existente, se añade uno que comprueba que **todo
nombre que el código encola es renderizable**.

El defecto vivía justo en la costura. Los dos lados estaban probados:

```
enqueue({template})  ──►  mail:outbox  ──►  consumer  ──►  renderMailTemplate(template)
      ▲                                                            ▲
   probado con                                                 probado con
   MailService simulado                                      sus seis plantillas
                          nadie prueba que el de la izquierda
                          sea uno de los de la derecha
```

El test nuevo cierra esa costura: recorre los nombres que los servicios encolan y exige que
`renderMailTemplate` los acepte. Falla el día que alguien encole uno que no existe, sin
depender de que ese alguien escriba su propio test.

**Verificación por mutación, obligatoria**: quitar una de las dos plantillas nuevas del
registro debe hacer caer ese test. Si no cae, el test es decorativo y no cierra nada.

---

## D4 — El aviso de intento no lleva OTP ni enlace

**Decisión**: `existing_account_attempt` renderiza un aviso informativo. Sin código, sin
botón, sin enlace de acción.

El razonamiento ya está escrito en el propio servicio, y esta fase sólo lo respeta al
renderizar: *«El OTP no es el canal — el OTP lo pidió el titular cuando quiso verificar SU
cuenta, no un extraño. Mandar un OTP aquí confundiría al titular y revelaría a un tercero
que el correo existe.»*

Añadir un enlace de acción convertiría un aviso en un vector: un tercero provoca el correo,
y el titular recibe algo en lo que hacer clic a raíz de una acción que no fue suya.

---

## D5 — La indistinguibilidad se conserva

**Decisión**: nada de esta fase toca la respuesta HTTP del alta.

REG cerró un oráculo de enumeración que sobrevivió seis rondas:
`REGISTRATION_INDISTINGUISHABLE_MESSAGE` hace que la respuesta sea idéntica exista o no la
cuenta. Los dos correos son distintos —uno lleva OTP, el otro es un aviso— pero eso viaja
por el buzón del titular, no por la respuesta.

**Lo que esto prohíbe explícitamente**: que el arreglo introduzca cualquier diferencia
observable por el cliente HTTP entre los dos caminos. Ni código de estado, ni cuerpo, ni
tiempo de respuesta medible — el encolado es asíncrono en ambos, y sigue siéndolo.

---

## D6 — `mail:dead` se acota, no se vacía en caliente

**Decisión**: limitar el crecimiento del stream de entradas muertas.

Las entradas guardan el cuerpo del mensaje, y para la verificación eso incluye **el OTP en
claro**. Cada fallo deja un código legible para cualquiera con acceso a Redis.

Hoy el riesgo es acotado: el OTP caduca en 15 minutos y la cuenta asociada queda sin
verificar. Pero el stream no caduca, así que lo que se acumula es un historial permanente
de códigos y direcciones de correo.

**Lo que NO se hace**: borrar `mail:dead` automáticamente al arrancar. Es la única
evidencia de que un correo falló; borrarla convierte un fallo silencioso en un fallo
invisible, que es peor. Se acota el tamaño, se conserva lo reciente.

---

## D7 — La confirmación de correo vive sólo en el cliente

**Decisión**: el segundo campo es un control del formulario Angular. **No** viaja al
backend y **no** se añade a `RegisterDto`.

Una confirmación por repetición defiende contra un dedazo: obliga a teclear dos veces y
compara. Eso sólo tiene sentido donde hay dedos. Un cliente que llame al API directamente
manda los dos campos idénticos sin esfuerzo, y la comprobación del servidor no dice nada
sobre nada.

**Trampa verificada, no teórica**: el `ValidationPipe` del backend corre con
`forbidNonWhitelisted`. Mandar un campo de más no se ignora — **rechaza la petición
entera**. Comprobado en staging el 2026-09-06 con un cuerpo que traía `full_name`:

```
{"message":["property full_name should not exist"],"error":"Bad Request","statusCode":400}
```

Así que el control de confirmación tiene que quedarse fuera del cuerpo que se envía. El
código actual ya desestructura campo por campo antes de llamar al servicio
(`const { email, password, first_name, last_name } = this.registerForm.value`), que es
justo la forma que lo evita: añadir un control no lo mete en la petición por accidente.

**Dónde vive la comparación**: en un validador de grupo sobre el `FormGroup`, no en el
campo. Un validador de campo no ve el valor del otro; y si se engancha sólo al segundo
campo, cambiar el primero después de confirmarlo deja el formulario válido con dos valores
distintos.

---

## D8 — El mensaje de éxito tiene un solo dueño

**Decisión**: el frontend muestra el mensaje que devuelve el backend. Deja de mantener su
propia copia.

Hoy hay dos cadenas para lo mismo, y ya divergieron: REG (ronda 12) quitó del backend la
frase *«Si ya lo estaba, te enviamos un aviso al titular»* y la copia del frontend se quedó
con ella. La que el usuario ve es la del frontend.

**Por qué importa aunque no sea un fallo de seguridad**: la frase es constante, así que no
revela si un correo existe — no es el oráculo que REG cerró. Pero el motivo por el que se
quitó del backend fue reducir lo que la respuesta afirma sobre cuentas ajenas, y esa
decisión no llegó al sitio donde se lee. Dos copias de una regla es una que se va a
quedar vieja.

---

---

## D9 — El aviso muestra lo justo para reconocerse, no para identificar a nadie

**Decisión**: tres campos, todos recortados.

```
Dispositivo     Chrome en Linux                          ← sin versiones
Dirección IP    190.15.x.x                               ← dos octetos
Cuándo          6 de septiembre de 2026, 14:33 (GMT-5)   ← hora de Ecuador
```

**El criterio**: el titular sólo necesita decidir una cosa — «¿fui yo?». Para eso alcanza
con reconocer el dispositivo, la zona y el momento. La versión del navegador y los octetos
finales de la IP no ayudan a decidir nada y sí identifican a un tercero.

**Por qué no mostrarlo todo.** Un intento no es necesariamente un ataque: lo más común es
un dedazo, alguien escribiendo mal su propio correo. En ese caso el sistema le estaría
mandando a un desconocido la IP exacta y el perfil de dispositivo de una persona de buena
fe, que no hizo nada malo.

**Por qué no mostrar nada.** Un aviso sin contexto no se puede accionar: todos se parecen y
la gente los ignora. Un aviso que nadie lee es peor que no mandarlo, porque da la impresión
de que hay una alerta.

**Enmascarado**: IPv4 conserva los dos primeros octetos (`190.15.x.x`). IPv6 conserva los
dos primeros grupos. Un valor ausente se muestra como «desconocida», nunca como cadena
vacía.

**`attemptedAt` viaja en los datos del encolado**, no se calcula al renderizar. El outbox es
asíncrono: la hora de entrega no es la hora del intento, y la que le importa al titular es
la segunda. Hoy el servicio pasa sólo `{ ip, userAgent }`; se le añade el momento.

**La hora se muestra en hora de Ecuador** (`America/Guayaquil`), no en UTC. Un
`2026-09-06T19:33:41Z` no lo reconoce nadie, y reconocer es todo lo que este correo pide.

**El parser de dispositivo es propio**, unas veinte líneas sobre el user-agent. No se añade
dependencia: una librería de parseo trae una base de firmas que envejece, para producir dos
palabras.

---

## D10 — La confianza en el proxy se declara por dirección, no por número de saltos

**Decisión**: habilitar `trust proxy` acotado a la red interna de Docker.

Hoy no está declarado en ninguna parte, así que Express ignora el `X-Forwarded-For` que
nginx sí manda (`nginx.conf:56`) y `req.ip` devuelve la IP del contenedor de nginx —
idéntica para todo el tráfico.

**Lo que eso rompe hoy, más allá del correo**: `auth.register.ts:146` limita el alta por IP
con `IP_MAX = 5` en una hora. Con una sola llave compartida, eso son **cinco altas por hora
para todo internet**; el sexto ciudadano recibe un rechazo por límite de tasa sin haber
hecho nada, y cualquiera lo dispara con cinco intentos.

**Alternativa descartada — `trust proxy: true`.** Confía en cualquiera. Un cliente que
alcance el backend directo manda su propio `X-Forwarded-For` y se inventa la IP que quiera:
el límite de tasa deja de existir en vez de arreglarse.

**Alternativa descartada — `trust proxy: 1`.** Contar saltos supone que siempre hay
exactamente un proxy delante. Deja de ser cierto el día que se agrega un balanceador, y
falla en silencio hacia el lado inseguro.

**Por qué importa que sea por dirección**: `APP_PORT=3004` está publicado en el host, así
que el backend **es alcanzable sin pasar por nginx**. Confiando por dirección, una petición
directa no viene de la red interna y su `X-Forwarded-For` se descarta.

**Anotado como deuda de infraestructura**: publicar `APP_PORT` en el host no hace falta si
todo el tráfico entra por nginx. Cerrar ese puerto reduce la superficie, pero es un cambio
de despliegue y no de código — no entra en esta fase.

**Verificación por mutación, obligatoria**: con el ajuste puesto, una petición que llega
por nginx debe registrar la IP del cliente; una petición directa que trae un
`X-Forwarded-For` falsificado **no** debe hacerse pasar por esa IP. Las dos, con test.

---

## D11 — Qué NO se toca

**El proveedor.** Resend, su dominio verificado y sus registros DNS funcionan. Se comprobó
que el fallo ocurre antes de abrir la conexión SMTP (`attempts 0`). Cambiar de proveedor
por este defecto sería diagnosticar mal.

**Las entradas muertas existentes.** No se reinyectan. El OTP que contienen ya caducó; el
ciudadano pide uno nuevo y funciona.

**El `as never` de `incidents.service.ts:269`.** Es otro cast, en otro camino, sin relación
con el correo. Arreglarlo de pasada, sin entender qué oculta, repetiría el error que trajo
hasta acá.
