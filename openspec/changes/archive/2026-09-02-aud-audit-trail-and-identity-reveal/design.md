# Design: AUD — Auditoría y revelación de autoría sellada

Cada decisión lleva su alternativa rechazada. Sin eso, la decisión no es revisable:
quien la lea dentro de seis meses no sabe qué se descartó ni por qué.

---

## D1 — Dónde vive la autoría de una publicación anónima

**Hecho de partida, verificado:**

```sql
-- database/migrations/0004_incidents.sql:30
citizen_id  uuid NOT NULL REFERENCES users (id),
```

La autoría **ya está** en la tabla principal, y la columna es `NOT NULL`. «Ocultar el
autor» no es, entonces, sólo filtrar en la capa API.

**Decisión: `incidents.citizen_id` de una publicación anónima apunta a la máscara.**
El autor real vive en una tabla aparte, `incident_reporters`.

```sql
CREATE TABLE incident_reporters (
  incident_id  uuid PRIMARY KEY REFERENCES incidents (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

La máscara es la fila que **ya existe**: `users` con `device_uuid = 'anonymous'`
(`0001_initial_schema.sql:49`). ANON la deja sin uso como identidad de autenticación —
aquí se recicla como identidad de publicación. No se crea nada nuevo, y la fila deja de
ser código muerto.

**Alternativa rechazada — `is_anonymous` y filtrar en la API, dejando `citizen_id`
apuntando a la persona.** Es lo más barato de implementar y es la peor opción de las
dos, por una razón específica de este proyecto: obliga a que **cada** endpoint que
devuelva incidencias se acuerde de suprimir el campo. Uno que se olvide filtra la
identidad. El roadmap ya nombra ese modo de fallo como el patrón recurrente del
proyecto —*«reglas implementadas a medias: aplicadas en el camino por donde entró la
funcionalidad y no en el añadido después»*— con tres instancias registradas. Poner el
dato donde no está es una garantía estructural; recordar filtrarlo es una promesa.

**Alternativa rechazada — hacer `citizen_id` anulable.** Arquitectónicamente es la más
limpia: la incidencia sencillamente no tiene autor. Se descarta por radio de impacto:
`NOT NULL` → anulable en una columna central obliga a revisar toda consulta, entidad y
DTO que hoy asume que siempre hay valor, y no existe un test que garantice haberlos
encontrado todos. La máscara consigue la misma propiedad —la tabla principal no
contiene la identidad real— sin tocar la restricción.

**Consecuencia aceptada:** `citizen_id` deja de significar «la persona» y pasa a
significar «la autoría mostrada». Es un cambio de semántica sobre una columna existente
y hay que documentarlo en el esquema, no sólo aquí. Ver `T-AUD-B4`.

---

## D2 — Tabla aparte para que el endurecimiento sea migración, no reescritura

Hoy `incident_reporters` es legible por el mismo rol de Postgres que el resto del
esquema. La protección real es el permiso `REVEAL` en la capa de aplicación.

Eso es deliberado y **no** es el estado final. Al estar en su propia tabla, subir el
nivel más adelante es:

```
hoy         → protección de aplicación (permiso REVEAL + auditoría)
endurecer   → REVOKE sobre la tabla + rol de Postgres dedicado al servicio de revelación
más aún     → cifrado de la columna con clave fuera del servidor
```

Ninguno de esos pasos mueve datos de sitio ni cambia consultas ajenas. **La versión
fuerte queda como migración, no como reescritura** — que es exactamente lo que se pierde
si la identidad se guarda como columna de `incidents`.

**Alternativa rechazada — cifrar desde el día uno.** Añade gestión de claves (dónde
vive, quién rota, qué pasa si se pierde) a un equipo que todavía no tiene alertas cuando
se le cae el runner. El riesgo de perder la clave —y con ella toda capacidad de
sanción— es hoy mayor que el riesgo que mitiga.

---

## D3 — Auditoría genérica, no específica de la revelación

```sql
CREATE TABLE audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL REFERENCES users (id),
  action        varchar(64) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id   uuid,
  justification text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_resource ON audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_actor    ON audit_events (actor_id, created_at DESC);
