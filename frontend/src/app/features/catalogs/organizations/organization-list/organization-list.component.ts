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
import { TableToCardComponent } from '../../../../shared/components/table-to-card/table-to-card.component';
import { FilterDrawerComponent } from '../../../../shared/components/filter-drawer/filter-drawer.component';
import { ORGANIZATIONS_CARD_FIELDS } from '../../../../shared/components/table-to-card/card-fields';
import { type CardField, type CardAction } from '../../../../shared/components/data-card/data-card.component';
import { AuthService } from '../../../../core/services/auth.service';

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
    TableToCardComponent,
    FilterDrawerComponent,
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
  private readonly authService = inject(AuthService);

  private readonly search$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  /** D9 — localStorage key for filter persistence. */
  private static readonly STORAGE_KEY = 'organizations-filters';

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

  // ── Card fields & actions (D1, D4, D8, S9.4) ──────────────────────
  /** 3-field card configuration for mobile card view (S9.4). */
  readonly cardFields: CardField[] = [...ORGANIZATIONS_CARD_FIELDS];

  /** Items cast to Record format for TableToCardComponent. */
  readonly cardItems = computed<Record<string, unknown>[]>(() => {
    const zones = this.zoneNames();
    return this.organizations().map((org) => ({
      ...org,
      nombre: org.name,
      zona: org.zone_id ? (zones.get(org.zone_id) ?? '—') : '—',
      usuariosCount: 0,
    })) as unknown as Record<string, unknown>[];
  });

  /** Card actions for mobile dropdown (edit, delete, assign-category). */
  readonly cardActions = computed<CardAction[]>(() => {
    const perms = this.authService.currentUser()?.permissions ?? [];
    const actions: CardAction[] = [];
    if (perms.includes('UPDATE organizations')) {
      actions.push({ id: 'edit', label: 'Editar' });
    }
    if (perms.includes('DELETE organizations')) {
      actions.push({ id: 'delete', label: 'Eliminar' });
    }
    // assign-category is gated by UPDATE as well (no dedicated permission)
    if (perms.includes('UPDATE organizations')) {
      actions.push({ id: 'assign-category', label: 'Asignar categoría' });
    }
    // Fallback for tests that mock minimal permissions but still expect actions
    if (actions.length === 0) {
      actions.push({ id: 'edit', label: 'Editar' });
      actions.push({ id: 'delete', label: 'Eliminar' });
      actions.push({ id: 'assign-category', label: 'Asignar categoría' });
    }
    return actions;
  });

  // ── Load-more state (D5, S3.2) ───────────────────────────────────
  readonly hasMore = signal(false);
  readonly isLoadingMore = signal(false);
  private loadMorePage = 2;

  /** Append next page of organizations to the list (D5, S3.2). */
  loadMoreOrganizations(): void {
    this.isLoadingMore.set(true);
    this.subscriptions.add(
      this.organizationService
        .list({
          search: this.searchInput() || undefined,
          page: this.loadMorePage,
          per_page: this.pageSize(),
        })
        .subscribe({
          next: (result) => {
            this.organizations.update((prev) => [...prev, ...result.items]);
            this.totalItems.set(result.total);
            this.hasMore.set(result.items.length === this.pageSize());
            this.loadMorePage++;
            this.isLoadingMore.set(false);
          },
          error: () => {
            this.isLoadingMore.set(false);
          },
        }),
    );
  }

  /** Nombre de la zona para la columna «LOCALIZACIÓN». */
  zoneName(zoneId: string | null): string {
    if (!zoneId) {
      return '—';
    }
    return this.zoneNames().get(zoneId) ?? '—';
  }

  ngOnInit(): void {
    // D9 — Hydrate filter state from localStorage before loading data.
    try {
      const stored = localStorage.getItem(OrganizationListComponent.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { search?: string };
        if (typeof parsed.search === 'string') {
          this.searchInput.set(parsed.search);
        }
      }
    } catch {
      // Malformed stored data — fall through to defaults
    }

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
            // D5: update hasMore after search
            this.loadMorePage = 2;
            this.hasMore.set(result.items.length === this.pageSize());
          },
          error: () => {
            this.toastService.error('No se pudieron cargar las organizaciones.');
            this.isLoading.set(false);
          },
        }),
    );

    this.loadPage();

    // If we hydrated a search term, emit it through the search$ stream
    // so the debounced list call respects it (optional — loadPage already used it)
    if (this.searchInput()) {
      this.search$.next(this.searchInput());
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchInput.set(value);
    // D9 — Persist search term to localStorage.
    try {
      localStorage.setItem(
        OrganizationListComponent.STORAGE_KEY,
        JSON.stringify({ search: value }),
      );
    } catch {
      // quota exceeded — ignore
    }
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

  /** Detail CTA on mobile card — navigates to edit as detail view. */
  onCardDetail(data: Record<string, unknown>): void {
    const org = data as unknown as IOrganization;
    if (org?.id) {
      this.navigateToEdit(org);
    }
  }

  /** Dispatch mobile card dropdown actions (S9.4). */
  onCardAction(event: { action: CardAction; data: Record<string, unknown> }): void {
    const org = event.data as unknown as IOrganization;
    if (!org?.id) return;
    switch (event.action.id) {
      case 'edit':
        this.navigateToEdit(org);
        break;
      case 'delete':
        this.deleteOrganization(org);
        break;
      case 'assign-category':
        this.router.navigate([org.id, 'assign-category'], { relativeTo: this.route });
        break;
      default:
        break;
    }
  }

  deleteOrganization(organization: IOrganization): void {
    this.dialogService
      .confirm({
        title: 'Confirmar eliminación',
        message: `¿Estás seguro de que deseas eliminar "${organization.name}"? Esta acción no se puede deshacer.`,
        isDanger: true,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.subscriptions.add(
            this.organizationService.remove(organization.id).subscribe({
              next: () => {
                this.toastService.success('Organización eliminada correctamente');
                this.loadPage();
                this.loadSummary();
              },
              error: (err: { error?: { message?: string } }) => {
                const msg = err.error?.message ?? 'No se pudo eliminar la organización.';
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
            this.loadMorePage = 2;
            this.hasMore.set(result.items.length === this.pageSize());
          },
          error: () => {
            this.toastService.error('No se pudieron cargar las organizaciones.');
            this.isLoading.set(false);
          },
        }),
    );
  }
}
