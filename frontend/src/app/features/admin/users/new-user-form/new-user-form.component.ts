import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { UsersService } from '../services/users.service';
import { InvitationsService } from '../services/invitations.service';
import {
  DEFAULT_NEW_USER_FORM,
  NewUserFormData,
  Organization,
  RoleOption,
  RolePermissionsView,
  CreateUserJsonPayload,
} from '../models/user.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

const AVATAR_MIME_ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ROLES_REQUIRING_ORG = ['admin_org', 'operador_org'] as const;

/**
 * NewUserFormComponent — F6 (`2026-09-08-f6-new-user-form`).
 *
 * Reemplaza al `UserFormComponent` en la ruta `admin/users/new`. Sigue
 * el layout del mock 03-02: 6 secciones inline (D-frontend-2) con
 * estado en signals (D-frontend-3), sin `FormGroup` (el edit sigue
 * con `FormGroup` porque tiene `directPermissions`).
 *
 * Decisiones aplicadas (ver `design.md` del change):
 * - D-frontend-1: ruta, no modal
 * - D-frontend-4: submit en 2 pasos (POST user → PATCH avatar si foto)
 * - D-frontend-5: permisos del rol via `GET /api/roles/:id/permissions`
 *   on-demand al seleccionar el rol
 * - D-frontend-6: invitación como `POST /api/admin/users/invite`
 *   separado, no flag en DTO
 * - D-frontend-7: validación frontend por campo, no `Validators`
 * - D-frontend-8/9: geolocalización y canal/estado fijos, disabled F7
 */
