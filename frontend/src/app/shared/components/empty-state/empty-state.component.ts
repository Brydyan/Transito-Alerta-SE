import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty-state-container text-center py-12 px-4">
      <div class="empty-state-icon mb-4">
        <i [class]="icon()"></i>
      </div>
      <h5 class="font-semibold text-slate-800 mb-2">{{ title() }}</h5>
      <p class="text-slate-500 text-sm mb-4 max-w-sm mx-auto">{{ description() }}</p>
      @if (actionLabel()) {
        <button
          class="btn btn-primary inline-flex items-center gap-2 font-medium px-4"
          (click)="actionClicked.emit()"
        >
          @if (actionIcon()) {
            <i [class]="actionIcon()"></i>
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
        background-color: rgba(30, 30, 84, 0.05);
        color: var(--color-brand-navy);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
      }

      .max-w-sm {
        max-width: 400px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input<string>('bi bi-inbox');
  readonly title = input<string>('Sin datos');
  readonly description = input<string>('No se encontraron registros para mostrar.');
  readonly actionLabel = input<string>('');
  readonly actionIcon = input<string>('');

  readonly actionClicked = output<void>();
}
