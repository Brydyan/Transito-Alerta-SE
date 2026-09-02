import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * Variantes de estado de incidencia. Coinciden con `incident_status` en backend.
 */
export type UiBadgeStatus = 'pendiente' | 'en_proceso' | 'resuelto' | 'cerrada';

/**
 * Variantes de prioridad de incidencia. Cuatro valores: `critical` existe en
 * backend (D9) y debe distinguirse de `high` no sólo por color.
 */
export type UiBadgePriority = 'low' | 'medium' | 'high' | 'critical';

export type UiBadgeVariant = UiBadgeStatus | UiBadgePriority;

interface BadgeStyle {
  /** Clases de Tailwind resueltas contra los tokens de F0.1.1 + D10. */
  readonly classes: string;
  /** Texto visible. */
  readonly text: string;
  /** Glifo Lucide extra; null = sin icono, sólo dot. */
  readonly icon: string | null;
}

/**
 * Píldora de estado/prioridad — F0.4.1.
 *
 * Mapa contrato (D10, ver `specs/design-system/spec.md`):
 *
 * | Variante  | Fondo                       | Texto                | Contraste |
 * |-----------|-----------------------------|----------------------|-----------|
 * | pendiente | bg-status-pendiente/20     | text-on-tint-slate   | 9.5 ✓     |
 * | en_proceso| bg-brand-primary-soft      | text-on-tint-violet  | 6.5 ✓     |
 * | resuelto  | bg-status-resuelto/15      | text-on-tint-green   | 7.1 ✓     |
 * | cerrada   | bg-status-cerrada/12       | text-on-tint-graphite| 9.9 ✓     |
 * | low       | bg-prio-low/15             | text-on-tint-green   | 7.1 ✓     |
 * | medium    | bg-prio-medium/40         | text-on-tint-amber   | 8.1 ✓     |
 * | high      | bg-prio-high/15           | text-on-tint-red     | 7.5 ✓     |
 * | critical  | bg-prio-critical **sólido**| text-white + alert-octagon | 6.5 ✓ |
 *
 * Tintado para todas las variantes, `critical` sólido como única excepción
 * (el sólido se reserva para `ui-kpi-card`; acá se usa por la carga
 * semántica de la emergencia — D9).
 *
 * D9: `critical` lleva además un icono (`alert-octagon`) porque dos rojos
 * contiguos son indistinguibles para buena parte de los usuarios.
 */
@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold tracking-wide rounded-full whitespace-nowrap"
      [class]="style().classes"
      [attr.data-variant]="variant()"
    >
      @if (style().icon) {
        <ui-icon [name]="style().icon!" [size]="12" [strokeWidth]="2" />
      } @else if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
      }
      <span>{{ style().text }}</span>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiBadgeComponent {
  readonly variant = input.required<UiBadgeVariant>();
  readonly label = input<string>('');
  readonly dot = input<boolean>(false);

  readonly style = computed<BadgeStyle>(() => {
    const v = this.variant();
    const text = this.label() || v.replace(/_/g, ' ');

    switch (v) {
      // Estados — D10: tintado, texto de los tokens on-tint.
      case 'pendiente':
        return {
          classes: 'bg-status-pendiente/20 text-on-tint-slate',
          text,
          icon: null,
        };
      case 'en_proceso':
        return {
          classes: 'bg-brand-primary-soft text-on-tint-violet',
          text,
          icon: null,
        };
      case 'resuelto':
        return {
          classes: 'bg-status-resuelto/15 text-on-tint-green',
          text,
          icon: null,
        };
      case 'cerrada':
        return {
          classes: 'bg-status-cerrada/12 text-on-tint-graphite',
          text,
          icon: null,
        };

      // Prioridades.
      case 'low':
        return {
          classes: 'bg-prio-low/15 text-on-tint-green',
          text,
          icon: null,
        };
      case 'medium':
        return {
          classes: 'bg-prio-medium/40 text-on-tint-amber',
          text,
          icon: null,
        };
      case 'high':
        return {
          classes: 'bg-prio-high/15 text-on-tint-red',
          text,
          icon: null,
        };
      case 'critical':
        // D9: sólido + icono.
        return {
          classes: 'bg-prio-critical text-white',
          text,
          icon: 'alert-octagon',
        };
    }
  });
}
