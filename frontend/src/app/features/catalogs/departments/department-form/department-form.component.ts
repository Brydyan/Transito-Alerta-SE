import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DepartmentService } from '../services/department.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';
import { OrganizationService } from '../../organizations/services/organization.service';
import { IOrganization } from '../../organizations/interfaces/iorganization.interface';

/** 0058 — incident category shape used by the form's checkbox list. */
export interface IIncidentCategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

// Roles that bypass the per-org scoping (mirror of backend's
// DepartmentsController.GLOBAL_ROLES set). Used by the form to decide
// whether to render the org selector (master/operador_sistema) vs. fix
// the org to the caller's own (admin_org).
const GLOBAL_ROLES = new Set(['master', 'operador_sistema']);

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
  private readonly organizationService = inject(OrganizationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? null;

  readonly isEditing = computed(() => this.id !== null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly organizations = signal<IOrganization[]>([]);
  /** 0058 — incident categories the dept can be assigned to.
   *  Loaded once via form-data on init for both create + edit paths. */
  readonly incidentCategories = signal<IIncidentCategoryOption[]>([]);
  /** Selected category ids for the create/edit payload. Stored as a
   *  signal so the checkbox group can render the bound state cleanly. */
  readonly selectedCategoryIds = signal<string[]>([]);
  /** Inline field error from the server (e.g. 409 → name collision). */
  readonly nameServerError = signal<string | null>(null);
  /** Sticky banner above the form for cross-field errors. */
  readonly bannerError = signal<string | null>(null);

  /** D9-style: master + operador_sistema see an org selector; admin_org
   *  sees the org field locked to their own (no choice). */
  readonly isGlobalRole = computed(() => {
    const role = this.authService.currentUser()?.roleName ?? null;
    return role !== null && GLOBAL_ROLES.has(role);
  });
  readonly showOrgSelector = this.isGlobalRole;
  /** The caller's own org, when isGlobalRole is false. */
  readonly ownOrganizationId = computed(
    () => this.authService.currentUser()?.organizationId ?? null,
  );

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(500)]],
    // organization_id is added below (with conditional `required`) once
    // we know whether the caller can choose or is locked to their own org.
    organization_id: [''],
    // 0058 — the M:N assignment. Held as a FormControlArray for the
    // checkbox group; the submit handler flattens it into `category_ids`.
    category_ids: this.fb.control<string[]>([]),
  });

  get nameControl() {
    return this.form.get('name')!;
  }
  get descriptionControl() {
    return this.form.get('description')!;
  }
  get organizationIdControl() {
    return this.form.get('organization_id')!;
  }
  get categoryIdsControl() {
    return this.form.get('category_ids')!;
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
    // Apply the `required` rule on organization_id AFTER we've decided
    // whether the caller is locked to their own org or picks from a list.
    const ownOrgId = this.ownOrganizationId();
    if (this.isGlobalRole()) {
      // master / operador_sistema pick from the org list once it loads.
      this.organizationIdControl.setValidators([Validators.required]);
    } else if (ownOrgId) {
      // admin_org is locked to their own org — pre-fill the value. We do
      // NOT disable the control, because Angular excludes disabled
      // controls from `form.value`, which would wipe the value at submit
      // time. Instead the template renders it as `readonly` visually.
      this.organizationIdControl.setValue(ownOrgId, { emitEvent: false });
    } else {
      // Defensive: non-global user without an organizationId — the
      // backend will 403, but we surface a clear error before submitting.
      this.bannerError.set(
        'Tu cuenta no tiene una organización asignada. Pídele al master que te asigne una.',
      );
    }
    this.organizationIdControl.updateValueAndValidity({ emitEvent: false });

    if (this.isGlobalRole()) {
      this.loadOrganizations();
    }
    // 0058 — always load the form-data lookup (for the category checkbox
    // group). Both create + edit need it; the load is a single
    // round-trip regardless of mode.
    this.loadFormData();
    if (this.isEditing()) {
      this.loadDepartment(this.id!);
    }
  }

  /** 0058 — single endpoint, two sources of truth (orgs + categories).
   *  We split the subscription so each signal updates independently;
   *  if one fails the other still lights up the form. */
  private loadFormData(): void {
    this.departmentService
      .getFormData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          // Sort alphabetically for predictable display in the checkbox group.
          const sorted = [...data.incident_categories].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          this.incidentCategories.set(sorted);
        },
        error: () => {
          this.bannerError.set(
            'No se pudieron cargar los tipos de incidencia. Podes crear el departamento sin tipos y asignarlos después.',
          );
        },
      });
  }

  /** 0058 — toggle a category in the selected set. */
  toggleCategory(categoryId: string, checked: boolean): void {
    const current = this.selectedCategoryIds();
    if (checked) {
      if (current.includes(categoryId)) return;
      this.selectedCategoryIds.set([...current, categoryId]);
    } else {
      if (!current.includes(categoryId)) return;
      this.selectedCategoryIds.set(current.filter((id) => id !== categoryId));
    }
    // Keep the form control in sync so submit reads from `form.value.category_ids`.
    this.categoryIdsControl.setValue(this.selectedCategoryIds());
  }

  private loadOrganizations(): void {
    // list({ per_page: 100 }) — `OrganizationService` clamps at 100 silently
    // per MAX_PAGE_SIZE in organizations.repository.ts. For the dropdown,
    // 100 is more than enough for any realistic catalog size; if it grows
    // past that, switch to a typeahead/autocomplete.
    this.organizationService
      .list({ per_page: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // Sort by name for predictable order in the dropdown.
          this.organizations.set(
            [...result.items].sort((a, b) => a.name.localeCompare(b.name)),
          );
        },
        error: () => {
          this.bannerError.set(
            'No se pudieron cargar las organizaciones. Intenta recargar la página.',
          );
        },
      });
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
    // For master / operador_sistema: the form's organization_id field
    // holds the caller's choice from the dropdown. For admin_org: it
    // holds their locked-in org from the auth context. Either way the
    // form value is the single source of truth at submit time.
    const organizationId = (this.form.value.organization_id as string) ?? null;
    // 0058 — the checkbox group writes to `selectedCategoryIds` (signal)
    // which mirrors into the form control at toggle time. Read from
    // form.value to keep the single source of truth at submit.
    const categoryIds =
      (this.form.value.category_ids as string[] | null) ?? [];

    if (this.isEditing()) {
      // PATCH — `category_ids` is tri-state on the wire; sending the
      // current selection is the normal path. (Absent = no-op, [] = wipe,
      // [..] = replace. The form always sends [..].)
      this.departmentService.update(this.id!, { name, description, category_ids: categoryIds }).subscribe({
        next: () => {
          this.toastService.success('Departamento actualizado correctamente');
          this.isSaving.set(false);
          this.goBack();
        },
        error: (err) => this.handleSubmitError(err),
      });
    } else {
      if (!organizationId) {
        // Defensive: caller has no org selected (e.g. admin_org with no
        // assigned org, or master with empty dropdown). Block client-side
        // to fail fast; the backend would also reject this with 400.
        this.bannerError.set(
          'Selecciona una organización antes de crear el departamento.',
        );
        this.isSaving.set(false);
        return;
      }
      this.departmentService
        .create({ name, description, organization_id: organizationId, category_ids: categoryIds })
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
          organization_id: dept.organization_id,
        });
        // 0058 — pre-fill the category checkbox group from the row's
        // own category_ids. `getById()` returns the unwrapped envelope
        // (department + category_ids merged into one IDepartment).
        const ids = dept.category_ids ?? [];
        this.selectedCategoryIds.set(ids);
        this.categoryIdsControl.setValue(ids);
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
