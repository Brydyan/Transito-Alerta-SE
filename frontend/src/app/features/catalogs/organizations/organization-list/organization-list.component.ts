import {
  Component,
  ChangeDetectionStrategy,
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

  ngOnInit(): void {
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
