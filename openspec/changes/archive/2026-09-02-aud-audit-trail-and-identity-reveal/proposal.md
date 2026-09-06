# Proposal: AUD — Auditoría y revelación de autoría sellada

## Intent

Dos fases distintas necesitan lo mismo y ninguna lo tiene: **un registro de quién hizo
qué, cuándo y por qué**.

| Quién lo necesita | Para qué | Estado |
|---|---|---|
| F4 — Ciudadano | Revelar el autor de una publicación anónima ante una denuncia | no existe |
| F7 — Emergencias | «Excepción al tope, **con motivo y autor registrados**» (decisión cerrada) | no existe |

El roadmap ya lo declara como hecho verificado: **«no hay tabla de auditoría»**.
Construirla dos veces sería un error; construirla una vez, antes de ambas, es lo correcto.

Esta fase existe además porque el equipo cerró una decisión de producto el 2026-09-02:
el ciudadano podrá **publicar de forma anónima**, y esa publicación deberá poder abrirse
—dejando rastro— cuando haya una denuncia por información falsa.

## El nombre correcto de lo que se construye

No es anonimato. Es **seudonimato sellado**: el sistema conoce al autor, nadie lo ve, y
existe un procedimiento auditado para abrirlo.

```
Anonimato real       → el sistema tampoco sabe. Irreversible. No hay sanción posible.
Seudonimato sellado  → el sistema sabe, nadie lo ve, hay procedimiento para abrirlo.  ← esto
```

De ahí se sigue una obligación que forma parte del alcance, no del marketing: **el
ciudadano tiene que estar informado**. Un mecanismo de revelación oculto no disuade a
nadie —quien miente no sabe que existe— y además convierte la etiqueta «anónimo» de la
interfaz en una afirmación falsa, con la LOPDP ecuatoriana de por medio.

El aviso es requisito, no copy opcional. Ver `R-AUD-6`.

## Scope

### In Scope — A · Auditoría genérica
- Tabla `audit_events` con actor, acción, recurso, motivo y momento
- Servicio de escritura, único punto por donde pasa todo registro auditado
- Diseñada para que la excepción al tope de F7 quepa sin migración adicional

### In Scope — B · Autoría sellada
- Tabla `incident_reporters` — el autor real de una incidencia publicada como anónima
- `incidents.citizen_id` de esas incidencias apunta a la **máscara**, no a la persona
- Columna `incidents.is_anonymous` para que el frontend sepa qué rotular

### In Scope — C · Permiso y revelación
- Acción `REVEAL` incorporada al `CHECK` de `permissions.action`
- Permiso `REVEAL incidents`, concedido **sólo a `master`**
- Endpoint de revelación con motivo obligatorio, que escribe en `audit_events`
- Endpoint de consulta del historial de revelaciones

### In Scope — D · Aviso al ciudadano
- Texto normativo que la interfaz de F4 debe mostrar junto al interruptor de anonimato

### Out of Scope
- **Cifrado en reposo de `incident_reporters`** y custodia de clave fuera del servidor.
  El diseño lo deja como endurecimiento posterior alcanzable con un `GRANT` y una
  migración, no con una reescritura — ver `design.md` D2
- **Control dual** (dos personas para revelar). Requiere decisión del cliente
- **Revelación por `admin_org`.** Decisión del equipo 2026-09-02: **sólo `master` por
  ahora**, pendiente de coordinar con el cliente, que no pidió esta capacidad
- Panel de administración de auditoría. Los datos quedan consultables por API; la
  pantalla, si se pide, es fase aparte

## Capabilities

- `audit-trail` (nueva)

## Dependencias

**Bloquea a F4** (revelación de autoría) y a **F7 / A** (excepción al tope registrada).
No depende de ninguna fase: sólo toca backend y esquema.

**Debe ir después de REG y ANON** por una razón de secuencia, no técnica: hasta que el
ciudadano pueda registrarse (REG) y se cierre el reporte sin sesión (ANON), no existe
todavía la figura del «autor autenticado que publica anónimamente» que esta fase sella.

## Trampas verificadas que esta fase pisa

Las tres están documentadas en `openspec/ROADMAP.md` §«Hechos verificados»:

| Trampa | Consecuencia aquí |
|---|---|
| La acción `CLOSE` **no existe** en el `CHECK` de `permissions.action` | Insertar `REVEAL` choca con el mismo `CHECK`. Hay que extenderlo primero |
| `users.permissions` es **copia denormalizada** de `roles.permissions` | Conceder `REVEAL` obliga a tocar **las dos** tablas e invalidar `perm:v3:uid:*` |
| `SnakeCaseResponseInterceptor` reescribe toda respuesta | El contrato del frontend se deriva del **controlador**, no de la clase DTO |

## Preguntas abiertas

- **Q1** — ¿Cuánto tiempo se conserva un `incident_reporters`? Si una incidencia anónima
  se borra (soft delete), ¿el sello sobrevive? Propuesta: sí, porque la denuncia por
  información falsa suele llegar **después** de que el reporte se descartó.
- **Q2** — ¿El autor sellado ve en su propio historial que la incidencia es suya?
  Propuesta: sí. Ocultársela al propio autor no protege a nadie y rompe «mis reportes».
