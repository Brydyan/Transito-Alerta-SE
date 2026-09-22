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
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { RolesService } from './services/roles.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  RoleListItem,
  RoleStats,
} from './models/role-permission.interface';

import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiTableComponent } from '../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../shared/components/table-skeleton/table-skeleton.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SearchBarComponent } from '../users/users-list/components/search-bar.component';
import { ActionMenuComponent } from '../users/users-list/components/action-menu.component';
import { StatsCardsComponent } from './components/stats-cards.component';
import { TableToCardComponent } from '../../../shared/components/table-to-card/table-to-card.component';
import { FilterDrawerComponent } from '../../../shared/components/filter-drawer/filter-drawer.component';
import { ROLES_CARD_FIELDS } from '../../../shared/components/table-to-card/card-fields';
import { type CardField, type CardAction } from '../../../shared/components/data-card/data-card.component';

/**
 * RolesComponent rediseñado — F6 (`2026-09-08-f6-roles-redesign`).
 *
 * Reemplaza el scaffold anterior con un layout que cumple el mock
 * 04-01: `ui-page-header` + search + `ui-table` con 3 columnas
 * (NOMBRE | PERMISOS | ACCIONES) + paginación + `StatsCardsComponent`
 * con 3 tarjetas agregadas (Total Permisos / Módulos Protegidos /
 * Usuarios Asignados).
 *
 * Componentes reusados de la fase `f6-usuarios-redesign` (mismo
 * branch): `SearchBarComponent` y `ActionMenuComponent`. Sin
 * `*hasPermission` (D7): ver la lista de roles es universal para
 * admins; el botón de eliminar siempre se ve, y el 403 del backend
 * se traduce a un toast específico.
 */
