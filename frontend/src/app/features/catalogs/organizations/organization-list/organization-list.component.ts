import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { OrganizationService } from '../services/organization.service';
import { IOrganization } from '../interfaces/iorganization.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../../shared/components/table-skeleton/table-skeleton.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

@Component({
  selector: 'app-organization-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginationComponent,
    EmptyStateComponent,
    TableSkeletonComponent,
    HasPermissionDirective,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiTableComponent,
    UiIconComponent,
  ],
  templateUrl: './organization-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationListComponent implements OnInit, OnDestroy {
  private readonly organizationService = inject(OrganizationService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly search$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  readonly organizations = signal<IOrganization[]>([]);
  readonly isLoading = signal(true);
  readonly searchInput = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly totalItems = signal(0);

  readonly pageSizeOptions = [5, 10, 20];

  /**
   * Catálogo completo. Las tarjetas del mock 08-01 se calculan sobre todas
   * las organizaciones, no sobre la página visible: «5 Cantones» con 10 filas
   * en pantalla sería un número distinto según la paginación.
   */
  private readonly allOrganizations = signal<IOrganization[]>([]);

  /** `zone_id` → nombre, resuelto vía `GET /organizations/form-data`. */
  private readonly zoneNames = signal<Map<string, string>>(new Map());

  /** Tarjeta «TOTAL ORGANIZACIONES». */
  readonly totalCount = computed(() => this.allOrganizations().length);

  /**
   * Tarjeta «CIUDADES ALCANZADAS»: zonas **distintas** con al menos una
   * organización. En el mock, once entidades cubren cinco cantones — es el
   * conteo de zonas, no de filas. Las organizaciones sin zona no cuentan.
   */
  readonly citiesReached = computed(() => {
    const zones = new Set<string>();
    for (const organization of this.allOrganizations()) {
      if (organization.zone_id) {
        zones.add(organization.zone_id);
      }
    }
    return zones.size;
  });

  /** Tarjeta «NUEVAS (ESTE MES)». */
  readonly monthCount = computed(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return this.allOrganizations().filter((organization) => {
      const created = new Date(organization.created_at);
      return created.getMonth() === month && created.getFullYear() === year;
    }).length;
  });

  /** Nombre de la zona para la columna «LOCALIZACIÓN». */
  zoneName(zoneId: string | null): string {
    if (!zoneId) {
      return '—';
    }
    return this.zoneNames().get(zoneId) ?? '—';
  }

  ngOnInit(): void {
    this.loadSummary();

    this.subscriptions.add(
      this.search$
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
          tap(() => this.currentPage.set(1)),
          switchMap((term) =>
            this.organizationService.list({
              search: term || undefined,
              page: this.currentPage(),
              per_page: this.pageSize(),
            }),
          ),
        )
        .subscribe({
          next: (result) => {
            this.organizations.set(result.items);
            this.totalItems.set(result.total);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastService.error('Failed to load organizations.');
            this.isLoading.set(false);
          },
        }),
    );

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

  navigateToEdit(organization: IOrganization): void {
    this.router.navigate([organization.id, 'edit'], { relativeTo: this.route });
  }

  deleteOrganization(organization: IOrganization): void {
    this.dialogService
      .confirm({
        title: 'Confirm deletion',
        message: `Are you sure you want to delete "${organization.name}"? This action cannot be undone.`,
        isDanger: true,
        confirmText: 'Delete',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.subscriptions.add(
            this.organizationService.remove(organization.id).subscribe({
              next: () => {
                this.toastService.success('Organization deleted successfully');
                this.loadPage();
                this.loadSummary();
              },
              error: (err: { error?: { message?: string } }) => {
                const msg = err.error?.message ?? 'Failed to delete organization.';
                this.toastService.error(msg);
              },
            }),
          );
        }
      });
  }

  /**
   * Carga el catálogo completo y el mapa de zonas para las tarjetas y la
   * columna «LOCALIZACIÓN». Se vuelve a pedir tras cada borrado para que los
   * conteos no queden desfasados.
   */
  private loadSummary(): void {
    this.subscriptions.add(
      this.organizationService.listAll().subscribe({
        next: (items) => this.allOrganizations.set(items),
        error: () => this.allOrganizations.set([]),
      }),
    );

    this.subscriptions.add(
      this.organizationService.formData().subscribe({
        next: (data) =>
          this.zoneNames.set(new Map(data.geo_zones.map((z) => [z.id, z.name]))),
        error: () => this.zoneNames.set(new Map()),
      }),
    );
  }

  private loadPage(): void {
    this.isLoading.set(true);
    this.subscriptions.add(
      this.organizationService
        .list({
          search: this.searchInput() || undefined,
          page: this.currentPage(),
          per_page: this.pageSize(),
        })
        .subscribe({
          next: (result) => {
            this.organizations.set(result.items);
            this.totalItems.set(result.total);
            this.isLoading.set(false);
          },
          error: () => {
            this.toastService.error('Failed to load organizations.');
            this.isLoading.set(false);
          },
        }),
    );
  }
}
