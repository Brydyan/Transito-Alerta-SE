import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';

import { DepartmentService } from '../services/department.service';
import { IDepartment } from '../interfaces/idepartment.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../../shared/components/table-skeleton/table-skeleton.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

// Roles that bypass the per-org scoping (mirror of backend's
// GLOBAL_ROLES set in DepartmentsController). Used by D9 to decide
// whether to render the Organization column.
const GLOBAL_ROLES = new Set(['master', 'operador_sistema']);

/**
 * DepartmentListComponent (`front/2026-09-15-departments-menu`).
 *
 * Mirrors the `CategoryListComponent` shape but adds the dept-specific
 * UX (D2/D4/D8/D9):
 *   - 400ms debounce on the search box (D4 — spec is explicit; categories
 *     use 300ms).
 *   - Page-size options [10, 20, 50] (D5 — categories use [5,10,20]).
 *   - Organization column hidden for non-master callers (D9).
 *   - Delete confirm carries a `user_count > 0` warning so admins
 *     know they're about to orphan operators.
 *   - Delete response includes `deleted_at` (D8) — rendered in the
 *     success toast for transparency.
 */
@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginationComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    HasPermissionDirective,
    UiPageHeaderComponent,
    UiTableComponent,
    UiIconComponent,
  ],
  templateUrl: './department-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepartmentListComponent implements OnInit, OnDestroy {
  private readonly departmentService = inject(DepartmentService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  private readonly search$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  readonly departments = signal<IDepartment[]>([]);
  readonly isLoading = signal(true);
  readonly searchInput = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly totalItems = signal(0);

  /** D5: [10, 20, 50]. Backend MAX_PAGE_SIZE = 100, so all three are legal. */
  readonly pageSizeOptions = [10, 20, 50];

  /** D9: organization column visible for master + operador_sistema only. */
  readonly showOrganizationColumn = computed(() => {
    const role = this.authService.currentUser()?.roleName ?? null;
    return role !== null && GLOBAL_ROLES.has(role);
  });

  /** Display label for the master/org column. */
  readonly organizationHeaderLabel = 'Organización';

  ngOnInit(): void {
    // Server-side search with 400ms debounce (D4). distinctUntilChanged
    // keeps back-to-back identical keystrokes (e.g. typing then deleting
    // to the same value) from triggering redundant requests.
    this.subscriptions.add(
      this.search$
        .pipe(
          debounceTime(400),
          distinctUntilChanged(),
          tap(() => this.currentPage.set(1)),
          switchMap((term) => this.loadPageStream(term)),
        )
        .subscribe({
          next: (result) => {
            this.departments.set(result.items);
            this.totalItems.set(result.total);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastService.error('No se pudieron cargar los departamentos.');
            this.isLoading.set(false);
          },
        }),
    );

    // Initial load.
    this.loadPage();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchInput.set(value);
    this.search$.next(value);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadPage();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadPage();
  }

  navigateToCreate(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  navigateToEdit(dept: IDepartment): void {
    this.router.navigate([dept.id, 'edit'], { relativeTo: this.route });
  }

  deleteDepartment(dept: IDepartment): void {
    const usersInDept = dept.user_count ?? 0;
    const orphanWarning =
      usersInDept > 0
        ? ` Este departamento tiene ${usersInDept} usuario(s) asignado(s) que quedarán sin departamento.`
        : '';

    this.dialogService
      .confirm({
        title: 'Confirmar eliminación',
        message: `¿Estás seguro de que deseas eliminar "${dept.name}"? Esta acción no se puede deshacer.${orphanWarning}`,
        isDanger: true,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.subscriptions.add(
          this.departmentService.remove(dept.id).subscribe({
            next: ({ deleted_at }) => {
              const stamp = new Date(deleted_at).toLocaleString();
              this.toastService.success(`Departamento eliminado el ${stamp}`);
              this.loadPage();
            },
            error: (err: { error?: { message?: string } }) => {
              const msg = err.error?.message ?? 'No se pudo eliminar el departamento.';
              this.toastService.error(msg);
            },
          }),
        );
      });
  }

  private loadPage(): void {
    this.isLoading.set(true);
    this.subscriptions.add(this.loadPageStream(this.searchInput()).subscribe({
      next: (result) => {
        this.departments.set(result.items);
        this.totalItems.set(result.total);
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error('No se pudieron cargar los departamentos.');
        this.isLoading.set(false);
      },
    }));
  }

  /**
   * Shared between the search stream and the explicit reloads
   * (delete, page change, page-size change). Returns a fresh observable
   * per call so multiple subscribers don't share state.
   */
  private loadPageStream(term: string) {
    return this.departmentService.list({
      search: term || undefined,
      page: this.currentPage(),
      per_page: this.pageSize(),
    });
  }
}