@Component({
  selector: 'app-roles',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UiPageHeaderComponent,
    UiTableComponent,
    UiIconComponent,
    UiBadgeComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
    SearchBarComponent,
    ActionMenuComponent,
    StatsCardsComponent,
    TableToCardComponent,
    FilterDrawerComponent,
  ],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  /** D9 — localStorage key for filter persistence. */
  private static readonly STORAGE_KEY = 'roles-filters';

  readonly roles = signal<ReadonlyArray<RoleListItem>>([]);
  readonly stats = signal<RoleStats>({
    totalPermissions: 0,
    protectedModules: 0,
    assignedUsers: 0,
  });
  readonly total = signal(0);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly currentPage = signal(1);
  // F6 fix: `pageSize` default es 10 para alinearse con el dropdown
  // de opciones [5, 10, 15, 20]. Al entrar a la ruta, muestra 10
  // datos y el selector dice "Mostrar: 10" (no "Mostrar: 5").
  readonly pageSize = signal(10);
  readonly searchTerm = signal('');

  /** Filtro local por nombre (decisión del design: «Search local —
   *  Small dataset (5 roles), fast»). */
  readonly visibleRoles = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.roles();
    return this.roles().filter((r) => r.nombre.toLowerCase().includes(term));
  });

  readonly hasFilters = computed(() => !!this.searchTerm());

  // ── Card fields & actions (D1, D4, D8, S9.3) ──────────────────────
  /** 3-field card configuration for mobile card view (S9.3). */
  readonly cardFields: CardField[] = [...ROLES_CARD_FIELDS];

  /** Items cast to Record format for TableToCardComponent.
   *  Uses `visibleRoles()` so the mobile card view reflects the local
   *  search term — previously it mapped raw `roles()` and the cards
   *  ignored search while the desktop table honored it. */
  readonly cardItems = computed<Record<string, unknown>[]>(() => {
    return this.visibleRoles().map((r) => ({
      ...r,
      permisosCount: r.permissionCount ?? 0,
      usuariosCount: 0,
    })) as unknown as Record<string, unknown>[];
  });

  /** Card actions for mobile dropdown (edit, delete). */
  readonly cardActions = computed<CardAction[]>(() => {
    return [
      { id: 'edit', label: 'Editar' },
      { id: 'delete', label: 'Eliminar' },
    ];
  });

  // ── Load-more state (D5, S3.2) ───────────────────────────────────
  readonly hasMore = signal(false);
  readonly isLoadingMore = signal(false);
  private loadMorePage = 2;

  /** Append next page of roles to the list (D5, S3.2). */
  loadMoreRoles(): void {
    this.isLoadingMore.set(true);
    this.rolesService
      .getRoles(this.loadMorePage, this.pageSize(), this.searchTerm() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          if (!list) {
            this.isLoadingMore.set(false);
            return;
          }
          this.roles.update((prev) => [...prev, ...list]);
          this.total.set(this.roles().length);
          this.hasMore.set(list.length === this.pageSize());
          this.loadMorePage++;
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.isLoadingMore.set(false);
        },
      });
  }

  readonly pageRange = computed(() => {
    if (this.total() === 0) return '0';
    const from = (this.currentPage() - 1) * this.pageSize() + 1;
    const to = Math.min(this.currentPage() * this.pageSize(), this.total());
    return `${from}-${to}`;
  });

  ngOnInit(): void {
    // D9 — Hydrate search from localStorage before loading data.
    const stored = localStorage.getItem(RolesComponent.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { search?: string };
        if (parsed.search) this.searchTerm.set(parsed.search);
      } catch {
        // Malformed stored data — fall through to defaults
      }
    }
    this.loadRoles();
    this.loadStats();
  }

  /**
   * Change `2026-09-09-roles-stats-endpoint` — restaurado del commit
   * `9d19888c1` (2026-09-08) que lo había quitado porque el endpoint
   * backend no existía. Ahora `GET /api/roles/stats` está implementado
   * en `backend/src/modules/roles/roles.controller.ts` y devuelve
   * `{totalPermissions, protectedModules, assignedUsers}`. El
   * `catchError` degrada a ceros si el endpoint falla, así que la UI
   * nunca rompe (sólo muestra 0/0/0).
   */
  private loadStats(): void {
    this.rolesService
      .getRoleStats()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          console.error('[Roles] stats failed:', err);
          return of<RoleStats>({
            totalPermissions: 0,
            protectedModules: 0,
            assignedUsers: 0,
          });
        }),
      )
      .subscribe((stats) => this.stats.set(stats));
  }

  protected loadRoles(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.rolesService
      .getRoles(this.currentPage(), this.pageSize(), this.searchTerm() || undefined)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          this.errorMessage.set('No se pudieron cargar los roles.');
          this.toast.error(
            'No se pudieron cargar los roles. Intenta nuevamente.',
            'Error',
          );
          console.error('[Roles] load failed:', err);
          this.isLoading.set(false);
          return of<RoleListItem[] | null>(null);
        }),
      )
      .subscribe({
        next: (list) => {
          this.isLoading.set(false);
          if (!list) {
            return;
          }
          this.roles.set(list);
          this.total.set(list.length);
          // D5: hasMore depends on whether more items are available
          this.loadMorePage = 2;
          this.hasMore.set(list.length === this.pageSize());
        },
        error: (err) => {
          console.error('[Roles] subscription error:', err);
          this.isLoading.set(false);
        }
      });
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    // D9 — Persist search term to localStorage.
    localStorage.setItem(
      RolesComponent.STORAGE_KEY,
      JSON.stringify({ search: term }),
    );
    this.refetch();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadRoles();
  }

  /** Reset a página 1 + recarga — usado por `onSearch` para que
   *  un filtro nuevo no deje al usuario en una página vacía. */
  private refetch(): void {
    this.currentPage.set(1);
    this.loadMorePage = 2;
    this.hasMore.set(false);
    this.loadRoles();
  }

  onView(roleId: string | number): void {
    this.router.navigate(['/app/admin/roles', roleId]);
  }

  /** Detail CTA on mobile card — same navigation as the desktop eye
   *  icon (`onView`). */
  onCardDetail(data: Record<string, unknown>): void {
    const id = data['rolId'];
    if (id != null) {
      this.onView(id as string);
    }
  }

  /** Dispatch mobile card dropdown actions (S9.3).
   *  Fix: `table-to-card` emits `actionClicked` but these outputs were
   *  never connected on mobile — desktop worked because `ui-table`
   *  uses `app-action-menu` directly. */
  onCardAction(event: { action: CardAction; data: Record<string, unknown> }): void {
    const id = event.data['rolId'];
    if (id == null) {
      this.toast.error('No se encontró el rol.', 'Error');
      return;
    }
    switch (event.action.id) {
      case 'edit':
        this.onEdit(id as string);
        break;
      case 'delete':
        this.onDelete(id as string);
        break;
      default:
        break;
    }
  }

  onEdit(roleId: string | number): void {
    // F6 fix: la ruta del editor es `roles/:rolId` (sibling de
    // `roles`, no child con segmento `/edit`). Antes navegaba a
    // `/app/admin/roles/:id/edit` que NO matcheaba ninguna
    // ruta (los users sí tienen `/edit`, los roles no) y caía
    // en el wildcard `**` → error page.
    this.router.navigate(['/app/admin/roles', roleId]);
  }

  onDelete(roleId: string | number): void {
    const role = this.roles().find((r) => String(r.rolId) === String(roleId));
    if (!role) return;
    this.dialogService
      .confirm({
        title: 'Eliminar rol',
        message: `¿Eliminar el rol ${role.nombre}? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        isDanger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.rolesService
          .deleteRole(role.rolId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success('Rol eliminado.', 'Éxito');
              this.loadRoles();
            },
            error: (err: { status?: number }) => {
              if (err?.status === 403) {
                this.toast.error(
                  'No tienes permiso para eliminar este rol.',
                  'Acción no permitida',
                );
              } else {
                this.toast.error(
                  'Error al eliminar el rol. Inténtalo de nuevo.',
                  'Error',
                );
              }
            },
          });
      });
  }
}
