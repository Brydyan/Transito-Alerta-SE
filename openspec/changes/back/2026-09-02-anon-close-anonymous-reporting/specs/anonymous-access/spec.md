# Spec: ANON — Cerrar el reporte sin sesión

## Domain: anonymous-access (MODIFIED)

### Requirement: La identidad anónima no puede autenticarse
El login con `device_uuid` igual al configurado como anónimo DEBE rechazarse.

- Scenario: Login rechazado — GIVEN una petición de login con
  `device_uuid = 'anonymous'` THEN se rechaza con 401
- Scenario: Sin tokens — GIVEN ese rechazo THEN no se emite token de acceso ni de
  refresco, y no se crea sesión
- Scenario: Motivo distinguible — GIVEN el rechazo THEN el cuerpo indica que la
  identidad anónima ya no permite iniciar sesión, no un error genérico de credenciales:
  un cliente antiguo debe poder mostrar algo accionable
- Scenario: Otras credenciales por dispositivo intactas — GIVEN un login con un
  `device_uuid` distinto del anónimo THEN funciona como antes
- Scenario: La forma de credencial sobrevive — GIVEN una petición con `{device_uuid}`
  como único campo THEN sigue siendo una forma válida para `ValidationPipe` y para
  `resolveCredential`

### Requirement: El techo anónimo queda vacío
`anonymousPermissions` NO DEBE conceder ninguna capacidad, ni en configuración ni en la
copia denormalizada de la fila máscara.

- Scenario: Configuración vacía — GIVEN `auth.config.ts` THEN `anonymousPermissions` es
  una lista vacía
- Scenario: Sin lectura — GIVEN la identidad anónima THEN no tiene `READ incidents` ni
  `READ comments`
- Scenario: Sin escritura — GIVEN la identidad anónima THEN no tiene `CREATE incidents`
  ni `CREATE comments`
- Scenario: Fila máscara vaciada — GIVEN la fila `users` con `device_uuid = 'anonymous'`
  THEN su columna `permissions` es una lista vacía tras la migración
- Scenario: Efecto de 0008 anulado — GIVEN que `0008_anonymous_read_comments.sql` amplió
  el techo THEN una migración nueva lo revierte, sin reescribir el historial aplicado

### Requirement: La fila máscara sobrevive
La fila `users` con `device_uuid = 'anonymous'` NO DEBE borrarse: AUD la usa como
identidad de publicación.

- Scenario: Fila presente — GIVEN la base tras la migración THEN la fila sigue existiendo
  con su mismo id
- Scenario: Referenciable — GIVEN una incidencia cuyo `citizen_id` es la máscara
  THEN la restricción de clave foránea se satisface
- Scenario: Sigue sin rol — GIVEN la fila máscara THEN no tiene rol asignado, y ampliar
  `reporter` no le concede nada
- Scenario: Publica pero no entra — GIVEN la máscara THEN puede figurar como autoría de
  una incidencia y no puede iniciar sesión. Son propiedades independientes

### Requirement: Ningún camino sin sesión crea contenido
Tras esta fase, NO DEBE existir ninguna vía para crear una incidencia o un comentario sin
una sesión autenticada.

- Scenario: Crear incidencia sin token — GIVEN una petición sin cabecera de autorización
  THEN se rechaza con 401
- Scenario: Crear comentario sin token — GIVEN una petición sin cabecera de autorización
  THEN se rechaza con 401
- Scenario: Sin puerta trasera — GIVEN el conjunto de rutas del módulo de incidencias
  THEN ninguna está marcada como pública para escritura
- Scenario: Lectura pública también cerrada — GIVEN una petición de listado sin token
  THEN se rechaza con 401. El producto no expone feed público en esta etapa
