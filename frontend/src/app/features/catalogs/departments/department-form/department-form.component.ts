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

import { DepartmentService } from '../services/department.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

/**
 * DepartmentFormComponent (`front/2026-09-15-departments-menu`).
 *
 * Mirrors `CategoryFormComponent` but with the dept-specific fields and
 * 409/404 mapping. The 409 → inline name error path exists because
 * `DepartmentsRepository.list()` no longer surfaces UNIQUE collisions
 * (the rename from BadRequestException → ConflictException in Phase 1
 * moved that signal to the 409 status code).
 *
 * `organization_id` is wired from the caller's auth context (admin_org
 * → own org; master → not auto-populated, admin sets it explicitly via
 * the route param if needed). For now, admin_org is the only caller:
 * the form binds organization_id from `currentUser.organizationId`.
 */
@Component({
  selector: 'app-department-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiIconComponent,
  ],
  templateUrl: './department-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepartmentFormComponent implements OnInit {
  private readonly departmentService = inject(DepartmentService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? null;

  readonly isEditing = computed(() => this.id !== null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  /** Inline field error from the server (e.g. 409 → name collision). */
  readonly nameServerError = signal<string | null>(null);
  /** Sticky banner above the form for cross-field errors. */
  readonly bannerError = signal<string | null>(null);

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(500)]],
  });

  get nameControl() {
    return this.form.get('name')!;
  }
  get descriptionControl() {
    return this.form.get('description')!;
  }

  fieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  /**
   * Field-error resolver. Server-side (409 UNIQUE) error takes
   * precedence over the generic required message.
   */
  fieldError(field: 'name' | 'description'): string | null {
    if (field === 'name' && this.nameServerError()) {
      return this.nameServerError()!;
    }
    const control = this.form.get(field);
    if (!control || !control.errors || !(control.dirty || control.touched)) {
      return null;
    }
    if (control.errors['required']) return 'Este campo es obligatorio.';
    if (control.errors['maxlength']) {
      const max = control.errors['maxlength'].requiredLength;
      return `Máximo ${max} caracteres.`;
    }
    return null;
  }

  ngOnInit(): void {
    if (this.isEditing()) {
      this.loadDepartment(this.id!);
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.nameServerError.set(null);
    this.bannerError.set(null);

    const name = (this.form.value.name as string).trim();
    const description =
      (this.form.value.description as string | null)?.trim() || null;
    const userOrgId = this.authService.currentUser()?.organizationId ?? null;

    if (this.isEditing()) {
      this.departmentService.update(this.id!, { name, description }).subscribe({
        next: () => {
          this.toastService.success('Departamento actualizado correctamente');
          this.isSaving.set(false);
          this.goBack();
        },
        error: (err) => this.handleSubmitError(err),
      });
    } else {
      if (!userOrgId) {
        // Defensive: admin_org without organizationId should not be able
        // to create a dept (the backend would 403 it anyway). Block
        // client-side to fail fast and give a clear error.
        this.bannerError.set(
          'No se puede crear un departamento sin una organización asociada al usuario.',
        );
        this.isSaving.set(false);
        return;
      }
      this.departmentService
        .create({ name, description, organization_id: userOrgId })
        .subscribe({
          next: () => {
            this.toastService.success('Departamento creado correctamente');
            this.isSaving.set(false);
            this.goBack();
          },
          error: (err) => this.handleSubmitError(err),
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
          if (confirmed) this.goBack();
        });
    } else {
      this.goBack();
    }
  }

  goBack(): void {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }

  private loadDepartment(id: string): void {
    this.isLoading.set(true);
    this.departmentService.getById(id).subscribe({
      next: (dept) => {
        this.form.patchValue({
          name: dept.name,
          description: dept.description ?? '',
        });
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error('No se pudieron cargar los datos del departamento.');
        this.isLoading.set(false);
        this.goBack();
      },
    });
  }

  /**
   * Maps backend error responses to the right user-visible signal:
   *   - 409 ConflictException (UNIQUE collision) → inline name error.
   *     The user can edit the field and resubmit; no toast spam.
   *   - 404 NotFoundException → toast + navigate to list. The dept
   *     was deleted out from under us (race) — no point keeping the
   *     form open.
   *   - anything else → generic toast with server message.
   */
  private handleSubmitError(err: {
    status?: number;
    error?: { message?: string };
  }): void {
    this.isSaving.set(false);
    if (err.status === 409) {
      this.nameServerError.set(
        'Ya existe un departamento con este nombre en tu organización.',
      );
      // Mark the field dirty+touched so the message renders.
      this.nameControl.markAsTouched();
      return;
    }
    if (err.status === 404) {
      this.toastService.error('El departamento ya no existe.');
      this.goBack();
      return;
    }
    const msg = err.error?.message ?? 'Ocurrió un error inesperado.';
    this.toastService.error(msg);
  }
}
