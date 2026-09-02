import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * Estado vacío para listados y pantallas sin datos. F0 — usa `<ui-icon>` de
 * Lucide en lugar de `bi bi-*` (F0.2). El input `icon` es ahora un nombre
 * Lucide kebab-case (p. ej. `inbox`, `search`, `settings`); los consumidores
 * que pasaban `bi bi-*` deben migrar a un nombre equivalente.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  template: `
    <div class="empty-state-container text-center py-12 px-4">
      <div class="empty-state-icon mb-4">
        <ui-icon [name]="icon()" [size]="32" />
      </div>
      <h5 class="font-semibold text-slate-800 mb-2">{{ title() }}</h5>
      <p class="text-slate-500 text-sm mb-4 max-w-sm mx-auto">{{ description() }}</p>
      @if (actionLabel()) {
        <button
          class="btn btn-primary inline-flex items-center gap-2 font-medium px-4"
          (click)="actionClicked.emit()"
        >
          @if (actionIcon()) {
            <ui-icon [name]="actionIcon()" [size]="16" />
          }
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .empty-state-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .empty-state-icon {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        background-color: rgba(124, 58, 237, 0.05);
        color: var(--color-brand-primary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .max-w-sm {
        max-width: 400px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  /** Nombre Lucide kebab-case (p. ej. `inbox`, `search`, `settings`). */
  readonly icon = input<string>('inbox');
  readonly title = input<string>('Sin datos');
  readonly description = input<string>('No se encontraron registros para mostrar.');
  readonly actionLabel = input<string>('');
  /** Nombre Lucide kebab-case para el icono del botón de acción. */
  readonly actionIcon = input<string>('');

  readonly actionClicked = output<void>();
}
