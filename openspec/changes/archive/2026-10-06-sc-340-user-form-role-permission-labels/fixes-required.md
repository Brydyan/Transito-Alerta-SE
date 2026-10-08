# Fixes Required: sc-340 user form role & permission labels

**Change**: `front/2026-09-27-sc-340-user-form-role-permission-labels`  
**Destinatario**: Minimax (Builder) / Orchestrator  
**Origen**: Auditoría SDD Verify (`verify-report.md`)  
**Veredicto del verify**: **PASS WITH WARNINGS**

---

## 1. Antes de empezar

1. **La implementación de sc-340 está 100% correcta y verificada.** Los 6 requerimientos (R1–R6) y los 11 escenarios de prueba están completamente cubiertos en backend y frontend. Las pruebas de unidad y componentes del dominio `admin/users` pasan al 100% (75/75 tests en frontend, 6/6 tests en backend form-data).
2. **No re-audites ni refactorices código que ya funciona.** Los warnings detectados en el reporte de verificación **no son defectos del código de sc-340**, sino estado ambiental y cambios concurrentes en la rama de trabajo.
3. Si encontrás discrepancias entre esta descripción y el código, **detenete y escalá** antes de modificar archivos.

---

## 2. Estado real de los gates

| Gate | Salida Real | Diagnóstico y Responsabilidad |
|---|---|---|
| **Backend `npm test -- users.service.form-data`** | `6 passed, 6 total` (2.392 s) | ✅ **Propio sc-340**. Verde. |
| **Backend `npm test` (suite completa)** | `123 passed, 1275 passed, 11 skipped` | ✅ Verde en aislamiento. |
| **Backend `npm run lint`** | `0 errors, 18 warnings` | ✅ 18 warnings en tests e2e ajenos. Cero errores. |
| **Backend `npm run typecheck`** | Exit code 0 | ✅ Verde. |
| **Backend `npm run build`** | Exit code 0 | ✅ Verde. |
| **Frontend `admin/users` tests** | `8 suites passed, 75 passed` (2.023 s) | ✅ **Propio sc-340**. Verde. |
| **Frontend `npm run build`** | Exit code 0, 608.37 kB bundle | ✅ **Propio sc-340**. Verde (0 bytes de overhead de ejecución). |
| **Frontend `npx tsc -b`** | Exit code 2 (5 errors) | ⚠️ **Ajeno a sc-340**. 5 errores de tipado en `department-list.component.spec.ts` (SC-334) y `map.component.spec.ts`. Todos los archivos de sc-340 compilan con 0 errores. |
| **Frontend `npm test` (suite global)** | Exit code 1 (79 fallos) | ⚠️ **Ajeno a sc-340**. Fuga de estado en `TestBed`/Zone.js durante ejecución masiva en paralelo (ej. `UiPageHeaderComponent` falla en lote, pero pasa 2/2 aislado). |

---

## 3. Bloques por hallazgo / Warning

### Hallazgo W1: Errores en `npx tsc -b` de componentes ajenos
- **Archivos**:
  - `frontend/src/app/features/catalogs/departments/department-list/department-list.component.spec.ts:276`
  - `frontend/src/app/features/citizen/map/map.component.spec.ts:223, 236`
- **El defecto**: Tipado incompleto de `IDepartment` (faltan `updated_at`, `deleted_at`) y tipos incorrectos en mock de polígonos/spies de mapa.
- **Por qué importa**: Impide que el gate global de tipado pase en CI para la rama en la que se integró.
- **Responsabilidad**: **Ajeno a sc-340**. Pertenece a las ramas `sc-341`/`sc-334` y al change en curso `2026-10-05-map-polygon-and-feed-filters-fix`.

### Hallazgo W2: Aislamiento de tests en frontend
- **Archivos**: `frontend/src/app/shared/components/ui-page-header/` y afines.
- **El defecto**: En ejecuciones globales con Jest y Angular v21, los inputs requeridos `input.required()` lanzan `NG0950` por contaminación de ciclos de detección de cambios de suites anteriores.
- **Por qué importa**: Provoca falsos negativos en corridas masivas desatendidas.
- **Responsabilidad**: **Infraestructura de testing** (deuda técnica global). No modificar sc-340 por esto.

### Hallazgo W3: Petición HTTP extra al cambiar de rol en `NewUserFormComponent` (D-T4)
- **Archivo**: `frontend/src/app/features/admin/users/services/users.service.ts:269-276`
- **El defecto**: `getRolePermissions` encadena `this.getPermissions()` vía `switchMap`, lo que genera una solicitud `GET /api/permissions?limit=100` por cada cambio en el selector de roles.
- **Por qué importa**: Desperdicio menor de ancho de banda y latencia innecesaria (aunque funcionalmente es inocuo).
- **Corrección recomendada**: Mantener como comportamiento aceptado para sc-340 (declarado en `apply-progress.md` como D-T4). Opcionalmente optimizar en un refactor futuro con cache en memoria o signal compartido.

---

## 4. Reparto de responsabilidades

| Ítem | Responsable | Estado |
|---|---|---|
| Código de producción sc-340 | Minimax (Builder) | **COMPLETO y aprobado**. No requiere cambios. |
| Especificación y Enmienda A-1 | Arquitecto / QA | **CERRADO y consistente** en `spec.md` y `design.md`. |
| Errores de tipado en `department-list` y `map.component` | Responsables de ramas SC-341 / SC-334 / Map-feed | Fuera de este change; atender en sus respectivos tickets. |
| Follow-ups F1, F2, F3 | Backlog de producto / Arquitectura | Documentados con tickets sugeridos (`back/roles-stats-modules-from-uuids`, `back/user-permissions-breakdown`, `front/replace-vacuous-subscribe-assertions`). |

---

## 5. Tabla de NO TOCAR (Fuera de alcance)

| Archivo / Área | Motivo |
|---|---|
| `backend/src/modules/roles/roles.service.ts:155-160` (`getStats`) | Decisión D4 y Follow-up F1. La resolución de módulos por UUIDs en estadísticas de roles es un cambio de backend aparte (`back/roles-stats-modules-from-uuids`). |
| `frontend/src/app/features/admin/users/services/users.service.ts:129-135` (`getUserById`) | Decisión D6 y Follow-up F2. El backend no expone el desglose de permisos directos; extender el DTO de usuario afecta auditoría y no forma parte de este ticket. |
| `frontend/src/app/features/catalogs/**` | Cambios en progreso de otras ramas y tickets (SC-341/SC-334). No tocar desde sc-340. |
| `frontend/src/app/features/citizen/map/**` | Cambios en progreso de ticket de mapa/polígonos. |
| Templates `user-form.component.html:274,304,318,322` | Decisión D-T2 y Enmienda A-1. Los bindings ya consumen correctamente las etiquetas y el identificador tras la alineación del modelo. |

---

## 6. Orden sugerido de acción

Dado que el código de sc-340 está 100% verificado y validado:
1. **No realizar modificaciones de código sobre sc-340.**
2. Proceder al archivado de la especificación vía `sdd-archive` cuando el orquestador lo determine.
3. Registrar los follow-ups F1 (`roles-stats-modules-from-uuids`) y F2 (`user-permissions-breakdown`) en el backlog de backend.
