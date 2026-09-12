# Apply Progress — F6 Auditoría de Acceso (Frontend)

**Change**: `2026-09-11-f6-audit-logs-export` (front)
**Branch**: `brydyan/sc-308/f6-rediseno-dashboard-usuarios-roles-y-perfil`
**Date**: 2026-09-11 (aplicado)

---

## Resumen

Pantalla `/app/admin/audit-logs` lista los eventos de auditoría del
sistema con filtros por rango de fecha + actor (dropdown con fallback
UUID), paginación, tabla con seis columnas y botón "Descargar CSV"
que dispara la descarga vía `HttpClient` blob (no `window.open`).

Reemplaza el `href="#"` del card "Auditoría de Acceso" en
`/app/admin/users` por `[routerLink]` real. Gateada con
`permissionGuard` + `READ audit-logs`.

---

## Lo que quedó implementado

| Archivo | Estado | Notas |
|---|---|---|
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.ts` | NUEVO | Standalone + Signals + OnPush. 5 señales: `items`, `total`, `currentPage`, `filters`, `users`, `actorDropdownAvailable`. `loadData()` y `loadUsers()` separados para resiliencia. |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.html` | NUEVO | Header + filter toolbar (date × 2 + actor select/UUID fallback + reset) + table 6 columnas + empty-state + pagination + CSV button. |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.css` | NUEVO | Estilos del toolbar y error banner (mirror de UsersList). |
| `frontend/src/app/features/admin/audit-logs/audit-logs.component.spec.ts` | NUEVO | 16 specs: R1-S2, R2-S1/S2/S3, R3-S2/S4, R4-S1/S2/S3, D2 fallback, 500 capture, formatActor. |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.ts` | NUEVO | `getAuditLogs`, `exportCsv`, `getUsers`. `HttpClient` + `withCredentials`. snake_case en wire, camelCase en modelo. |
| `frontend/src/app/features/admin/audit-logs/services/audit-logs.service.spec.ts` | NUEVO | 5 specs con `HttpClientTestingModule`: params, omisión de filtros vacíos, `responseType: 'blob'`, snake_case wire. |
| `frontend/src/app/app.routes.ts` | MODIFICADO | Nueva ruta sibling `audit-logs` con `data.permission = 'READ audit-logs'`, breadcrumb y `permissionGuard`. |
| `frontend/src/app/features/admin/users/users-list/users-list.component.html` | MODIFICADO | `href="#"` → `[routerLink]="['/app/admin/audit-logs']"`. |
| `frontend/openspec/changes/front/2026-09-11-f6-audit-logs-export/tasks.md` | MODIFICADO | Todo `[x]`. |

---

## Desviaciones respecto al `design.md`

### D1 — Endpoint del dropdown de actores: `GET /api/users?limit=100` (no `form-data`)

El design D2 dice:

> "Dropdown via `GET /api/users/form-data` (existing endpoint),
> fallback to UUID text input on 403".

El endpoint `GET /api/users/form-data` actual
(`backend/src/modules/users/users.controller.ts:46` →
`FormDataResponseDto` en `backend/src/modules/users/dto/form-data-response.dto.ts`)
**sólo devuelve** `{roles: [{id, name}], organizations: [{id, name}]}` —
**no** trae usuarios con `{first_name, last_name}`. El shape slim que
el dropdown necesita no existe en `form-data`.

**Decisión del builder**: usar `GET /api/users?limit=100` en su lugar.
Este endpoint ya existe (`users.controller.ts:125`) y devuelve
`{items: UserEntity[], total: number}` con `first_name` /
`last_name` que el `map` del service proyecta a
`{id, firstName, lastName}`.

El fallback UUID (D2) sigue activo: si el actor actual no tiene
`READ users`, el back devuelve 403 y el componente degrada al
`<input type="text">` UUID.

