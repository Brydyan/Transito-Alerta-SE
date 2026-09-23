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
import { IncidentCategoryService } from '../services/incident-category.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';
import { IncidentPriority } from '../../../../core/models/incident.model';
import {
  IIncidentCategory,
  IncidentCategoryTreeNode,
} from '../interfaces/iincident-category.interface';

/**
 * Type of record the user is creating on the form. Edit mode is
 * always bound to a single existing category and does NOT expose the
 * toggle (the hierarchy of an existing node shouldn't be reshuffled
 * from this form — that would require a separate "move" flow with a
 * cycle check).
 */
type CategoryMode = 'root' | 'sub';

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiIconComponent,
  ],
  templateUrl: './category-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFormComponent implements OnInit {
  private readonly categoryService = inject(IncidentCategoryService);
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

  /**
   * sc-334-adjacent (T7.4) — UI mode. Only relevant on CREATE: the user
   * picks whether they're adding a root category or a sub-category
   * under one of the existing roots. On EDIT the toggle is hidden and
   * this signal is derived from the loaded category's `parent_id`.
   */
  readonly mode = signal<CategoryMode>('root');

  /**
   * Available parent candidates — flattened list of every existing
   * root category (the dropdown never lets the user pick a sub-category
   * as parent, keeping the tree at most 2 levels deep per the existing
   * UX expectation in this admin panel).
   */
  readonly availableParents = signal<IIncidentCategory[]>([]);
  readonly isLoadingParents = signal(false);

  /**
   * Convenience flags for the template: which mode is active right now.
   */
  readonly isRoot = computed(() => this.mode() === 'root');
  readonly isSub = computed(() => this.mode() === 'sub');

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(2000)]],
    parent_id: [null as string | null],
    // 2026-09-22-sc-subcategory-priority-assignment (D6) — pre-filled
    // default. Validation lives server-side (the service rejects subs
    // without priority). Root categories ignore this value on submit.
    priority: ['medium' as IncidentPriority],
  });

  get nameControl() {
    return this.form.get('name')!;
  }
  get descriptionControl() {
    return this.form.get('description')!;
  }
  get parentIdControl() {
    return this.form.get('parent_id')!;
  }
  get priorityControl() {
    return this.form.get('priority')!;
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
      return 'Este campo es obligatorio.';
    }
    if (control.errors['maxlength']) {
      return `Máximo ${control.errors['maxlength'].requiredLength} caracteres.`;
    }
    return null;
  }

  ngOnInit(): void {
    if (this.isEditing()) {
      this.loadCategory(this.id!);
    } else {
      this.loadAvailableParents();
    }
  }

  /**
   * Toggles between root / sub modes on CREATE. Switching to 'sub'
   * triggers a fetch of available parent candidates if we don't have
   * them yet, and re-validates `parent_id` (it's required when 'sub').
   */
  setMode(mode: CategoryMode): void {
    if (this.isEditing()) return; // guard — disabled in the template
    this.mode.set(mode);
    if (mode === 'sub') {
      this.parentIdControl.setValidators([Validators.required]);
      if (this.availableParents().length === 0) {
        this.loadAvailableParents();
      }
    } else {
      this.parentIdControl.clearValidators();
      this.parentIdControl.setValue(null);
    }
    this.parentIdControl.updateValueAndValidity();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    this.serverErrors.set({});
    this.integrityError.set(false);

    const raw = this.form.value as {
      name: string;
      description: string | null;
      parent_id: string | null;
      priority: IncidentPriority;
    };
    const dto = {
      name: raw.name,
      description: raw.description?.trim() ? raw.description.trim() : null,
      parent_id: this.isEditing()
        ? undefined // edit path keeps parent_id untouched unless explicitly sent
        : this.isSub()
          ? raw.parent_id
          : null,
      // 2026-09-22-sc-subcategory-priority-assignment (D1) — priority
      // only travels on sub-category CREATE/UPDATE. On EDIT of a root
      // we still send `undefined` so the service keeps it null. On
      // EDIT of a sub we send the current value so the service can
      // accept the explicit re-send.
      priority: this.isSub() ? raw.priority : undefined,
    };

    if (this.isEditing()) {
      this.categoryService.update(this.id!, dto).subscribe({
        next: () => {
          this.toastService.success('Categoría actualizada correctamente');
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
      this.categoryService.create(dto).subscribe({
        next: () => {
          this.toastService.success(
            this.isSub()
              ? 'Sub-categoría creada correctamente'
              : 'Categoría creada correctamente',
          );
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

  private loadCategory(id: string): void {
    this.isLoading.set(true);
    this.categoryService.getById(id).subscribe({
      next: (category) => {
        this.form.patchValue({
          name: category.name,
          description: category.description ?? '',
          parent_id: category.parent_id,
          // 2026-09-22-sc-subcategory-priority-assignment (D6) —
          // fallback to 'medium' for legacy rows created before 0065
          // (which all have NULL priority in the DB).
          priority: category.priority ?? 'medium',
        });
        // Derive mode from existing parent. EDIT never re-exposes the
        // toggle, so this is read-only context for the template.
        this.mode.set(category.parent_id ? 'sub' : 'root');
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error('No se pudieron cargar los datos de la categoría.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Pulls the tree once, then flattens to a list of root-level nodes.
   * We restrict parents to roots because the existing list/tree UI only
   * displays 2 levels, and creating grandchildren from this form would
   * silently break the admin list rendering.
   */
  private loadAvailableParents(): void {
    this.isLoadingParents.set(true);
    this.categoryService.getTree().subscribe({
      next: (tree: IncidentCategoryTreeNode[]) => {
        const roots: IIncidentCategory[] = tree.map((node) => ({
          id: node.id,
          name: node.name,
          description: null,
          parent_id: null,
          created_at: '',
          updated_at: '',
        }));
        this.availableParents.set(roots);
        this.isLoadingParents.set(false);
      },
      error: () => {
        this.isLoadingParents.set(false);
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