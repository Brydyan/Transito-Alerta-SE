import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MapDataService, MapActiveFilters } from '../../services/map-data.service';

@Component({
  selector: 'app-map-filters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './map-filters.component.html',
  host: { class: 'block' }
})
export class MapFiltersComponent implements OnInit {
  @Output() filtersChange = new EventEmitter<MapActiveFilters>();
  
  form: FormGroup;
  categories = signal<{ id: string, name: string }[]>([]);
  
  statuses = [
    { value: 'pending', label: 'Pendiente' },
    { value: 'in_progress', label: 'En Proceso' },
    { value: 'resolved', label: 'Resuelto' },
    { value: 'closed', label: 'Cerrado' }
  ];

  priorities = [
    { value: 'low', label: 'Baja' },
    { value: 'medium', label: 'Media' },
    { value: 'high', label: 'Alta' },
    { value: 'critical', label: 'Crítica' }
  ];

  isOpen = signal(false);

  constructor(private fb: FormBuilder, private mapDataService: MapDataService) {
    this.form = this.fb.group({
      status: [''],
      priority: [''],
      category_id: ['']
    });

    this.form.valueChanges.subscribe(val => {
      // Remove empty values
      const cleanFilters: MapActiveFilters = {};
      if (val.status) cleanFilters.status = val.status;
      if (val.priority) cleanFilters.priority = val.priority;
      if (val.category_id) cleanFilters.incident_category_id = val.category_id;
      this.filtersChange.emit(cleanFilters);
    });
  }

  ngOnInit() {
    this.mapDataService.getMapFilters()
      .subscribe({
        next: (res) => {
          this.categories.set(res.data?.categories || []);
        },
        error: (err) => console.error('Failed to load map filters', err)
      });
  }

  togglePanel() {
    this.isOpen.set(!this.isOpen());
  }

  clearFilters() {
    this.form.reset({ status: '', priority: '', category_id: '' });
  }
}