@Component({
  selector: 'app-new-user-form',
  standalone: true,
  imports: [CommonModule, UiPageHeaderComponent, UiIconComponent],
  templateUrl: './new-user-form.component.html',
  styleUrl: './new-user-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewUserFormComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  // ---- Estado del formulario (D-frontend-3) -------------------------
  readonly formData = signal<NewUserFormData>({ ...DEFAULT_NEW_USER_FORM });
  readonly roles = signal<ReadonlyArray<RoleOption>>([]);
  readonly organizations = signal<ReadonlyArray<Organization>>([]);
  readonly permissionsCatalog = signal<ReadonlyArray<string>>([]);
  readonly selectedRolePermissions = signal<RolePermissionsView>({ access: [], noAccess: [] });

  // ---- Estado UI ----------------------------------------------------
  readonly avatarPreview = signal<string | null>(null);
  readonly pendingAvatar = signal<File | null>(null);
  readonly isLoadingLookups = signal<boolean>(true);
  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  // ---- Computed -----------------------------------------------------

  /**
   * D-frontend-7 — validación reactiva. Reglas:
   *  - firstName y lastName: requerido, >= 2 chars
   *  - email: requerido, formato básico
   *  - phone: opcional, max 30 chars
   *  - roleId: si el rol es `admin_org` u `operador_org`,
   *    `organizationId` es requerido
   */
  readonly isFormValid = computed<boolean>(() => {
    const d = this.formData();
    if (d.firstName.trim().length < 2) return false;
    if (d.lastName.trim().length < 2) return false;
    if (!/^[^@\s]+@[^@\s]+$/.test(d.email)) return false;
    if (d.phone.length > 30) return false;
    if (d.roleId) {
      const role = this.roles().find((r) => r.id === d.roleId);
      if (role && (ROLES_REQUIRING_ORG as readonly string[]).includes(role.name) && !d.organizationId) {
        return false;
      }
    }
    return true;
  });

  /**
   * D-frontend-10 / spec `Modal Cancel` — distingue "form limpio"
   * (cancelar directo) de "form con cambios" (cancelar pide
   * confirmación). `sendInvitation` empieza en `true` por default,
   * así que se ignora al calcular.
   */
  readonly isFormDirty = computed<boolean>(() => {
    const d = this.formData();
    return (
      d.email !== '' ||
      d.firstName !== '' ||
      d.lastName !== '' ||
      d.phone !== '' ||
      d.organizationId !== null ||
      d.roleId !== null ||
      this.pendingAvatar() !== null
    );
  });

  /** Roles que disparan warning de organización requerida. */
  readonly requiresOrganization = computed<boolean>(() => {
    const d = this.formData();
    if (!d.roleId) return false;
    const role = this.roles().find((r) => r.id === d.roleId);
    return !!role && (ROLES_REQUIRING_ORG as readonly string[]).includes(role.name);
  });

  // ---- Lifecycle ----------------------------------------------------

  ngOnInit(): void {
    this.loadFormData();
    this.loadPermissionsCatalog();
  }

  private loadFormData(): void {
    this.isLoadingLookups.set(true);
    this.usersService
      .getFormData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, organizations }) => {
          this.roles.set(roles.map((r) => ({ id: r.id, name: r.name })));
          this.organizations.set(organizations);
          this.isLoadingLookups.set(false);
        },
        error: () => {
          this.errorMessage.set(
            'No se pudieron cargar los datos del formulario. Recargá la página para reintentar.',
          );
          this.isLoadingLookups.set(false);
        },
      });
  }

  private loadPermissionsCatalog(): void {
    // D-frontend-5.a — catálogo upfront (no on-demand) para que la
    // lista "SIN ACCESO" del preview se calcule sin re-fetch.
    this.usersService
      .getPermissionsCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => this.permissionsCatalog.set(catalog),
        error: () => {
          /* tolerar: si falla, "SIN ACCESO" muestra "Sin permisos restringidos" */
          this.permissionsCatalog.set([]);
        },
      });
  }

  // ---- Handlers -----------------------------------------------------

  /**
   * D-frontend-5 — al seleccionar un rol, fetchea sus permisos y
   * computa `access` (4 primeros) y `noAccess` (permisos del
   * catálogo que el rol NO tiene, slice 0-2).
   */
  onRoleChange(roleId: string | null): void {
    this.formData.update((d) => ({ ...d, roleId }));
    if (!roleId) {
      this.selectedRolePermissions.set({ access: [], noAccess: [] });
      return;
    }
    this.usersService
      .getRolePermissions(roleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perms) => {
          const access = perms.slice(0, 4);
          const catalog = this.permissionsCatalog();
          const roleHas = new Set(perms);
          const noAccess = catalog.filter((p) => !roleHas.has(p)).slice(0, 2);
          this.selectedRolePermissions.set({ access, noAccess });
        },
        error: () => {
          this.selectedRolePermissions.set({ access: [], noAccess: [] });
          this.toastService.warning(
            'No se pudieron cargar los permisos del rol.',
            'Aviso',
          );
        },
      });
  }

  onOrganizationChange(organizationId: string | null): void {
    this.formData.update((d) => ({ ...d, organizationId }));
  }

  onSendInvitationChange(value: boolean): void {
    this.formData.update((d) => ({ ...d, sendInvitation: value }));
  }

  /**
   * D-frontend-3 — un único `signal<NewUserFormData>`. Cada input
   * actualiza el signal con un spread; no usamos `FormGroup` por
   * consistencia con `UsersListComponent` (D-frontend-3).
   */
  onFieldChange<K extends keyof NewUserFormData>(field: K, value: NewUserFormData[K]): void {
    this.formData.update((d) => ({ ...d, [field]: value }));
  }

  /**
   * D-frontend-4 — upload de avatar: valida MIME y size; si pasa,
   * previsualiza con FileReader y guarda el File en `pendingAvatar`.
   * El upload real ocurre en `onSubmit()` (POST user → PATCH avatar).
   */
  onAvatarSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!(AVATAR_MIME_ALLOWED as readonly string[]).includes(file.type)) {
      this.errorMessage.set(
        'Archivo no soportado. JPG, PNG, WEBP máximo 2MB',
      );
      input.value = '';
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.errorMessage.set(
        'Archivo no soportado. JPG, PNG, WEBP máximo 2MB',
      );
      input.value = '';
      return;
    }
    this.errorMessage.set(null);
    this.pendingAvatar.set(file);

    const reader = new FileReader();
    reader.onload = () => this.avatarPreview.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ---- Submit / Cancel ----------------------------------------------

  /**
   * D-frontend-4 + D-frontend-6 — submit en hasta 3 requests:
   *  1. `POST /api/users` con JSON snake_case (requerido)
   *  2. `PATCH /api/users/:id/avatar` con FormData (si hay foto)
   *  3. `POST /api/admin/users/invite` (si `sendInvitation` es true)
   *
   * Cada paso es tolerante a fallas:
   *  - `createUserJson` falla → toast, no navega, rehabilita Guardar
   *  - `uploadAvatar` falla → warning toast, sigue al invite
   *  - `invite` falla (4xx/5xx) → warning toast, navega igual
   */
  onSubmit(): void {
    if (!this.isFormValid() || this.isSaving()) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    const d = this.formData();
    const payload: CreateUserJsonPayload = {
      email: d.email.trim(),
      first_name: d.firstName.trim(),
      last_name: d.lastName.trim(),
      phone: d.phone.trim(),
      role_id: d.roleId,
      organization_id: d.organizationId,
    };

    this.usersService
      .createUserJson(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => this.afterUserCreated((user as { id?: string }).id ?? ''),
        error: (err: unknown) => this.onCreateError(err),
      });
  }

  private afterUserCreated(userId: string): void {
    const avatar = this.pendingAvatar();
    const shouldInvite = this.formData().sendInvitation;

    if (avatar) {
      this.usersService
        .uploadAvatar(userId, avatar)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.afterAvatar(userId, shouldInvite),
          error: () => {
            this.toastService.warning(
              'Usuario creado, pero la foto no se pudo subir. Podés actualizarla desde la edición.',
              'Aviso',
            );
            this.afterAvatar(userId, shouldInvite);
          },
        });
    } else {
      this.afterAvatar(userId, shouldInvite);
    }
  }

  private afterAvatar(userId: string, shouldInvite: boolean): void {
    if (shouldInvite) {
      this.invitationsService
        .invite({
          email: this.formData().email.trim(),
          roleId: this.formData().roleId,
          organizationId: this.formData().organizationId,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.onSuccess(),
          error: (err: unknown) => {
            const msg = this.inviteErrorMessage(err);
            this.toastService.warning(
              `Usuario creado, pero la invitación no se envió (${msg}). Podés reinvitarlo desde la lista.`,
              'Aviso',
            );
            this.onSuccess();
          },
        });
    } else {
      this.onSuccess();
    }
  }

  private onCreateError(err: unknown): void {
    this.isSaving.set(false);
    const status = (err instanceof HttpErrorResponse && err.status) || 0;
    if (status === 409) {
      this.toastService.error('Email ya registrado en el sistema', 'Error');
    } else if (status === 403) {
      this.toastService.error(
        'No tienes permiso para crear usuarios',
        'Acción no permitida',
      );
    } else if (status === 400) {
      this.toastService.error(
        'Datos inválidos. Verificá los campos e intenta de nuevo.',
        'Error',
      );
    } else {
      this.toastService.error(
        'No se pudo crear el usuario. Intenta nuevamente.',
        'Error',
      );
    }
  }

  private inviteErrorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 409) return 'el email ya tenía cuenta';
      if (err.status === 403) return 'sin permiso para invitar';
    }
    return 'error del servidor';
  }

  private onSuccess(): void {
    this.isSaving.set(false);
    this.toastService.success('Usuario creado correctamente', 'Éxito');
    this.router.navigate(['/app/admin/users']);
  }

  /**
   * D-frontend-10 — Cancelar descarta. Si el form está limpio, sale
   * directo; si tiene cambios, abre `ConfirmDialogService`.
   */
  onCancel(): void {
    if (!this.isFormDirty()) {
      this.router.navigate(['/app/admin/users']);
      return;
    }
    this.dialogService
      .confirm({
        title: '¿Descartar los cambios?',
        message: 'Esta acción no se puede deshacer.',
        confirmText: 'Descartar',
        cancelText: 'Seguir editando',
        isDanger: true,
      })
      .subscribe((ok) => {
        if (ok) this.router.navigate(['/app/admin/users']);
      });
  }
}
