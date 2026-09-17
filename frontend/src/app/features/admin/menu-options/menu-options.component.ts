import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MenuOptionService, MenuOption, RoleMatrix, ApiEndpointEntity } from '../../../core/services/menu-option.service';
import { MenuTreeComponent } from './components/menu-tree/menu-tree.component';
import { RoleMatrixComponent } from './components/role-matrix/role-matrix.component';
import { EndpointPickerComponent } from './components/endpoint-picker/endpoint-picker.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';

/**
 * MenuOptionsComponent (F5.6.2) — admin screen for dynamic menu management.
 * Layout: tree on the left, detail form on the right (mock 05-01).
 *
 * Routes: /app/admin/controles (lazy-loaded).
 */
@Component({
  selector: 'app-menu-options',
  standalone: true,
  imports: [
    CommonModule,
    UiPageHeaderComponent,
    UiIconComponent,
    UiCardComponent,
    MenuTreeComponent,
    RoleMatrixComponent,
    EndpointPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu-options.component.html',
  styleUrl: './menu-options.component.css',
})
export class MenuOptionsComponent implements OnInit {
  private readonly menuOptionService = inject(MenuOptionService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly allOptions = signal<MenuOption[]>([]);
  readonly selectedOptionId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly saving = signal(false);
  readonly roleMatrix = signal<RoleMatrix | null>(null);
  readonly allEndpoints = signal<ApiEndpointEntity[]>([]);
  readonly assignedEndpoints = signal<ApiEndpointEntity[]>([]);

  // Form state
  readonly editingName = signal('');
  readonly editingRoute = signal('');
  readonly editingIcon = signal('');
  readonly editingOrder = signal(0);
  readonly editingParentId = signal<string | null>(null);
  readonly formParentId = signal<string | null>(null);

  /** Options that can be selected as parent (excluding self to prevent cycles). */
  readonly parentOptions = signal<MenuOption[]>([]);

  /**
   * sc-334 admin-controles-enhancements Phase 6 (D4/R4) — suggested
   * display_order for the next menu option:
   *   - Parent menus (parent_id === null): +10 increment (10, 20, 30…)
   *   - Sub-menus (parent_id !== null): +1 increment (1, 2, 3…)
   * Reflects the existing display_order convention in the seed data.
   * Returns null when no siblings exist yet (so the template can show
   * a different empty state) — actually returns the increment of 0
   * for simplicity.
   */
  readonly nextOrder = computed<number>(() => {
    const parentId = this.editingParentId();
    const increment = parentId === null ? 10 : 1;
    const siblings = this.allOptions().filter((o) => o.parent_id === parentId);
    if (siblings.length === 0) {
      return increment; // first entry: 10 for root, 1 for child
    }
    const maxOrder = siblings.reduce(
      (max, child) => Math.max(max, child.display_order),
      -Infinity,
    );
    return maxOrder + increment;
  });

  ngOnInit(): void {
    this.loadOptions();
    this.loadEndpointCatalog();
  }

  loadOptions(): void {
    this.menuOptionService.findAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => this.allOptions.set(options),
        error: () => this.toast.error('Error al cargar las opciones de menú.', 'Error'),
      });
  }

  loadEndpointCatalog(): void {
    this.menuOptionService.getEndpointCatalog({ page: 1, limit: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.allEndpoints.set(result.data),
        error: () => this.toast.error('Error al cargar el catálogo de endpoints.', 'Error'),
      });
  }

  onTreeSelect(optionId: string): void {
    this.selectedOptionId.set(optionId);
    this.isCreating.set(false);
    this.loadOptionDetail(optionId);
  }

  onTreeCreate(parentId: string | null): void {
    this.isCreating.set(true);
    this.selectedOptionId.set(null);
    this.formParentId.set(parentId);
    this.editingParentId.set(parentId);
    
    // Find parent to prefill route prefix
    const parent = parentId ? this.allOptions().find(o => o.id === parentId) : null;
    let prefilledRoute = '';
    if (parent && parent.route) {
      prefilledRoute = parent.route.endsWith('/') ? parent.route : parent.route + '/';
    }
    
    // Calculate next order via the nextOrder computed (Phase 6: +10 for root, +1 for children).
    this.editingName.set('');
    this.editingRoute.set(prefilledRoute);
    this.editingIcon.set('');
    this.editingOrder.set(this.nextOrder());
    
    this.roleMatrix.set(null);
    this.assignedEndpoints.set([]);
    // Parent options exclude the current option (none yet in create mode)
    this.parentOptions.set(this.allOptions());
  }

  onBackToList(): void {
    this.selectedOptionId.set(null);
    this.isCreating.set(false);
    this.roleMatrix.set(null);
    this.assignedEndpoints.set([]);
  }

  onParentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.editingParentId.set(value || null);
  }

  saveOption(): void {
    const name = this.editingName().trim();
    if (!name) {
      this.toast.error('El nombre es obligatorio.', 'Validación');
      return;
    }

    this.saving.set(true);
    const payload = {
      name,
      route: this.editingRoute(),
      icon: this.editingIcon() || undefined,
      parentId: this.editingParentId(),
      displayOrder: this.editingOrder(),
    };

    const request$ = this.isCreating()
      ? this.menuOptionService.create(payload)
      : this.menuOptionService.update(this.selectedOptionId()!, payload);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(
            this.isCreating() ? 'Opción creada.' : 'Opción actualizada.',
            'Éxito',
          );
          this.saving.set(false);
          this.loadOptions();
          this.onBackToList();
        },
        error: (err: { status?: number }) => {
          this.saving.set(false);
          if (err?.status === 409) {
            this.toast.error('Ya existe una opción con esa ruta.', 'Conflicto');
          } else if (err?.status === 422) {
            this.toast.error('Datos inválidos. Verifica el formulario.', 'Validación');
          } else {
            this.toast.error('Error al guardar. Inténtalo de nuevo.', 'Error');
          }
        },
      });
  }

  deleteOption(): void {
    const id = this.selectedOptionId();
    const option = id ? this.allOptions().find((o) => o.id === id) : null;
    if (!id || !option) return;

    // sc-334 admin-controles-enhancements Phase 5 (D5/R5) — confirm before
    // destructive delete. Same ConfirmDialogService pattern as
    // LocationListComponent and RolesService.
    this.confirmDialog
      .confirm({
        title: 'Eliminar opción de menú',
        message: `¿Eliminar "${option.name}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        isDanger: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.saving.set(true);
        this.menuOptionService
          .delete(id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success('Opción eliminada.', 'Éxito');
              this.saving.set(false);
              this.loadOptions();
              this.onBackToList();
            },
            error: (err: { status?: number }) => {
              this.saving.set(false);
              if (err?.status === 409) {
                this.toast.error('No se puede eliminar: tiene submenús. Elimínalos primero.', 'Conflicto');
              } else {
                this.toast.error('Error al eliminar. Inténtalo de nuevo.', 'Error');
              }
            },
          });
      });
  }

  onRoleAccessChange(event: { roleId: string; canRead: boolean; canWrite: boolean }): void {
    const optionId = this.selectedOptionId();
    if (!optionId) return;

    this.menuOptionService.setRoleAccess(optionId, event.roleId, {
      canRead: event.canRead,
      canWrite: event.canWrite,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Acceso actualizado.', 'Éxito');
          this.loadRoleMatrix(optionId);
        },
        error: () => this.toast.error('Error al actualizar acceso.', 'Error'),
      });
  }

  onEndpointsChange(endpointIds: string[]): void {
    const optionId = this.selectedOptionId();
    if (!optionId) return;

    this.menuOptionService.assignEndpoints(optionId, { endpointIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Endpoints actualizados.', 'Éxito');
          this.loadAssignedEndpoints(optionId);
        },
        error: () => this.toast.error('Error al actualizar endpoints.', 'Error'),
      });
  }

  private loadOptionDetail(id: string): void {
    this.menuOptionService.findOne(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (option) => {
          if (this.selectedOptionId() !== id || this.isCreating()) return;
          this.editingName.set(option.name);
          this.editingRoute.set(option.route);
          this.editingIcon.set(option.icon ?? '');
          this.editingOrder.set(option.display_order);
          this.editingParentId.set(option.parent_id);
          // Parent options: all except self (prevent self-parent)
          this.parentOptions.set(this.allOptions().filter((o) => o.id !== id));
          this.loadRoleMatrix(id);
          this.loadAssignedEndpoints(id);
        },
        error: () => this.toast.error('Error al cargar el detalle.', 'Error'),
      });
  }

  private loadRoleMatrix(optionId: string): void {
    this.menuOptionService.getRoleMatrix(optionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (matrix) => {
          if (this.selectedOptionId() !== optionId || this.isCreating()) return;
          this.roleMatrix.set(matrix);
        },
        error: () => this.toast.error('Error al cargar la matriz de roles.', 'Error'),
      });
  }

  private loadAssignedEndpoints(optionId: string): void {
    // sc-334 admin-controles-enhancements Phase 5 (D7/R1) — backend
    // Phase 1 added GET /menu-options/:id/endpoints. Frontend Phase 2
    // wired the service method. Now we actually call it.
    this.menuOptionService
      .getAssignedEndpoints(optionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (endpoints) => {
          if (this.selectedOptionId() !== optionId || this.isCreating()) return;
          this.assignedEndpoints.set(endpoints);
        },
        error: () => this.toast.error('Error al cargar endpoints asignados.', 'Error'),
      });
  }
}
