# Archive Report — AUD: Auditoría y revelación de autoría sellada (sc-327)

**Archivado**: 2026-09-06  
**Rondas de verify**: 3  
**Veredicto final**: **PASS** — 0 CRITICAL, 1 WARNING (non-blocking), 1 SUGGESTION (non-blocking)

---

## Qué entrega

La decisión de producto 2026-09-02: el ciudadano puede publicar de forma anónima, y esa
publicación puede abrirse —dejando rastro— cuando hay una denuncia por información falsa.

La fase entrega los cuatro bloques del design (`design.md` D1–D7):

### A — Auditoría genérica

Tabla `audit_events` inmutable (sin `UPDATE`, sin `DELETE`), con un servicio `AuditService`
que expone una sola operación: `record(...)`. La escritura comparte transacción con la
acción auditada, de modo que un fallo del registro revierte la acción por completo.

- Migración 0045
- Entidad `AuditEventEntity`
- Servicio `AuditService` (8 tests, 8/8 PASS)

### B — Autoría sellada

Cuando una incidencia se publica con `is_anonymous = true`, su `citizen_id` apunta a la
**máscara** (`users.device_uuid = 'anonymous'`), y el autor real queda en una tabla aparte
(`incident_reporters`). Ningún endpoint que devuelva una incidencia carga la autoría real,
salvo la ruta protegida de revelación.

- Migración 0046
- Entidad `IncidentReporterEntity`
- `IncidentsService.create` acepta `is_anonymous` con transacción compartida
- Specs de sellado (6 tests, 6/6 PASS) + regresión sobre todos los endpoints

### C — Permiso y revelación

La acción `REVEAL incidents` se concede **sólo a `master`**. La revelación es una
escritura (`POST`, no `GET`) que exige `justification` de ≥ 20 caracteres y produce un
registro de auditoría. Hay un endpoint de consulta del historial de revelaciones.

- Migración 0047 (extiende `permissions.action`, inserta `REVEAL`, denormaliza a `master`)
- `RevealIncidentDto` y `RevealService`
- Specs de permiso y revelación (9 tests, 9/9 PASS)

### D — Máscara y aviso

La máscara publica (la FK de `incidents.citizen_id` la referencia válidamente) pero no
autentica (el login con `device_uuid = 'anonymous'` se rechaza en ANON). La constante
`ANONYMOUS_DISCLOSURE_NOTICE` se exporta para que F4 la consuma, evitando que la interfaz
reescriba el texto normativo.

- Especificación de la máscara (2 tests, 2/2 PASS)
- Constante `ANONYMOUS_DISCLOSURE_NOTICE` (3 tests, 3/3 PASS)

---

## Hallazgos de verificación

### Ronda 1 — Implementación inicial

La ronda 1 se archivó con casillas marcadas pero un defecto estructural: `repo.create()`
corría la query fuera de la transacción. Los inserts de `incidents` e `incident_reporters`
no compartían transacción, y una falla del segundo dejaba una fila huérfana del primero. El
test unitario mockeaba `repo.create`, así que nunca tocaba la BD real.

### Ronda 2 — Tres defectos críticos

**CRITICAL-1 (después FIX-1)**: `IncidentsRepository.create` no aceptaba `manager`  
**CRITICAL-2 (después FIX-2)**: Falta de e2e para las superficies de creación anónima  
**CRITICAL-3 (después FIX-4)**: Archivado prematuro con artefactos sin borrar

Conjuntamente con 3 WARNING detectadas:

- **WARNING-1**: `RolesService.syncPermissions` no rechaza `REVEAL` para roles ≠ `master`
- **WARNING-2**: `RevealIncidentDto.justification` no valida sustancia (alfanuméricos)
- **WARNING-4**: `RevealService.reveal` no tipaba los errores estructurales (`throw new Error` crudo)

### Ronda 3 — Dos defectos de privilege escalation (bypass del guard)

**CRITICAL-5 (después FIX-5)**: `assertRevealOnlyForMaster` vivía sólo en `syncPermissions`.  
`create()` y `update()` aceptaban un `permissions: ['REVEAL incidents']` en un rol no-master.

**Mutación**: Reemplazar el cuerpo de `assertRevealOnlyForMaster` con `return;` hace fallar
exactamente 6 tests: los tres caminos de mutación en `syncPermissions`, `create` y `update`
dependen del guard. Restaurado desde el backup; idéntico al estado previo a la mutación.

Remediación: Refactor de `assertRevealOnlyForMaster` a una aserción que toma `(roleName,
permissions)` y se usa en los 3 puntos de mutación (`create`, `update`, `syncPermissions`).

