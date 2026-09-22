import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  input,
  Output,
  signal,
} from '@angular/core';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';

/**
 * Action card field — re-exported from DataCard for convenience.
 * Consumers should import CardAction from the data-card barrel instead
 * when possible. This re-export keeps the action-dropdown self-contained.
 */
import type { CardAction } from '../data-card/data-card.component';

export type { CardAction };

/**
 * ActionDropdownComponent — kebab menu (⋮) for card actions (D4).
 *
 * Displays a trigger button that toggles a dropdown menu of
 * card-level actions (edit, delete, claim, etc.).
 *
 * Accessibility:
 * - Trigger has `aria-label="More actions"` (S8.3).
 * - Menu items have `min-h-[44px]` for touch targets (S6.2/S8.2).
 * - Escape and click-outside close the menu (S6.4).
 * - Dropdown is absolutely positioned with `right-0` to prevent
 *   viewport overflow (S6.1).
 *
 * @example
 *   <app-action-dropdown [actions]="cardActions" (actionSelected)="handleAction($event)" />
 */
@Component({
  selector: 'app-action-dropdown',
  standalone: true,
  imports: [ClickOutsideDirective],
  templateUrl: './action-dropdown.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionDropdownComponent {
  /** Available actions to display in the menu. */
  readonly actions = input<CardAction[]>([]);

  /** Whether the dropdown menu is open. */
  readonly isOpen = signal(false);

  /** Emits when a menu item is selected. Closes the menu automatically. */
  @Output() readonly actionSelected = new EventEmitter<CardAction>();

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  /** Toggle the menu open/closed. */
  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  /** Close the menu. */
  close(): void {
    this.isOpen.set(false);
  }

  /** Handle action click — emit and close. */
  onActionClick(action: CardAction): void {
    this.actionSelected.emit(action);
    this.isOpen.set(false);
  }

  /** Close on Escape key (S6.4). */
  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) {
      this.isOpen.set(false);
    }
  }

  /** Close on click outside (S6.4). */
  onClickOutside(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
    }
  }
}
