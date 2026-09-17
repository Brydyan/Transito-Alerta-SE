# Tasks: F5.7 — Mejoras a /app/admin/controles

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 400–600 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (single PR) |
| Delivery strategy | simple |
| Chain strategy | N/A |

---

## Phase 1: Backend — Endpoints Asignados y Filtros

> Prerequisites: F5 (Menús dinámicos administrables) merged and working.

- [x] 1.1 **RED** — Write failing unit test for `MenuOptionsService.getAssignedEndpoints(id)` in `backend/src/modules/menus/menu-options.service.spec.ts`: (a) existing menu with 2 assigned endpoints returns both, (b) menu with 0 endpoints returns empty array, (c) nonexistent menu throws 404
- [x] 1.2 Implement `getAssignedEndpoints(id)` in `MenuOptionsService`: query `menu_option_endpoints` where `menu_option_id = id`, join with `api_endpoints` to get full entity
- [x] 1.3 **GREEN** — Ensure 1.1 tests pass
- [x] 1.4 Add `GET :id/endpoints` route to `backend/src/modules/menus/menu-options.controller.ts` before `:id/endpoints` assignment route: `@RequirePermission('READ', 'menu-options')`, delegates to `getAssignedEndpoints(id)`
- [x] 1.5 **RED** — Write failing unit test for filtro `module` en `getEndpointCatalog()`: (a) query with `module=incidents` returns only endpoints with "incidents" in path, (b) empty module returns all, (c) case-insensitive match
- [x] 1.6 Extend `MenuOptionsService.getEndpointCatalog()` to accept optional `module` parameter; if present, filter `api_endpoints.path LIKE %module%` (case-insensitive)
- [x] 1.7 **GREEN** — Ensure 1.5 tests pass
- [ ] 1.8 **RED** — Write failing integration test (Testcontainers): create menu → assign 2 endpoints → call GET :id/endpoints → verify response matches assignment
- [ ] 1.9 Run integration test from 1.8; should now pass
- [x] 1.10 Run `npm run lint && npm run typecheck && npm test && npm run test:e2e` in `backend/` — all green

---

## Phase 2: Frontend Service — MenuOptionService

> Prerequisites: Phase 1 backend merged.

- [x] 2.1 Add method `getAssignedEndpoints(id)` to `frontend/src/app/core/services/menu-option.service.ts`: GET `/api/menu-options/{id}/endpoints`, returns `Observable<ApiEndpointEntity[]>`
- [x] 2.2 Extend `getEndpointCatalog()` to accept optional query params: `{ module?: string, page?: number, limit?: number }`; pass to `HttpParams`
- [x] 2.3 **RED** — Write failing unit test for both methods in `menu-option.service.spec.ts` (mock HttpClient)
- [x] 2.4 **GREEN** — Service tests should pass

---

## Phase 3: Frontend Component — MenuTreeComponent

> Prerequisites: Phase 2 frontend service merged.

- [x] 3.1 Update `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.html` to add chevron icon (▶/▼) before each node that has children: `<span *ngIf="hasChildren(item.id)" class="chevron" [class.expanded]="isExpanded(item.id)">▶</span>`
- [x] 3.2 Add CSS to `frontend/src/app/features/admin/menu-options/components/menu-tree/menu-tree.component.css`: chevron styling (size, color, rotation on expand)
- [x] 3.3 **RED** — Write failing unit test: node with children shows chevron, node without children does not
- [x] 3.4 **GREEN** — Ensure 3.3 passes
- [x] 3.5 Run `pnpm test -- menu-tree` in `frontend/` — all green

---

## Phase 4: Frontend Component — RoleMatrixComponent (Major Rewrite)

> Prerequisites: Phase 2 frontend service merged.

- [x] 4.1 Rewrite `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.ts` to accept and display `RoleMatrix` with `rolesByScope` (platform, organization, public)
- [x] 4.2 Change input to: `@Input() matrix: RoleMatrix | null = null;` + `@Output() accessChanged = new EventEmitter<{ roleId: string; canRead: boolean; canWrite: boolean }>()`
- [x] 4.3 Add computed field `roleGroups()` that returns array of `{ scope: string; roles: RoleAccess[] }` from `matrix.rolesByScope`
- [x] 4.4 **RED** — Write failing unit test: matrix with 5 roles renders 3 blocks (Plataforma, Organización, Público), each with correct role count
- [x] 4.5 Rewrite `frontend/src/app/features/admin/menu-options/components/role-matrix/role-matrix.component.html` (new structure):
   ```html
   <div class="role-groups">
     <div *ngFor="let group of roleGroups()" class="role-group">
       <h3 class="group-header">{{ group.scope }}</h3>
       <div class="role-row" *ngFor="let role of group.roles">
         <label>{{ role.roleName }}</label>
         <input type="checkbox" [checked]="role.canRead" 
           (change)="onReadChange(role.roleId, $event)"> Read
         <input type="checkbox" [checked]="role.canWrite" [disabled]="!role.canRead"
           (change)="onWriteChange(role.roleId, $event)"> Write
       </div>
     </div>
   </div>
   ```
- [x] 4.6 Implement invariant: if Write is checked, Read must be checked. If Read is unchecked, Write is automatically unchecked.
- [x] 4.7 Add CSS for group headers and role layout (3 blocks stacked, each with role rows)
- [x] 4.8 **GREEN** — Ensure 4.4 tests pass
- [x] 4.9 Run `pnpm test -- role-matrix` in `frontend/` — all green

