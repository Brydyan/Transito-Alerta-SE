# ADR-0002: Auditoría inmutable vía trigger de PostgreSQL

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Equipo de Proyecto

## Context and Problem Statement

Las incidencias pasan por cambios de estado (`pending` → `pending_operator` → `in_progress` → `resolved`) como parte de su ciclo de vida. Estos cambios son legalmente relevantes: hay que poder demostrar quién hizo qué cambio y cuándo. La auditoría debe sobrevivir incluso si el código de la aplicación es comprometido o tiene bugs.

¿Cómo garantizar que la tabla de historial de estados (`status_history`) se llene siempre, sin depender de la disciplina del código de aplicación?

## Considered Options

1. **Código de aplicación inserta en `status_history`** en cada cambio de estado, dentro de una transacción.
2. **Trigger de PostgreSQL** que se dispara ante UPDATE de `incidents.status` y escribe automáticamente en `status_history`. **Elegido.**
3. **Event sourcing completo** — modelar el estado como una secuencia de eventos inmutables, no como una columna mutable.

## Decision Outcome

**Opción 2: trigger de base de datos.** La inserción en `status_history` la hace un trigger `AFTER UPDATE OF status` en la tabla `incidents`. El trigger extrae el `user_id` del JWT de la sesión PostgreSQL (configurada por el backend en cada request). El código de aplicación NO escribe en `status_history`; solo modifica `incidents.status` y el trigger hace el resto.

**Razones:**

- **Inmutabilidad real**: aunque el código de aplicación sea comprometido, no puede evitar la inserción en `status_history` modificando el flujo de código. La única forma de evitarlo es deshabilitar el trigger (que requiere `ALTER TABLE`, no accesible a la app).
- **Atomicidad**: el cambio de estado y la inserción en historial ocurren en la misma transacción de DB. O ambos, o ninguno.
- **No se pierde performance**: el trigger es O(1) por cambio de estado, no hay round-trip adicional.
- **No requiere event sourcing**: para este caso de uso, event sourcing sería over-engineering. El estado actual de la incidencia sigue siendo la columna `status`; el historial es una vista derivada.

## Consequences

### Positive

- **Garantía de auditoría real**: ningún path de código puede saltarse la inserción.
- **Menos código de aplicación**: no hay que acordarse de insertar en `status_history` en cada acción.
- **Consistencia**: el historial SIEMPRE refleja la realidad de la BD.
- **Recuperación ante incidentes**: si el código borra una incidencia pero el trigger de auditoría registra el cambio, hay rastro.

### Negative

- **Migración compleja**: la lógica de auditoría queda en SQL procedural (PL/pgSQL), no en PHP. Bugs en el trigger son más difíciles de debuggear.
- **Testeo de la auditoría requiere DB real**: no podés testear con mocks; necesitás un PostgreSQL con la migración aplicada.
- **Dependencia de variable de sesión**: el trigger lee `current_setting('app.current_user_id', true)` que la app debe setear en cada request. Si la app olvida setearlo, el historial queda con `user_id=NULL` (o falla).
- **Acoplamiento a PostgreSQL**: el patrón no es portable a MySQL u otras BD. Aceptable porque el proyecto ya está casado con PostgreSQL (ver ADR-0007).

## Implementation

**Archivos clave:**

- `backend/database/migrations/2026_06_15_000010_create_incident_triggers.php` — crea la función PL/pgSQL y el trigger `AFTER UPDATE OF status ON incidents`.
- `backend/database/migrations/2026_06_27_100001_fix_audit_actor_in_status_trigger.php` — fix para extraer correctamente el `user_id` desde la sesión.

**Forma del trigger** (esquemático):

```sql
CREATE OR REPLACE FUNCTION log_incident_status_change() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO status_history (incident_id, previous_status, new_status, changed_by_user_id, created_at)
    VALUES (NEW.id, OLD.status, NEW.status, current_setting('app.current_user_id', true)::BIGINT, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_incident_status_change
  AFTER UPDATE OF status ON incidents
  FOR EACH ROW EXECUTE FUNCTION log_incident_status_change();
```

**En el backend, antes de cada UPDATE**, setear la variable de sesión:

```php
DB::statement("SET LOCAL app.current_user_id = ?", [$userId]);
```

## References

- [SRS v2.0 §3.6 RS-008 Auditoría inmutable](../Requisitos/SRS.md#requisitos-de-seguridad)
- [SRS v2.0 §3.2 RF-FUNC-008 Historial de Cambios](../Requisitos/SRS.md#estados-y-auditoría)
- ADR-0007 PostGIS — otra decisión que ata el proyecto a PostgreSQL.
- ADR-0003 Claim/Release/Confirm — los cambios de estado que dispara este trigger.
