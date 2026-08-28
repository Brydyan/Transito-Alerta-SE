import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { ConnectionService } from '../../core/services/connection.service';
import { lastValueFrom, Observable } from 'rxjs';

@Component({
  selector: 'app-citizen-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './citizen-report.component.html'
})
export class CitizenReportComponent implements OnInit {
  form: FormGroup;
  isOnline$: Observable<boolean>;
  isSyncing$: Observable<boolean>;
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
    this.isOnline$ = this.connectionService.getConnectionStatus$();
    this.isSyncing$ = this.offlineSyncService.getSyncInProgress$();
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
