import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { IncidentService } from '../../../core/services/incident.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  Incident,
  IncidentListFilters,
  IncidentStatus,
  IncidentPriority,
} from '../../../core/models/incident.model';

import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiBadgeComponent, UiBadgeStatus, UiBadgePriority } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { ViewActionBtnComponent } from '../../../shared/components/view-action-btn/view-action-btn.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../shared/components/table-skeleton/table-skeleton.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import { UiKpiCardComponent } from '../../../shared/components/ui-kpi-card/ui-kpi-card.component';
import { UiTableComponent } from '../../../shared/components/ui-table/ui-table.component';

// FIX-16 — reverse geocode cache (same approach as feed incident-card).
// Duplicated locally to avoid coupling feed ↔ list; both share Nominatim
// semantics (deduped by lat,lng rounded to 5 decimals).
const reverseGeocodeCache = new Map<string, string>();
const inFlightReverseGeocodes = new Map<string, Promise<string | null>>();

function reverseGeocodeKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

const PLACE_KEYS = ['parish', 'city', 'town', 'village', 'county', 'municipality', 'state'] as const;

function extractPlaceName(data: { address?: Record<string, string>; display_name?: string } | null): string | null {
  if (data?.address) {
    const parts = PLACE_KEYS.map((k) => data.address?.[k]).filter((v): v is string => !!v && v.length > 0);
    const unique = [...new Set(parts)];
    if (unique.length > 0) return unique.slice(0, 2).join(', ');
  }
  if (data?.display_name) {
    const parts = data.display_name.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts.slice(0, 2).join(', ');
  }
  return null;
}

/**
 * F3 (sc-303) — F3.2 Listado de Incidencias.
 *
 * Convenciones heredadas:
 *  - F0 primitivos (`ui-page-header`, `ui-table`, `ui-badge`,
 *    `empty-state`, `table-skeleton`, `pagination`, `ui-card`,
 *    `ui-kpi-card`).
 *  - D2 (design.md): los filtros viven en query params. El
 *    componente los deriva de `ActivatedRoute`; cambiar un
 *    filtro navega con los params nuevos. Un listado
 *    filtrado es compartible por enlace.
 *  - D8: las tarjetas de contexto muestran guion cuando la
 *    métrica está indisponible, **nunca cero** (cero es
 *    un valor legítimo).
 *  - F3.2.9: filtros combinables generan los query params
 *    correctos; restaurar desde URL reconstruye el estado;
 *    `empty-state` cuando no hay resultados.
 */
