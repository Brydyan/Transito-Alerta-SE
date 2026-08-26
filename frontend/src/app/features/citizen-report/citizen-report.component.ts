import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { ConnectionService } from '../../core/services/connection.service';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-citizen-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="p-4 max-w-md mx-auto">
      <h2 class="text-xl font-bold mb-4">Reportar Incidente</h2>
      
      <div *ngIf="(isOnline$ | async) === false" class="bg-yellow-100 p-2 mb-4 rounded">
        Modo Offline. El reporte se enviará cuando haya conexión.
      </div>
      <div *ngIf="isSyncing$ | async" class="bg-blue-100 p-2 mb-4 rounded">
        Sincronizando reportes pendientes...
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex flex-col gap-4">
        <input type="text" formControlName="title" placeholder="Título" class="border p-2 rounded" />
        <textarea formControlName="description" placeholder="Descripción" class="border p-2 rounded"></textarea>
        
        <input type="file" accept="image/*" (change)="onPhotoSelected($event)" class="border p-2 rounded" />
        <img *ngIf="photoPreview" [src]="photoPreview" class="w-full h-48 object-cover rounded" />

        <button type="submit" [disabled]="!form.valid || !selectedPhoto" class="bg-blue-500 text-white p-2 rounded">
          Enviar Reporte
        </button>
      </form>
    </div>
  `
})
export class CitizenReportComponent implements OnInit {
  form: FormGroup;
  isOnline$ = this.connectionService.getConnectionStatus$();
  isSyncing$ = this.offlineSyncService.getSyncInProgress$();
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;

  constructor(
    private fb: FormBuilder,
    private offlineSyncService: OfflineSyncService,
    private geolocationService: GeolocationService,
    private connectionService: ConnectionService,
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      priority: ['medium'],
    });
  }

  ngOnInit() {
    this.geolocationService.getCurrentLocation().subscribe({
      next: coords => console.log('GPS:', coords),
      error: err => console.error('GPS error:', err)
    });
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedPhoto = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.photoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async onSubmit() {
    if (!this.form.valid || !this.selectedPhoto) return;

    let coords;
    try {
      coords = await lastValueFrom(this.geolocationService.getCurrentLocation());
    } catch (e) {
      console.warn('Could not get coords', e);
    }

    const incident = {
      ...this.form.value,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    };

    const incidentId = await this.offlineSyncService.queueIncident(
      incident,
      this.selectedPhoto,
    );

    console.log('✅ Report queued:', incidentId);
    this.form.reset({ priority: 'medium' });
    this.selectedPhoto = null;
    this.photoPreview = null;
  }
}
