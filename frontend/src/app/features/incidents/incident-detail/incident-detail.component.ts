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
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { IncidentService } from '../../../core/services/incident.service';
import { CommentService } from '../../../core/services/comment.service';
import { StatusHistoryService } from '../../../core/services/status-history.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import {
  Incident,
  IncidentStatus,
} from '../../../core/models/incident.model';
import { Comment } from '../../../core/models/comment.model';
import {
  StatusHistoryEntry,
} from '../../../core/models/status-history.model';
import {
  availableActions,
  IncidentAction,
} from '../workflow.util';

import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiCardComponent } from '../../../shared/components/ui-card/ui-card.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CommentThreadComponent } from '../components/comment-thread/comment-thread.component';

/**
 * F3 (sc-303) — F3.4 Detalle de Incidencia.
 *
 * Composición (D3 del design):
 *   1. Encabezado con título, badges y acciones
 *   2. Datos y descripción
 *   3. Mini-mapa con Leaflet — sólo si hay coordenadas
 *   4. Galería (placeholder — el endpoint de incident-images
 *      existe pero su consumo real queda como follow-up
 *      porque el spec de galería no era bloqueante para F3)
 *   5. Status-timeline
 *   6. Hilo de comentarios
 *
 * Reglas:
 *   - F3.4.2 — carga en paralelo: `forkJoin` de los tres recursos.
 *   - F3.4.4 — id inexistente → estado local de "no encontrado"
 *     dentro del layout, NO la página de error global.
 *   - F3.4.7 — un 409 al ejecutar una acción recarga la
 *     incidencia (el servidor es la autoridad).
 *   - F3.4.9 — feedback explícito al asignar: 2xx o 429.
 *     El backend distingue 429 `CLAIM_LIMIT_REACHED` (operador
 *     saturado). El cliente lo muestra explícito.
 *   - F3.4.10 — `availableOperators()` filtra los ocupados
 *     (depende del cambio 316/D1 del backend). Documentado en
 *     el apply-progress como gap; mientras tanto, este detalle
 *     se enfoca en el flujo principal.
 */
