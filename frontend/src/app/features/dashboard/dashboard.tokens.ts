import { UiBadgePriority, UiBadgeStatus } from '../../shared/components/ui-badge/ui-badge.component';
import { UiKpiTone } from '../../shared/components/ui-kpi-card/ui-kpi-card.component';

/**
 * Mapeos del wire (snake_case) a las variantes del design system (F0).
 *
 * Concentrados acá para que un cambio de naming del backend
 * (precedente SC-209) o un ajuste de paleta (precedente F0/D12)
 * toquen un solo archivo en lugar de los componentes.
 */

/** `incident_status` del wire → variante de `ui-badge`. */
export function toIncidentBadgeTone(
  status: string | null | undefined,
): UiBadgeStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'pendiente':
      return 'pendiente';
    case 'in_progress':
    case 'en_proceso':
    case 'in-progress':
      return 'en_proceso';
    case 'resolved':
    case 'resuelto':
      return 'resuelto';
    case 'closed':
    case 'cerrada':
    case 'cerrado':
      return 'cerrada';
    default:
      // Fallback: el status desconocido se trata como pendiente —
      // es el estado "neutro" del dominio. Mejor un badge genérico
      // que un componente roto.
      return 'pendiente';
  }
}

/** `priority` del wire → variante de `ui-badge`. */
export function toPriorityBadgeTone(
  priority: string | null | undefined,
): UiBadgePriority {
  switch ((priority ?? '').toLowerCase()) {
    case 'low':
    case 'baja':
      return 'low';
    case 'medium':
    case 'media':
      return 'medium';
    case 'high':
    case 'alta':
      return 'high';
    case 'critical':
    case 'critica':
    case 'crítico':
      return 'critical';
    default:
      return 'low';
  }
}

/** Nombre legible para mostrar en el KPI card (mock 01-01). */
export function toKpiLabel(kind: 'total' | 'inProgress' | 'resolved' | 'pending' | 'avgTime'): string {
  switch (kind) {
    case 'total':
      return 'Total Incidencias';
    case 'inProgress':
      return 'En proceso';
    case 'resolved':
      return 'Resueltas';
    case 'pending':
      return 'Pendientes';
    case 'avgTime':
      return 'Tiempo promedio';
  }
}

/** Tono del KPI card según la celda del dashboard (mock 01-01). */
export function toKpiTone(kind: 'total' | 'inProgress' | 'resolved' | 'pending' | 'avgTime'): UiKpiTone {
  switch (kind) {
    case 'total':
      return 'brand'; // violeta primario
    case 'inProgress':
      return 'cyan';
    case 'resolved':
      return 'green';
    case 'pending':
      return 'red';
    case 'avgTime':
      return 'violet';
  }
}
