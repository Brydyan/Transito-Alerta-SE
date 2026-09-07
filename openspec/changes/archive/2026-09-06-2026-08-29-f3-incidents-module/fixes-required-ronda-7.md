# Fixes Required — Ronda 7: F3 — Módulo de Incidencias (sc-303)

**De**: `verify-report-ronda-7.md` (auditoría independiente, 2026-09-07)
**Change auditado**: `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/` (uncommitted)
**Change de origen (ya archivado)**: `openspec/changes/archive/2026-09-06-2026-08-29-f3-incidents-module/`
**Bloquea**: dar por listo para `sdd-archive` el change de seguimiento `2026-09-07-fix-incident-claim-wiring`. **No bloquea** nada del change ya archivado — su CRITICAL de ronda 6 quedó remediado por completo.

---

## Resumen en una línea

El fix de `claim` es correcto y está probado con mutación real (0 CRITICAL sobreviven). El único hallazgo de esta ronda es de proceso, no de código: al change de seguimiento le falta su propio `spec.md` de delta.

---

## WARNING — falta `spec.md` de delta en el change de seguimiento

**Qué está mal**: `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/` existe como directorio pero está **vacío** — no contiene `spec.md`. La convención SDD de este proyecto (visible en el propio change archivado, que sí lleva `specs/frontend-incidents/spec.md` con el delta de cada ronda) espera que todo change registre, aunque sea de forma mínima, si modifica o no una capacidad descrita en el spec del proyecto.

**Por qué no lo atrapó el test**: esto no es un defecto de comportamiento — ningún test unitario o de integración puede detectar la ausencia de un archivo de documentación SDD. Es un gap de higiene de proceso, detectado por inspección directa del árbol de archivos del change, no por ejecución.

**Archivos involucrados**:
- `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/` (directorio vacío)
- Referencia — el spec del proyecto que este fix hace real (sin necesidad de tocarlo): `openspec/specs/frontend-incidents/spec.md:67-68` y `specs/frontend-incidents/spec.md:67-68` ("Reclamar — ... THEN queda asignada al usuario actual")
- Referencia — `tasks.md` del propio change (`3.3`) ya documenta correctamente la decisión de no tocar el spec del proyecto porque no hay delta de comportamiento; falta el artefacto formal que registre esa decisión dentro del change

**Qué cambiar**:

1. Agregar `openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/spec.md` con un delta explícito de "sin cambio de comportamiento": documentar que el escenario "Reclamar" del spec sincronizado del proyecto ya describía el comportamiento correcto (`claimed_by` asignado al usuario actual) y que este change corrige la implementación para que cumpla ese escenario, sin modificar el contrato.
2. No es necesario abrir una nueva ronda de `sdd-verify` para este punto — es puramente documental. Una vez agregado el archivo, el change queda listo para `sdd-archive`.

**Test que debe pasar**: N/A — no es un defecto de código. La verificación de este punto es de presencia de archivo, no de ejecución. Criterio de cierre: `ls openspec/changes/front/2026-09-07-fix-incident-claim-wiring/specs/frontend-incidents/spec.md` debe devolver el archivo, con contenido no vacío que referencie el escenario "Reclamar".

---

## Deuda no bloqueante a registrar

Ninguna. Todos los hallazgos de código de la ronda 6 (el único CRITICAL) se remediaron y se verificaron con evidencia de ejecución real (mutación, lectura de SQL/decoradores/seeds, gates en vivo). C1, C2, C3, W1 y W2 (ahora 5/5 acciones) siguen cerrados sin regresión.

---

## Orden sugerido

1. Agregar el `spec.md` de delta descrito arriba al change `2026-09-07-fix-incident-claim-wiring`.
2. Ejecutar `sdd-archive` sobre ese change — no hace falta una ronda 8 de `sdd-verify` acotada a este punto documental.
3. El change ya archivado (`2026-09-06-2026-08-29-f3-incidents-module`) no requiere ninguna acción adicional.