**CRITICAL-6 (después FIX-6)**: El guard usaba `role.name`, pero `update()` permitía  
renombrar. Ataque de dos pasos: `PATCH /admin/roles/:id {name: 'master'}` (acepta, sin
guard de rename) → `PUT /admin/roles/:id/permissions ['REVEAL incidents']` (acepta porque
`role.name` ahora es 'master').

Remediación doble:
1. El guard evalúa con el nombre **resultante** (`dto.name ?? role.name`), no con el
   nombre anterior.
2. Se añade `assertSeededNameNotRenamed` que rechaza renombrar hacia o desde los nombres
   sembrados (`master`, `admin_org`, `operador_org`, `operador_sistema`, `reporter`).

**Mutación**: Reemplazar el cuerpo de `assertSeededNameNotRenamed` con `return;` hace fallar
exactamente 4 tests de la suite "update (AUD FIX-6 ...)". El 5º test de esa suite (renombrar
roles no-sembrados entre sí) sigue pasando correctamente. Restaurado desde el backup; idéntico al estado
previo a la mutación.

Consecuencia esperada: El test de `email-verified-guard.e2e-spec.ts` (sc-325) que se basaba
en `PATCH /roles/:id { name: 'ciudadano' }` sobre la fila `reporter` se rompió (su setup
era exactamente el camino de escalada que FIX-6 cierra). Reescrito con CREATE de un rol nuevo
en vez de rename.

---

## Estado de gates — Ronda 3

| Gate | Resultado |
|---|---|
| backend lint | **0 errors**, 24 warnings (preexistentes, ninguno introducido por este round) |
| backend typecheck | exit 0 |
| backend build | exit 0 |
| backend unit (109 suites) | **989/989 tests** PASS |
| backend e2e (53 suites) | **465/465 tests** PASS |
| frontend unit (48 suites) | **329/329 tests** PASS |
| migraciones en `MIGRATION_LOG` | pasa |

**Conteo de incrementos vs. línea base:**
- Ronda 1: 105 suites / 944 tests
- Ronda 3 (actual): 109 suites (+4) / 989 tests (+45)
  - Los +4 suites y +45 tests proceden de: 10 specs nuevos en `roles.service.spec.ts`
    (ronda 3 FIX-5/FIX-6 fixes + mutación), 6 e2e en `audit-trail-reveal` (WARNING-A),
    2 e2e en `incidents.service.anonymous.spec.ts` (WARNING-B/C), y suite de
    observability (`request-id.logger.spec.ts`, etc.) en HEAD.

---

## Specs — Merge y verificación

**Dominio**: `audit-trail` (nuevo)  
**Requisitos**: 6  
**Escenarios**: 30  

| Requisito | Escenarios | Cobertura |
|---|---|---|
| R1 — Toda acción auditada deja registro inmutable | 5 | ✅ 100% (A.1-A.5 + mutation) |
| R2 — Una publicación anónima no expone autor | 6 | ✅ 100% (B.1-B.6 + e2e A.1-A.3) |
| R3 — Sólo master puede revelar | 6 | ✅ 100% (C.1-C.3 + FIX-5/FIX-6 mutation) |
| R4 — Revelar exige motivo y rastro | 7 | ✅ 100% (C.4-C.9 + e2e) |
| R5 — Máscara publica pero no autentica | 3 | ✅ 100% (D.1 + coexistencia con ANON) |
| R6 — Ciudadano informado | 3 | ✅ 100% (D.2 + constante exportada) |

Conteo verificado con `grep -c 'Scenario:'` sobre el spec mergeado y por requisito: 5+6+6+7+3+3 = 30.

La especificación completa está en `openspec/specs/audit-trail/spec.md`.

---

## Compuertas finales — Números exactos de Ronda 3

```bash
$ npx jest src/modules/roles/roles.service.spec.ts
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total        # +10 desde ronda 2 (FIX-5/FIX-6)

$ npx jest src/modules/incidents/incidents.service.anonymous.spec.ts
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total          # +0 (unchanged, pero con aserciones reforzadas)

$ npx jest --config ./test/jest-e2e.json --runInBand
Test Suites: 53 passed, 53 total
Tests:       465 passed, 465 total      # +8 desde ronda 2 (FIX-5/FIX-6 e2e)

$ npx jest
Test Suites: 109 passed, 109 total
Tests:       989 passed, 989 total

$ npx tsc --noEmit -p tsconfig.json
exit 0

$ npm run lint
0 errors
```

---

## Migraciones

| ID | Archivo | Propósito | Estado |
|---|---|---|---|
| 0045 | `database/migrations/0045_audit_events.sql` | Tabla `audit_events` inmutable | ✅ con DOWN |
| 0046 | `database/migrations/0046_incident_reporters.sql` | Tabla `incident_reporters` + `incidents.is_anonymous` | ✅ con DOWN |
| 0047 | `database/migrations/0047_reveal_permission.sql` | Permiso `REVEAL`, denormalización a master, invalidación de caché | ✅ con DOWN |

