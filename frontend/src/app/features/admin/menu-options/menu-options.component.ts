import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MenuOptionService, MenuOption, RoleMatrix } from '../../../core/services/menu-option.service';
import { MenuTreeComponent } from './components/menu-tree/menu-tree.component';
import { RoleMatrixComponent } from './components/role-matrix/role-matrix.component';
import { EndpointPickerComponent } from './components/endpoint-picker/endpoint-picker.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

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
    MenuTreeComponent,
    RoleMatrixComponent,
    EndpointPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu-options.component.html',
})
export class MenuOptionsComponent implements OnInit {
  private readonly menuOptionService = inject(MenuOptionService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly allOptions = signal<MenuOption[]>([]);
  readonly selectedOptionId = signal<string | null>(null);
  readonly isCreating = signal(false);
  readonly saving = signal(false);
  readonly roleMatrix = signal<RoleMatrix | null>(null);
  readonly allEndpoints = signal<{ id: string; method: string; path: string; description: string }[]>([]);
  readonly assignedEndpoints = signal<{ id: string; method: string; path: string; description: string }[]>([]);

  // Form state
  readonly editingName = signal('');
  readonly editingRoute = signal('');
  readonly editingIcon = signal('');
  readonly editingOrder = signal(0);
  readonly editingParentId = signal<string | null>(null);
  readonly formParentId = signal<string | null>(null);

  /** Options that can be selected as parent (excluding self to prevent cycles). */
  readonly parentOptions = signal<MenuOption[]>([]);

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
    this.editingName.set('');
    this.editingRoute.set('');
    this.editingIcon.set('');
    this.editingOrder.set(0);
    this.editingParentId.set(parentId);
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
    if (!id) return;

    this.saving.set(true);
    this.menuOptionService.delete(id)
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
        next: (matrix) => this.roleMatrix.set(matrix),
        error: () => this.toast.error('Error al cargar la matriz de roles.', 'Error'),
      });
  }

  private loadAssignedEndpoints(optionId: string): void {
    // The backend doesn't have a separate endpoint for assigned endpoints.
    // The MenuOption entity has endpoints via the menu_option_endpoints junction.
    // We'll get them from the findOne response (if populated) or from the assign response.
    // For now, we rely on the catalog filter: endpoints in the catalog that are
    // assigned will be in the assignedEndpoints signal.
    // TODO: backend needs GET /menu-options/:id/endpoints — for now clear on re-select
    this.assignedEndpoints.set([]);
  }
}
