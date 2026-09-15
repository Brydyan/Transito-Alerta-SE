import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface EndpointItem {
  id: string;
  method: string;
  path: string;
  description: string;
}

/**
 * EndpointPickerComponent (F5.6.6) — dual-panel picker for associating
 * API endpoints with a menu option.
 *
 * Left panel: available endpoints (excluding already assigned).
 * Right panel: assigned endpoints.
 * Both panels have search, transfer buttons, and selected count.
 */
@Component({
  selector: 'app-endpoint-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="endpoint-picker grid grid-cols-2 gap-4">
      <!-- Available panel -->
      <div class="panel border rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-gray-600">Disponibles</h4>
          <span class="text-xs text-gray-400">{{ filteredAvailable().length }}</span>
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          [ngModel]="availableSearch()"
          (ngModelChange)="availableSearch.set($event)"
          class="w-full text-sm border rounded px-2 py-1 mb-2"
        />
        <ul class="space-y-1 max-h-60 overflow-y-auto">
          @for (ep of filteredAvailable(); track ep.id) {
            <li
              class="flex items-center gap-2 text-sm p-1 rounded hover:bg-gray-50 cursor-pointer"
              (click)="moveToAssigned(ep.id)"
            >
              <span class="text-xs font-mono px-1 rounded"
                [class.bg-green-100]="ep.method === 'GET'"
                [class.bg-blue-100]="ep.method === 'POST'"
                [class.bg-yellow-100]="ep.method === 'PUT' || ep.method === 'PATCH'"
                [class.bg-red-100]="ep.method === 'DELETE'"
              >{{ ep.method }}</span>
              <span class="truncate flex-1">{{ ep.path }}</span>
              <span class="text-xs text-gray-400">→</span>
            </li>
          }
        </ul>
      </div>

      <!-- Assigned panel -->
      <div class="panel border rounded-lg p-3">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-gray-600">Asignados</h4>
          <span class="text-xs text-gray-400">{{ assignedCount() }}</span>
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          [ngModel]="assignedSearch()"
          (ngModelChange)="assignedSearch.set($event)"
          class="w-full text-sm border rounded px-2 py-1 mb-2"
        />
        <ul class="space-y-1 max-h-60 overflow-y-auto">
          @for (ep of filteredAssigned(); track ep.id) {
            <li
              class="flex items-center gap-2 text-sm p-1 rounded hover:bg-gray-50 cursor-pointer"
              (click)="moveToAvailable(ep.id)"
            >
              <span class="text-xs text-gray-400">←</span>
              <span class="text-xs font-mono px-1 rounded"
                [class.bg-green-100]="ep.method === 'GET'"
                [class.bg-blue-100]="ep.method === 'POST'"
                [class.bg-yellow-100]="ep.method === 'PUT' || ep.method === 'PATCH'"
                [class.bg-red-100]="ep.method === 'DELETE'"
              >{{ ep.method }}</span>
              <span class="truncate flex-1">{{ ep.path }}</span>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class EndpointPickerComponent {
  /** All endpoints from the catalog. */
  readonly availableEndpoints = input.required<EndpointItem[]>();

  /** Currently assigned endpoint IDs for this menu option. */
  readonly assignedEndpoints = input.required<EndpointItem[]>();

  /** Emits the new list of assigned endpoint IDs. */
  readonly assignedChange = output<string[]>();

  readonly availableSearch = signal('');
  readonly assignedSearch = signal('');

  /** Available endpoints excluding already assigned. */
  readonly filteredAvailable = computed(() => {
    const assignedIds = new Set(this.assignedEndpoints().map((e) => e.id));
    const query = this.availableSearch().toLowerCase();
    return this.availableEndpoints()
      .filter((ep) => !assignedIds.has(ep.id))
      .filter((ep) =>
        !query ||
        ep.path.toLowerCase().includes(query) ||
        ep.method.toLowerCase().includes(query) ||
        ep.description.toLowerCase().includes(query)
      );
  });

  /** Assigned endpoints, filtered by search. */
  readonly filteredAssigned = computed(() => {
    const query = this.assignedSearch().toLowerCase();
    return this.assignedEndpoints().filter((ep) =>
      !query ||
      ep.path.toLowerCase().includes(query) ||
      ep.method.toLowerCase().includes(query) ||
      ep.description.toLowerCase().includes(query)
    );
  });

  /** Count of assigned endpoints. */
  readonly assignedCount = computed(() => this.assignedEndpoints().length);

  /** Move a single endpoint from available to assigned. */
  moveToAssigned(endpointId: string): void {
    const currentIds = this.assignedEndpoints().map((e) => e.id);
    if (currentIds.includes(endpointId)) return;
    this.assignedChange.emit([...currentIds, endpointId]);
  }

  /** Move a single endpoint from assigned to available. */
  moveToAvailable(endpointId: string): void {
    const currentIds = this.assignedEndpoints().map((e) => e.id);
    this.assignedChange.emit(currentIds.filter((id) => id !== endpointId));
  }

  /** Move all filtered available endpoints to assigned. */
  moveAllToAssigned(): void {
    const currentIds = new Set(this.assignedEndpoints().map((e) => e.id));
    const toAdd = this.filteredAvailable().map((e) => e.id);
    this.assignedChange.emit([...currentIds, ...toAdd]);
  }

  /** Move all assigned endpoints to available. */
  moveAllToAvailable(): void {
    this.assignedChange.emit([]);
  }
}