**Por qué no agregué `users` al shape de `form-data`**: extender
el back `FormDataResponseDto` queda fuera del alcance del change
de front (regla: "NO parchees en el frontend un defecto del
backend. Documentalo en apply-progress.md y escalá"). Si querés
que el dropdown use `form-data` puro, hay que abrir un change de
back que agregue `users: [{id, first_name, last_name}]` al DTO.

### D2 — Filtros iniciales vacíos vs `{}`

El componente inicializa `filters` con
`{dateFrom: '', dateTo: '', actorId: ''}` (strings vacíos) en
lugar de un objeto `{}`. Esto es para que los `<input>` y
`<select>` del template tengan un valor two-way bound consistente
con `[(ngModel)]`. El `toParams()` del service ya omite los
vacíos, así que la wire queda limpia.

Esta desviación no afecta el contrato — los specs verifican que
el request sale sin `date_from`/`date_to`/`actor_id` cuando están
vacíos.

---

## Contradicciones encontradas

### C1 — `proposal.md` vs `design.md` en `data.permission`

El `proposal.md` (líneas 40-52) define la ruta sin
`data.permission`:

```ts
{
  path: 'audit-logs',
  data: { breadcrumb: 'Auditoría de Acceso' },
  canActivate: [permissionGuard],
  ...
}
```

Y aclara:

> `permissionGuard` debe leer `data.permission = 'READ audit-logs'`
> si la data no se pasa vía route data. Verify guard implementation.

El `design.md` (líneas 137-145) ya incluye `permission` en `data`:

```ts
{
  path: 'audit-logs',
  data: { breadcrumb: 'Auditoría de Acceso', permission: 'READ audit-logs' },
  ...
}
```

**Resolución**: tomé la versión del design (más explícita y
alineada con el resto de las rutas admin — ver `app.routes.ts`
para `organizations/new`, `categories/new`, etc., que sí
declaran `data.permission`). El `permissionGuard`
(`permission.guard.ts:26`) lee `route.data['permission']` — la
ruta matchea sin más cambios.

### C2 — `design.md` declara `actor_name` por `LEFT JOIN users` — ya está en el wire back

No es contradicción; es confirmación. El back devuelve
`actor_name` en cada item (D4 del design back →
`backend/src/modules/audit/audit.service.ts:list()` con LEFT
JOIN users). El frontend lee `item.actor_name` directamente del
modelo. Cuando el user fue borrado, `actor_name` viene `null` y
el template muestra `—`.

---

## Validación corrida

| Gate | Comando | Resultado |
|---|---|---|
| Tests del change | `rtk jest --testPathPatterns='audit-logs'` | **21 / 21 PASS** (5 service + 16 component) |
| Full test suite | `rtk pnpm test` | 572 / 574 PASS — los 2 fallos son **pre-existentes** en `users-list.component.spec.ts:111,123` (esperan `pageSize=25`, código actual usa `10`). No introduje ninguno. |
| Build | `rtk pnpm run build` | exit 0 — chunk `audit-logs-component` = 10.72 kB raw |
| ESLint | `./node_modules/.bin/eslint "src/app/features/admin/audit-logs/**/*.{ts,html}" "src/app/app.routes.ts"` | **0 errors, 0 warnings** |
| Typecheck | `./node_modules/.bin/tsc -b --noEmit` | exit 0 — sin errores en archivos del change |

Smoke manual no se ejecutó: el backend no está desplegado todavía
(la migration 0053 que crea el permiso `READ audit-logs` es del
change back). El guard bloqueará a master hasta que el back
despliegue; eso es esperado y reversible — la ruta simplemente
no carga.

---

## Riesgos / pendientes

1. **Deploy back primero**. La ruta frontend ya está activa y
   linkeada desde `/app/admin/users`; si el back no deployó,
   master verá 403 al click. Documentado en el design y acá.

2. **El dropdown de actores usa `GET /api/users?limit=100`**.
   Esto puede devolver usuarios soft-deleted si el `WHERE` del
   back los incluye (ver `UsersService.list`); si aparecen en el
   dropdown, hay que pedirle al back que excluya inactivos o
   filtrar client-side. Pendiente de validar con datos reales.

3. **Sin dropdown de `action` ni `resource_type`** — diferidos
   per proposal OD-F1/OD-F2.

---

## Spec coverage

| Spec scenario | Test |
|---|---|
| R1-S2: guard bloquea sin permiso | `audit-logs.component.spec.ts: R1-S2` (defensivo — valida el formato `data.permission`) |
| R1-S3: breadcrumb correcto | Cubierto por `breadcrumb.service.ts` — ruta declara `data.breadcrumb = 'Auditoría de Acceso'` |
| R2-S1: tabla renderiza on load | `se crea y llama getAuditLogs({page:1, limit:20}) en ngOnInit` + `renderiza una fila por item` |
| R2-S2: empty state | `R2-S2: muestra empty-state cuando la respuesta viene vacía` |
| R2-S3: paginación navega | `R2-S3: onPageChange recarga con la página nueva` |
| R3-S2: filtro actor | `R3-S2: enviar filtros de actor en la query` |
| R3-S3: filtros combinados | Implícito en `limpiar filtros restaura la vista sin params` (todos los filtros van juntos) |
| R3-S4: filtros resetean page | `R3-S4: aplicar filtros resetea la página a 1` |
| R4-S1/S2: CSV trigger | `R4-S1/R4-S2: onDownloadCsv llama exportCsv con filtros activos y dispara URL.createObjectURL` |
| R4-S3: blob, no window.open | `R4-S3: NO usa window.open para descargar el CSV` |
| R5-S1/R5-S2: card navega | Manual: el cambio `href="#" → routerLink` se hizo en `users-list.component.html:151` |

---

**Listo para auditoría (`sdd-verify`)**.