```

`justification` es anulable **en el esquema** y obligatoria **por acción**: la revelación
la exige (D4), la excepción al tope de F7 también, y una acción futura de sólo lectura
podría no necesitarla. Poner la restricción en el servicio y no en la columna permite
que F7 entre sin migración.

**Alternativa rechazada — una tabla `identity_reveals` dedicada.** Modela mejor este
caso concreto y obliga a F7 a inventarse la suya, con lo que el proyecto acaba con dos
mecanismos de auditoría que hay que consultar por separado para responder «qué pasó con
esta incidencia». El costo del genérico es un `metadata jsonb` menos tipado; el costo
del dedicado es la fragmentación.

**Sin `UPDATE` ni `DELETE`.** El servicio sólo inserta. Un registro de auditoría
editable no es un registro de auditoría.

---

## D4 — La revelación es una escritura, no una lectura

`POST /incidents/:id/reveal-reporter`, no `GET`.

Suena a consulta y no lo es: **cada revelación produce un hecho nuevo** —la fila de
auditoría— y ese es el punto del mecanismo. Modelarla como `GET` invita a que la cachee
un proxy, a que un navegador la repita, y a que alguien la considere idempotente y le
quite el registro por «optimización».

`justification` es obligatoria, con mínimo de 20 caracteres útiles:

```ts
@IsString() @MinLength(20)
justification!: string;
```

El mínimo no es burocracia. Convierte *«puedo mirar»* en *«miré, y consta quién y por
qué»* — y esa es la única disuasión que existe del lado del operador. Un campo libre que
acepta `"."` no registra nada.

**Alternativa rechazada — devolver el autor en el detalle de la incidencia cuando el
solicitante tiene `REVEAL`.** Es más cómodo y elimina la posibilidad de auditar: la
identidad viajaría en cada carga de la pantalla, y no habría forma de distinguir «abrió
el detalle» de «quiso saber quién fue».

---

## D5 — Sólo `master`, y por qué eso se escribe en el spec

Decisión del equipo, 2026-09-02: **`REVEAL incidents` se concede únicamente a `master`.**

El motivo no es técnico. El cliente **no pidió** esta capacidad, y el equipo la ve como
una posible línea de servicio a acordar por separado. Hasta esa conversación, ampliarla
a `admin_org` sería decidir por el cliente algo que le corresponde.

Se escribe como requisito con su escenario negativo (`R-AUD-4`) para que la concesión a
otro rol falle un test, no dependa de que alguien recuerde la conversación.

**Alternativa rechazada — `admin_org` de la organización dueña.** Es lo que pediría la
operación diaria: quien gestiona la organización es quien recibe la denuncia. Queda
pendiente de la decisión comercial, no descartada.

---

## D6 — La máscara no autentica

Cuando ANON cierre el techo anónimo, la fila `device_uuid = 'anonymous'` deja de poder
iniciar sesión. Aquí se le da un uso nuevo, y hay que ser explícito para que nadie
reabra el camino viejo creyendo que esta fase lo necesita:

```
antes (se elimina en ANON) → identidad de autenticación: reportar sin cuenta
ahora (esta fase)          → identidad de publicación: rotular autoría sin revelarla
```

Un `INSERT` en `incidents` con `citizen_id` = la máscara es válido. Un `login` con
`device_uuid = 'anonymous'` no. Son propiedades independientes y `R-AUD-5` afirma las
dos.

---

## D7 — Qué pasa al borrar la incidencia

`ON DELETE CASCADE` sobre `incident_reporters` cubre el borrado físico, que no ocurre:
el proyecto usa **soft delete** (`0025_incidents_soft_delete.sql`).

Con soft delete el sello **sobrevive**, y es lo que se quiere: la denuncia por
información falsa suele llegar *después* de que el reporte se descartó por inválido. Un
sello que se borra junto con la incidencia descartada dejaría sin sanción exactamente el
caso que motivó la fase (Q1 del proposal, resuelta aquí).
