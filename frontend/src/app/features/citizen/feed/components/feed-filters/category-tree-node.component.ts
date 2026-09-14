import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IIncidentCategory } from '../../../../catalogs/incident-categories/interfaces/iincident-category.interface';

export interface CategoryNode {
  category: IIncidentCategory;
  children: CategoryNode[];
  selected: boolean;
  indeterminate: boolean;
}

@Component({
  selector: 'app-category-tree-node',
  standalone: true,
  templateUrl: './category-tree-node.component.html'
})
export class CategoryTreeNodeComponent {
  @Input({ required: true }) nodes: CategoryNode[] = [];
  @Input() depth = 0;
  @Output() nodeToggled = new EventEmitter<CategoryNode>();

  onToggle(node: CategoryNode): void {
    this.nodeToggled.emit(node);
  }

  onChildToggled(node: CategoryNode): void {
    this.nodeToggled.emit(node);
  }
}
