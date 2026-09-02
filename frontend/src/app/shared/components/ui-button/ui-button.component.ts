import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost';
export type UiButtonType = 'button' | 'submit' | 'reset';
export type UiButtonSize = 'sm' | 'md';

/**
 * Botón base de la app — F0.4.3.
 *
 * Variantes:
 * - `primary`   (def.) violeta sólido, blanco.
 * - `secondary` blanco con borde, slate-700.
 * - `ghost`     transparente, slate-600; en hover, fondo suave.
 *
 * Slots:
 * - `[uiButtonIcon]`  icono a la izquierda (típicamente `<ui-icon>`).
 * - default           texto/etiqueta.
 *
 * Estados:
 * - `disabled`  aplica `opacity-50 cursor-not-allowed` y bloquea el click.
 * - `loading`   añade spinner y `aria-busy`; implícitamente `disabled`.
 *
 * Selector atributo: aplica tanto a `<button uiButton>` como a `<a uiButton>`.
 *
 * @example
 *   <button uiButton (click)="save()">
 *     <ui-icon uiButtonIcon name="check" [size]="16" />
 *     Guardar
 *   </button>
 *
 *   <a uiButton variant="secondary" routerLink="/incidents">Ver todo</a>
 */
@Component({
  selector: 'button[uiButton], a[uiButton]',
  standalone: true,
  template: `
    <ng-content select="[uiButtonIcon]" />
    <span class="truncate"><ng-content /></span>
    @if (loading()) {
      <span class="ml-2 inline-block w-3 h-3 border-2 border-current border-r-transparent rounded-full animate-spin"></span>
    }
  `,
  host: {
    '[class]': 'hostClasses()',
    '[attr.disabled]': 'disabled() || loading() ? true : null',
    '[attr.aria-busy]': 'loading() ? "true" : null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButtonComponent {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly block = input<boolean>(false);

  readonly hostClasses = computed<string>(() => {
    const base =
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed';

    const sizes: Record<UiButtonSize, string> = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
    };

    const variants: Record<UiButtonVariant, string> = {
      primary:
        'bg-brand-primary border-brand-primary text-white hover:bg-brand-primary-hover hover:border-brand-primary-hover focus:ring-2 focus:ring-brand-primary/40',
      secondary:
        'bg-bg-secondary border-border-subtle text-slate-700 hover:bg-bg-primary focus:ring-2 focus:ring-brand-primary/20',
      ghost:
        'bg-transparent border-transparent text-slate-600 hover:bg-bg-primary hover:text-brand-primary',
    };

    return [
      base,
      sizes[this.size()],
      variants[this.variant()],
      this.block() ? 'w-full' : '',
    ]
      .filter(Boolean)
      .join(' ');
  });
}
