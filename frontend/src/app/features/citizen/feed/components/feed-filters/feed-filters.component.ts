import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IncidentStatus, IncidentListFilters } from '../../../../../core/models/incident.model';
import { IncidentCategoryService } from '../../../../catalogs/incident-categories/services/incident-category.service';
import { IIncidentCategory } from '../../../../catalogs/incident-categories/interfaces/iincident-category.interface';

/**
 * FeedFiltersComponent — citizen feed (`/app/inicio`).
 *
 * 2026-10-16-categories-chips-restructure — el filtro CATEGORÍAS pasó
 * de un árbol recursivo tri-state (CategoryTreeNodeComponent) a
 * chips seleccionables con las 5 categorías raíz, con el mismo
 * patrón visual que los chips de estado. La selección emite
 * `incident_category_id` al backend (antes era un DEBT silenciado);
 * el backend (`IncidentFeedService`) expande la raíz al subárbol
 * completo via CTE para que los incidents que apuntan a
 * subcategorías también matcheen.
 */
@Component({
  selector: 'app-feed-filters',
  standalone: true,
  imports: [CommonModule],
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
  ];

  selectedStatus: IncidentStatus | undefined = undefined;

  /**
   * 2026-10-16 — sólo las categorías raíz (`parent_id === null`)
   * son visibles como chips. Subcategorías se manejan via la
   * expansión CTE del backend, no en el cliente. Cargar las 500
   * (per_page) y filtrar en cliente es trivial; armar el árbol
   * recursivo previo era O(n²) sin ganancia real.
   */
  readonly rootCategories = signal<IIncidentCategory[]>([]);
  readonly selectedCategoryId = signal<string | null>(null);

  constructor(private categoryService: IncidentCategoryService) {}

  ngOnInit() {
    this.categoryService.list({ per_page: 500 }).subscribe((result) => {
      this.rootCategories.set(
        result.items.filter((c) => c.parent_id === null),
      );
    });
  }

  setStatus(status: IncidentStatus | undefined): void {
    this.selectedStatus = status;
    this.emitFilters();
  }

  /**
   * Toggle de chip: si ya está seleccionado, deselecciona (null).
   * Emite en ambos sentidos — `filtersChanged` siempre lleva el
   * estado actual, no requiere que el consumer reste filtros.
   */
  setCategory(id: string): void {
    this.selectedCategoryId.update((prev) => (prev === id ? null : id));
    this.emitFilters();
  }

  /**
   * 2026-10-16 — el DEBT viejo desapareció. Wireamos
   * `incident_category_id` directamente al output — el backend
   * (`IncidentFeedService`) se encarga de expandir al subárbol
   * vía `getDescendantIds`.
   */
  private emitFilters(): void {
    this.filtersChanged.emit({
      status: this.selectedStatus ?? undefined,
      incident_category_id: this.selectedCategoryId() ?? undefined,
    });
  }
}