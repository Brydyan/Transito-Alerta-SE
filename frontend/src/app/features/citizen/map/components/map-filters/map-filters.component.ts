import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MapDataService, MapActiveFilters } from '../../services/map-data.service';
import { GeoZoneService } from '../../../../catalogs/locations/services/geo-zone.service';
import { GeoZoneLevel } from '../../../../catalogs/locations/interfaces/igeo-zone.interface';

/** Lightweight zone option used to populate the cascading dropdowns. */
interface ZoneOption {
  id: string;
  name: string;
  code: string | null;
  level: GeoZoneLevel;
}

@Component({
  selector: 'app-map-filters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './map-filters.component.html',
  host: { class: 'block' }
})
export class MapFiltersComponent implements OnInit {
  private readonly geoZoneService = inject(GeoZoneService);
  private readonly mapDataService = inject(MapDataService);

  @Output() filtersChange = new EventEmitter<MapActiveFilters>();

  form: FormGroup;
  categories = signal<{ id: string; name: string }[]>([]);

  // sc-334 Phase 4 — cascading zone dropdowns
  readonly provincias = signal<ZoneOption[]>([]);
  readonly cantones = signal<ZoneOption[]>([]);
  readonly parroquias = signal<ZoneOption[]>([]);

  readonly provinciaIdControl = signal<string>('');
  readonly cantonIdControl = signal<string>('');
  readonly parroquiaIdControl = signal<string>('');

  readonly isLoadingProvincias = signal(false);
  readonly isLoadingCantones = signal(false);
  readonly isLoadingParroquias = signal(false);

  private readonly subs = new Subscription();

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

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      status: [''],
      priority: [''],
      category_id: [''],
      provincia_id: [{ value: '', disabled: false }],
      canton_id: [{ value: '', disabled: true }],
      parroquia_id: [{ value: '', disabled: true }],
    });

    // ── valueChanges subscriptions — cascading reset + load ────────────────
    this.subs.add(
      this.form.get('provincia_id')!.valueChanges.subscribe((value: string | null) =>
        this.onProvinciaChange(value ?? ''),
      ),
    );
    this.subs.add(
      this.form.get('canton_id')!.valueChanges.subscribe((value: string | null) =>
        this.onCantonChange(value ?? ''),
      ),
    );

    // Emit cleaned filters (including zone_id) on every change.
    this.form.valueChanges.subscribe((val) => {
      const cleanFilters: MapActiveFilters = {};
      if (val.status) cleanFilters.status = val.status;
      if (val.priority) cleanFilters.priority = val.priority;
      if (val.category_id) cleanFilters.incident_category_id = val.category_id;

      // Phase 4 R4: zone_id = most specific selected id.
      const zoneId =
        val.parroquia_id || val.canton_id || val.provincia_id || '';
      if (zoneId) cleanFilters.zone_id = zoneId;

      this.filtersChange.emit(cleanFilters);
    });
  }

  ngOnInit() {
    this.subs.add(
      this.mapDataService.getMapFilters().subscribe({
        next: (res) => this.categories.set(res.data?.categories || []),
        error: (err) => console.error('Failed to load map filters', err),
      }),
    );
    this.loadProvincias();
  }

  private loadProvincias(): void {
    this.isLoadingProvincias.set(true);
    this.subs.add(
      this.geoZoneService.list({ level: 'provincia', per_page: 100 }).subscribe({
        next: (res) => {
          this.provincias.set(
            res.items.map((z) => ({ id: z.id, name: z.name, code: z.code, level: z.level })),
          );
          this.isLoadingProvincias.set(false);
        },
        error: () => this.isLoadingProvincias.set(false),
      }),
    );
  }

  private loadZonesByParent(level: 'canton' | 'parroquia', parentId: string): void {
    const signal = level === 'canton' ? this.isLoadingCantones : this.isLoadingParroquias;
    const dest = level === 'canton' ? this.cantones : this.parroquias;
    signal.set(true);
    this.subs.add(
      this.geoZoneService
        .list({ level, parent_id: parentId, per_page: 100 })
        .subscribe({
          next: (res) => {
            dest.set(
              res.items.map((z) => ({ id: z.id, name: z.name, code: z.code, level: z.level })),
            );
            signal.set(false);
          },
          error: () => signal.set(false),
        }),
    );
  }

  private onProvinciaChange(provinciaId: string): void {
    // Reset downstream + disable canton until data loads.
    this.form.get('canton_id')!.setValue('', { emitEvent: false });
    this.form.get('canton_id')!.disable({ emitEvent: false });
    this.cantones.set([]);
    this.form.get('parroquia_id')!.setValue('', { emitEvent: false });
    this.form.get('parroquia_id')!.disable({ emitEvent: false });
    this.parroquias.set([]);

    if (provinciaId) {
      this.form.get('canton_id')!.enable({ emitEvent: false });
      this.loadZonesByParent('canton', provinciaId);
    }
  }

  private onCantonChange(cantonId: string): void {
    this.form.get('parroquia_id')!.setValue('', { emitEvent: false });
    this.form.get('parroquia_id')!.disable({ emitEvent: false });
    this.parroquias.set([]);

    if (cantonId) {
      this.form.get('parroquia_id')!.enable({ emitEvent: false });
      this.loadZonesByParent('parroquia', cantonId);
    }
  }

  togglePanel() {
    this.isOpen.set(!this.isOpen());
  }

  clearFilters() {
    this.form.reset({
      status: '',
      priority: '',
      category_id: '',
      provincia_id: '',
      canton_id: { value: '', disabled: true },
      parroquia_id: { value: '', disabled: true },
    });
    this.cantones.set([]);
    this.parroquias.set([]);
  }
}
