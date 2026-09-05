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
import { GeoZoneService } from '../services/geo-zone.service';
import {
  IGeoZone,
  GeoZoneLevel,
  IGeoZoneNode,
  GEO_ZONE_LEVELS,
  GEO_ZONE_LEVEL_LABELS,
} from '../interfaces/igeo-zone.interface';
import { buildTree, filterTreePreservingAncestors } from '../tree.util';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '../../../../shared/components/table-skeleton/table-skeleton.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

const LEVEL_OPTIONS: Array<'all' | GeoZoneLevel> = [
  'all',
  'provincia',
  'canton',
  'parroquia',
  'zona',
];
const INDENT_PER_DEPTH = 24;

type LevelFilter = 'all' | GeoZoneLevel;

@Component({
  selector: 'app-location-list',
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
  templateUrl: './location-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent implements OnInit, OnDestroy {
  private readonly geoZoneService = inject(GeoZoneService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly subscriptions = new Subscription();

  /** The raw flat list returned by the backend. */
  readonly rows = signal<IGeoZone[]>([]);
  /** The hierarchical tree built client-side from `rows` (D3). */
  readonly tree = signal<IGeoZoneNode[]>([]);
  /** Ids of manually expanded nodes. */
  readonly expandedIds = signal<Set<string>>(new Set());
  readonly levelFilter = signal<LevelFilter>('all');
  readonly searchTerm = signal('');
  readonly isLoading = signal(true);

  readonly levelOptions = LEVEL_OPTIONS;
  readonly levelLabels = GEO_ZONE_LEVEL_LABELS;
  readonly allLabel = 'All';
  readonly levelKeys = GEO_ZONE_LEVELS;

  /** Filter the tree by the selected level dropdown. */
  private filterByLevel(tree: IGeoZoneNode[], level: LevelFilter): IGeoZoneNode[] {
    if (level === 'all') {
      return tree;
    }
    const filter = (node: IGeoZoneNode): IGeoZoneNode | null => {
      const children = node.children
        .map(filter)
        .filter((child): child is IGeoZoneNode => child !== null);
      if (node.level === level || children.length > 0) {
        return { ...node, children };
      }
      return null;
    };
    return tree.map(filter).filter((node): node is IGeoZoneNode => node !== null);
  }

  /** The flat list of visible rows: only expanded nodes plus their children,
   *  with `depth` used for indentation (design D4). */
  readonly visibleNodes = computed<IGeoZoneNode[]>(() => {
    let tree = this.tree();
    tree = this.filterByLevel(tree, this.levelFilter());

    const term = this.searchTerm().trim();
    const searching = term.length > 0;
    if (searching) {
      tree = filterTreePreservingAncestors(tree, term);
    }

    const out: IGeoZoneNode[] = [];
    const expanded = this.expandedIds();
    const expandChild = (node: IGeoZoneNode): boolean => searching || expanded.has(node.id);

    const visit = (node: IGeoZoneNode): void => {
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

    for (const root of tree) {
      visit(root);
    }
    return out;
  });

  /** Summary card: total count across the whole catalog. */
  readonly totalCount = computed(() => this.rows().length);

  /** Summary card: count created this calendar month. */
  readonly monthCount = computed(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return this.rows().filter((row) => {
      const created = new Date(row.created_at);
      return created.getMonth() === month && created.getFullYear() === year;
    }).length;
  });

  /** Summary card: distribution of zones per level. */
  readonly levelDistribution = computed(() => {
    const counts = new Map<GeoZoneLevel, number>();
    for (const level of GEO_ZONE_LEVELS) {
      counts.set(level, 0);
    }
    for (const row of this.rows()) {
      counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
    }
    return counts;
  });

  /** Summary card: the level with the highest zone count ("critical level").
   *  Returns `null` when the catalog is empty. */
  readonly criticalLevel = computed<{ level: GeoZoneLevel; count: number } | null>(() => {
    const distribution = this.levelDistribution();
    let best: { level: GeoZoneLevel; count: number } | null = null;
    for (const level of GEO_ZONE_LEVELS) {
      const count = distribution.get(level) ?? 0;
      if (best === null || count > best.count) {
        best = { level, count };
      }
    }
    return best && best.count > 0 ? best : null;
  });

  /** Summary card: last synchronization time, derived from the newest
   *  `updated_at` across the catalog. `null` when empty. */
  readonly lastSync = computed<Date | null>(() => {
    let latest: string | null = null;
    for (const row of this.rows()) {
      if (latest === null || row.updated_at > latest) {
        latest = row.updated_at;
      }
    }
    return latest ? new Date(latest) : null;
  });

  get indentForDepth(): (depth: number) => string {
    return (depth: number) => `${depth * INDENT_PER_DEPTH}px`;
  }

  levelLabel(level: GeoZoneLevel): string {
    return GEO_ZONE_LEVEL_LABELS[level];
  }

  levelBadgeClass(level: GeoZoneLevel): string {
    switch (level) {
      case 'provincia':
        return 'bg-sky-100 text-sky-700';
      case 'canton':
        return 'bg-emerald-100 text-emerald-700';
      case 'parroquia':
        return 'bg-amber-100 text-amber-700';
      case 'zona':
        return 'bg-slate-200 text-slate-700';
    }
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

  onLevelFilterChange(event: Event): void {
    this.levelFilter.set((event.target as HTMLSelectElement).value as LevelFilter);
  }

  toggleExpand(node: IGeoZoneNode): void {
    const expanded = new Set(this.expandedIds());
    if (expanded.has(node.id)) {
      expanded.delete(node.id);
    } else {
      expanded.add(node.id);
    }
    this.expandedIds.set(expanded);
  }

  hasChildren(node: IGeoZoneNode): boolean {
    return node.children.length > 0;
  }

  isExpanded(node: IGeoZoneNode): boolean {
    return this.expandedIds().has(node.id);
  }

  navigateToCreate(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  navigateToEdit(location: IGeoZone): void {
    this.router.navigate([location.id, 'edit'], { relativeTo: this.route });
  }

  deleteLocation(location: IGeoZone): void {
    this.dialogService
      .confirm({
        title: 'Confirm deletion',
        message: `Are you sure you want to delete "${location.name}"? This action cannot be undone.`,
        isDanger: true,
        confirmText: 'Delete',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.subscriptions.add(
            this.geoZoneService.remove(location.id).subscribe({
              next: () => {
                this.toastService.success('Location deleted successfully');
                this.loadAll();
              },
              error: (err: { status?: number; error?: { message?: string } }) => {
                if (err.status === 409) {
                  this.toastService.error(
                    'This location cannot be deleted because it has child locations.',
                  );
                } else {
                  const msg = err.error?.message ?? 'Failed to delete location.';
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
      this.geoZoneService.listAll().subscribe({
        next: (items) => {
          this.rows.set(items);
          this.tree.set(buildTree(items));
          this.expandedIds.set(new Set());
          this.isLoading.set(false);
        },
        error: () => {
          this.toastService.error('Failed to load locations.');
          this.isLoading.set(false);
        },
      }),
    );
  }
}
