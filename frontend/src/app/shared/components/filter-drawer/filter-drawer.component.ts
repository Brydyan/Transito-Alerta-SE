import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { LayoutService } from '../../../core/services/layout.service';

/**
 * FilterDrawerComponent — collapsible filter drawer for mobile (D6).
 *
 * On desktop (>= 1024px): filter content is always visible inline (S4.1).
 * On mobile (< 1024px): filters are hidden behind a "Filtros" toggle button;
 * clicking it opens a slide-in drawer with overlay (S4.2, S4.3).
 *
 * Drawer closes on:
 * - Overlay click (S4.5)
 * - Escape key (S4.5)
 * - Close button (S4.5)
 *
 * Filter changes apply immediately — no "Apply" button needed (S4.4).
 *
 * @example
 *   <app-filter-drawer>
 *     <app-search-bar (searchChange)="onSearch($event)" />
 *     <app-filter-bar (filterChange)="onFilterChange($event)" />
 *   </app-filter-drawer>
 */
@Component({
  selector: 'app-filter-drawer',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './filter-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterDrawerComponent {
  /** Reactive viewport detection from LayoutService (D2). */
  readonly isSmallViewport$: Observable<boolean> = inject(LayoutService).isSmallViewport$;

  /** Whether the mobile drawer is open. */
  readonly isOpen = signal(false);

  /** Toggle the mobile drawer open/closed. */
  toggleDrawer(): void {
    this.isOpen.update((v) => !v);
  }

  /** Close the mobile drawer. */
  closeDrawer(): void {
    this.isOpen.set(false);
  }

  /** Close on Escape key (S4.5). */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) {
      this.isOpen.set(false);
    }
  }
}
