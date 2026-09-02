# Spec: F7 — Despacho de emergencias

## Domain: emergency-dispatch (NEW)

### Requirement: Aviso por Telegram ante incidencia crítica
Al crearse una incidencia con `priority = 'critical'`, los `admin_org` de su
organización DEBEN recibir un aviso por Telegram.

- Scenario: Aviso enviado — GIVEN una incidencia creada con `priority = 'critical'` en
  una organización con administradores que tienen `telegram_chat_id`
  THEN cada uno recibe un mensaje con título, categoría, ubicación, prioridad y enlace
  al detalle
- Scenario: Prioridad no crítica — GIVEN una incidencia `low`, `medium` o `high`
  THEN no se envía ningún aviso por Telegram
- Scenario: Admin sin Telegram configurado — GIVEN un `admin_org` sin
  `telegram_chat_id` THEN se omite ese destinatario sin fallar y se avisa a los demás
- Scenario: Organización sin administradores con Telegram — GIVEN que ninguno lo tiene
  configurado THEN la incidencia se crea igual y el hecho queda registrado
- Scenario: Incidencia sin organización — GIVEN una incidencia `critical` sin
  `organization_id` THEN no hay a quién avisar y la creación no falla

### Requirement: Recordatorio mientras la emergencia siga sin atender
Mientras una incidencia `critical` permanezca en `pending`, los `admin_org` DEBEN
recibir un recordatorio cada 5 minutos.

- Scenario: Repique — GIVEN una incidencia `critical` en `pending` desde hace 5 minutos
  THEN se envía un recordatorio a los `admin_org` con `telegram_chat_id`
- Scenario: Parada por asignación — GIVEN una incidencia `critical` que pasa a
  `in_progress` THEN no se envían más recordatorios
- Scenario: Parada por cierre — GIVEN una incidencia `critical` que pasa a `closed`
  desde `pending` THEN no se envían más recordatorios
- Scenario: Escalado — GIVEN una incidencia `critical` que lleva 6 recordatorios
  (30 minutos) sin asignarse THEN el aviso se extiende a `master` y `operador_sistema`
- Scenario: Límite duro — GIVEN una incidencia `critical` que alcanza 12 recordatorios
  (1 hora) THEN el repique se detiene y la incidencia queda marcada como no atendida
- Scenario: Sin horario silencioso — GIVEN una emergencia creada de madrugada
  THEN el recordatorio se envía igual: una emergencia no espera al horario laboral
- Scenario: Prioridad no crítica — GIVEN una incidencia `high` en `pending` durante
  horas THEN no genera ningún recordatorio

### Requirement: El operador asignado recibe su tarea
Al asignarse una incidencia, el `operador_org` asignado DEBE recibir un mensaje con el
detalle y el enlace.

- Scenario: Aviso al asignado — GIVEN una asignación creada y un operador con
  `telegram_chat_id` THEN recibe un mensaje con título, categoría, ubicación, prioridad
  y enlace directo a la incidencia
- Scenario: Sólo al asignado — GIVEN una organización con varios operadores
  THEN únicamente el asignado recibe el mensaje; los demás no
- Scenario: Operador sin Telegram — GIVEN un operador sin `telegram_chat_id`
  THEN la asignación se crea igual y el aviso se omite sin fallar
- Scenario: Reasignación — GIVEN una incidencia reasignada a otro operador
  THEN el nuevo asignado recibe el mensaje

### Requirement: La excepción al tope se comunica al operador
Asignar por encima del tope DEBE avisar al operador afectado.

- Scenario: Aviso con motivo — GIVEN una asignación con excepción aceptada THEN el
  operador recibe un mensaje que incluye el motivo que escribió el admin
- Scenario: Asignación normal — GIVEN una asignación dentro del tope THEN el mensaje no
  menciona ninguna excepción

### Requirement: El canal externo no compromete la creación
Un fallo de Telegram NUNCA DEBE impedir crear una incidencia de emergencia.

- Scenario: Telegram caído — GIVEN que la API de Telegram no responde
  WHEN se crea una incidencia `critical` THEN la incidencia se persiste correctamente y
  el aviso queda pendiente de reintento
- Scenario: Reintento — GIVEN un aviso que falló THEN se reintenta, y tras agotar los
  reintentos se registra el fallo sin perderlo en silencio
- Scenario: Sin llamada síncrona — GIVEN el camino de creación de una incidencia
  THEN no contiene ninguna llamada bloqueante a un servicio externo

### Requirement: La asignación valida la carga del operador
`AssignmentsService.assign()` DEBE comprobar el tope de la organización antes de asignar.

