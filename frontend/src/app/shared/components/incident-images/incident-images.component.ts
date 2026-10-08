import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IncidentService } from '../../../core/services/incident.service';
import { IncidentImage } from '../../../core/models/incident.model';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

@Component({
  selector: 'app-incident-images',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  template: `
    @if (loading()) {
      <p class="text-sm text-slate-500 italic">Cargando imágenes...</p>
    } @else if (error()) {
      <p class="text-sm text-red-500 italic">
        <ui-icon name="alert-circle" [size]="14" class="inline align-middle mr-1" />
        No se pudieron cargar las imágenes.
      </p>
    } @else if (images().length === 0) {
      <p class="text-sm text-slate-500 italic">No hay imágenes adjuntas.</p>
    } @else {
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        @for (img of images(); track img.id) {
          <a [href]="img.url" target="_blank" class="block aspect-square overflow-hidden rounded border border-slate-200">
            <img [src]="img.url" alt="Imagen del incidente" class="w-full h-full object-cover hover:scale-105 transition-transform" />
          </a>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentImagesComponent implements OnInit {
  readonly incidentId = input.required<string>();
  
  private readonly incidentService = inject(IncidentService);

  readonly images = signal<IncidentImage[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<boolean>(false);

  ngOnInit(): void {
    this.incidentService.getIncidentImages(this.incidentId()).subscribe({
      next: (imgs) => {
        this.images.set(imgs);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }
}
