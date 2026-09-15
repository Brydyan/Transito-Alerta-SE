# Design: GET /api/roles/stats

---

## Decisions

### D1: Cálculo on-the-fly, sin cache

**Decisión**: 3 queries simples a `roles` y `users`, todo en
memoria, sin cache Redis ni tabla materializada.

```typescript
async getStats(): Promise<RoleStatsDto> {
  const roles = await this.roleRepo.find({
    where: { deletedAt: IsNull() },
    select: ['id', 'permissions'],
  });

  const allPerms = new Set<string>();
  const modules = new Set<string>();
  for (const role of roles) {
    for (const perm of role.permissions ?? []) {
      allPerms.add(perm);
      const parts = perm.split(' ');
      if (parts.length === 2) {
        modules.add(parts[1]);
      }
    }
  }

  const assignedUsers = await this.userRepo.count({
    where: { roleId: Not(IsNull()), deletedAt: IsNull() },
  });

  return {
    totalPermissions: allPerms.size,
    protectedModules: modules.size,
    assignedUsers,
  };
}
```

**Por qué**:

- 3 queries en una pantalla que lista 5-50 roles: el costo es
  despreciable (< 50ms típico).
- Stats cambian con cada asignación de rol / sync de
  permissions, así que el cache tendría TTL corto (< 1 min) y
  riesgo de mostrar datos stale.
- Sin cache evitamos un punto más de invalidación (D7 del
  diseño de roles: el `permissionVersion` ya bumpeado en cada
  cambio; otro cache agregaría coordinación).

**Rechazado**: Cache Redis con TTL 60s — innecesario, suma
complejidad.

**Rechazado**: Tabla materializada (`role_stats_snapshot`) —
overkill, requiere cron job.

---

### D2: Permiso `READ` (mismo que listar roles)

**Decisión**: `@RequirePermission('READ')` en el endpoint, igual
que `GET /api/roles` (línea 58 del controller).

**Por qué**: El panel de stats es read-only y complementario a
la lista. Si el actor puede ver roles, puede ver sus stats. No
hay razón para separar el permiso (D7 del design de F6:
"viewing roles is universal for admins").

**Rechazado**: Permiso custom `READ role-stats` — D7 lo veta
explícitamente.

---

### D3: Soft-deleted rows excluidas (T7.2.C4)

**Decisión**: `where: { deletedAt: IsNull() }` en ambas queries.

**Por qué**: Coherente con `findAll()` (línea 127 del
`roles.service.ts`) y con el patrón del módulo desde T7.2. Un
rol soft-deleted sigue existiendo en BD para auditoría pero no
debe contar en stats visibles.

**Rechazado**: Incluir soft-deleted — confunde al usuario y
rompe el contrato de "stats de lo que está activo".

---

### D4: Parsear `"ACTION resource"` con split simple

**Decisión**: `parts[1]` después de split por espacio. Si la
permission no tiene exactamente 2 partes, se ignora para
`protectedModules` (pero igual cuenta para `totalPermissions`).

```typescript
const parts = perm.split(' ');
if (parts.length === 2) {
  modules.add(parts[1]);
}
```

**Por qué**: El shape está fijado por T3.1 desde 0009. El
parser simple es robusto y testeable. Si en el futuro se
agregan resources con espacios (ej. `"READ geo zones"`), se
cambia el parser; hasta entonces, YAGNI.

**Rechazado**: Regex `/^(\S+)\s+(\S+)$/` — más complejo, mismo
resultado.

**Rechazado**: Usar la tabla `permissions` (catálogo) para
mapear resource — acopla con soft-delete del catálogo (T7.2
revela que permissions también pueden soft-deletearse, y el
parser directo del string es independiente de ese estado).

---

### D5: Order de rutas: `@Get('stats')` ANTES de `@Get(':id')`

**Decisión**: Insertar `@Get('stats')` en
`roles.controller.ts` antes de `@Get(':id')` (línea 63).

**Por qué**: Express matchea rutas en orden. Si `:id` va
primero, intenta parsear `"stats"` como UUID y falla con 400
(porque `ParseUUIDPipe` rechaza). El literal `stats` debe ir
primero. Mismo patrón que
`backend/src/modules/incidents/incidents.controller.ts:65-66`
que documenta: *"Route order matters: literal routes (stats,
weekly-stats, feed, export)"*.

**Rechazado**: Sin `ParseUUIDPipe` en `:id` — rompería el
contrato de T5.6 que exige UUID.

---

### D6: DTO mínimo, sin campos calculados extra

**Decisión**: DTO con sólo 3 campos, todos `number` no
negativos.

```typescript
export class RoleStatsDto {
  totalPermissions!: number;
  protectedModules!: number;
  assignedUsers!: number;
}
```

**Por qué**: Mock 04-01 muestra exactamente esas 3. Más
campos serían scope creep.

**Rechazado**: Agregar `rolesCount`, `systemRolesCount`,
`lastSyncAt`, etc. — fuera de scope.

---

## File Changes

| File | Change | Lines |
|------|--------|-------|
| `backend/src/modules/roles/dto/role-stats.dto.ts` | New | +10 |
| `backend/src/modules/roles/roles.service.ts` | Modified | +20 (método `getStats`) |
| `backend/src/modules/roles/roles.controller.ts` | Modified | +5 (endpoint) |
| `backend/src/modules/roles/roles.service.spec.ts` | Modified | +50 (3-4 tests) |

Total: ~85 líneas.

---

## Contracts (TypeScript)

### RoleStatsDto

```typescript
export class RoleStatsDto {
  totalPermissions!: number;   // int >= 0
  protectedModules!: number;   // int >= 0
  assignedUsers!: number;      // int >= 0
}
```

### Service

```typescript
class RolesService {
  // ...existing methods...
  async getStats(): Promise<RoleStatsDto> { ... }
}
```

### Controller

```typescript
@Controller('roles')
export class RolesController {
  // ...existing routes...

  @Get('stats')                              // ← ANTES de @Get(':id')
  @RequirePermission('READ')
  getStats(): Promise<RoleStatsDto> {
    return this.rolesService.getStats();
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(...)
}
```

---

## API Behavior

### GET /api/roles/stats

**Request**:
```
GET /api/roles/stats
Cookie: <session>
```

**Response 200**:
```json
{
  "totalPermissions": 124,
  "protectedModules": 12,
  "assignedUsers": 85
}
```

**Errores**:
- `401` — sin sesión
- `403` — sin `READ` permission

(404 no es posible: la ruta existe.)

---

## Coherence con el codebase

- Mismo patrón de controller que los otros `@Get()` del módulo.
- Mismo `ParseUUIDPipe`-related: ruta literal antes de
  paramétrica (D5).
- Mismo `deletedAt: IsNull()` que `findAll()` (D3).
- Mismo `@RequirePermission('READ')` que `GET /api/roles`.

---

## Out of Scope explícito

- Cache, stats por org, más métricas, drill-down endpoint.
- Migración nueva — los datos están en `roles.permissions`,
  `roles.deletedAt`, `users.roleId`, `users.deletedAt`, todos
  pre-existentes.
- Permiso custom para stats — D2.
- Frontend change chico (restaurar `loadStats()`) va en este
  mismo SDD porque sin él, los 2 tests del frontend siguen
  fallando.