- Scenario: Operador con capacidad — GIVEN un operador cuyo número de incidencias
  `in_progress` es menor que el tope WHEN se le asigna una incidencia THEN la
  asignación se crea y la respuesta es 2xx
- Scenario: Operador en el tope — GIVEN un operador que alcanzó el tope de su
  organización WHEN se intenta asignarle otra incidencia THEN se rechaza con **429** y
  el código `CLAIM_LIMIT_REACHED`, el mismo que ya emite el camino de autoasignación
- Scenario: Incidencia ya asignada — GIVEN una incidencia con asignación activa
  THEN se sigue rechazando con 409, comportamiento actual sin cambios
- Scenario: Paridad entre caminos — GIVEN el mismo operador saturado
  THEN autoasignarse y ser asignado por un admin producen el mismo rechazo; hoy el
  camino del admin no valida nada

### Requirement: Excepción al tope con confirmación explícita
DEBE poder asignarse por encima del tope cuando no queda alternativa, dejando registro.

- Scenario: Excepción aceptada — GIVEN todos los operadores en el tope y una incidencia
  `critical` WHEN el admin confirma explícitamente y aporta un motivo THEN la asignación
  se crea pese al tope
- Scenario: Motivo obligatorio — GIVEN una excepción sin motivo THEN se rechaza con 422:
  saltarse el tope sin explicar por qué no es auditable
- Scenario: Autor registrado — GIVEN una excepción aceptada THEN quedan persistidos el
  motivo y el usuario que la autorizó
- Scenario: Sin confirmación no hay excepción — GIVEN una asignación normal sobre un
  operador saturado, sin la marca de confirmación THEN se rechaza con 429; la excepción
  nunca es el comportamiento por omisión
- Scenario: Limitada a emergencias — GIVEN una incidencia que no es `critical`
  THEN la excepción se rechaza con 422: el tope existe para el trabajo ordinario y sólo
  una emergencia justifica romperlo

### Requirement: Las escrituras de asignación se acotan por organización
Asignar, liberar y reasignar DEBEN validar que incidencia y operador pertenecen a la
organización del solicitante.

- Scenario: Asignación dentro de la organización — GIVEN un `admin_org` de la
  organización A, una incidencia de A y un operador de A THEN la asignación se acepta
- Scenario: Operador de otra organización — GIVEN un `admin_org` de A que intenta
  asignar un operador de la organización B THEN se rechaza con 403
- Scenario: Incidencia de otra organización — GIVEN un `admin_org` de A que intenta
  asignar sobre una incidencia de B THEN se rechaza con 403
- Scenario: Liberar asignación ajena — GIVEN un `admin_org` de A que intenta liberar una
  asignación de B THEN se rechaza con 403
- Scenario: Reasignar fuera de la organización — GIVEN el `PATCH` de reasignación hacia
  un operador de otra organización THEN se rechaza con 403
- Scenario: `master` conserva alcance global — GIVEN un `master` THEN puede asignar en
  cualquier organización, según su definición desde `0015_organizations_scoping.sql`
- Scenario: Paridad lectura/escritura — GIVEN el mismo usuario THEN lo que puede
  escribir está acotado igual que lo que puede leer; hoy las lecturas se acotan y las
  escrituras no

### Requirement: El selector muestra también a los operadores ocupados
`availableOperators()` DEBE informar sobre todos los operadores, no filtrar a los saturados.

- Scenario: Todos presentes — GIVEN una organización con operadores libres y saturados
  THEN la respuesta los incluye a todos, cada uno con su `activeClaimCount` y una
  bandera de disponibilidad
- Scenario: Motivo visible — GIVEN un operador saturado THEN la respuesta permite
  distinguir por qué no está disponible, en lugar de omitirlo sin explicación
- Scenario: Operador inactivo — GIVEN un usuario con `is_active = false`
  THEN sigue sin aparecer: no está disponible ni ocupado, no forma parte del equipo
- Scenario: Rol incorrecto — GIVEN un usuario que no es `operador_org` ni
  `operador_sistema` THEN no aparece

## Coverage

Happy paths: cubiertos (aviso, asignación con capacidad, excepción justificada).
Edge cases: cubiertos (admin sin Telegram, org sin admins, incidencia sin organización,
operador inactivo, excepción sobre incidencia no crítica).
Error states: cubiertos (429 por tope, 422 sin motivo y por prioridad, 409 ya asignada,
Telegram caído).
Seguridad: el secreto del bot no aparece en el repositorio ni en los registros.

## Next

Listo para `sdd-design`. Depende de F4 (story 306).
