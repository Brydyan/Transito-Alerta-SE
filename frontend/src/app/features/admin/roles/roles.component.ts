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
  readonly pageSize = signal(25);
  readonly searchTerm = signal('');

  /** Filtro local por nombre (decisión del design: «Search local —
   *  Small dataset (5 roles), fast»). */
  readonly visibleRoles = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.roles();
    return this.roles().filter((r) => r.nombre.toLowerCase().includes(term));
  });

  readonly hasFilters = computed(() => !!this.searchTerm());

  readonly pageRange = computed(() => {
    if (this.total() === 0) return '0';
    const from = (this.currentPage() - 1) * this.pageSize() + 1;
    const to = Math.min(this.currentPage() * this.pageSize(), this.total());
    return `${from}-${to}`;
  });

  ngOnInit(): void {
    this.loadRoles();
    this.loadStats();
  }

  private loadStats(): void {
    this.rolesService
      .getRoleStats()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          // eslint-disable-next-line no-console
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
          // eslint-disable-next-line no-console
          console.error('[Roles] load failed:', err);
          this.isLoading.set(false);
          return of<RoleListItem[] | null>(null);
        }),
      )
      .subscribe((list) => {
        this.isLoading.set(false);
        if (!list) return;
        this.roles.set(list);
        // El backend puede traer `total` aparte o como parte de
        // la respuesta. Defensivo: caer al length si falta.
        this.total.set(list.length);
      });
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
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
    this.loadRoles();
  }

  onView(roleId: string | number): void {
    this.router.navigate(['/app/admin/roles', roleId]);
  }

  onEdit(roleId: string | number): void {
    this.router.navigate(['/app/admin/roles', roleId, 'edit']);
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
