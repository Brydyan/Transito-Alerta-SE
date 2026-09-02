import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { UiBadgeComponent, UiBadgeVariant } from '../ui-badge/ui-badge.component';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary';

const TONE_TO_VARIANT: Record<BadgeTone, UiBadgeVariant> = {
  success: 'resuelto',
  warning: 'en_proceso',
  danger: 'cerrada',
  info: 'pendiente',
  primary: 'en_proceso',
  secondary: 'pendiente',
};

/**
 * Envoltorio delgado sobre `ui-badge` — D6.
 * Conserva la API pública previa (`status`, `customLabel`, `customTone`, `dot`)
 * para no romper consumidores actuales; traduce estado de dominio → variante
 * del primitivo compartido.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [UiBadgeComponent],
  template: `
    <ui-badge [variant]="variant()" [label]="label()" [dot]="dot()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input<string>('');
  readonly customLabel = input<string>('');
  readonly customTone = input<BadgeTone | ''>('');
  readonly dot = input<boolean>(true);

  readonly label = computed(() => {
    if (this.customLabel()) return this.customLabel();
    const st = this.status() || '';
    return st.replace(/_/g, ' ');
  });

  readonly variant = computed<UiBadgeVariant>(() => {
    if (this.customTone()) {
      return TONE_TO_VARIANT[this.customTone() as BadgeTone];
    }
    const st = (this.status() || '').toUpperCase();

    if (
      [
        'REGISTRADO',
        'ACTIVO',
        'PAGADO',
        'APPROVED',
        'APROBADO',
        'APROBADA',
        'EXITOSO',
        'RESUELTO',
        'RESUELTA',
        'COMPLETADA',
      ].includes(st)
    ) {
      return 'resuelto';
    }
    if (
      [
        'PENDIENTE',
        'IN_REVIEW',
        'EN_REVISION',
        'EN_PROCESO',
        'PARCIAL',
        'CON_NOVEDAD',
        'POR_REVISION',
      ].includes(st)
    ) {
      return 'en_proceso';
    }
    if (
      [
        'ANULADO',
        'INACTIVO',
        'RECHAZADO',
        'RECHAZADA',
        'RECHAZADA_VERIFICACION',
        'REJECTED',
        'VENCIDO',
        'ERROR',
        'FALLIDO',
        'DESCARTADO',
        'DESCARTADA',
        'CANCELADA',
      ].includes(st)
    ) {
      return 'cerrada';
    }
    if (
      [
        'GENERATED',
        'GENERADO',
        'EMITIDO',
        'NUEVA',
        'NUEVO',
        'ESTIMADA',
        'PLANILLADA',
        'ASIGNADA',
        'TOMADA',
      ].includes(st)
    ) {
      return 'pendiente';
    }
    return 'pendiente';
  });
}
