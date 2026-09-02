import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MenuService } from '../../core/services/menu.service';
import { LayoutService } from '../../core/services/layout.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MenuItem } from '../../core/models/menu.model';
import { UiIconComponent } from '../../shared/components/ui-icon/ui-icon.component';

export interface MenuGroup {
  label: string | null;
  items: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule, MatTooltipModule, FormsModule, UiIconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  readonly menuService = inject(MenuService);
  readonly layoutService = inject(LayoutService);

  readonly expandedItems = signal<Record<number, boolean>>({});
  readonly searchQuery = signal('');

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private normalize(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  readonly filteredMenuItems = computed(() => {
    const query = this.normalize(this.searchQuery());
    const items = this.menuService.menuItems();

    if (!query) return items;

    return items.reduce<MenuItem[]>((acc, item) => {
      const parentMatches = this.normalize(item.name).includes(query);

      if (item.children && item.children.length > 0) {
        const matchingChildren = item.children.filter((child) =>
          this.normalize(child.name).includes(query),
        );

        if (parentMatches) {
          acc.push(item);
        } else if (matchingChildren.length > 0) {
          acc.push({ ...item, children: matchingChildren });
        }
      } else if (parentMatches) {
        acc.push(item);
      }

      return acc;
    }, []);
  });

  /**
   * Agrupa los items filtrados por su campo `group`, preservando el orden
   * de llegada del backend. Los items sin `group` van al principio bajo
   * un encabezado `null` (sin etiqueta en el render).
   */
  readonly groupedMenuItems = computed<MenuGroup[]>(() => {
    const items = this.filteredMenuItems();
    const groups: MenuGroup[] = [];
    const seen = new Map<string, MenuGroup>();

    for (const item of items) {
      const key = item.group ?? '';
      if (!seen.has(key)) {
        const group: MenuGroup = { label: key || null, items: [] };
        seen.set(key, group);
        groups.push(group);
      }
      seen.get(key)!.items.push(item);
    }

    return groups;
  });

  readonly effectiveExpandedItems = computed(() => {
    const query = this.searchQuery();
    if (!query) return this.expandedItems();

    const normalizedQuery = this.normalize(query);
    const expanded: Record<number, boolean> = { ...this.expandedItems() };

    for (const item of this.menuService.menuItems()) {
      if (item.children && item.children.length > 0) {
        const hasMatchingChild = item.children.some((child) =>
          this.normalize(child.name).includes(normalizedQuery),
        );
        if (hasMatchingChild) expanded[item.id] = true;
      }
    }

    return expanded;
  });

  toggleItem(itemId: number): void {
    if (!this.layoutService.sidebarOpen()) {
      this.layoutService.openSidebar();
      this.expandedItems.update((state) => ({ ...state, [itemId]: true }));
    } else {
      this.expandedItems.update((state) => ({ ...state, [itemId]: !state[itemId] }));
    }
  }

  openSearchAndFocus(): void {
    this.layoutService.openSidebar();
    setTimeout(() => this.searchInputRef()?.nativeElement.focus(), 320);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }
}
