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
import { TableToCardComponent } from '../../../../shared/components/table-to-card/table-to-card.component';
import { FilterDrawerComponent } from '../../../../shared/components/filter-drawer/filter-drawer.component';
import { CATEGORIES_CARD_FIELDS } from '../../../../shared/components/table-to-card/card-fields';
import { type CardField, type CardAction } from '../../../../shared/components/data-card/data-card.component';

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
    TableToCardComponent,
    FilterDrawerComponent,
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

  /** D9 — localStorage key for filter persistence. */
  private static readonly STORAGE_KEY = 'categories-filters';

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

  // ── Card fields & actions (D1, D4, D8, S9.5) ──────────────────────
  /** 3-field card configuration for mobile card view (S9.5). */
  readonly cardFields: CardField[] = [...CATEGORIES_CARD_FIELDS];

  /** Items cast to Record format for TableToCardComponent.
   *  Uses visibleNodes() so the mobile card view reflects tree expansion
   *  and search filtering — consistent with roles pattern using visibleRoles. */
  readonly cardItems = computed<Record<string, unknown>[]>(() => {
    return this.visibleNodes().map((node) => ({
      ...node,
      nombre: node.name,
      descripcion: node.description ?? '—',
      icon: node.name,
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
  readonly pageSize = signal(10);

  /** Append next page of categories to the list (D5, S3.2).
   *  Categories are typically a small dataset; this is a fallback
   *  for when the catalog grows beyond one page. */
  loadMoreCategories(): void {
    this.isLoadingMore.set(true);
    this.subscriptions.add(
      this.categoryService.list({ page: this.loadMorePage, per_page: this.pageSize() }).subscribe({
        next: (result) => {
          const newItems = result.items ?? [];
          if (newItems.length === 0) {
            this.hasMore.set(false);
            this.isLoadingMore.set(false);
            return;
          }
          const merged = [...this.rows(), ...newItems];
          this.rows.set(merged);
          this.tree.set(buildCategoryTree(merged));
          this.hasMore.set(newItems.length === this.pageSize());
          this.loadMorePage++;
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.isLoadingMore.set(false);
        },
      }),
    );
  }

  get indentForDepth(): (depth: number) => string {
    return (depth: number) => `${depth * INDENT_PER_DEPTH}px`;
  }

  ngOnInit(): void {
    // D9 — Hydrate search from localStorage before loading data.
    try {
      const stored = localStorage.getItem(CategoryListComponent.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { search?: string };
        if (typeof parsed.search === 'string') {
          this.searchTerm.set(parsed.search);
        }
      }
    } catch {
      // Malformed stored data — fall through to defaults
    }
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    // D9 — Persist search term to localStorage.
    try {
      localStorage.setItem(
        CategoryListComponent.STORAGE_KEY,
        JSON.stringify({ search: value }),
      );
    } catch {
      // quota exceeded — ignore
    }
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

  /** Detail CTA on mobile card — navigates to edit as detail view. */
  onCardDetail(data: Record<string, unknown>): void {
    const id = data['id'] as string | undefined;
    if (id) {
      this.router.navigate([id, 'edit'], { relativeTo: this.route });
    }
  }

  /** Dispatch mobile card dropdown actions (S9.5). */
  onCardAction(event: { action: CardAction; data: Record<string, unknown> }): void {
    const id = event.data['id'] as string | undefined;
    if (!id) return;
    const node = this.visibleNodes().find((n) => n.id === id) ?? (event.data as unknown as IncidentCategoryNode);
    switch (event.action.id) {
      case 'edit':
        this.navigateToEdit(node as unknown as IIncidentCategory);
        break;
      case 'delete':
        this.deleteCategory(node as IncidentCategoryNode);
        break;
      default:
        break;
    }
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
          // D5: hasMore depends on whether more items beyond first page exist
          // Since listAll loads up to 100, hasMore is false unless catalog is huge
          this.loadMorePage = 2;
          this.hasMore.set(items.length === this.pageSize());
        },
        error: () => {
          this.toastService.error('No se pudieron cargar las categorías.');
          this.isLoading.set(false);
        },
      }),
    );
  }
}
