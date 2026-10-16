# Fixes Required: front/2026-10-14-admin-route-guards

> Destinatario: Minimax (o quien aplique correcciones)
>
> Lo que está bien: Las 5 rutas admin tienen guard correcto. Los 946 tests
> pasan. El build compila. La vulnerabilidad de acceso está cerrada.
> Esta lista sólo cubre los puntos que necesitan ajuste.

---

## Antes de empezar

No re-audites desde cero. Si el código que encontrás no coincide con lo
descrito aquí, pará y escalá — no improvises correcciones sobre diferencias.

El cambio funcional (route guards) es correcto. Los 4 ítems de esta lista
son de documentación/contrato, no de código de producción.

---

## Estado de los gates

| Gate | Resultado |
|------|-----------|
| `npx jest --no-coverage` (frontend) | 946 passed / 0 failed |
| `npx ng build` (frontend) | OK (2 warnings NG8113 pre-existentes, no son tuyas) |
| Migration DB (docker) | BLOQUEADO — docker no disponible; no correr, sólo notado |

---

## Hallazgo 1 — Tasks 1.1/1.2 marcadas completas pero los archivos no existen

**Archivo**: `openspec/changes/front/2026-10-14-admin-route-guards/apply-progress.md`

**Defecto**: Líneas 8-9 marcan como `[x]` la creación de
`database/migrations/0070_system_config_permission.sql` y
`database/rollback/0070_system_config_permission.DOWN.sql`. Esos archivos no
existen — el permiso `READ system-config` fue absorbido en la consolidación
Group A de `0009_roles_permissions.sql` (commit `1bbccfec3`).

**Por qué importa**: Un lector del apply-progress asume que esos archivos
existen. Si busca la migración para auditarla o revertirla, no la encuentra.

**Corrección**: Actualizar las líneas 8-9 de `apply-progress.md`:

```markdown
- [x] 1.1 CREATE absorbed — `READ system-config` catalog row was consolidated
  into `database/migrations/0009_roles_permissions.sql` (Group A consolidation
  2026-10-14, commit 1bbccfec3). No standalone 0070 file was created.
- [x] 1.2 DOWN absorbed — rollback is covered by
  `database/rollback/0009_roles_permissions.DOWN.sql`. No standalone
  0070.DOWN.sql was created.
```

**No toques**: El código de producción. No crees los archivos 0070 — la migración ya está en 0009 y crearlo duplicaría el permiso (fallaría por el `UNIQUE` constraint).

---

## Hallazgo 2 — MIGRATION_LOG.md no documenta el 0070 consolidado

**Archivo**: `database/MIGRATION_LOG.md`

**Defecto**: El log de migraciones no tiene entrada para la consolidación de
`READ system-config` en 0009.

**Corrección**: Agregar una nota en la entrada de `0009` (o al final del log):

```markdown
## Nota de consolidación 2026-10-14
`READ system-config` (diseñado como migración 0070 en
`front/2026-10-14-admin-route-guards`) fue consolidado en `0009` durante
la refactorización Group A del mismo día. No existe archivo `0070_*.sql`
independiente. Ver commit 1bbccfec3.
```

---

## Hallazgo 3 — Spec sobredeclara rutas fuera de scope

**Archivo**: `openspec/changes/front/2026-10-14-admin-route-guards/specs/admin-route-security/spec.md`

**Defecto**: La tabla de rutas (líneas 30-38) lista 8 rutas. El scope real
es 5. Las tres extra:
- `/app/admin/auditoria` — la ruta existe pero se llama `audit-logs` (no `auditoria`), y ya tenía guard antes de este change.
- `/app/admin/geo-zonas` — no existe en `app.routes.ts`.
- `/app/admin/reportes` — no existe en `app.routes.ts`.

**Por qué importa**: Un auditor futuro leerá las dos últimas como rutas sin guard (defecto) cuando en realidad nunca fueron creadas.

**Corrección**: En `spec.md`, reemplazar la tabla de rutas con sólo las 5 en scope, y agregar una nota:

```markdown
> **Fuera de scope de este change**: Las rutas `/app/admin/audit-logs`
> (ya tenía guard — `READ audit-logs` desde `2026-09-11-f6-audit-logs-export`),
> `/app/admin/geo-zonas` (ruta no creada), y `/app/admin/reportes` (ruta no
> creada) no son parte de este change.
```

**Importante**: `audit-logs` ya tiene guard correcto — no crear escenarios de test para él en este change; pertenece a `2026-09-11-f6-audit-logs-export`.

---

## Hallazgo 4 — Tabla de roles autorizados en spec no coincide con DB

**Archivo**: `openspec/changes/front/2026-10-14-admin-route-guards/specs/admin-route-security/spec.md`  
**Tipo**: Decisión de arquitectura bloqueada — este ítem requiere decisión antes de corrección.

**Defecto**: Línea 32 de la spec declara que `READ roles` está autorizado sólo
para `master, operador_sistema`. En DB (`0009`, línea 159), `admin_organizacion`
(renombrado `admin_org`) también tiene `READ roles`.

**Decisión requerida (arquitecto)**: ¿Debe `admin_org` ver la lista de roles?

- Si SÍ: Actualizar la tabla de la spec para incluir `admin_org`.
- Si NO: Crear un change separado que revoque `READ roles` de `admin_org` en la DB.

**Mientras se decide**: Ninguna corrección de código. La ruta funciona correctamente — el guard respeta lo que el usuario tiene en su permission set. Sólo la spec está inconsistente con la DB.

---

## No toques (fuera de alcance)

| Qué | Por qué |
|-----|---------|
| `frontend/src/app/app.routes.ts` | Correcto — no cambiar |
| `frontend/src/app/app.routes.spec.ts` | 10 tests pasan — no cambiar |
| `frontend/src/app/core/guards/permission.guard.ts` | Lógica correcta — no cambiar |
| `database/migrations/0009_roles_permissions.sql` | No duplicar; `READ system-config` ya está |
| Cualquier otro test que pase actualmente | Los 946 pasan — no tocar |

---

## Orden sugerido

1. **apply-progress.md** (Hallazgo 1) — 2 líneas, sin riesgo.
2. **MIGRATION_LOG.md** (Hallazgo 2) — 1 nota, sin riesgo.
3. **spec.md route table** (Hallazgo 3) — edición de documento.
4. **spec.md authorized roles** (Hallazgo 4) — esperar decisión de arquitecto.