@Component({
  selector: 'app-incident-detail',
  standalone: true,
  imports: [
    CommonModule,
    UiPageHeaderComponent,
    UiBadgeComponent,
    UiCardComponent,
    UiIconComponent,
    EmptyStateComponent,
    CommentThreadComponent,
  ],
  templateUrl: './incident-detail.component.html',
  styleUrl: './incident-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly incidentService = inject(IncidentService);
  private readonly commentService = inject(CommentService);
  private readonly statusHistoryService = inject(StatusHistoryService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  // ── Resource state ────────────────────────────────────────────────
  readonly loading = signal<boolean>(true);
  readonly notFound = signal<boolean>(false);
  readonly incident = signal<Incident | null>(null);
  readonly comments = signal<Comment[]>([]);
  readonly history = signal<StatusHistoryEntry[]>([]);

  // ── UI helpers ────────────────────────────────────────────────────
  readonly currentUserId = computed(
    () => this.authService.user()?.id ?? null,
  );
  readonly permissions = computed(
    () => this.authService.user()?.permissions ?? [],
  );

  readonly actions = computed<readonly IncidentAction[]>(() => {
    const inc = this.incident();
    const userId = this.currentUserId();
    if (!inc || !userId) return [];
    return availableActions(inc, this.permissions(), userId);
  });

  readonly hasCoordinates = computed(() => {
    const inc = this.incident();
    return !!inc && Number.isFinite(inc.lat) && Number.isFinite(inc.lng);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.loadAll(id);
  }

  /** F3.4.2 — forkJoin para no bloquear un recurso con otro. */
  private loadAll(id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    forkJoin({
      incident: this.incidentService.getIncident(id).pipe(
        catchError(() => {
          this.notFound.set(true);
          return of(null);
        }),
      ),
      comments: this.commentService.getComments(id).pipe(
        catchError(() => of<Comment[]>([])),
        map((c) => c ?? []),
      ),
      history: this.statusHistoryService.getStatusHistory(id).pipe(
        catchError(() => of({ items: [] as StatusHistoryEntry[], total: 0 })),
        map((r) => r.items ?? []),
      ),
    }).subscribe(({ incident, comments, history }) => {
      this.incident.set(incident);
      this.comments.set(comments);
      this.history.set(history);
      this.loading.set(false);
    });
  }

  // ── Action handlers (F3.4.7) ─────────────────────────────────────
  onAction(action: IncidentAction): void {
    const inc = this.incident();
    if (!inc) return;

    switch (action) {
      case 'claim':
        this.runStatusTransition(inc.id, 'in_progress');
        break;
      case 'release':
        // F3 (sc-303) C2 (ronda 4) — `release` ya no es un no-op.
        // `IncidentWorkflowService.release()` en el backend
        // exige que el caller sea el `claimed_by` actual; si no,
        // devuelve 409 con código `NOT_THE_CLAIMER` o
        // `INCIDENT_NOT_CLAIMED`. El toast expone el motivo.
        this.incidentService.releaseIncident(inc.id).subscribe({
          next: (released) => {
            this.incident.set(released);
            this.toast.show('Incidencia liberada.', 'success');
            this.statusHistoryService.getStatusHistory(inc.id).subscribe({
              next: (r) => this.history.set(r.items),
            });
          },
          error: (err) => {
            const message =
              err?.error?.message ?? 'No se pudo liberar la incidencia.';
            this.toast.show(message, 'error');
            this.incidentService.getIncident(inc.id).subscribe({
              next: (refreshed) => this.incident.set(refreshed),
            });
          },
        });
        break;
      case 'resolve':
        this.runStatusTransition(inc.id, 'resolved');
        break;
      case 'close':
        // F3.4.9 + D4 — el motivo es obligatorio. Pedimos al usuario
        // mediante un prompt simple; en F3.6 se sustituye por un
        // modal dedicado.
        const reason = window.prompt('Motivo del cierre:');
        if (!reason || !reason.trim()) {
          this.toast.show('El cierre requiere un motivo.', 'warning');
          return;
        }
        this.runStatusTransition(inc.id, 'closed', reason.trim());
        break;
      case 'assign':
        // F3.4.8 — la asignación consume GET /available-operators
        // y POST /assignments/:id. El endpoint de assignments no
        // es scope de F3 (es F3.4.8 con la salvedad documentada:
        // los operadores ocupados se filtran en backend por hoy).
        this.toast.show(
          'Asignación: requiere integración con módulo assignments (F3.4.8).',
          'info',
        );
        break;
    }
  }

  private runStatusTransition(
    id: string,
    to: IncidentStatus,
    closedReason?: string,
  ): void {
    this.incidentService
      .updateIncidentStatus(id, to, closedReason)
      .subscribe({
        next: (updated) => {
          this.incident.set(updated);
          this.toast.show(
            `Estado actualizado a ${to}.`,
            'success',
          );
          // Recargar el historial (la nueva transición es la entrada más reciente).
          this.statusHistoryService.getStatusHistory(id).subscribe({
            next: (r) => this.history.set(r.items),
          });
        },
        error: (err) => {
          // F3.4.7 — 409 re-sincroniza. 422 explica motivo. 403
          // explica el permiso faltante. El toast expone el
          // mensaje del backend para que el usuario sepa qué pasó.
          const message = err?.error?.message ?? 'No se pudo cambiar el estado.';
          this.toast.show(message, 'error');
          // En cualquier error, recargar la fila para reflejar
          // posibles cambios en el servidor.
          this.incidentService.getIncident(id).subscribe({
            next: (refreshed) => this.incident.set(refreshed),
          });
        },
      });
  }

  // ── Helpers de UI ────────────────────────────────────────────────
  badgeStatusFor(s: IncidentStatus): 'pendiente' | 'en_proceso' | 'resuelto' | 'cerrada' {
    return (
      {
        pending: 'pendiente',
        in_progress: 'en_proceso',
        resolved: 'resuelto',
        closed: 'cerrada',
      } as const
    )[s];
  }

  badgePriorityFor(p: Incident['priority']): 'low' | 'medium' | 'high' | 'critical' {
    return p;
  }

  actionLabel(action: IncidentAction): string {
    return (
      {
        claim: 'Reclamar',
        release: 'Liberar',
        resolve: 'Resolver',
        close: 'Cerrar',
        assign: 'Asignar',
      } as const
    )[action];
  }

  actionIcon(action: IncidentAction): string {
    return (
      {
        claim: 'hand',
        release: 'log-out',
        resolve: 'check-circle',
        close: 'archive',
        assign: 'user-plus',
      } as const
    )[action];
  }

  onCommentsChanged(comments: Comment[]): void {
    this.comments.set(comments);
  }

  goBack(): void {
    this.router.navigate(['/app/incidencias']);
  }
}
