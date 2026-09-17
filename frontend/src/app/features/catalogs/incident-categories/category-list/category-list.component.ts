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
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { IncidentCategoryService } from '../services/incident-category.service';
import { IIncidentCategory, IncidentCategoryNode } from '../interfaces/iincident-category.interface';
import {
  buildCategoryTree,
  filterCategoryTreePreservingAncestors,
} from '../tree.util';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../../shared/components/table-skeleton/table-skeleton.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

const INDENT_PER_DEPTH = 24;

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [
    CommonModule,
    EmptyStateComponent,
    TableSkeletonComponent,
    HasPermissionDirective,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiTableComponent,
    UiIconComponent,
  ],
  templateUrl: './category-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryListComponent implements OnInit, OnDestroy {
  private readonly categoryService = inject(IncidentCategoryService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly subscriptions = new Subscription();

  /** Raw flat list returned by `listAll()`. */
  readonly rows = signal<IIncidentCategory[]>([]);
  /** Hierarchical tree built from `rows`. */
  readonly tree = signal<IncidentCategoryNode[]>([]);
  /** Ids the user has manually expanded. */
  readonly expandedIds = signal<Set<string>>(new Set());
  readonly searchTerm = signal('');
  readonly isLoading = signal(true);

  /**
   * Flat list of rows to render, honouring expand state + search. The
   * template uses `depth` for indentation and `hasChildren()` for the
   * chevron toggle (matches the locations list UX).
   */
  readonly visibleNodes = computed<IncidentCategoryNode[]>(() => {
    const tree = this.tree();
    const term = this.searchTerm().trim();
    const filtered = term.length > 0
      ? filterCategoryTreePreservingAncestors(tree, term)
      : tree;

    const expanded = this.expandedIds();
    const expandChild = (node: IncidentCategoryNode): boolean =>
      term.length > 0 || expanded.has(node.id);

    const out: IncidentCategoryNode[] = [];
    const visit = (node: IncidentCategoryNode): void => {
      out.push(node);
      if (node.children.length === 0) {
        return;
      }
      if (expandChild(node)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    for (const root of filtered) {
      visit(root);
    }
    return out;
  });

  get indentForDepth(): (depth: number) => string {
    return (depth: number) => `${depth * INDENT_PER_DEPTH}px`;
  }

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  toggleExpand(node: IncidentCategoryNode): void {
    const expanded = new Set(this.expandedIds());
    if (expanded.has(node.id)) {
      expanded.delete(node.id);
    } else {
      expanded.add(node.id);
    }
    this.expandedIds.set(expanded);
  }

  hasChildren(node: IncidentCategoryNode): boolean {
    return node.children.length > 0;
  }

  isExpanded(node: IncidentCategoryNode): boolean {
    return this.expandedIds().has(node.id);
  }

  /**
   * Backend rejects deletion of a category that has children. The
   * pre-flight guard surfaces this with a clear message rather than
   * a generic 409 toast.
   */
  canDelete(node: IncidentCategoryNode): boolean {
    return node.children.length === 0;
  }

  navigateToCreate(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  navigateToEdit(category: IIncidentCategory): void {
    this.router.navigate([category.id, 'edit'], { relativeTo: this.route });
  }

  deleteCategory(node: IncidentCategoryNode): void {
    if (!this.canDelete(node)) {
      this.toastService.error(
        'Esta categoría no puede eliminarse porque tiene sub-categorías asociadas.',
      );
      return;
    }
    this.dialogService
      .confirm({
        title: 'Confirmar eliminación',
        message: `¿Estás seguro de que deseas eliminar "${node.name}"? Esta acción no se puede deshacer.`,
        isDanger: true,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.subscriptions.add(
            this.categoryService.remove(node.id).subscribe({
              next: () => {
                this.toastService.success('Categoría eliminada correctamente');
                this.loadAll();
              },
              error: (err: { status?: number; error?: { message?: string } }) => {
                if (err.status === 409) {
                  this.toastService.error(
                    'Esta categoría no puede eliminarse porque tiene sub-categorías asociadas.',
                  );
                } else {
                  const msg = err.error?.message ?? 'No se pudo eliminar la categoría.';
                  this.toastService.error(msg);
                }
              },
            }),
          );
        }
      });
  }

  private loadAll(): void {
    this.isLoading.set(true);
    this.subscriptions.add(
      this.categoryService.listAll().subscribe({
        next: (items) => {
          this.rows.set(items);
          this.tree.set(buildCategoryTree(items));
          this.expandedIds.set(new Set());
          this.isLoading.set(false);
        },
        error: () => {
          this.toastService.error('No se pudieron cargar las categorías.');
          this.isLoading.set(false);
        },
      }),
    );
  }
}