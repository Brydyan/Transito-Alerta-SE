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

## D7 — Qué NO se toca

**El proveedor.** Resend, su dominio verificado y sus registros DNS funcionan. Se comprobó
que el fallo ocurre antes de abrir la conexión SMTP (`attempts 0`). Cambiar de proveedor
por este defecto sería diagnosticar mal.

**Las entradas muertas existentes.** No se reinyectan. El OTP que contienen ya caducó; el
ciudadano pide uno nuevo y funciona.

**El `as never` de `incidents.service.ts:269`.** Es otro cast, en otro camino, sin relación
con el correo. Arreglarlo de pasada, sin entender qué oculta, repetiría el error que trajo
hasta acá.
