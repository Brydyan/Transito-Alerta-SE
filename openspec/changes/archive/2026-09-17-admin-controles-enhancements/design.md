# Design: F5.7 — Mejoras a /app/admin/controles

## Technical Approach

Mejoras incrementales a la pantalla F5.6 sin reescritura. Se agregan backend para endpoints asignados, se mejora frontend en presentación y validación.

## Architecture Decisions

### D1 — Nuevo endpoint `GET /menu-options/:id/endpoints`

Actualmente falta un endpoint para obtener los endpoints **asignados** a una opción de menú.

**Decisión**: Crear `GET /menu-options/:id/endpoints` que retorne la lista de `ApiEndpointEntity` asociadas vía `MenuOptionEndpointEntity`.

```typescript
@Get(':id/endpoints')
@RequirePermission('READ', 'menu-options')
getAssignedEndpoints(
  @Param('id', new ParseUUIDPipe()) id: string,
): Promise<ApiEndpointEntity[]> {
  return this.menuOptionsService.getAssignedEndpoints(id);
}
```

**Ventaja**: El panel de endpoints en el frontend puede hidratar correctamente la lista de asignados al seleccionar un menú.

**Alternativa rechazada**: Incluir endpoints en la respuesta de `findOne()` — violaría el principio de responsabilidad única y cada GET sería más pesado.

### D2 — Matriz de roles agrupada por ámbito (`platform`, `organization`, `public`)

**Decisión**: El `RoleMatrixComponent` agrupa roles por `roles.scope` en tres bloques visuales:
1. **Plataforma**: `master`, `operador_sistema`
2. **Organización**: `admin_org`, `operador_org`
3. **Público**: `reporter`

Cada bloque muestra una matriz de checkboxes para `can_read` y `can_write` por rol.

**Presentación**:
```
┌─────────────────────────────────────────┐
│ PERMISOS POR ROL                        │
├─────────────────────────────────────────┤
│ 🔷 PLATAFORMA                           │
│   ☐ Master          [Read] [Write]     │
│   ☐ Operador Sist.  [Read] [Write]     │
│                                         │
│ 🔶 ORGANIZACIÓN                         │
│   ☐ Admin Org       [Read] [Write]     │
│   ☐ Operador Org    [Read] [Write]     │
│                                         │
│ 🟡 PÚBLICO                              │
│   ☐ Reporter        [Read] [Write]     │
└─────────────────────────────────────────┘
```

**Invariante**: Un rol sin lectura no puede tener escritura (validación en backend y frontend).

### D3 — Indicadores visuales en el árbol

**Decisión**: Agregar iconos chevron (`>` / `v`) a nodos con hijos. El color/estilo indica estado de expansión.

Implementación en template:
```html
<span *ngIf="hasChildren(item.id)" class="chevron" [class.expanded]="isExpanded(item.id)">
  ▶
</span>
```

**Ventaja**: Claridad inmediata sobre jerarquía sin necesidad de probar expandir cada nodo.

### D4 — Estrategia de orden (`display_order`)

**Decisión**: Mostrar recomendación de orden basada en jerarquía:
- **Menús principales** (parent_id = null): incrementos de 10 (10, 20, 30...)
- **Sub-menús** (parent_id ≠ null): incrementos de 1 (1, 2, 3...)

Cuando se crea un nuevo menú, el frontend calcula automáticamente:
```typescript
const children = this.allOptions().filter(o => o.parent_id === parentId);
const maxOrder = children.reduce((max, child) => Math.max(max, child.display_order), -1);
this.editingOrder.set(maxOrder + 1);
```

Mostrar en el formulario: `Orden: [_____] (siguiente: 21)` si es padre, o `Orden: [_____] (siguiente: 4)` si es hijo.

### D5 — Modal de confirmación para borrado

**Decisión**: Usar el `ConfirmDialogService` existente (patrón usado en roles) antes de ejecutar delete.

