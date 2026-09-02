import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Contenedor blanco `rounded-xl` con borde sutil y sombra tenue — F0.4.2.
 *
 * Slots:
 * - default (`<ng-content />`)            — cuerpo de la tarjeta.
 * - `[card-actions]`                       — acciones de cabecera, alineadas a la derecha.
 *
 * Si no se pasa `title` ni `subtitle`, el bloque de cabecera se omite entero
 * y el cuerpo ocupa todo el alto.
 *
 * @example
 *   <ui-card title="Incidencias" subtitle="Última semana">
 *     <button card-actions uiButton variant="secondary">Exportar</button>
 *     <p>contenido</p>
 *   </ui-card>
 */
@Component({
  selector: 'ui-card',
  standalone: true,
  template: `
    <article
      class="ui-card bg-bg-secondary border border-border-subtle rounded-xl shadow-[0_4px_6px_-1px_rgba(15,23,42,0.04)] flex flex-col min-w-0 break-words"
      [attr.data-padding]="padding()"
    >
      @if (title() || subtitle()) {
        <header
          class="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-border-subtle"
        >
          <div class="min-w-0">
            @if (title()) {
              <h3 class="text-base font-semibold text-slate-800 leading-tight truncate">
                {{ title() }}
              </h3>
            }
            @if (subtitle()) {
              <p class="text-sm text-slate-500 mt-0.5 truncate">{{ subtitle() }}</p>
            }
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <ng-content select="[card-actions]" />
          </div>
        </header>
      }
      <div [class]="'ui-card-body ' + (padding() === 'none' ? 'p-0' : 'p-5')">
        <ng-content />
      </div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCardComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly padding = input<'normal' | 'none'>('normal');
}