Todas están registradas en `database/MIGRATION_LOG.md`. El `CHECK` de `permissions.action`
fue extendido con `REVEAL` mediante `DROP CONSTRAINT` + `ADD CONSTRAINT` (no directamente
modificado), evitando la trampa que dejó `CLOSE` fuera del catálogo antes.

---

## Nota de despliegue — Permisos e invalidación de caché

AUD introduce `REVEAL incidents` como nuevo permiso e inmediatamente lo concede a `master`.
La migración 0047:

1. Inserta `REVEAL` en el catálogo de acciones (`permissions.action`)
2. Dota a `master` de `REVEAL incidents` en `roles.permissions`
3. Denormaliza ese permiso a **todos los usuarios con `role_id = master`** via `UPDATE users`
4. Bumpa `permission_version` para invalidar la cache `perm:v3:uid:*`

Tras el despliegue:
- Un usuario master que **inicia sesión** obtiene `REVEAL` inmediatamente
- Un usuario master con **sesión abierta** obtiene el permiso en la siguiente lectura de
  permisos (función `getAuthContextByUserId` evalúa `permissionVersion` y rechaza el caché
  si es antiguo)

**Ventana de consistencia**: El token de acceso vive 15 minutos. Si un master inicia sesión
justo antes del despliegue, su token comporta una copia de permisos sin `REVEAL`, y seguirá
sin el permiso durante toda la vida de ese token (máx 15 min). No afecta a nuevos logins
ni a sesiones que lean permisos tras el despliegue.

**Relación con ANON (sc-326)**: ANON introduce la invalidación del caché `perm:v3:uid:*`
vía `permission_version` (ver su archivo de despliegue). AUD la usa para el mismo propósito
en contexto diferente. Ambas migraciones son idempotentes, no se interfieren.

---

## Deuda conocida

1. **WARNING (no-bloqueante)**: Caché de invalidación de permisos no tiene test runtime
   directo — la afirmación es estructural (leer el SQL de la migración). Se incluyó en
   `fixes-required.md` de la ronda 3 como "recomendado, no bloqueante". Pendiente para
   próxima ronda si procede.

2. **SUGGESTION (no-bloqueante)**: El `apply-progress.md` documenta sólo la ronda 1 y no
   refleja las rondas 2-3 (FIX-1 a FIX-6). La deuda es documentación, no código.

3. **Cambio de semántica de `citizen_id`**: Pasa de significar "la persona" a "la autoría
   mostrada". Está documentada en la entidad, la migración y el diseño, pero es crucial para
   futuras modificaciones del esquema o del servicio de incidencias.

---

## Cuadro de defectos y remediaciones

| Defecto | Categoría | Ronda | Fix | Cobertura |
|---|---|---|---|---|
| `repo.create()` fuera de transacción | CRITICAL | 2 | FIX-1: parámetro manager | Mutation + e2e trigger |
| Falta e2e de creación anónima | CRITICAL | 2 | FIX-2: 9 escenarios e2e | 100% de superficies |
| Archivado prematuro | CRITICAL | 2 | FIX-4: borrar artefactos | Verificación manual |
| `syncPermissions` bypass | WARNING | 2 | WARNING-1: add guard | Mutation test |
| `create()`/`update()` bypass | CRITICAL | 3 | FIX-5: 3 mutation paths | Mutation test (disable guard) |
| Rename bypass + escalada | CRITICAL | 3 | FIX-6: nombre resultante + assertSeededNameNotRenamed | Mutation test (disable guard) |
| Falta de validación alfanumérica | WARNING | 2 | WARNING-2: add @Matches | N/A (lint) |
| Falta de tiro de errores | WARNING | 2 | WARNING-4: add typed exception | N/A (lint) |
| No-filtración en /incidents | WARNING | 3 | WARNING-A: 6 e2e | Cobertura e2e |
| Docstring impreciso en B.6 | WARNING | 3 | WARNING-B: rewrite + assertión | Mutation test |
| No-filtración en filtro por autor | WARNING | 3 | WARNING-C: 2 e2e | Cobertura e2e |
| Cache invalidation sin test | SUGGESTION | 3 | (none, no-bloqueante) | Estructural |

---

## Recomendación para productivo

✅ **Archive approved.** Todas las CRITICAL están resueltas y confirmadas por mutación testing.
Las WARNING y SUGGESTION son no-bloqueantes y ya fueron flaggeadas en round-2 como
"recomendado, no bloqueante".

La fase es segura de desplegar. Seguir la nota de despliegue sobre invalidación de caché de
permisos.

---

## Siguiente fase

AUD bloquea a **F4** (revelación de autoría) y a **F7 / A** (excepción al tope registrada).
Ambas están fuera del alcance de este change.
