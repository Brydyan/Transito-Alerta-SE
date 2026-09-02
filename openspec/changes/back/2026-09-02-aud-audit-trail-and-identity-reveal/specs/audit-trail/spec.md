# Spec: AUD — Auditoría y revelación de autoría sellada

## Domain: audit-trail (NEW)

### Requirement: Toda acción auditada deja un registro inmutable
El sistema DEBE registrar en `audit_events` el actor, la acción, el recurso y el momento
de cada operación declarada como auditable, y NO DEBE permitir modificarlo ni borrarlo.

- Scenario: Registro escrito — GIVEN una acción auditable ejecutada por un usuario
  autenticado THEN existe una fila en `audit_events` con `actor_id`, `action`,
  `resource_type`, `resource_id` y `created_at`
- Scenario: Sin actualización — GIVEN un registro de auditoría existente
  THEN el servicio no expone ninguna operación que lo modifique
- Scenario: Sin borrado — GIVEN un registro de auditoría existente
  THEN el servicio no expone ninguna operación que lo elimine
- Scenario: Fallo de la acción sin registro — GIVEN una acción auditable que aborta con
  error THEN no se escribe registro: se audita lo ocurrido, no lo intentado
- Scenario: Fallo del registro aborta la acción — GIVEN que la escritura en
  `audit_events` falla THEN la operación auditada se revierte por completo. Una acción
  cuyo rastro no se pudo guardar no debe quedar hecha

### Requirement: Una publicación anónima no expone a su autor
Cuando una incidencia se publica de forma anónima, `incidents.citizen_id` DEBE apuntar a
la máscara (`users.device_uuid = 'anonymous'`) y el autor real DEBE quedar únicamente en
`incident_reporters`.

- Scenario: Autoría sellada — GIVEN un `reporter` autenticado que crea una incidencia
  con `is_anonymous = true` THEN `incidents.citizen_id` es el id de la máscara Y existe
  una fila en `incident_reporters` con el id real del autor
- Scenario: Publicación normal — GIVEN un `reporter` que crea una incidencia con
  `is_anonymous = false` THEN `incidents.citizen_id` es su propio id Y no se crea fila en
  `incident_reporters`
- Scenario: El detalle no filtra — GIVEN una incidencia anónima consultada por un
  `operador_org`, un `admin_org` o un `master` THEN la respuesta no contiene el id, el
  nombre ni el correo del autor real, sólo la marca de anónima
- Scenario: El listado no filtra — GIVEN un listado que incluye incidencias anónimas
  THEN ninguna entrada expone al autor real, por ningún campo ni relación anidada
- Scenario: Filtrar por autor no revela — GIVEN un filtro por `citizen_id` con el id de
  un usuario real THEN las incidencias que ese usuario publicó como anónimas no aparecen
- Scenario: El autor sí se ve a sí mismo — GIVEN el autor real consultando sus propios
  reportes THEN sus incidencias anónimas aparecen marcadas como anónimas. Ocultárselas al
  propio autor no protege a nadie

### Requirement: Sólo `master` puede revelar una autoría
La acción `REVEAL incidents` DEBE existir en el catálogo de permisos y DEBE estar
concedida exclusivamente al rol `master`.

- Scenario: Acción registrada — GIVEN el `CHECK` de `permissions.action`
  THEN admite el valor `REVEAL`
- Scenario: Concedida a master — GIVEN el rol `master` THEN sus permisos incluyen
  `REVEAL incidents`, tanto en `roles.permissions` como en la copia de
  `users.permissions` de cada usuario con ese rol
- Scenario: Negada a admin_org — GIVEN un `admin_org` que solicita revelar una autoría
  THEN la petición se rechaza con 403
- Scenario: Negada a operador y reporter — GIVEN un `operador_org`, un
  `operador_sistema` o un `reporter` THEN la petición se rechaza con 403
- Scenario: No se concede por descuido — GIVEN el catálogo completo de roles
  THEN ningún rol distinto de `master` tiene `REVEAL incidents`
- Scenario: Caché invalidada — GIVEN la migración que concede el permiso
  THEN las claves `perm:v3:uid:*` quedan invalidadas, de modo que un `master` con sesión
  abierta obtiene el permiso sin volver a entrar

### Requirement: Revelar exige motivo y deja rastro
La revelación DEBE ser una operación de escritura que exige una justificación
sustantiva y produce un registro de auditoría.

- Scenario: Revelación registrada — GIVEN un `master` que revela la autoría de una
  incidencia anónima con una justificación válida THEN recibe la identidad del autor Y
  se escribe un `audit_events` con `action = 'REVEAL'`, `resource_type = 'incidents'`,
  el id de la incidencia, el id del `master` y la justificación
- Scenario: Motivo ausente — GIVEN una petición de revelación sin `justification`
  THEN se rechaza con 400 y no se revela nada
- Scenario: Motivo insustancial — GIVEN una `justification` de menos de 20 caracteres
  útiles THEN se rechaza con 400. Un campo libre que acepta un punto no registra nada
- Scenario: Incidencia no anónima — GIVEN una incidencia publicada sin anonimato
  THEN la revelación se rechaza con 404: no hay nada sellado que abrir
- Scenario: Es escritura, no lectura — GIVEN el endpoint de revelación
  THEN responde a `POST`, no a `GET`
- Scenario: Cada revelación cuenta — GIVEN dos revelaciones de la misma incidencia
  THEN existen dos registros de auditoría, no uno
- Scenario: Historial consultable — GIVEN un `master` que consulta las revelaciones de
  una incidencia THEN obtiene quién reveló, cuándo y con qué motivo

### Requirement: La máscara publica pero no autentica
La identidad `device_uuid = 'anonymous'` DEBE poder figurar como autoría de una
incidencia y NO DEBE poder iniciar sesión.

- Scenario: Publica — GIVEN una incidencia anónima THEN su `citizen_id` referencia
  válidamente a la máscara y la restricción `NOT NULL` se cumple sin cambios de esquema
- Scenario: No autentica — GIVEN un intento de login con `device_uuid = 'anonymous'`
  THEN se rechaza (comportamiento establecido en ANON)
- Scenario: No se le asigna rol — GIVEN la fila de la máscara THEN sigue sin rol, y
  ampliar `reporter` no le concede nada

### Requirement: El ciudadano es informado de que el anonimato es revelable
La interfaz DEBE advertir, junto al interruptor de anonimato, que la identidad puede
revelarse ante una denuncia por información falsa.

- Scenario: Aviso presente — GIVEN el paso del asistente que ofrece publicar de forma
  anónima THEN se muestra un texto que indica que la identidad no se publica y que puede
  ser revelada, dejando registro, ante una denuncia por información falsa
- Scenario: No es opcional — GIVEN el interruptor de anonimato visible
  THEN el aviso es visible sin interacción adicional: no detrás de un tooltip, un
  acordeón ni un enlace
- Scenario: Coherencia — GIVEN el texto mostrado THEN no emplea la palabra «anónimo» sin
  la aclaración. Prometer un anonimato que el sistema no da es la falla que este
  requisito existe para impedir
