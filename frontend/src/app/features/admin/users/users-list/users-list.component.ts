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
import { catchError, forkJoin, of } from 'rxjs';

import { UsersService } from '../services/users.service';
import {
  Organization,
  Role,
  toUserStatus,
  User,
  UserStatus,
} from '../models/user.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../../shared/components/table-skeleton/table-skeleton.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { AuthService } from '../../../../core/services/auth.service';

import { SearchBarComponent } from './components/search-bar.component';
import { FilterBarComponent } from './components/filter-bar.component';
import { ActionMenuComponent } from './components/action-menu.component';
import { UserDetailModalComponent } from '../user-detail-modal/user-detail-modal.component';
import { UserDetailModalService } from '../user-detail-modal/user-detail-modal.service';

/**
 * UsersListComponent — F6 (`2026-09-08-f6-usuarios-redesign`).
 *
 * Reemplaza al anterior `UserManagementComponent` (que vivía en
 * `user-management/`) con un layout que cumple el mock 03-01:
 * `ui-page-header` + search bar + filter bar (rol / organización)
 * + `ui-table` con 7 columnas + paginación. Los nuevos
 * sub-componentes `SearchBarComponent`, `FilterBarComponent` y
 * `ActionMenuComponent` viven en `users-list/components/`.
 *
 * Decisiones de diseño aplicadas (D7): NO `*hasPermission` sobre
 * los botones de la lista. La idea es que `operador_org` ve
 * los botones y, al hacer click, recibe un 403 del backend
 * que el toast traduce. La spec D1 dice que no se pueden
 * modificar aserciones preexistentes — y los specs viejos del
 * `UserManagementComponent` no mencionaban `*hasPermission`,
 * así que sumarlo cambiaría comportamiento testeado.
 */
