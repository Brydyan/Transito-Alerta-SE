import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IncidentStatus, IncidentListFilters } from '../../../../../core/models/incident.model';
import { IncidentCategoryService } from '../../../../catalogs/incident-categories/services/incident-category.service';
import { CategoryTreeNodeComponent, CategoryNode } from './category-tree-node.component';

export type { CategoryNode };

@Component({
  selector: 'app-feed-filters',
  standalone: true,
  imports: [CommonModule, CategoryTreeNodeComponent],
  templateUrl: './feed-filters.component.html'
})
export class FeedFiltersComponent implements OnInit {
  @Output() filtersChanged = new EventEmitter<IncidentListFilters>();

  // Use real backend statuses. 'Todo' means undefined status.
  statuses: { label: string; value: IncidentStatus | undefined }[] = [
    { label: 'Todo', value: undefined },
    { label: 'Pendiente', value: 'pending' },
    { label: 'En proceso', value: 'in_progress' },
    { label: 'Resuelto', value: 'resolved' },
    // closed not usually shown in active feed, but we can add it if needed
  ];

  selectedStatus: IncidentStatus | undefined = undefined;
  
  categoryNodes = signal<CategoryNode[]>([]);

  constructor(private categoryService: IncidentCategoryService) {}

  ngOnInit() {
    this.categoryService.list({ per_page: 500 }).subscribe((result) => {
      this.categoryNodes.set(this.buildTree(result.items));
    });
  }

  buildTree(items: import('../../../../catalogs/incident-categories/interfaces/iincident-category.interface').IIncidentCategory[]): CategoryNode[] {
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];
    
    // Create nodes
    for (const item of items) {
      map.set(item.id, { category: item, children: [], selected: false, indeterminate: false });
    }
    
    // Link nodes
    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  setStatus(status: IncidentStatus | undefined) {
    this.selectedStatus = status;
    this.emitFilters();
  }

  toggleNode(node: CategoryNode) {
    node.selected = !node.selected;
    node.indeterminate = false;
    this.setChildrenState(node, node.selected);
    this.updateParentsState();
    this.emitFilters();
  }

  setChildrenState(node: CategoryNode, selected: boolean) {
    for (const child of node.children) {
      child.selected = selected;
      child.indeterminate = false;
      this.setChildrenState(child, selected);
    }
  }

  updateParentsState() {
    for (const root of this.categoryNodes()) {
      this.updateNodeState(root);
    }
  }

  updateNodeState(node: CategoryNode): { all: boolean; any: boolean } {
    if (node.children.length === 0) {
      node.indeterminate = false;
      return { all: node.selected, any: node.selected };
    }

    let all = true;
    let any = false;

    for (const child of node.children) {
      const state = this.updateNodeState(child);
      if (!state.all) all = false;
      if (state.any) any = true;
    }

    if (all) {
      node.selected = true;
      node.indeterminate = false;
    } else if (any) {
      node.selected = false;
      node.indeterminate = true;
    } else {
      node.selected = false;
      node.indeterminate = false;
    }

    return { all, any };
  }

  emitFilters() {
    const filters: IncidentListFilters = {};
    if (this.selectedStatus) {
      filters.status = this.selectedStatus;
    }
    // DEBT: when backend supports category_id, we extract selected IDs here.
    // For now we just emit what is supported by the interface.
    this.filtersChanged.emit(filters);
  }
}
