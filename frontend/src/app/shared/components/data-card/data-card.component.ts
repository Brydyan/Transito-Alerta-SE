import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  input,
  Output,
} from '@angular/core';
import { UiBadgeComponent, type UiBadgeVariant } from '../ui-badge';
import { ActionDropdownComponent, type CardAction as ActionDropdownCardAction } from '../action-dropdown/action-dropdown.component';

/**
 * Configuration for a single field displayed inside a card.
 */
export interface CardField {
  /** Property key on the data object. */
  key: string;
  /** Display label for the field. */
  label: string;
  /** Optional format hint: 'badge' for status, 'priority-badge' for priority, null/undefined for plain text. */
  format?: 'badge' | 'priority-badge' | null;
}

/**
 * An action available on a card (e.g., edit, delete).
 */
export interface CardAction {
  id: string;
  label: string;
  icon?: string;
}

/** English wire → Spanish badge variant map (matches IncidentListComponent). */
const STATUS_BADGE_MAP: Record<string, UiBadgeVariant> = {
  pending: 'pendiente',
  in_progress: 'en_proceso',
  resolved: 'resuelto',
  closed: 'cerrada',
};

/**
 * Resolves the wire value to a valid UiBadgeVariant.
 * Status badges need English→Spanish mapping; priority badges pass through directly.
 */
function toBadgeVariant(value: string): UiBadgeVariant {
  return STATUS_BADGE_MAP[value] ?? (value as UiBadgeVariant);
}

/**
 * DataCardComponent — internal card leaf (D12).
 *
 * Renders exactly 3 fields from a data object, with optional badge formatting.
 * Used by TableToCard to render mobile card views (S2.2).
 *
 * Accessibility (S8.3): host has `role="article"` and a computed `aria-label`
 * that announces: "Card: [title], [field1]: [value1], [field2]: [value2]".
 */
@Component({
  selector: 'app-data-card',
  standalone: true,
  imports: [UiBadgeComponent, ActionDropdownComponent],
  templateUrl: './data-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'article',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class DataCardComponent {
  /** The data object to render. */
  readonly data = input.required<Record<string, unknown>>();

  /** Field configuration — exactly 3 fields per S2.2. */
  readonly fields = input<CardField[]>([]);

  /** Available actions for this card. */
  readonly actions = input<CardAction[]>([]);

  @Output() readonly detailClicked = new EventEmitter<Record<string, unknown>>();
  @Output() readonly actionClicked = new EventEmitter<{ action: CardAction; data: Record<string, unknown> }>();

  /** S8.3: computed aria-label for screen reader announcement. */
  readonly ariaLabel = (): string => {
    const d = this.data() as Record<string, unknown> | undefined;
    if (!d) return 'Card';
    const f = this.fields();
    const fieldValues = f
      .map((field) => `${field.label}: ${this.getValue(field)}`)
      .join(', ');
    return `Card: ${fieldValues}`;
  };

  /** Resolve the display value for a field from the data object. */
  getValue(field: CardField): string {
    const d = this.data() as Record<string, unknown> | undefined;
    if (!d) return '-';
    const raw = d[field.key];
    if (raw === null || raw === undefined) return '-';
    return String(raw);
  }

  /** Resolve badge variant for formatted fields. */
  resolveBadge(field: CardField): UiBadgeVariant {
    const d = this.data() as Record<string, unknown> | undefined;
    const value = String(d?.[field.key] ?? '');
    return toBadgeVariant(value);
  }

  onDetailClick(): void {
    this.detailClicked.emit(this.data());
  }

  onActionClick(action: CardAction): void {
    this.actionClicked.emit({ action, data: this.data() });
  }
}
