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
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { GeoZoneService } from '../services/geo-zone.service';
import {
  IGeoZone,
  GeoZoneLevel,
  IGeoZoneNode,
  IGeoJsonPolygon,
  IImportGeoZoneResponse,
  GEO_ZONE_LEVELS,
  GEO_ZONE_LEVEL_LABELS,
} from '../interfaces/igeo-zone.interface';
import { buildTree, getLevelParentLevel } from '../tree.util';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

/**
 * A minimal valid GeoJSON Polygon (a tiny bounding box) used as a placeholder.
 * The backend `CreateGeoZoneDto` REQUIRES `polygon` (`@IsGeoJsonPolygon()`,
 * not optional), but F2.3 has no map/drawing tool, so the form always sends
 * this placeholder on create.
 */
const PLACEHOLDER_POLYGON: IGeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-79.5, -0.5],
      [-79.5, 0.5],
      [-78.5, 0.5],
      [-78.5, -0.5],
      [-79.5, -0.5],
    ],
  ],
};

/** Maximum shapefile payload — matches backend `FileInterceptor` 10 MB cap. */
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

@Component({
  selector: 'app-location-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HasPermissionDirective,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiIconComponent,
  ],
  templateUrl: './location-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormComponent implements OnInit, OnDestroy {
  private readonly geoZoneService = inject(GeoZoneService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly subscriptions = new Subscription();

  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly isEditing = computed(() => !!this.id);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly integrityError = signal(false);

  // ── sc-334 inline shapefile import (right panel) ──────────────────────

  /** Currently selected zip file in the right-panel file input. */
  readonly importFile = signal<File | null>(null);
  /** Upload progress 0-100. */
  readonly importProgress = signal<number>(0);
  /** Final import envelope (success or partial). */
  readonly importResult = signal<IImportGeoZoneResponse | null>(null);
  /** Inline error message; cleared on next file pick. */
  readonly importError = signal<string | null>(null);
  /** Auto-parent toggle (default true — matches backend ImportGeoZoneQueryDto). */
  readonly importAutoParent = signal<boolean>(true);
  /** True while an upload is in flight. */
  readonly isImporting = signal<boolean>(false);

  readonly maxImportFileSize = MAX_IMPORT_FILE_SIZE;

  /** All zones used to populate the parent selector. */
  readonly allZones = signal<IGeoZone[]>([]);

  readonly levelOptions = GEO_ZONE_LEVELS;
  readonly levelLabels = GEO_ZONE_LEVEL_LABELS;

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    code: [''],
    level: ['zona' as GeoZoneLevel, Validators.required],
    parent_id: [''],
  });

  private readonly levelControl = this.form.get('level') as FormControl;
  private readonly parentControl = this.form.get('parent_id') as FormControl;

  readonly selectedLevel = signal<GeoZoneLevel>('zona');

  /** When true, the parent field must be present (canton / parroquia). Not
   *  required for provincia (no parent) or zona (any parent or none). */
  readonly parentRequired = computed(() => {
    const level = this.selectedLevel();
    return level === 'canton' || level === 'parroquia';
  });

  /** Ids that must never be offered as a parent: the edited node plus every
   *  descendant, to avoid creating a cycle (backend also rejects these). */
  private readonly excludedIds = computed(() => {
    const ids = new Set<string>();
    if (!this.id) {
      return ids;
    }
    ids.add(this.id);
    const tree = buildTree(this.allZones());
    const node = findNode(tree, this.id!);
    if (node) {
      collectDescendants(node, ids);
    }
    return ids;
  });

  /** Parent options restricted to the immediate parent level (design D3 /
   *  backend REQUIRED_PARENT_LEVEL). For 'zona' any level is offered. */
  readonly parentOptions = computed(() => {
    const level = this.selectedLevel();
    if (!level) {
      return [];
    }
    const required = getLevelParentLevel(level);
    const excluded = this.excludedIds();
    return this.allZones()
      .filter((zone) => !excluded.has(zone.id))
      .filter((zone) => {
        if (required === null) {
          return false;
        }
        if (required === '*') {
          return true;
        }
        return zone.level === required;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  get nameControl() {
    return this.form.get('name')!;
  }

  ngOnInit(): void {
    this.loadZones();
    if (this.isEditing()) {
      this.loadLocation(this.id!);
    }
    this.subscriptions.add(
      this.levelControl.valueChanges.subscribe(() => this.refreshParentValidation()),
    );
    this.refreshParentValidation();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  fieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  fieldError(field: string): string | null {
    if (this.serverErrors()[field]) {
      return this.serverErrors()[field];
    }
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) {
      return null;
    }
    if (control.errors['required']) {
      return field === 'parent_id'
        ? 'Este nivel requiere una ubicación padre.'
        : 'Este campo es obligatorio.';
    }
    return null;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.serverErrors.set({});
    this.integrityError.set(false);

    const { name, code, level, parent_id } = this.form.value as {
      name: string;
      code: string;
      level: GeoZoneLevel;
      parent_id: string;
    };

    const parent = parent_id || null;

    if (this.isEditing()) {
      this.geoZoneService
        .update(this.id!, {
          name,
          code: code || null,
          level,
          parent_id: parent,
        })
        .subscribe({
          next: () => {
            this.toastService.success('Ubicación actualizada correctamente');
            this.isSaving.set(false);
            this.goBack();
          },
          error: (err) => {
            this.handleError(err);
            this.isSaving.set(false);
          },
        });
    } else {
      // polygon is REQUIRED by the backend CreateGeoZoneDto; send the
      // placeholder since F2.3 has no map/drawing tool.
      this.geoZoneService
        .create({
          name,
          code: code || null,
          level,
          parent_id: parent,
          polygon: PLACEHOLDER_POLYGON,
        })
        .subscribe({
          next: () => {
            this.toastService.success('Ubicación creada correctamente');
            this.isSaving.set(false);
            this.goBack();
          },
          error: (err) => {
            this.handleError(err);
            this.isSaving.set(false);
          },
        });
    }
  }

  onCancel(): void {
    if (this.form.dirty) {
      this.dialogService
        .confirm({
          title: '¿Descartar cambios?',
          message: 'Tienes cambios sin guardar. ¿Estás seguro de que deseas salir?',
          confirmText: 'Descartar',
          cancelText: 'Cancelar',
          isDanger: true,
        })
        .subscribe((confirmed) => {
          if (confirmed) {
            this.goBack();
          }
        });
    } else {
      this.goBack();
    }
  }

  goBack(): void {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }

  /** sc-334 — inline import (right panel). */

  onImportFileChange(event: Event): void {
    this.importError.set(null);
    this.importResult.set(null);
    this.importProgress.set(0);

    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) {
      this.importFile.set(null);
      return;
    }

    const looksLikeZip =
      picked.name.toLowerCase().endsWith('.zip') ||
      picked.type === 'application/zip' ||
      picked.type === 'application/x-zip-compressed';

    if (!looksLikeZip) {
      this.importError.set('Solo se admiten archivos .zip con shapefiles.');
      this.importFile.set(null);
      return;
    }

    if (picked.size > MAX_IMPORT_FILE_SIZE) {
      this.importError.set(
        `El archivo pesa ${(picked.size / 1024 / 1024).toFixed(1)} MB y excede el límite de 10 MB.`,
      );
      this.importFile.set(null);
      return;
    }

    this.importFile.set(picked);
  }

  onImportAutoParentChange(event: Event): void {
    this.importAutoParent.set((event.target as HTMLInputElement).checked);
  }

  submitImport(): void {
    const picked = this.importFile();
    if (!picked || this.isImporting()) {
      return;
    }

    this.isImporting.set(true);
    this.importError.set(null);
    this.importResult.set(null);
    this.importProgress.set(0);

    this.geoZoneService
      .importShapefile(picked, {
        level: (this.form.value.level as GeoZoneLevel) || 'zona',
        auto_parent: this.importAutoParent(),
        name_column: 'NAME',
        code_column: 'CODE',
      })
      .subscribe({
        next: (event: HttpEvent<IImportGeoZoneResponse>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const loaded = event.loaded ?? 0;
            const total = event.total ?? 0;
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            this.importProgress.set(pct);
          } else if (event.type === HttpEventType.Response && event.body) {
            this.importResult.set(event.body);
            this.importProgress.set(0);
            this.isImporting.set(false);
            const summary =
              `${event.body.imported} importadas, ` +
              `${event.body.skipped} omitidas, ` +
              `${event.body.errors.length} con error.`;
            if (event.body.errors.length === 0) {
              this.toastService.success(summary);
            } else {
              this.toastService.error(summary);
            }
          }
        },
        error: (err: { error?: { message?: string } }) => {
          this.isImporting.set(false);
          this.importProgress.set(0);
          const msg =
            err.error?.message ?? 'No se pudo importar el shapefile.';
          this.importError.set(msg);
          this.toastService.error(msg);
        },
      });
  }

  private refreshParentValidation(): void {
    const level = (this.levelControl.value as GeoZoneLevel | '') || 'zona';
    this.selectedLevel.set(level as GeoZoneLevel);
    if (this.parentRequired()) {
      this.parentControl.setValidators(Validators.required);
    } else {
      this.parentControl.clearValidators();
      if (level === 'provincia') {
        this.parentControl.setValue('');
      }
    }
    this.parentControl.updateValueAndValidity();
  }

  private loadZones(): void {
    this.geoZoneService.listAll().subscribe({
      next: (items) => this.allZones.set(items),
      error: () => {
        // Parent list is best-effort; the form can still be filled manually.
        this.toastService.error('No se pudieron cargar las ubicaciones para el selector de padre.');
      },
    });
  }

  private loadLocation(id: string): void {
    this.isLoading.set(true);
    this.geoZoneService.getById(id).subscribe({
      next: (location) => {
        this.form.patchValue({
          name: location.name,
          code: location.code ?? '',
          level: location.level,
          parent_id: location.parent_id ?? '',
        });
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error('No se pudieron cargar los datos de la ubicación.');
        this.isLoading.set(false);
      },
    });
  }

  private handleError(err: {
    status?: number;
    error?: { message?: string; errors?: Record<string, string> };
  }): void {
    if (err.status === 422 && err.error?.errors) {
      this.serverErrors.set(err.error.errors);
    } else if (err.status === 409) {
      this.integrityError.set(true);
    } else {
      const msg = err.error?.message ?? 'Ocurrió un error inesperado.';
      this.toastService.error(msg);
    }
  }
}

function findNode(tree: IGeoZoneNode[], id: string): IGeoZoneNode | undefined {
  for (const node of tree) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function collectDescendants(node: IGeoZoneNode, ids: Set<string>): void {
  for (const child of node.children) {
    ids.add(child.id);
    collectDescendants(child, ids);
  }
}
