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
import { UiIconComponent } from '../../../../../shared/components/ui-icon/ui-icon.component';

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
  imports: [CommonModule, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './menu-tree.component.html',
  styleUrl: './menu-tree.component.css',
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
