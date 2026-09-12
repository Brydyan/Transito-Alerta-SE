import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

import {
  AuditLogActor,
  AuditLogFilters,
  AuditLogItem,
  AuditLogsService,
} from './services/audit-logs.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../shared/components/table-skeleton/table-skeleton.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiTableComponent } from '../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';

/**
 * F6 (`2026-09-11-f6-audit-logs-export`) — página de Auditoría de
 * Acceso.
 *
 * Layout:
 *   - `ui-page-header` con kicker + título + botón "Descargar CSV"
 *     en la zona de acciones (R4).
 *   - Filtros: `date_from`, `date_to`, dropdown de actor o UUID
 *     fallback (D2). Aplicar resetea la página a 1 (R3-S4).
 *   - Tabla `ui-table` con 6 columnas (Fecha, Usuario, Acción,
 *     Recurso, Recurso ID, Justificación).
 *   - `app-pagination` con `totalItems` del back.
 *   - Empty state cuando `items: []`.
 *
 * Decisiones aplicadas:
 *  - D3: native `<input type="date">` — sin date-picker.
 *  - D4: CSV via `HttpClient` blob + `URL.createObjectURL` +
 *    `<a download>`. **NUNCA** `window.open` (R4-S3) — rompería
 *    las cookies de auth en una nueva ventana sin contexto.
 *  - D2: dropdown con fallback UUID si el back devuelve 403.
 */
@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiTableComponent,
    UiIconComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
  ],
  templateUrl: './audit-logs.component.html',
  styleUrl: './audit-logs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogsComponent implements OnInit {
  private readonly service = inject(AuditLogsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Datos crudos del backend. */
  readonly items = signal<ReadonlyArray<AuditLogItem>>([]);
  readonly total = signal(0);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  /** Dropdown de actores (D2). Vacío si 403 ⇒ fallback UUID. */
  readonly users = signal<ReadonlyArray<AuditLogActor>>([]);
  readonly actorDropdownAvailable = signal(true);

  /** Filtros activos (bound a los inputs del template). */
  readonly filters = signal<AuditLogFilters>({
    dateFrom: '',
    dateTo: '',
    actorId: '',
  });

  /** Paginación — defaults alineados con la spec (R2-S1). */
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50, 100];

  ngOnInit(): void {
    this.loadData();
    this.loadUsers();
  }

  /**
   * GET /api/audit-logs con los filtros activos. Reset de página
   * NO ocurre acá — es responsabilidad del caller (la paginación
   * cambia `currentPage` directamente; los filtros pasan por
   * `onFilterChange`, que sí resetea a 1).
   */
  protected loadData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.service
      .getAuditLogs(this.filters(), {
        page: this.currentPage(),
        limit: this.pageSize(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          this.errorMessage.set('No se pudieron cargar los eventos de auditoría.');
          this.toast.error(
            'No se pudieron cargar los eventos de auditoría. Intenta nuevamente.',
            'Error',
          );
          console.error('[AuditLogs] load failed:', err);
          this.isLoading.set(false);
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.isLoading.set(false);
        if (!response) return;
        this.items.set(response.items ?? []);
        this.total.set(response.total ?? 0);
      });
  }

  /**
   * GET /api/users?limit=100 para el dropdown. Si el back devuelve
   * 403 (usuario sin READ users), degradamos al input UUID (D2).
   */
  private loadUsers(): void {
    this.service
      .getUsers()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: { status?: number }) => {
          if (err?.status === 403) {
            this.actorDropdownAvailable.set(false);
          } else {
            // Cualquier otro error también degrada silenciosamente —
            // el filtro no es crítico para la lectura de la tabla.
            this.actorDropdownAvailable.set(false);
            console.error('[AuditLogs] getUsers failed:', err);
          }
          this.users.set([]);
          return of([] as ReadonlyArray<AuditLogActor>);
        }),
      )
      .subscribe((users) => {
        if (users.length > 0) {
          this.users.set(users);
          this.actorDropdownAvailable.set(true);
        }
      });
  }

  /** Aplica filtros y resetea la página a 1 (R3-S4). */
  onFilterChange(next: AuditLogFilters): void {
    this.filters.set(next);
    this.currentPage.set(1);
    this.loadData();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadData();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadData();
  }

  /** Label del dropdown — firstName + lastName, "—" si vacío. */
  formatActor(actor: { firstName: string; lastName: string }): string {
    const name = `${actor.firstName} ${actor.lastName}`.trim();
    return name.length > 0 ? name : '—';
  }

  /** Formato de fecha corto para la tabla. */
  formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-EC', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * R4 — Descarga CSV. Pipeline: `service.exportCsv()` →
   * `URL.createObjectURL(blob)` → `<a download>` → click →
   * `revokeObjectURL`. **NUNCA** `window.open` (rompería auth
   * en una ventana sin cookies de sesión).
   */
  onDownloadCsv(): void {
    this.service
      .exportCsv(this.filters())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          this.toast.error(
            'No se pudo descargar el CSV. Intenta nuevamente.',
            'Error',
          );
          console.error('[AuditLogs] exportCsv failed:', err);
          return of(null);
        }),
      )
      .subscribe((blob) => {
        if (!blob) return;
        const dateStr = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }
}
