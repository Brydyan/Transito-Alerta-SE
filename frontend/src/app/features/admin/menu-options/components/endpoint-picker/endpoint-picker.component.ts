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
  templateUrl: './endpoint-picker.component.html',
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

  /**
   * sc-334 admin-controles-enhancements Phase 7 (D6/R6) — module filter
   * applied on top of search. When set, only endpoints whose path
   * matches the selected module are visible. null = no module filter.
   *
   * Modules are auto-detected from the catalog paths (first segment
   * after `/api`), so the dropdown contents are data-driven.
   */
  readonly moduleFilter = signal<string | null>(null);

  /** Unique modules present in the catalog paths. */
  readonly availableModules = computed<string[]>(() => {
    const modules = new Set<string>();
    for (const ep of this.availableEndpoints()) {
      const m = this.extractModule(ep.path);
      if (m) {
        modules.add(m);
      }
    }
    return Array.from(modules).sort();
  });

  /** Extracts the first path segment after `/api/`, e.g.
   * `/api/incidents/123` → `incidents`, `/users/:id` → `users`. */
  private extractModule(path: string): string | null {
    const match = path.match(/^\/?api\/([^/]+)/);
    return match ? match[1] : null;
  }

  /** Available endpoints excluding already assigned. */
  readonly filteredAvailable = computed(() => {
    const assignedIds = new Set(this.assignedEndpoints().map((e) => e.id));
    const query = this.availableSearch().toLowerCase();
    const mod = this.moduleFilter();
    return this.availableEndpoints()
      .filter((ep) => !assignedIds.has(ep.id))
      .filter((ep) =>
        !query ||
        ep.path.toLowerCase().includes(query) ||
        ep.method.toLowerCase().includes(query) ||
        ep.description.toLowerCase().includes(query),
      )
      .filter((ep) => !mod || this.extractModule(ep.path) === mod);
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
