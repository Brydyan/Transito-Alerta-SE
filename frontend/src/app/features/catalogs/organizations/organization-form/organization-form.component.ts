import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrganizationService } from '../services/organization.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

@Component({
  selector: 'app-organization-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiIconComponent,
  ],
  templateUrl: './organization-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationFormComponent implements OnInit {
  private readonly organizationService = inject(OrganizationService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly id = this.route.snapshot.paramMap.get('id');

  readonly isEditing = computed(() => !!this.id);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly serverErrors = signal<Record<string, string>>({});
  readonly integrityError = signal(false);

  readonly form: FormGroup = this.fb.group({
    name: ['', Validators.required],
  });

  get nameControl() {
    return this.form.get('name')!;
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
      return 'This field is required.';
    }
    return null;
  }

  ngOnInit(): void {
    if (this.isEditing()) {
      this.loadOrganization(this.id!);
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.serverErrors.set({});
    this.integrityError.set(false);

    const name = this.form.value.name as string;

    if (this.isEditing()) {
      this.organizationService.update(this.id!, { name }).subscribe({
        next: () => {
          this.toastService.success('Organization updated successfully');
          this.isSaving.set(false);
          this.goBack();
        },
        error: (err: {
          status?: number;
          error?: { message?: string; errors?: Record<string, string> };
        }) => {
          this.handleError(err);
          this.isSaving.set(false);
        },
      });
    } else {
      this.organizationService.create({ name }).subscribe({
        next: () => {
          this.toastService.success('Organization created successfully');
          this.isSaving.set(false);
          this.goBack();
        },
        error: (err: {
          status?: number;
          error?: { message?: string; errors?: Record<string, string> };
        }) => {
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
          title: 'Discard changes?',
          message: 'You have unsaved changes. Are you sure you want to leave?',
          confirmText: 'Discard',
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

  private loadOrganization(id: string): void {
    this.isLoading.set(true);
    this.organizationService.getById(id).subscribe({
      next: (organization) => {
        this.form.patchValue({ name: organization.name });
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error('Failed to load organization data.');
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
      const msg = err.error?.message ?? 'An unexpected error occurred.';
      this.toastService.error(msg);
    }
  }
}