```typescript
deleteOption(): void {
  const option = this.selectedOption();
  if (!option) return;

  this.confirmDialog.open({
    title: 'Eliminar opción de menú',
    message: `¿Eliminar "${option.name}"? Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    isDangerous: true,
  }).subscribe(confirmed => {
    if (confirmed) {
      // execute delete
    }
  });
}
```

### D6 — Filtro de endpoints por módulo

**Decisión**: Agregar parámetro de búsqueda `module` al endpoint `GET /menu-options/endpoints`.

```typescript
@Get('endpoints')
@RequirePermission('READ', 'menu-options')
getEndpointCatalog(
  @Query('module') module?: string,  // ← Nuevo: filtra por prefijo de ruta ej. 'incidents', 'roles'
  @Query('page') page?: string,
  @Query('limit') limit?: string,
): Promise<PaginatedResult<ApiEndpointEntity>> {
  return this.menuOptionsService.getEndpointCatalog({ module, page, limit });
}
```

Implementación en service:
```typescript
if (module) {
  query = query.where(`api_endpoint.path LIKE :module`, { module: `/%${module}%` });
}
```

En frontend, el `EndpointPickerComponent` puede ofrecer un dropdown de módulos detectados (primeras palabras después de `/api/`) o un campo de búsqueda libre.

### D7 — Hidratación del panel de endpoints asignados

**Decisión**: Cuando se selecciona una opción de menú en el árbol, llamar secuencialmente:

1. `GET /menu-options/:id` — cargar detalle
2. `GET /menu-options/:id/roles` — cargar matriz
3. **`GET /menu-options/:id/endpoints`** — cargar asignados (NUEVA, D1)

En `menu-options.component.ts`:

```typescript
private loadAssignedEndpoints(optionId: string): void {
  this.menuOptionService.getAssignedEndpoints(optionId)
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (endpoints) => this.assignedEndpoints.set(endpoints),
      error: () => this.toast.error('Error al cargar endpoints asignados.'),
    });
}
```

## Backend Changes

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `backend/src/modules/menus/menu-options.controller.ts` | Modificar | Agregar endpoint `GET :id/endpoints` |
| `backend/src/modules/menus/menu-options.service.ts` | Modificar | Agregar método `getAssignedEndpoints(id)` y filtro `module` en catálogo |
| `backend/src/modules/menus/menu-options.repository.ts` | Modificar | Agregar query para obtener endpoints asignados |

## Frontend Changes

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `frontend/src/app/features/admin/menu-options/menu-options.component.ts` | Modificar | Mejorar `loadAssignedEndpoints()` para llamar nuevo endpoint; agregar `ConfirmDialogService` |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts` | Reescribir | Agrupar roles por `scope`, mejorar presentación visual |
| `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.html` | Reescribir | Template con 3 bloques por ámbito, indicadores [Read]/[Write] |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.html` | Modificar | Agregar chevrones visuales a nodos con hijos |
| `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.css` | Modificar | Estilos para chevrones expandibles |
| `frontend/src/app/core/services/menu-option.service.ts` | Modificar | Agregar método `getAssignedEndpoints(id)` |

## Data Flow

**Lectura de detalles de menú** (seleccionar nodo):

```
Seleccionar en árbol
  │
  ├─→ GET /menu-options/:id (detalle)
  │
  ├─→ GET /menu-options/:id/roles (matriz)
  │
  └─→ GET /menu-options/:id/endpoints (asignados) [NUEVA D1]
       │
       └─→ Hidratar panel de endpoints con asignados
```

**Catálogo de endpoints** (opcional):

```
GET /menu-options/endpoints?module=incidents&page=1&limit=20
  │
  └─→ Retorna endpoints que incluyan 'incidents' en la ruta
```

## Testing Strategy

### Backend

- **Unit tests** para `getAssignedEndpoints()` — mock repository
- **Unit tests** para filtro de módulo en catálogo
- **Integration tests** — crear menú, asignar endpoints, verificar GET :id/endpoints retorna lista correcta

### Frontend

- **Unit tests** para `RoleMatrixComponent` — renderiza 3 bloques por scope
- **Unit tests** para `MenuTreeComponent` — chevrones visibles en nodos con hijos
- **Unit tests** para `ConfirmDialogService` integration — delete solicita confirmación
- **Component tests** para `MenuOptionsComponent.loadAssignedEndpoints()` — hidrata correctamente
- **Manual smoke**: crear menú → asignar endpoints → seleccionar → verificar endpoints cargados en panel

## Open Questions

- **Q1** — ¿Mostrar todos los endpoints del catálogo en el panel, o filtrar por módulo automáticamente? → Decisión: mostrar todos, permitir búsqueda por módulo (D6)
- **Q2** — ¿Permitir que un menú tenga 0 endpoints asignados? → Sí, es válido (información administrativa)

## Implementation Notes

### F5.7.1 — Cache invalidation

El nuevo endpoint `GET /menu-options/:id/endpoints` **no requiere caché** porque:
1. Se llama solo cuando el usuario selecciona un menú (no en cada página)
2. Los endpoints no se modifican con frecuencia (catálogo estable)
3. Si se asignan/desasignan, la llamada es inmediatamente después (datos frescos)

Se respeta D4 de F5: escribir sobre `menu_option_endpoints` invalida `menu:v1:*` completo (caché de resolución).

### F5.7.2 — Validación de lectura/escritura

Frontend y backend validan:
- `canRead: true, canWrite: true` → OK
- `canRead: true, canWrite: false` → OK
- `canRead: false, canWrite: false` → OK
- `canRead: false, canWrite: true` → **ERROR 422** — "lectura requerida para escritura"

Este invariante se mantiene en el frontend (checkboxes coordinados) y en el backend (validación en `setRoleAccess()`).
