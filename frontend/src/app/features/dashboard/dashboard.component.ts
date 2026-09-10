import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import {
  ActivityRow,
  IncidentStats,
  WeeklyStats,
} from '../../core/models/dashboard.model';
import { toKpiLabel, toKpiTone } from './dashboard.tokens';
import { UiKpiCardComponent } from '../../shared/components/ui-kpi-card/ui-kpi-card.component';
import { UiPageHeaderComponent } from '../../shared/components/ui-page-header/ui-page-header.component';

import { TopCategoriesChartComponent } from './components/top-categories-chart.component';
import { WeeklyPerformanceChartComponent } from './components/weekly-performance-chart.component';
import { RecentActivityComponent } from './components/recent-activity.component';

/**
 * Dashboard rediseñado — F6 (`2026-09-08-f6-dashboard-redesign`).
 *
 * Contenedor de señales que carga en paralelo las tres vistas del
 * backend y reparte los datos a cuatro primitivos:
 *  - 5 `<ui-kpi-card>` con `tone` derivado del mock 01-01
 *    (Total/In proceso/Resueltas/Pendientes/Tiempo promedio)
 *  - `<app-top-categories-chart>` con el `top_categories[]` del stats
 *  - `<app-recent-activity>` con los primeros 5 del feed
 *  - `<app-weekly-performance-chart>` con `weekly-stats.days[]`
 *
 * Estados:
 *  - `loading()`: true mientras `forkJoin` no resuelve. Los
 *    `ui-kpi-card` y los charts muestran su estado vacío
 *    diferenciado (D7/D5: el skeleton y el "Sin datos" no se
 *    confunden con un fallo de carga — la falla se anuncia
 *    aparte).
 *  - `error()`: no-null cuando al menos una de las tres llamadas
 *    falló. No aborta la página: cada componente degrada a su
 *    estado vacío individualmente (D5 del change: "cero es un
 *    valor con significado propio").
 *
 * Cero literales hexadecimales en la configuración de los
 * colores: cada `tone` es una variante del design system (F0/D12).
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    UiKpiCardComponent,
    UiPageHeaderComponent,
    TopCategoriesChartComponent,
    WeeklyPerformanceChartComponent,
    RecentActivityComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  /** Conservado para no romper el spec preexistente de este
   *  componente (`expect(component).toBeTruthy()` + mock de
   *  AuthService). Tras F6, la cabecera la pinta `ui-page-header`
   *  con datos del servicio, no de `authService`. */
  readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly stats = signal<IncidentStats | null>(null);
  readonly weekly = signal<WeeklyStats | null>(null);
  readonly activity = signal<ReadonlyArray<ActivityRow>>([]);

  // Proyecciones a las 5 tarjetas — el template itera sobre un
  // array de `{ key, label, tone, value, trend, icon }` que se
  // reconstruye cuando `stats()` cambia.
  readonly kpis = computed(() => {
    const s = this.stats();
    if (!s) {
      return [
        { key: 'total' as const, label: toKpiLabel('total'), tone: toKpiTone('total'), value: 0, trend: '', icon: 'layers' },
        { key: 'inProgress' as const, label: toKpiLabel('inProgress'), tone: toKpiTone('inProgress'), value: 0, trend: '', icon: 'activity' },
        { key: 'resolved' as const, label: toKpiLabel('resolved'), tone: toKpiTone('resolved'), value: 0, trend: '', icon: 'check-circle' },
        { key: 'pending' as const, label: toKpiLabel('pending'), tone: toKpiTone('pending'), value: 0, trend: '', icon: 'clock' },
        { key: 'avgTime' as const, label: toKpiLabel('avgTime'), tone: toKpiTone('avgTime'), value: '—', trend: '', icon: 'timer' },
      ];
    }
    return [
      {
        key: 'total' as const,
        label: toKpiLabel('total'),
        tone: toKpiTone('total'),
        value: s.total,
        trend: trend(s.trends?.total_pct, 'VS. MES ANTERIOR'),
        icon: 'layers',
      },
      {
        key: 'inProgress' as const,
        label: toKpiLabel('inProgress'),
        tone: toKpiTone('inProgress'),
        value: s.by_status['in_progress'] ?? 0,
        trend: trend(s.trends?.total_pct, 'ESTA SEMANA'),
        icon: 'activity',
      },
      {
        key: 'resolved' as const,
        label: toKpiLabel('resolved'),
        tone: toKpiTone('resolved'),
        value: s.by_status['resolved'] ?? 0,
        trend: trend(s.trends?.resolution_rate_pct, 'TASA DE RESOLUCIÓN'),
        icon: 'check-circle',
      },
      {
        key: 'pending' as const,
        label: toKpiLabel('pending'),
        tone: toKpiTone('pending'),
        value: s.by_status['pending'] ?? 0,
        trend: trend(s.trends?.pendientes_pct, 'VS. MES ANTERIOR'),
        icon: 'clock',
      },
      {
        key: 'avgTime' as const,
        label: toKpiLabel('avgTime'),
        tone: toKpiTone('avgTime'),
        value: s.average_resolution_time?.formatted ?? '—',
        trend: 'SOBRE INCIDENCIAS RESUELTAS',
        icon: 'timer',
      },
    ];
  });

  readonly topCategories = computed(() => this.stats()?.top_categories ?? []);
  readonly weeklyDays = computed(() => this.weekly()?.days ?? []);

  ngOnInit(): void {
    // F6 (W.1 sdd-verify fix): el dashboard ahora hace el forkJoin
    // de los 3 endpoints (`getStats`, `getWeeklyStats`,
    // `getRecentActivity`) con `catchError` POR Llamada — la falla
    // de uno no aborta los otros dos, y se enciende `error()` para
    // que el template pinte el `.error-banner` (S5 del spec).
    // Cada `catchError` degrada a un valor vacío con el mismo shape
    // que la respuesta exitosa — los computeds (`kpis`,
    // `topCategories`, `weeklyDays`) toleran `null`/`[]` (D5: cero
    // es un valor con significado propio).
    forkJoin({
      stats: this.dashboardService.getStats().pipe(
        catchError(() => {
          this.error.set('No se pudo cargar el dashboard. Los datos pueden estar incompletos.');
          return of(null);
        }),
      ),
      weekly: this.dashboardService.getWeeklyStats().pipe(
        catchError(() => {
          this.error.set('No se pudo cargar el dashboard. Los datos pueden estar incompletos.');
          return of(null);
        }),
      ),
      activity: this.dashboardService.getRecentActivity().pipe(
        catchError(() => {
          this.error.set('No se pudo cargar el dashboard. Los datos pueden estar incompletos.');
          return of([] as ActivityRow[]);
        }),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ stats, weekly, activity }) => {
        this.stats.set(stats);
        this.weekly.set(weekly);
        this.activity.set(activity);
        this.loading.set(false);
      });
  }
}

/** Formatea un porcentaje de tendencia para el pie del KPI. */
function trend(pct: number | null | undefined, label: string): string {
  if (pct === null || pct === undefined) return '';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}% ${label}`;
}
