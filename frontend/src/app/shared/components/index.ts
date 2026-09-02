/**
 * Design system — barrel de los primitivos de UI (F0).
 * Los consumidores deben importar desde aquí, no desde los subpaths,
 * para tener un punto único de evolución del contrato.
 *
 * Ejemplo:
 *   import { UiBadgeComponent, type UiBadgeVariant } from '@shared/components';
 */
export { UiIconComponent } from './ui-icon';
export { UiBadgeComponent, type UiBadgeVariant } from './ui-badge';
export { UiCardComponent } from './ui-card';
export { UiButtonComponent, type UiButtonVariant, type UiButtonSize } from './ui-button';
export { UiPageHeaderComponent } from './ui-page-header';
export { UiKpiCardComponent, type UiKpiTone } from './ui-kpi-card';
export { UiTableComponent } from './ui-table';
