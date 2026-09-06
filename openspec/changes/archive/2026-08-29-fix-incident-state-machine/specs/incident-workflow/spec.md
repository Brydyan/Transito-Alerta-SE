# Spec: Corrección de la máquina de estados de incidencias

## Domain: incident-workflow (MODIFIED)

### Requirement: Los cuatro estados son alcanzables
El servicio de flujo DEBE reconocer los cuatro estados que la base de datos y el tipo
`IncidentStatus` ya admiten.

- Scenario: `closed` en la lista de estados — GIVEN una llamada a `getStatuses()`
  THEN devuelve `['pending', 'in_progress', 'resolved', 'closed']`
- Scenario: Tipo completo — GIVEN el tipo interno de `status` en el servicio de flujo
  THEN incluye `'closed'`, igual que `incident.entity.ts`
- Scenario: Transición a `closed` posible — GIVEN una incidencia `in_progress` y un
  usuario con `UPDATE incidents` WHEN se cierra por imposibilidad THEN la transición
  se persiste, en lugar de rechazarse por estado desconocido

### Requirement: Máquina de estados declarada
Las transiciones válidas DEBEN estar declaradas en un único lugar y toda transición no
declarada DEBE rechazarse.

- Scenario: Asignar — GIVEN una incidencia `pending` WHEN se le asigna un operador
  THEN pasa a `in_progress`
- Scenario: Resolver — GIVEN una incidencia `in_progress` WHEN el operador la resuelve
  THEN pasa a `resolved`
- Scenario: Cerrar sin resolver — GIVEN una incidencia `in_progress` que no pudo
  resolverse WHEN se cierra THEN pasa a `closed`
- Scenario: Terminales alternativos — GIVEN una incidencia `resolved` WHEN se intenta
  pasarla a `closed` THEN se rechaza con 409: son desenlaces distintos, no consecutivos
- Scenario: Transición desde terminal — GIVEN una incidencia `resolved` o `closed`
  WHEN se intenta cualquier transición THEN se rechaza con 409
- Scenario: Salto de estado — GIVEN una incidencia `pending` WHEN se intenta pasarla
  directamente a `resolved` THEN se rechaza con 409: sin operador asignado no hay quien
  la haya resuelto
- Scenario: Descartar un reporte inválido — GIVEN una incidencia `pending` que es
  duplicada o inválida WHEN un `admin_org` la cierra con motivo THEN pasa a `closed`
  sin haber pasado por `in_progress`
- Scenario: Crítica sin salto de estado — GIVEN una incidencia creada con
  `priority = 'critical'` THEN nace en `pending` como cualquier otra: la urgencia se
  expresa en la prioridad y en el aviso, no en saltarse un estado
- Scenario: Regla en un solo sitio — GIVEN la tabla de transiciones THEN es la única
  fuente que decide qué es válido; ningún consumidor replica la regla con condicionales
  propios

### Requirement: Sólo `admin_org` puede cerrar
Dar de baja una incidencia DEBE exigir el permiso `CLOSE incidents`, distinto del que
permite resolverla.

- Scenario: Admin cierra — GIVEN un usuario con `CLOSE incidents` THEN puede cerrar una
  incidencia aportando motivo
- Scenario: Operador no cierra — GIVEN un `operador_org` con `UPDATE incidents` pero sin
  `CLOSE incidents` WHEN intenta cerrar THEN se responde 403
- Scenario: Operador sí resuelve — GIVEN ese mismo `operador_org` WHEN resuelve una
  incidencia asignada a él THEN la transición se acepta: resolver no requiere `CLOSE`
- Scenario: Permiso propagado — GIVEN la migración aplicada THEN `CLOSE incidents` está
  en `roles.permissions` y en `users.permissions` de los `master` y `admin_org`
  existentes, y `perm:v3:uid:*` queda invalidada

### Requirement: El cierre sin resolución exige motivo
Cerrar una incidencia que no pudo resolverse DEBE registrar por qué.

- Scenario: Motivo obligatorio — GIVEN una transición a `closed` sin motivo
  THEN se rechaza con 422
- Scenario: Motivo persistido — GIVEN una transición a `closed` con motivo
  THEN el texto queda asociado a la incidencia y visible en su historial
- Scenario: Resolver no exige motivo — GIVEN una transición a `resolved`
  THEN no se pide motivo: el desenlace exitoso se explica solo

### Requirement: Toda transición queda en el historial
Cada cambio de estado DEBE registrarse con quién y cuándo.

- Scenario: Registro — GIVEN cualquier transición aceptada THEN se añade una entrada al
  historial con estado anterior, estado nuevo, autor e instante
- Scenario: Transición rechazada — GIVEN una transición inválida THEN no se escribe
  nada en el historial: un intento fallido no es un cambio

### Requirement: Reconciliación con el flujo de aprobación
El flujo de aprobación de T5.6 DEBE seguir operando bajo la semántica única.

- Scenario: Aprobación coherente — GIVEN `incident-approval.service.ts` operando tras
  el cambio THEN su comportamiento corresponde a la semántica declarada, sin depender
  de que `closed` signifique «archivada tras resolverse»
- Scenario: Sin regresión — GIVEN los tests existentes del flujo de aprobación
  THEN siguen pasando, o su cambio queda justificado por escrito en el apply-progress

## Coverage

Happy paths: cubiertos (las cuatro transiciones válidas).
Edge cases: cubiertos (terminal → terminal, salto de estado, transición desde terminal).
Error states: cubiertos (409 en transición inválida, 422 sin motivo de cierre).
Datos: la migración de filas `closed` preexistentes se cubre en el diseño; si el
conjunto está vacío no hay nada que verificar.

## Next

Listo para `sdd-design`. No depende de nada; bloquea F3 (story 305).