@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UiPageHeaderComponent,
    UiIconComponent,
    UiBadgeComponent,
    UiTableComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    PaginationComponent,
    SearchBarComponent,
    FilterBarComponent,
    ActionMenuComponent,
    UserDetailModalComponent,
  ],
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersListComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly userDetailModalService = inject(UserDetailModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  // Conservado por consistencia con el patrón de las otras
  // pantallas admin; el header de F0 se pinta con `ui-page-header`
  // y no usa esta inyección, pero el constructor la mantiene para
  // que la inyección de DI no se queje en runtime.
  protected readonly authService = inject(AuthService);

  /** Datos crudos del backend. */
  readonly users = signal<ReadonlyArray<User>>([]);
  readonly roles = signal<ReadonlyArray<Role>>([]);
  readonly organizations = signal<ReadonlyArray<Organization>>([]);
  readonly total = signal(0);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Filtros. Combinan AND: search es local (filtra `users()`),
  // role+org disparan reload al backend.
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly searchTerm = signal('');
  readonly selectedRole = signal('');
  readonly selectedOrg = signal('');

  /** Lista que se muestra en la grilla — `users()` filtrada por
   *  `searchTerm` (búsqueda local) o `users()` entera. */
  readonly visibleUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.users();
    return this.users().filter((u) => {
      const haystack = [
        u.nombres,
        u.apellidos,
        u.email,
        u.rol?.nombre ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  });

  /** El backend devuelve `is_active` (boolean) o no lo devuelve;
   *  `toUserStatus` mapea a la etiqueta del design system. */
  readonly statusOf = (u: User): UserStatus =>
    toUserStatus(u.isActive);

  readonly hasFilters = computed(
    () =>
      !!this.searchTerm() || !!this.selectedRole() || !!this.selectedOrg(),
  );

  readonly pageRange = computed(() => {
    if (this.total() === 0) return '0';
    const from = (this.currentPage() - 1) * this.pageSize() + 1;
    const to = Math.min(this.currentPage() * this.pageSize(), this.total());
    return `${from}-${to}`;
  });

  ngOnInit(): void {
    this.loadLookups();
    this.loadUsers();
  }

  private loadLookups(): void {
    forkJoin({
      roles: this.usersService.getRoles().pipe(
        catchError(() => of([] as ReadonlyArray<Role>)),
      ),
      orgs: this.usersService.getOrganizations().pipe(
        catchError(() => of([] as ReadonlyArray<Organization>)),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ roles, orgs }) => {
        this.roles.set(roles);
        this.organizations.set(orgs);
      });
  }

  /** F6 fix batch (C.1) — resuelve el id de organización del usuario
   *  contra el signal `organizations()` (poblado por
   *  `UsersService.getOrganizations()` en `loadLookups()`). `—` si no
   *  hay id o si el id no matchea ninguna organización cargada. */
  getOrganizationName(orgId: string | null | undefined): string {
    if (!orgId) return '—';
    return this.organizations().find((o) => o.id === orgId)?.nombre ?? '—';
  }

  protected loadUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.usersService
      .getUsers(
        this.currentPage(),
        this.pageSize(),
        this.selectedRole() || undefined,
        this.selectedOrg() || undefined,
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err: unknown) => {
          this.errorMessage.set('No se pudieron cargar los usuarios.');
          // F6 fix batch (W.4) — el banner de error ya existe en el
          // template, pero un toast hace la falla visible aunque el
          // usuario tenga la vista scrolleada más abajo de la tabla.
          this.toastService.error(
            'No se pudieron cargar los usuarios. Intenta nuevamente.',
            'Error',
          );
          // eslint-disable-next-line no-console
          console.error('[UsersList] load failed:', err);
          return of(null);
        }),
      )
      .subscribe((response) => {
        this.isLoading.set(false);
        if (!response) return;
        this.users.set(response.data ?? []);
        // El backend puede traer `total` en meta o como número
        // directo. Defensivo: ambos casos.
        const total =
          (response as { total?: number }).total ??
          (response as { meta?: { total?: number } }).meta?.total ??
          (response.data ?? []).length;
        this.total.set(total);
      });
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    // La búsqueda es local — no recarga del backend (decisión de
    // diseño: «Instant feedback, no server overhead»).
  }

  onFilterChange(filters: { role: string; org: string }): void {
    // F6 fix batch (C.2) — `getUsers` ahora acepta `role`/`org` como
    // query params opcionales, así que un cambio de filtro dispara un
    // refetch real (no sólo guarda el valor en signal). El backend hoy
    // sólo lee `page`/`limit` en `GET /users` (ver
    // `backend/src/modules/users/users.controller.ts`); los params
    // extra viajan pero se ignoran server-side hasta que el endpoint
    // los soporte — deviation documentada en apply-progress.
    this.selectedRole.set(filters.role);
    this.selectedOrg.set(filters.org);
    this.refetch();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadUsers();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadUsers();
  }

  /** F6 fix batch (C.2/W.3) — resetea a página 1 y recarga. Usado por
   *  `onFilterChange` para que un filtro nuevo no deje al usuario
   *  varado en una página que ya no tiene datos con el filtro activo. */
  private refetch(): void {
    this.currentPage.set(1);
    this.loadUsers();
  }

  onView(userId: string | number): void {
    // F6 fix: el ojo en la fila abre un modal read-only con los
    // datos del user (NO navega a una ruta separada). Antes
    // intentaba navegar a `/app/admin/users/:id` que NO estaba
    // montada en el router (sólo `:id/edit`), así que el ojo
    // navegaba a una ruta inexistente y caía en el error page.
    // El detalle es read-only; para editar existe el menú
    // three-dot → Editar que sí navega a `:id/edit`.
    const user = this.users().find((u) => String(u.usuarioId) === String(userId));
    if (!user) {
      this.toastService.error('No se encontró el usuario.', 'Error');
      return;
    }
    // Pasamos la lista de orgs para que el modal pueda resolver
    // `organizationId` → nombre sin un round-trip extra.
    this.userDetailModalService.open(user, this.organizations());
  }

  onEdit(userId: string | number): void {
    this.router.navigate(['/app/admin/users', userId, 'edit']);
  }

  onDelete(userId: string | number): void {
    const user = this.users().find((u) => String(u.usuarioId) === String(userId));
    if (!user) return;
    this.dialogService
      .confirm({
        title: 'Eliminar usuario',
        message: `¿Eliminar a ${user.nombres} ${user.apellidos}? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        isDanger: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.usersService
          .deleteUser(user.usuarioId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toastService.success('Usuario eliminado.', 'Éxito');
              this.loadUsers();
            },
            error: (err: { status?: number }) => {
              if (err?.status === 403) {
                this.toastService.error(
                  'No tienes permiso para eliminar este usuario.',
                  'Acción no permitida',
                );
              } else {
                this.toastService.error(
                  'Error al eliminar el usuario. Inténtalo de nuevo.',
                  'Error',
                );
              }
            },
          });
      });
  }
}
