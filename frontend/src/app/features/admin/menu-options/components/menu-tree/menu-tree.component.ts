import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuOption } from '../../../../../core/services/menu-option.service';

/**
 * MenuTreeComponent (F5.6.3) — hierarchical tree with expand/collapse
 * and "Agregar menú" action for creating child menu options.
 *
 * This is the ADMIN tree view (management screen), NOT the citizen sidebar.
 * Expand/collapse IS correct here — the citizen sidebar keeps its flat look.
 */
@Component({
  selector: 'app-menu-tree',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-tree">
      <div class="tree-header">
        <span class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Menús</span>
        <button
          class="text-sm text-blue-600 hover:text-blue-800 font-medium"
          (click)="requestCreate(null)"
        >
          + Agregar menú
        </button>
      </div>
      <ul class="tree-list mt-2">
        @for (item of rootItems(); track item.id) {
          <ng-container *ngTemplateOutlet="treeNode; context: { $implicit: item, depth: 0 }"></ng-container>
        }
      </ul>
    </div>

    <ng-template #treeNode let-item let-depth="depth">
      <li>
        <div
          class="tree-node flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-gray-100 transition-colors"
          [style.padding-left.rem]="depth * 1.25"
          [class.bg-blue-50]="isSelected(item.id)"
          (click)="selectNode(item.id)"
        >
          @if (hasChildren(item.id)) {
            <button
              class="expand-btn w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 text-xs"
              (click)="toggleExpand(item.id); $event.stopPropagation()"
            >
              {{ isExpanded(item.id) ? '▼' : '▶' }}
            </button>
          } @else {
            <span class="w-4 h-4"></span>
          }
          @if (item.icon) {
            <span class="text-gray-500 text-sm">[#]</span>
          }
          <span class="text-sm truncate" [class.font-medium]="isSelected(item.id)">
            {{ item.name }}
          </span>
          @if (!item.route) {
            <span class="text-xs text-gray-400 ml-1">(sección)</span>
          }
          <button
            class="ml-auto text-xs text-gray-400 hover:text-green-600 opacity-0 group-hover:opacity-100"
            (click)="requestCreate(item.id); $event.stopPropagation()"
          >
            +
          </button>
        </div>
        @if (hasChildren(item.id) && isExpanded(item.id)) {
          <ul>
            @for (child of childrenOf(item.id); track child.id) {
              <ng-container *ngTemplateOutlet="treeNode; context: { $implicit: child, depth: depth + 1 }"></ng-container>
            }
          </ul>
        }
      </li>
    </ng-template>
  `,
  styles: [`
    .tree-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .tree-list ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .tree-node {
      user-select: none;
    }
  `],
})
export class MenuTreeComponent {
  /** Flat list of all menu options from the API. */
  readonly options = input.required<MenuOption[]>();

  /** ID of the currently selected menu option. */
  readonly selectedId = input<string | null>(null);

  /** Emits the ID when a node is selected. */
  readonly selected = output<string>();

  /** Emits the parent_id for a new menu option (null = root level). */
  readonly createRequested = output<string | null>();

  private readonly expandedNodes = signal<Record<string, boolean>>({});

  /** Root items: options with no parent. */
  readonly rootItems = computed(() =>
    this.options()
      .filter((o) => !o.parent_id)
      .sort((a, b) => a.display_order - b.display_order),
  );

  /** Get children of a given parent. */
  childrenOf(parentId: string): MenuOption[] {
    return this.options()
      .filter((o) => o.parent_id === parentId)
      .sort((a, b) => a.display_order - b.display_order);
  }

  /** Check if a node has children. */
  hasChildren(id: string): boolean {
    return this.options().some((o) => o.parent_id === id);
  }

  /** Check if a node is expanded. */
  isExpanded(id: string): boolean {
    return this.expandedNodes()[id] === true;
  }

  /** Toggle expand/collapse state. */
  toggleExpand(id: string): void {
    this.expandedNodes.update((state) => ({
      ...state,
      [id]: !state[id],
    }));
  }

  /** Check if a node is selected. */
  isSelected(id: string): boolean {
    return this.selectedId() === id;
  }

  /** Emit selection event. */
  selectNode(id: string): void {
    this.selected.emit(id);
  }

  /** Emit create request event. */
  requestCreate(parentId: string | null): void {
    this.createRequested.emit(parentId);
  }
}