@Component({
  selector: 'app-incident-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiBadgeComponent,
    UiIconComponent,
    ViewActionBtnComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
    UiCardComponent,
    UiKpiCardComponent,
    UiTableComponent,
  ],
  templateUrl: './incident-list.component.html',
  styleUrl: './incident-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentListComponent implements OnInit {
  private readonly incidentService = inject(IncidentService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ── Filter signals (D2) ─────────────────────────────────────────────
  // Las señales se derivan de la URL al montar. La mutación
  // posterior navega (router.navigate) — el ciclo se cierra vía
  // ActivatedRoute.queryParams.
  //
  // F3 (sc-303) C1 (ronda 4) — sólo `statusFilter` se persiste en
  // la URL. `priorityFilter` y `searchCtrl` se mantienen como
  // estado en memoria (no se mandan al backend hoy) hasta que
  // un change de backend extienda `findAll`.
  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  readonly statusFilter = signal<IncidentStatus | null>(null);
  readonly currentPage = signal<number>(1);

  // ── Data signals ───────────────────────────────────────────────────
  readonly loading = signal<boolean>(true);
  readonly incidents = signal<Incident[]>([]);
  readonly total = signal<number>(0);

  // FIX-16 — location names resolved via Nominatim (key = incident.id).
  // Trigger change detection via signal update after fetch.
  readonly locationNames = signal<Map<string, string>>(new Map());

  // ── Permisos (para el menú de acciones de fila) ────────────────────
  // F3.4 / D4 — el detail lee `permissions` del usuario actual para
  // derivar las acciones via `availableActions()`. El listado sólo
  // las necesita si en el futuro agrega acciones en fila; por
  // ahora exponemos el signal para que `availableActions` y los
  // hijos que lo pidan encuentren la fuente única.
  readonly permissions = computed<string[]>(
    () => this.authService.user()?.permissions ?? [],
  );

  // ── Catálogos de filtros (mock 02-01) ──────────────────────────────
  // Los valores `pendiente`/`en_proceso`/`resuelto`/`cerrada` son
  // el `UiBadgeStatus` que el shared consume; el wire es inglés.
  readonly statusOptions: Array<{ value: IncidentStatus; label: string; badge: UiBadgeStatus }> = [
    { value: 'pending', label: 'Pendiente', badge: 'pendiente' },
    { value: 'in_progress', label: 'En proceso', badge: 'en_proceso' },
    { value: 'resolved', label: 'Resuelto', badge: 'resuelto' },
    { value: 'closed', label: 'Cerrado', badge: 'cerrada' },
  ];
  readonly priorityOptions: Array<{ value: IncidentPriority; label: string; badge: UiBadgePriority }> = [
    { value: 'low', label: 'Baja', badge: 'low' },
    { value: 'medium', label: 'Media', badge: 'medium' },
    { value: 'high', label: 'Alta', badge: 'high' },
    { value: 'critical', label: 'Crítica', badge: 'critical' },
  ];

  // ── Métricas de las tarjetas de contexto (D8) ─────────────────────
  // Cada `null` representa "indisponible" → se renderiza guion.
  // `0` es un valor legítimo: el backend lo informa y se muestra
  // como "0". Distinción crucial: el bug de mostrar `0` cuando
  // falló la consulta es lo que D8 prohíbe.
  readonly territorialCoverage = signal<string | null>(null);
  readonly openIncidents = signal<string | null>(null);
  readonly avgResponseTime = signal<string | null>(null);

  ngOnInit(): void {
    // 1) Hidratar filtros desde la URL (D2 — "restaurar desde URL
    //    reconstruye el estado"). Hoy sólo `status` se persiste.
    const qp = this.route.snapshot.queryParamMap;
    this.statusFilter.set((qp.get('status') as IncidentStatus | null) ?? null);
    this.currentPage.set(Number(qp.get('page') ?? '1'));

    // 2) La búsqueda libre se mantiene en memoria (FormControl)
    //    pero NO se manda al backend (C1 — el backend no la soporta).
    //    Cuando el backend extienda `findAll`, descomentar el
    //    handler y agregar el caso a `toQueryParams()`.
    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage.set(1);
        // No llamamos a navigateWithFilters ni a fetch: la
        // búsqueda es local hasta que el backend la soporte.
      });

    this.fetch();
  }

  /** Traduce `IncidentStatus` (wire) → `UiBadgeStatus` (F0). */
  badgeStatusFor(s: IncidentStatus): UiBadgeStatus {
    return (
      {
        pending: 'pendiente',
        in_progress: 'en_proceso',
        resolved: 'resuelto',
        closed: 'cerrada',
      } as const
    )[s];
  }

  /** Traduce `IncidentPriority` (wire) → `UiBadgePriority` (F0). */
  badgePriorityFor(p: IncidentPriority): UiBadgePriority {
    return p;
  }

  /** Construye los query params actuales. */
  private currentFilters(): IncidentListFilters {
    const f: IncidentListFilters = {};
    if (this.statusFilter()) f.status = this.statusFilter()!;
    // F3 (sc-303) C1 (ronda 4) — sólo `status` se persiste en
    // la URL hasta que el backend extienda `findAll`. Los
    // demás campos viven en memoria o en el paginator interno.
    return f;
  }

  /** Empuja el estado actual de los filtros a la URL (D2). */
  navigateWithFilters(): void {
    const f = this.currentFilters();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: f,
      queryParamsHandling: 'merge',
      replaceUrl: false, // cada cambio queda en el history; back funciona
    });
  }

  /** Carga la página actual con los filtros en la URL. */
  private fetch(): void {
    this.loading.set(true);
    const f = this.currentFilters();
    this.incidentService.getIncidents(f).subscribe({
      next: (result) => {
        this.incidents.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
        // FIX-16 — prefetch location names for visible rows.
        result.items.forEach((inc) => this.ensureLocationName(inc));
      },
      error: () => {
        this.incidents.set([]);
        this.total.set(0);
        this.loading.set(false);
      },
    });
  }

  private getCoordinates(inc: Incident): { lat: number; lng: number } | null {
    const geom = inc.geom as unknown;
    if (
      geom &&
      typeof geom !== 'string' &&
      typeof (geom as { coordinates?: unknown }).coordinates !== 'undefined' &&
      Array.isArray((geom as { coordinates: [number, number] }).coordinates) &&
      (geom as { coordinates: [number, number] }).coordinates.length === 2
    ) {
      const coords = (geom as { coordinates: [number, number] }).coordinates;
      return { lat: coords[1], lng: coords[0] };
    }
    if (typeof geom === 'string') {
      try {
        const parsed = JSON.parse(geom) as { coordinates?: [number, number] };
        if (parsed?.coordinates && parsed.coordinates.length === 2) {
          return { lat: parsed.coordinates[1], lng: parsed.coordinates[0] };
        }
      } catch {
        // fall through
      }
    }
    if (inc.lat != null && inc.lng != null) return { lat: inc.lat, lng: inc.lng };
    return null;
  }

  private ensureLocationName(inc: Incident): void {
    if (this.locationNames().has(inc.id)) return;
    const coords = this.getCoordinates(inc);
    if (!coords) return;
    const key = reverseGeocodeKey(coords.lat, coords.lng);

    const cached = reverseGeocodeCache.get(key);
    if (cached) {
      const next = new Map(this.locationNames());
      next.set(inc.id, cached);
      this.locationNames.set(next);
      return;
    }

    const inFlight = inFlightReverseGeocodes.get(key);
    if (inFlight) {
      inFlight.then((name) => {
        if (name) {
          const next = new Map(this.locationNames());
          next.set(inc.id, name);
          this.locationNames.set(next);
        }
      });
      return;
    }

    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;

    const request = window
      .fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&addressdetails=1`)
      .then((res) => res.json())
      .then((data) => {
        const name = extractPlaceName(data);
        if (name) {
          reverseGeocodeCache.set(key, name);
          return name;
        }
        return null;
      })
      .catch(() => null);

    inFlightReverseGeocodes.set(key, request);
    request.finally(() => inFlightReverseGeocodes.delete(key));
    request.then((name) => {
      if (name) {
        const next = new Map(this.locationNames());
        next.set(inc.id, name);
        this.locationNames.set(next);
      }
    });
  }

  // ── Filter handlers ────────────────────────────────────────────────
  onStatusChange(value: IncidentStatus | null): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
    this.navigateWithFilters();
    this.fetch();
  }

  onClearFilters(): void {
    this.searchCtrl.setValue('');
    this.statusFilter.set(null);
    // F3 (sc-303) C1 (ronda 4) — `priorityFilter` se retiró: el
    // backend no lo acepta y mandarlo en la URL es un no-op
    // silencioso. Cuando un change de backend agregue soporte,
    // se reintroduce la signal y se vuelve a montar el selector.
    this.currentPage.set(1);
    this.navigateWithFilters();
    this.fetch();
  }

  // ── Pagination ────────────────────────────────────────────────────
  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.navigateWithFilters();
    this.fetch();
  }

  // ── Row navigation ────────────────────────────────────────────────
  goToDetail(incident: Incident): void {
    this.router.navigate(['/app/incidencias', incident.id]);
  }

  // ── Derived UI helpers ────────────────────────────────────────────
  // F3 (sc-303) C1 (ronda 4) — `hasActiveFilters` considera sólo
  // `status` hasta que el backend extienda `findAll`. La búsqueda
  // libre se mantiene en memoria (FormControl) pero no se cuenta
  // como "filtro activo" hasta que el backend la respete.
  readonly hasActiveFilters = computed(() => this.statusFilter() !== null);

  readonly rangeText = computed(() => {
    const total = this.total();
    if (total === 0) return 'Mostrando 0 de 0 incidencias';
    // F3 (sc-303) C1 (ronda 4) — sin paginación real del backend,
    // el rango siempre es `N de N`. Cuando se extienda `findAll`,
    // el template vuelve a `start-end de N`.
    return `Mostrando ${total} de ${total} incidencia${total === 1 ? '' : 's'}`;
  });

  /**
   * F3 (sc-303) C1 (ronda 4) — el backend no pagina. Mostrar el
   * paginador cuando hay un solo "page" real sería prometer una
   * navegación que no existe. Cuando el backend extienda `findAll`
   * con `page`/`limit` y un envelope con `total` real, esta guarda
   * se sustituye por `total() > pageSize`.
   */
  readonly shouldShowPagination = computed(() => false);

  /** Trunca el título a N chars con elipsis (F3.2.5). */
  truncate(title: string, max: number = 60): string {
    if (!title) return '';
    return title.length > max ? title.slice(0, max - 1) + '…' : title;
  }

  /** Ubicación textual: reverse name si está resuelto, else coordenadas 4 decimales (FIX-16). */
  locationLabel(incident: Incident): string {
    const cached = this.locationNames().get(incident.id);
    if (cached) return cached;
    // Kick off fetch lazily if not already cached/in-flight (covers rows rendered after fetch).
    this.ensureLocationName(incident);
    const coords = this.getCoordinates(incident);
    if (coords) return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    return 'Ubicación general';
  }
}
