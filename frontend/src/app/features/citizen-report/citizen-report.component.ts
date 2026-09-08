import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReportDraftService } from '../../core/services/report-draft.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { IncidentService } from '../../core/services/incident.service';
import { ImageCompressorService } from '../../core/services/image-compressor.service';
import { MapPickerComponent } from '../../shared/components';
import { lastValueFrom, Subscription } from 'rxjs';
import { ANONYMOUS_DISCLOSURE_NOTICE } from '../../core/constants/anonymous-disclosure-notice.constant';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-citizen-report',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MapPickerComponent],
  templateUrl: './citizen-report.component.html'
})
export class CitizenReportComponent implements OnInit, OnDestroy {
  currentStep = 1;
  form: FormGroup;
  selectedPhotos: Blob[] = [];
  photoPreviews: string[] = [];
  
  anonymousNotice = ANONYMOUS_DISCLOSURE_NOTICE;
  
  isSubmitting = false;
  submitError: string | null = null;
  locationCoords: { lat: number, lng: number } | null = null;
  
  private formSub?: Subscription;

  constructor(
    private fb: FormBuilder,
    private draftService: ReportDraftService,
    private geolocationService: GeolocationService,
    private incidentService: IncidentService,
    private imageCompressor: ImageCompressorService,
    private router: Router,
    public authService: AuthService
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      priority: ['medium', Validators.required],
      categoryId: ['', Validators.required],
      isAnonymous: [false]
    });
  }

  async ngOnInit() {
    // Restore from draft
    const draft = await this.draftService.getDraft();
    if (draft) {
      this.currentStep = draft.step;
      this.form.patchValue({
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        categoryId: draft.categoryId,
        isAnonymous: draft.isAnonymous
      }, { emitEvent: false });
      
      if (draft.latitude && draft.longitude) {
        this.locationCoords = { lat: draft.latitude, lng: draft.longitude };
      }
      
      this.selectedPhotos = draft.files || [];
      this.selectedPhotos.forEach(blob => {
        this.photoPreviews.push(URL.createObjectURL(blob));
      });
    }

    this.formSub = this.form.valueChanges.subscribe(() => {
      this.saveDraft();
    });
  }
  
  ngOnDestroy() {
    this.formSub?.unsubscribe();
  }

  async saveDraft() {
    const val = this.form.value;
    await this.draftService.saveDraft({
      step: this.currentStep,
      title: val.title,
      description: val.description,
      priority: val.priority,
      categoryId: val.categoryId,
      isAnonymous: val.isAnonymous,
      latitude: this.locationCoords?.lat ?? undefined,
      longitude: this.locationCoords?.lng ?? undefined,
      files: this.selectedPhotos
    });
  }

  async onPhotosSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files) return;
    const files = Array.from(target.files);
    for (const file of files) {
      if (this.selectedPhotos.length >= 5) break; // max 5 images
      const compressed = await this.imageCompressor.compressImage(file);
      this.selectedPhotos.push(compressed);
      this.photoPreviews.push(URL.createObjectURL(compressed));
    }
    await this.saveDraft();
  }
  
  removePhoto(index: number) {
    this.selectedPhotos.splice(index, 1);
    this.photoPreviews.splice(index, 1);
    this.saveDraft();
  }

  async goNext() {
    // Basic info
    if (this.currentStep === 1) {
      if (this.form.get('title')?.invalid || this.form.get('description')?.invalid || this.form.get('priority')?.invalid) return;
    }
    // Categories and files
    if (this.currentStep === 2) {
      if (this.form.get('categoryId')?.invalid) return;
    }
    // Location
    if (this.currentStep === 3) {
      if (!this.locationCoords) {
        // try to get current location
        try {
          const coords = await lastValueFrom(this.geolocationService.getCurrentLocation());
          this.locationCoords = { lat: coords.latitude, lng: coords.longitude };
        } catch {
          // Keep it null, let them use map
          if (!this.locationCoords) return;
        }
      }
    }

    this.currentStep++;
    await this.saveDraft();
  }

  async goBack() {
    if (this.currentStep > 1) {
      this.currentStep--;
      await this.saveDraft();
    }
  }

  onLocationSelected(loc: { lat: number, lng: number }) {
    this.locationCoords = loc;
    this.saveDraft();
  }

  async onSubmit() {
    if (this.form.invalid || !this.locationCoords) return;
    this.isSubmitting = true;
    this.submitError = null;

    try {
      const val = this.form.value;
      const incident = await lastValueFrom(this.incidentService.createIncident({
        title: val.title,
        description: val.description,
        priority: val.priority,
        category_ids: [val.categoryId],
        lat: this.locationCoords.lat,
        lng: this.locationCoords.lng,
        is_anonymous: val.isAnonymous
      }));

      if (this.selectedPhotos.length > 0) {
        await lastValueFrom(this.incidentService.uploadImages(incident.id, this.selectedPhotos));
      }

      await this.draftService.clearDraft();
      this.router.navigate(['/incidencias', incident.id]);
    } catch {
      this.submitError = 'Error al enviar el reporte. Por favor, intente nuevamente.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
