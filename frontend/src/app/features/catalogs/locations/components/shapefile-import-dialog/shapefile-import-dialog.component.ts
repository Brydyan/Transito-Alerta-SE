import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEvent, HttpEventType } from '@angular/common/http';

import { GeoZoneService } from '../../services/geo-zone.service';
import { IImportGeoZoneResponse } from '../../interfaces/igeo-zone.interface';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../../shared/components/ui-icon/ui-icon.component';

/** Maximum shapefile payload — matches backend `FileInterceptor` 10 MB cap. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * sc-334 Phase 2 — Shapefile bulk-import dialog.
 *
 * Self-contained modal launched from `LocationListComponent` via the
 * "Importar Shapefile" page-header button. Two-section vertical layout
 * per design D1: top = file + level + column mapping; bottom = (a
 * progress bar while uploading and (b) the import envelope summary
 * when the server responds.
 *
 * Client-side validation per task 2.9:
 * - reject anything that is not a `.zip` (by extension OR MIME type)
 * - reject files larger than 10 MB
 * Both failures set the `error` signal and never POST.
 *
 * The dialog renders an overlay; the parent mounts/unmounts it via
 * `@if (showImportDialog()) { <app-shapefile-import-dialog … /> }`.
 */
@Component({
  selector: 'app-shapefile-import-dialog',
  standalone: true,
  imports: [CommonModule, UiButtonComponent, UiIconComponent],
  templateUrl: './shapefile-import-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShapefileImportDialogComponent {
  private readonly geoZoneService = inject(GeoZoneService);
  private readonly toastService = inject(ToastService);

  readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly file = signal<File | null>(null);
  readonly error = signal<string | null>(null);
  readonly progress = signal<number>(0);
  readonly result = signal<IImportGeoZoneResponse | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  readonly level = signal<'provincia' | 'canton' | 'parroquia' | 'zona'>('canton');
  readonly nameColumn = signal<string>('NAME');
  readonly codeColumn = signal<string>('CODE');
  readonly autoParent = signal<boolean>(true);

  readonly maxFileSize = MAX_FILE_SIZE;

  /** Emitted when the user cancels or when the dialog should close. */
  @Output() readonly closed = new EventEmitter<void>();

  onFileChange(event: Event): void {
    this.error.set(null);
    this.result.set(null);
    this.progress.set(0);

    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (!picked) {
      this.file.set(null);
      return;
    }

    const looksLikeZip =
      picked.name.toLowerCase().endsWith('.zip') ||
      picked.type === 'application/zip' ||
      picked.type === 'application/x-zip-compressed';

    if (!looksLikeZip) {
      this.error.set('Solo se admiten archivos .zip con shapefiles.');
      this.file.set(null);
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      this.error.set(
        `El archivo pesa ${(picked.size / 1024 / 1024).toFixed(1)} MB y excede el límite de 10 MB.`,
      );
      this.file.set(null);
      return;
    }

    this.file.set(picked);
  }

  onLevelChange(event: Event): void {
    this.level.set(
      (event.target as HTMLSelectElement).value as
        | 'provincia'
        | 'canton'
        | 'parroquia'
        | 'zona',
    );
  }

  onNameColumnChange(event: Event): void {
    this.nameColumn.set((event.target as HTMLInputElement).value);
  }

  onCodeColumnChange(event: Event): void {
    this.codeColumn.set((event.target as HTMLInputElement).value);
  }

  onAutoParentChange(event: Event): void {
    this.autoParent.set((event.target as HTMLInputElement).checked);
  }

  submit(): void {
    const picked = this.file();
    if (!picked || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);
    this.result.set(null);
    this.progress.set(0);

    this.geoZoneService
      .importShapefile(picked, {
        level: this.level(),
        auto_parent: this.autoParent(),
        name_column: this.nameColumn(),
        code_column: this.codeColumn(),
      })
      .subscribe({
        next: (event: HttpEvent<IImportGeoZoneResponse>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const loaded = event.loaded ?? 0;
            const total = event.total ?? 0;
            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
            this.progress.set(pct);
          } else if (event.type === HttpEventType.Response && event.body) {
            this.result.set(event.body);
            this.progress.set(0);
            this.isSubmitting.set(false);
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
          this.isSubmitting.set(false);
          this.progress.set(0);
          const msg =
            err.error?.message ?? 'No se pudo importar el shapefile.';
          this.error.set(msg);
          this.toastService.error(msg);
        },
      });
  }

  cancel(): void {
    if (this.isSubmitting()) {
      return;
    }
    this.closed.emit();
  }

  retry(): void {
    this.file.set(null);
    this.result.set(null);
    this.error.set(null);
    this.progress.set(0);
    const input = this.fileInput()?.nativeElement;
    if (input) {
      input.value = '';
    }
  }

  /** Accessible label for the file input — used by the spec via getByLabel. */
  readonly fileInputLabel = 'Archivo ZIP';
}
