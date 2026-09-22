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
import { TableToCardComponent } from '../../../../shared/components/table-to-card/table-to-card.component';
import { FilterDrawerComponent } from '../../../../shared/components/filter-drawer/filter-drawer.component';
import { USERS_CARD_FIELDS } from '../../../../shared/components/table-to-card/card-fields';
import { type CardField, type CardAction } from '../../../../shared/components/data-card/data-card.component';
import { type CardAction as ActionDropdownCardAction } from '../../../../shared/components/action-dropdown/action-dropdown.component';
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
    TableToCardComponent,
    FilterDrawerComponent,
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

  /** D9 — localStorage key for filter persistence. */
  private static readonly STORAGE_KEY = 'users-filters';

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
  // F6 fix: `pageSize` default es 10 para alinearse con el dropdown
  // de opciones [5, 10, 15, 20]. Al entrar a la ruta, muestra 10
  // datos y el selector dice "Mostrar: 10" (no "Mostrar: 5").
  readonly pageSize = signal(10);
  readonly searchTerm = signal('');
  readonly selectedRole = signal('');
  readonly selectedOrg = signal('');

  /**
   * Lista que se muestra en la grilla.
   *
   * Search is local; selectedRole/selectedOrg are ALSO applied locally
   * (AND combination) so filters work on the visible list immediately.
   * NOTE: the backend's `GET /users` ignores `role`/`org` query params
   * today (documented deviation, see apply-progress + users.service.ts);
   * keeping the filters local guarantees the UI honors them regardless,
   * matching how the spec's "Instant feedback" decision works for search.
   */
  readonly visibleUsers = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const role = this.selectedRole();
    const org = this.selectedOrg();
    return this.users().filter((u) => {
      // Search: match by name/email/role name.
      if (term) {
        const haystack = [
          u.nombres,
          u.apellidos,
          u.email,
          u.rol?.nombre ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      // Role filter: compare against the role's id (string-tolerant).
      if (role && String(u.rol?.rolId ?? '') !== String(role)) return false;
      // Org filter: compare against organizationId.
      if (org && String(u.organizationId ?? '') !== String(org)) return false;
      return true;
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

  // ── Card fields & actions (D1, D4, D8, S9.2) ──────────────────────
  /** 3-field card configuration for mobile card view (S9.2). */
  readonly cardFields: CardField[] = [...USERS_CARD_FIELDS];

  /** Items cast to Record format for TableToCardComponent. */
  readonly cardItems = computed<Record<string, unknown>[]>(() => {
    return this.visibleUsers().map((u) => ({
      ...u,
      nombre: `${u.nombres} ${u.apellidos}`.trim(),
      rol: u.rol?.nombre ?? 'Sin rol',
    })) as unknown as Record<string, unknown>[];
  });

  /** Card actions for mobile dropdown (edit, delete, permissions). */
  readonly cardActions = computed<CardAction[]>(() => {
    const actions: CardAction[] = [
      { id: 'edit', label: 'Editar' },
      { id: 'delete', label: 'Eliminar' },
    ];
    return actions;
  });

  // ── Load-more state (D5, S3.2) ───────────────────────────────────
  readonly hasMore = signal(false);
  readonly isLoadingMore = signal(false);
  private loadMorePage = 2;

  /** Append next page of users to the list (D5, S3.2). */
  loadMoreUsers(): void {
    this.isLoadingMore.set(true);
    this.usersService
      .getUsers(
        this.loadMorePage,
        this.pageSize(),
        this.selectedRole() || undefined,
        this.selectedOrg() || undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (!response) {
            this.isLoadingMore.set(false);
            return;
          }
          const newItems = response.data ?? [];
          this.users.update((prev) => [...prev, ...newItems]);
          const total =
            (response as { total?: number }).total ??
            (response as { meta?: { total?: number } }).meta?.total ??
            0;
          this.total.set(total);
          this.hasMore.set(newItems.length === this.pageSize());
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
    // D9 — Hydrate filter state from localStorage before loading data.
    const stored = localStorage.getItem(UsersListComponent.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          role?: string;
          org?: string;
          search?: string;
        };
        if (parsed.role) this.selectedRole.set(parsed.role);
        if (parsed.org) this.selectedOrg.set(parsed.org);
        if (parsed.search) this.searchTerm.set(parsed.search);
      } catch {
        // Malformed stored data — fall through to defaults
      }
    }
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
        // D5: hasMore depends on whether there are more pages
        this.loadMorePage = 2;
        this.hasMore.set((response.data ?? []).length === this.pageSize());
      });
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    // La búsqueda es local — no recarga del backend (decisión de
    // diseño: «Instant feedback, no server overhead»).
    // D9 — Persist search term to localStorage.
    localStorage.setItem(
      UsersListComponent.STORAGE_KEY,
      JSON.stringify({
        role: this.selectedRole(),
        org: this.selectedOrg(),
        search: term,
      }),
    );
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
    // D9 — Persist filter state to localStorage.
    localStorage.setItem(
      UsersListComponent.STORAGE_KEY,
      JSON.stringify({
        role: filters.role,
        org: filters.org,
        search: this.searchTerm(),
      }),
    );
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
    this.loadMorePage = 2;
    this.hasMore.set(false);
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

  /** Detail CTA on mobile card — same read-only modal as the desktop
   *  eye icon (`onView`). */
  onCardDetail(data: Record<string, unknown>): void {
    const id = data['usuarioId'];
    if (id != null) {
      this.onView(id as string);
    }
  }

  /** Dispatch mobile card dropdown actions (S9.2).
   *  Fix: `table-to-card` emits `actionClicked` but these outputs were
   *  never connected on mobile — desktop worked because `ui-table`
   *  uses `app-action-menu` directly. */
  onCardAction(event: { action: CardAction; data: Record<string, unknown> }): void {
    const id = event.data['usuarioId'];
    if (id == null) {
      this.toastService.error('No se encontró el usuario.', 'Error');
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
