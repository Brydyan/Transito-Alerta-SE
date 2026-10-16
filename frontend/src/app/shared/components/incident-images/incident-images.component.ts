import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { environment } from '../../../../environments/environment';

/**
 * Minimal projection of the `IncidentImageDto` returned by
 * `GET /api/incidents/:id/images` after the change. The wire no
 * longer carries `url` — the frontend ALWAYS resolves the bytes
 * through the byte route (`GET /incidents/:id/images/:imageId/file`),
 * which the backend implements either as a `StreamableFile` (noop
 * provider — local dev) or as a 302 redirect to a fresh signed URL
 * (Supabase in production).
 */
interface IncidentImageMeta {
  id: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

/**
 * 2026-10-06-incident-images-read-path (D8) — frontend image gallery.
 *
 * The previous implementation bound `[src]="img.url"` directly. That
 * worked only when the storage provider returned a browser-friendly
 * http(s) URL — in local dev the noop client hands back `file://…`
 * URLs which the browser strictly blocks for security (D3 rationale).
 *
 * The fix is server-driven: the byte route streams bytes (local) or
 * issues a 302 redirect (prod). The frontend fetches each image as
 * a Blob, creates a local `Object URL`, and binds that to `<img>`. The
 * `DestroyRef` (Angular 16+ replacement for `OnDestroy`) hooks the
 * lifecycle and `revokeObjectURL`s every URL to avoid memory leaks.
 *
 * The metadata list keeps the same shape (`id`, `mime_type`,
 * `file_size`, `created_at`); the `url` field was removed from the
 * wire per D3.
 */
@Component({
  selector: 'app-incident-images',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  template: `
    @if (loading()) {
      <p class="text-sm text-slate-500 italic" data-testid="images-loading">
        Cargando imágenes...
      </p>
    } @else if (error()) {
      <p class="text-sm text-red-500 italic" data-testid="images-error">
        <ui-icon name="alert-circle" [size]="14" class="inline align-middle mr-1" />
        No se pudieron cargar las imágenes.
      </p>
    } @else if (images().length === 0) {
      <p class="text-sm text-slate-500 italic" data-testid="images-empty">
        No hay imágenes adjuntas.
      </p>
    } @else {
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="images-grid">
        @for (img of images(); track img.id) {
          @let url = objectUrlFor(img.id);
          @if (url) {
            <a [href]="url" target="_blank" rel="noopener noreferrer"
               class="block aspect-square overflow-hidden rounded border border-slate-200"
               [attr.data-testid]="'image-' + img.id">
              <img [src]="url" alt="Imagen del incidente"
                   class="w-full h-full object-cover hover:scale-105 transition-transform" />
            </a>
          } @else {
            <!-- metadata loaded but bytes not yet resolved (or failed) -->
            <div class="block aspect-square overflow-hidden rounded border border-slate-200
                        flex items-center justify-center bg-slate-50"
                 [attr.data-testid]="'image-pending-' + img.id">
              <ui-icon name="image" [size]="20" class="text-slate-400" />
            </div>
          }
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentImagesComponent implements OnInit {
  readonly incidentId = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Image metadata + the resolved Object URL keyed by image id.
   * We store the URL separately so the same metadata can survive a
   * re-render (e.g. when the parent toggles a panel) without
   * re-fetching the bytes. `objectUrls[id]` is `undefined` while the
   * bytes are still in flight or the request failed; the template
   * renders a placeholder in both cases.
   */
  readonly images = signal<IncidentImageMeta[]>([]);
  readonly objectUrls = signal<Record<string, string | undefined>>({});
  readonly loading = signal<boolean>(true);
  readonly error = signal<boolean>(false);

  ngOnInit(): void {
    const incidentId = this.incidentId();
    this.http
      .get<IncidentImageMeta[]>(`${environment.apiUrl}/incidents/${incidentId}/images`, {
        withCredentials: true,
      })
      .pipe(
        // For each metadata row, kick off the byte fetch. The
        // per-image Object URL arrives async — the template reads
        // it from the `objectUrls` signal and re-renders when each
        // resolves. A failure leaves the entry undefined; we DON'T
        // trip the global `error` signal because a single bad
        // image shouldn't blank the whole gallery.
        map((list) => {
          for (const img of list) {
            this.fetchAsObjectUrl(incidentId, img.id);
          }
          return list;
        }),
        catchError(() => {
          this.error.set(true);
          this.loading.set(false);
          return of(null);
        }),
      )
      .subscribe((list) => {
        if (!list) return;
        this.images.set(list);
        this.loading.set(false);
      });

    // Revoke every Object URL when the component is destroyed —
    // critical because we keep N URLs in memory until then. The
    // `destroyRef` cleanup is the modern Angular replacement for
    // `OnDestroy`.
    this.destroyRef.onDestroy(() => {
      const urls = this.objectUrls();
      for (const id of Object.keys(urls)) {
        const url = urls[id];
        if (url) URL.revokeObjectURL(url);
      }
    });
  }

  /**
   * Fire-and-forget byte fetch. Resolves into the `objectUrls`
   * signal via `set()` on completion; failures leave the entry
   * undefined so the template renders the placeholder.
   */
  private fetchAsObjectUrl(incidentId: string, imageId: string): void {
    this.http
      .get(`${environment.apiUrl}/incidents/${incidentId}/images/${imageId}/file`, {
        responseType: 'blob',
        withCredentials: true,
      })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.objectUrls.update((current) => ({ ...current, [imageId]: url }));
        },
        error: () => {
          // Leave undefined — the template renders the placeholder.
          this.objectUrls.update((current) => ({ ...current, [imageId]: undefined }));
        },
      });
  }

  /**
   * Helper for the template's `@let url = objectUrlFor(img.id)`.
   * Returns the Object URL for the image id, or `undefined` if the
   * bytes have not resolved yet (or the fetch failed). The template
   * uses the falsy branch to render a placeholder.
   */
  objectUrlFor(id: string): string | undefined {
    return this.objectUrls()[id];
  }
}