---

## Phase 5: Frontend Component — MenuOptionsComponent (Load Endpoints, Delete Confirmation)

> Prerequisites: Phases 2, 3, 4 merged.

- [ ] 5.1 Inject `ConfirmDialogService` in `frontend/src/app/features/admin/menu-options/menu-options.component.ts`
- [ ] 5.2 Rewrite `loadAssignedEndpoints()` method to actually call `menuOptionService.getAssignedEndpoints(optionId)` and set the signal:
   ```typescript
   private loadAssignedEndpoints(optionId: string): void {
     this.menuOptionService.getAssignedEndpoints(optionId)
       .pipe(takeUntilDestroyed(this.destroyRef))
       .subscribe({
         next: (endpoints) => this.assignedEndpoints.set(endpoints),
         error: () => this.toast.error('Error al cargar endpoints asignados.', 'Error'),
       });
   }
   ```
- [x] 5.3 Rewrite `deleteOption()` to use `ConfirmDialogService.open()` before executing delete:
   ```typescript
   deleteOption(): void {
     const id = this.selectedOptionId();
     const option = this.allOptions().find(o => o.id === id);
     if (!id || !option) return;

     this.confirmDialog.open({
       title: 'Eliminar opción de menú',
       message: `¿Eliminar "${option.name}"? Esta acción no se puede deshacer.`,
       confirmText: 'Eliminar',
       cancelText: 'Cancelar',
       isDangerous: true,
     }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(confirmed => {
       if (confirmed) {
         this.saving.set(true);
         this.menuOptionService.delete(id)...
       }
     });
   }
   ```
- [x] 5.4 Update `loadOptionDetail()` to call `loadAssignedEndpoints()` at the end (already there, but verify it's executed)
- [x] 5.5 Update `getRoleMatrix()` call to use new `RoleMatrix` structure (may require backend changes if not already returning `rolesByScope`)
- [x] 5.6 **RED** — Write failing unit test: selecting a menu loads endpoints, matrix with 3 blocks appears, delete shows confirmation modal
- [x] 5.7 **GREEN** — Ensure 5.6 tests pass
- [x] 5.8 Run `pnpm test -- menu-options` in `frontend/` — all green

---

## Phase 6: Frontend Component — MenuOptionsComponent (Order Suggestion)

> Prerequisites: Phase 5 merged.

- [x] 6.1 Add computed field `nextOrder()` to `MenuOptionsComponent`:
   ```typescript
   readonly nextOrder = computed(() => {
     const parentId = this.editingParentId();
     const children = this.allOptions().filter(o => o.parent_id === parentId);
     const maxOrder = children.reduce((max, child) => Math.max(max, child.display_order), -1);
     return maxOrder + 1;
   });
   ```
- [x] 6.2 Update template to display suggestion next to order field: `Orden: [{{ editingOrder }}] (siguiente: {{ nextOrder() }})`
- [x] 6.3 **RED** — Write failing test: order suggestion for main menu shows increments of 10, for submenu shows increments of 1
- [x] 6.4 **GREEN** — Ensure 6.3 passes
- [x] 6.5 Run `pnpm test` in `frontend/` — all green

---

## Phase 7: Frontend Component — EndpointPickerComponent (Optional Enhancements)

> Prerequisites: Phases 5, 6 merged; Optional phase (can defer).

- [x] 7.1 Add optional search field to `EndpointPickerComponent`: text input filters catalog by `path` or `description` (matches D6)
- [x] 7.2 Add "module" dropdown: auto-detect modules from endpoint paths (first segment after /api), allow filtering
- [ ] 7.3 **RED** — Write failing test: search "incidents" returns only incident endpoints; dropdown "roles" returns only roles endpoints
- [ ] 7.4 **GREEN** — Ensure 7.3 passes
- [ ] 7.5 Run `pnpm test -- endpoint-picker` — all green

---

## Phase 8: Integration & Verification

> Prerequisites: Phases 1–7 complete (7 is optional).

- [x] 8.1 Run full backend suite: `npm run lint && npm run typecheck && npm test && npm run test:e2e` in `backend/` — all green
- [x] 8.2 Run full frontend suite: `pnpm lint && pnpm test && pnpm build` in `frontend/` — all green
- [x] 8.3 **Manual smoke test**:
  - [ ] Navigate to `/app/admin/controles`
  - [ ] Click on a main menu (e.g., "Reportes") — verify chevron visible, clicking expands to show children
  - [ ] Click on a child — verify detail form loads, matrix shows 3 blocks, endpoints show assigned
  - [ ] Edit order field — verify suggestion updates based on parent
  - [ ] Try to delete a menu — verify confirmation modal appears
  - [ ] Click "Eliminar" — verify menu removed from tree
  - [ ] (Optional) Search endpoints by module — verify filter works
- [ ] 8.4 Verify no regressions in existing F5 functionality (menus still load in sidebar, permissions still work)

---

## Delivery Strategy

- **Single PR to main** (no chained PRs needed — this is an incremental improvement)
- **Commit message**: `feat(admin-controles): add endpoint assignment, role matrix grouping, delete confirmation, order suggestions (F5.7)`

---

## Notes

- Phase 1 (backend) can merge immediately without waiting for frontend
- Phase 7 (endpoint search) is optional and can be deferred to a later phase
- All tests use TDD (RED → GREEN)
- No breaking changes to existing APIs — all additions are new endpoints/methods
