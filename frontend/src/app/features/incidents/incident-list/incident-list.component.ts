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
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../shared/components/table-skeleton/table-skeleton.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import { UiKpiCardComponent } from '../../../shared/components/ui-kpi-card/ui-kpi-card.component';
import { UiTableComponent } from '../../../shared/components/ui-table/ui-table.component';
import { ActionsDropdownComponent } from '../actions-dropdown/actions-dropdown.component';
import { AssignmentModalComponent } from '../assignment-modal/assignment-modal.component';
import { TrackingPanelComponent } from '../tracking-panel/tracking-panel.component';

// FIX-16 — reverse geocode cache (same approach as feed incident-card).
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
 * Extended with incidents-assignment feature:
 *   - Three-dot ActionsDropdown per row (Ver, Asignar, Seguimiento, Eliminar)
 *   - Toolbar "Asignar" bulk button (ASSIGN permission gate)
 *   - AssignmentModal overlay
 *   - TrackingPanel side panel
 *
 * State signals added:
 *   - dropdownOpenId: which row's dropdown is currently open
 *   - assignmentModalOpen: whether the assignment modal is visible
 *   - preSelectedIncidentId: incident pre-selected when modal opens from a row
 *   - trackingPanelOpen: whether the tracking panel is visible
 *   - trackingIncidentId: which incident to show in the tracking panel
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
    EmptyStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
    UiCardComponent,
    UiKpiCardComponent,
    UiTableComponent,
    ActionsDropdownComponent,
    AssignmentModalComponent,
    TrackingPanelComponent,
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
  readonly searchCtrl = new FormControl<string>('', { nonNullable: true });
  readonly statusFilter = signal<IncidentStatus | null>(null);
  readonly currentPage = signal<number>(1);

  // ── Data signals ───────────────────────────────────────────────────
  readonly loading = signal<boolean>(true);
  readonly incidents = signal<Incident[]>([]);
  readonly total = signal<number>(0);
  readonly locationNames = signal<Map<string, string>>(new Map());

  // ── Permission signals ─────────────────────────────────────────────
  readonly permissions = computed<string[]>(
    () => this.authService.user()?.permissions ?? [],
  );

  /**
   * True when the current user has the ASSIGN permission on assignments.
   * Format matches backend `RequirePermission('ASSIGN')` → resolved by the
   * permission guard as `'ASSIGN assignments'` (verb + resource).
   * Controls visibility of: toolbar "Asignar" button, row "Asignar" option.
   */
  readonly hasAssignPermission = computed<boolean>(() =>
    this.permissions().includes('ASSIGN assignments'),
  );

  // ── Assignment modal state ─────────────────────────────────────────
  readonly assignmentModalOpen = signal<boolean>(false);
  /** Incident pre-selected when modal is opened from a row action. */
  readonly preSelectedIncidentId = signal<string | null>(null);

  // ── Row dropdown state ─────────────────────────────────────────────
  /** ID of the incident whose dropdown is currently open. null = none. */
  readonly dropdownOpenId = signal<string | null>(null);

  // ── Tracking panel state ───────────────────────────────────────────
  readonly trackingPanelOpen = signal<boolean>(false);
  readonly trackingIncidentId = signal<string | null>(null);

  // ── Catálogos de filtros ──────────────────────────────────────────
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
  readonly territorialCoverage = signal<string | null>(null);
  readonly openIncidents = signal<string | null>(null);
  readonly avgResponseTime = signal<string | null>(null);

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.statusFilter.set((qp.get('status') as IncidentStatus | null) ?? null);
    this.currentPage.set(Number(qp.get('page') ?? '1'));

    this.searchCtrl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.currentPage.set(1);
      });

    this.fetch();
  }

  // ── Assignment modal ────────────────────────────────────────────────

  /**
   * Opens the assignment modal.
   * Optional `incidentId` pre-selects an incident (row "Asignar" action).
   * No argument = opens for manual selection (toolbar button).
   */
  openAssignmentModal(incidentId?: string): void {
    this.preSelectedIncidentId.set(incidentId ?? null);
    this.assignmentModalOpen.set(true);
    this.closeDropdown();
  }

  closeAssignmentModal(): void {
    this.assignmentModalOpen.set(false);
    this.preSelectedIncidentId.set(null);
  }

  onAssignmentCompleted(event: { incidentId: string; operatorId: string }): void {
    // Refresh the incident list to reflect the new assignment status
    this.fetch();
    this.closeAssignmentModal();
  }

  // ── Row dropdown ────────────────────────────────────────────────────

  openDropdown(incidentId: string): void {
    this.dropdownOpenId.set(incidentId);
  }

  closeDropdown(): void {
    this.dropdownOpenId.set(null);
  }

  // ── Tracking panel ──────────────────────────────────────────────────

  openTracking(incidentId: string): void {
    this.trackingIncidentId.set(incidentId);
    this.trackingPanelOpen.set(true);
    this.closeDropdown();
  }

  closeTracking(): void {
    this.trackingPanelOpen.set(false);
    this.trackingIncidentId.set(null);
  }

  // ── Existing methods (unchanged) ────────────────────────────────────

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

  badgePriorityFor(p: IncidentPriority): UiBadgePriority {
    return p;
  }

  private currentFilters(): IncidentListFilters {
    const f: IncidentListFilters = {};
    if (this.statusFilter()) f.status = this.statusFilter()!;
    return f;
  }

  navigateWithFilters(): void {
    const f = this.currentFilters();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: f,
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  }

  private fetch(): void {
    this.loading.set(true);
    const f = this.currentFilters();
    this.incidentService.getIncidents(f).subscribe({
      next: (result) => {
        this.incidents.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
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

  onStatusChange(value: IncidentStatus | null): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
    this.navigateWithFilters();
    this.fetch();
  }

  onClearFilters(): void {
    this.searchCtrl.setValue('');
    this.statusFilter.set(null);
    this.currentPage.set(1);
    this.navigateWithFilters();
    this.fetch();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.navigateWithFilters();
    this.fetch();
  }

  goToDetail(incident: Incident): void {
    this.router.navigate(['/app/incidencias', incident.id]);
  }

  readonly hasActiveFilters = computed(() => this.statusFilter() !== null);

  readonly rangeText = computed(() => {
    const total = this.total();
    if (total === 0) return 'Mostrando 0 de 0 incidencias';
    return `Mostrando ${total} de ${total} incidencia${total === 1 ? '' : 's'}`;
  });

  readonly shouldShowPagination = computed(() => false);

  truncate(title: string, max: number = 60): string {
    if (!title) return '';
    return title.length > max ? title.slice(0, max - 1) + '…' : title;
  }

  locationLabel(incident: Incident): string {
    const cached = this.locationNames().get(incident.id);
    if (cached) return cached;
    this.ensureLocationName(incident);
    const coords = this.getCoordinates(incident);
    if (coords) return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    return 'Ubicación general';
  }
}
