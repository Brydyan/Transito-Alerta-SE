import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold tracking-wide rounded-full whitespace-nowrap" [ngClass]="'badge-soft-' + tone()">
      @if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
      }
      <span>{{ label() }}</span>
    </span>
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

  readonly tone = computed<BadgeTone>(() => {
    if (this.customTone()) return this.customTone() as BadgeTone;
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
      return 'success';
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
      return 'warning';
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
      return 'danger';
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
      return 'info';
    }
    return 'secondary';
  });
}
