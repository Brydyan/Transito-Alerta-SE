import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  input,
  Output,
} from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { LayoutService } from '../../../core/services/layout.service';
import { DataCardComponent, CardField, CardAction } from '../data-card/data-card.component';

/**
 * TableToCardComponent — reusable responsive wrapper (D1).
 *
 * Toggles between a card grid (mobile/tablet, < 1024px) and a
 * projected `<ng-content>` table (desktop, >= 1024px).
 *
 * The switching is driven by `LayoutService.isSmallViewport$` (D2).
 * The card grid uses `grid grid-cols-1 md:grid-cols-2 gap-4` (D7).
 *
 * @example
 *   <table-to-card [items]="incidents()" [cardFields]="INCIDENTS_CARD_FIELDS">
 *     <ui-table>
 *       <!-- desktop table content via ng-content -->
 *     </ui-table>
 *   </table-to-card>
 */
@Component({
  selector: 'table-to-card',
  standalone: true,
  imports: [AsyncPipe, DataCardComponent],
  templateUrl: './table-to-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableToCardComponent {
  /** Items to render as cards or table rows. */
  readonly items = input<Record<string, unknown>[]>([]);

  /** Field configuration for DataCardComponent (3 fields per S2.2). */
  readonly cardFields = input<CardField[]>([]);

  /** Actions available on each card. */
  readonly cardActions = input<CardAction[]>([]);

  /** Route or event for detail navigation. */
  readonly detailRoute = input<string>('');

  /** Reactive viewport switch from LayoutService (D2). */
  readonly isSmallViewport$: Observable<boolean> = inject(LayoutService).isSmallViewport$;

  @Output() readonly detailClicked = new EventEmitter<Record<string, unknown>>();
  @Output() readonly actionClicked = new EventEmitter<{ action: CardAction; data: Record<string, unknown> }>();
}
