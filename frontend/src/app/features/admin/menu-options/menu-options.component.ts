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

/**
 * MenuOptionsComponent (F5.6.2) — admin screen for dynamic menu management.
 * Layout: tree on the left, detail form on the right (mock 05-01).
 *
 * Routes: /app/admin/menu-options (lazy-loaded).
 */
@Component({
  selector: 'app-menu-options',
  standalone: true,
  imports: [
    CommonModule,
    MenuTreeComponent,
    RoleMatrixComponent,
    EndpointPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-options h-full flex">
      <!-- Tree panel (left) -->
      <div class="w-72 border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
        <app-menu-tree
          [options]="allOptions()"
          [selectedId]="selectedOptionId()"
          (selected)="onTreeSelect($event)"
          (createRequested)="onTreeCreate($event)"
        />
      </div>

      <!-- Detail panel (right) -->
      <div class="flex-1 p-6 overflow-y-auto">
        @if (!selectedOptionId() && !isCreating()) {
          <div class="flex items-center justify-center h-full text-gray-400">
            <p>Selecciona una opción de menú o crea una nueva</p>
          </div>
        } @else {
          <div class="max-w-2xl">
            <div class="flex items-center gap-3 mb-6">
              <button
                class="text-sm text-blue-600 hover:text-blue-800"
                (click)="onBackToList()"
              >
                ← Volver
              </button>
              <h2 class="text-lg font-semibold text-gray-800">
                {{ isCreating() ? 'Nueva opción de menú' : 'Editar opción de menú' }}
              </h2>
            </div>

            <!-- Detail form (F5.6.4) -->
            <div class="space-y-4 mb-8">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  class="w-full border rounded px-3 py-2 text-sm"
                  [value]="editingName()"
                  (input)="editingName.set($any($event.target).value)"
                  placeholder="Nombre del menú"
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Orden</label>
                  <input
                    type="number"
                    class="w-full border rounded px-3 py-2 text-sm"
                    [value]="editingOrder()"
                    (input)="editingOrder.set($any($event.target).valueAsNumber)"
                    min="0"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Icono</label>
                  <input
                    type="text"
                    class="w-full border rounded px-3 py-2 text-sm"
                    [value]="editingIcon()"
                    (input)="editingIcon.set($any($event.target).value)"
                    placeholder="nombre-icono"
                  />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Ruta</label>
                <input
                  type="text"
                  class="w-full border rounded px-3 py-2 text-sm"
                  [value]="editingRoute()"
                  (input)="editingRoute.set($any($event.target).value)"
                  placeholder="/ruta/del/menu"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Opción padre</label>
                <select
                  class="w-full border rounded px-3 py-2 text-sm"
                  [value]="editingParentId() ?? ''"
                  (change)="onParentChange($event)"
                >
                  <option value="">(Ninguna — nivel raíz)</option>
                  @for (opt of parentOptions(); track opt.id) {
                    <option [value]="opt.id">{{ opt.name }}</option>
                  }
                </select>
              </div>
              <div class="flex gap-3">
                <button
                  class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  [disabled]="saving()"
                  (click)="saveOption()"
                >
                  {{ saving() ? 'Guardando...' : (isCreating() ? 'Crear' : 'Guardar') }}
                </button>
                @if (!isCreating()) {
                  <button
                    class="px-4 py-2 border border-red-300 text-red-600 text-sm rounded hover:bg-red-50 disabled:opacity-50"
                    [disabled]="saving()"
                    (click)="deleteOption()"
                  >
                    Eliminar
                  </button>
                }
              </div>
            </div>

            <!-- Role matrix (F5.6.5) — only when editing existing -->
            @if (!isCreating() && roleMatrix()) {
              <div class="mb-8">
                <h3 class="text-md font-semibold text-gray-800 mb-3">Matriz de Roles</h3>
                <app-role-matrix
                  [matrix]="roleMatrix()!"
                  [saving]="saving()"
                  (accessChange)="onRoleAccessChange($event)"
                />
              </div>
            }

            <!-- Endpoint picker (F5.6.6) — only when editing existing -->
            @if (!isCreating()) {
              <div>
                <h3 class="text-md font-semibold text-gray-800 mb-3">Endpoints Asociados</h3>
                <app-endpoint-picker
                  [availableEndpoints]="allEndpoints()"
                  [assignedEndpoints]="assignedEndpoints()"
                  (assignedChange)="onEndpointsChange($event)"
                />
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
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
