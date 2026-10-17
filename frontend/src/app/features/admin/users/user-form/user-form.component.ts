import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { UsersService } from '../services/users.service';
import { InvitationsService } from '../services/invitations.service';
import {
  Role,
  PermissionItem,
  DirectPermission,
  UserDetail,
  Organization,
  resolveRolePermissionLabels,
  toPermissionItem,
} from '../models/user.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../core/services/auth.service';

export function ecuadorPhoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const val = String(control.value).trim();

    if (!val.startsWith('+593') && !val.startsWith('09')) {
      return { invalidPrefix: true };
    }

    const lengthWithoutPlus = val.replace('+', '').length;
    if (lengthWithoutPlus < 10 || lengthWithoutPlus > 12) {
      return { invalidLength: true };
    }

    if (!/^\+?\d+$/.test(val)) {
      return { invalidFormat: true };
    }

    return null;
  };
}

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormComponent implements OnInit, OnDestroy {
  private readonly usersService = inject(UsersService);
  private readonly invitationsService = inject(InvitationsService);
  private readonly toastService = inject(ToastService);
  // 2026-10-15-user-status-notif-channel (S3) — confirm before
  // deactivating an active user. The dialog returns a Subject<boolean>;
  // we subscribe and send the PATCH only on `true`. Reactivation
  // proceeds without a dialog (spec S3 escenario "Master reactivates").
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly subscriptions = new Subscription();

  // F6 fix batch (pre-existing, ver `apply-progress.md` del change
  // `2026-09-08-f6-usuarios-redesign`): el `id` del URL es un UUID
  // (string), no un número. Convertirlo con `Number()` daba `NaN`,
  // el `isEditing` siempre era `false`, y la request `getUserById`
  // nunca se disparaba — el form abría vacío.
  readonly userId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly isEditing = computed(() => !!this.userId);

  readonly isAdminOrSuperadmin = computed(() => {
    const role = this.authService.currentUser()?.roleName?.toLowerCase();
    return role === 'master' || role === 'admin_org';
  });

  /**
   * 2026-10-15-user-status-notif-channel (S3) — the Cuenta section
   * (active toggle + channel selector) is rendered only when the
   * authenticated user is `master`. Spec S3 escenario "Non-master
   * opens edit form — Cuenta section not visible". This is stricter
   * than `isAdminOrSuperadmin` (which also admits `admin_org`); the
   * change's design D6 narrows visibility to master-only.
   */
  readonly isMaster = computed(() => {
    return this.authService.currentUser()?.roleName?.toLowerCase() === 'master';
  });

  /**
   * 2026-10-15-user-status-notif-channel (S3) — defense in depth. The
   * backend service rejects self-deactivation with `ForbiddenException`
   * (controller passes `callerId === id`); we also disable the
   * toggle visually so Master can't even attempt it from the form.
   */
  readonly isSelfEdit = computed(() => {
    const caller = this.authService.currentUser()?.id;
    return !!caller && caller === this.userId;
  });

  /**
   * 2026-10-16-resend-invitation (D4) — gate del botón. Sólo visible
   * cuando (a) el caller es Master, (b) estamos editando (no create),
   * (c) el target tiene una invitación pendiente. La condición (c) se
   * cumple sólo para shadow users — un usuario desactivado por Master
   * (también `isActive = false`) NO tiene invitación pendiente, así
   * que el botón no aparece (no tendría sentido reenviarle el mail).
   *
   * El flag se computa desde `userData()` (signal cargado por
   * `loadUserData()`); `false` mientras no haya carga (default).
   */
  readonly hasPendingInvitation = computed<boolean>(() => {
    return this.userData()?.hasPendingInvitation === true;
  });

  /**
   * 2026-10-16-resend-invitation (D5) — `true` mientras la request de
   * reenvío está en vuelo. Libera en `finalize()` así cubrimos éxito
   * y error sin dos ramas duplicadas.
   */
  readonly isResending = signal<boolean>(false);

  /**
   * 2026-10-16-resend-invitation (D4) — copia del último `UserDetail`
   * cargado por `loadUserData()`. La fuente de verdad para campos que
   * NO viven en el `FormGroup` (ej. `hasPendingInvitation`, que el
   * backend proyecta pero el form no edita — sólo lo lee para
   * mostrar/ocultar el botón). `null` mientras no haya carga.
   */
  readonly userData = signal<UserDetail | null>(null);

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  readonly roles = signal<Role[]>([]);
  readonly rolePermissions = signal<string[]>([]);
  readonly allPermissions = signal<PermissionItem[]>([]);
  readonly organizations = signal<Organization[]>([]);
  readonly directPermissionIds = signal<Set<string>>(new Set());

  readonly avatarPreview = signal<string | null>(null);
  readonly isUploadingAvatar = signal(false);

  private pendingAvatarFile: File | null = null;
  private originalDirectIds = new Set<string>();

  readonly roleSearch = signal('');
  readonly userPermSearch = signal('');

  readonly filteredRolePerms = computed(() => {
    const term = this.roleSearch().toLowerCase().trim();
    if (!term) return this.rolePermissions();
    // sc-340: `rolePermissions` holds labels resolved against the
    // permissions catalog (`"<action> <resource>"`, or the explicit
    // unknown-permission marker) — filter over the rendered text.
    return this.rolePermissions().filter((p) => p.toLowerCase().includes(term));
  });

  /**
   * sc-340 (R5): null-safe search over the user permissions panel.
   * Entries may lack a legible name (pre-sc-340 the service passed
   * the raw wire through), so every field falls back to `''` before
   * `.toLowerCase()` — the filter never throws `TypeError` and a
   * search with no matches yields an empty list.
   */
  readonly filteredAllPerms = computed(() => {
    const term = this.userPermSearch().toLowerCase().trim();
    if (!term) return this.allPermissions();
    return this.allPermissions().filter(
      (p) =>
        (p.nombre ?? '').toLowerCase().includes(term) ||
        (p.recurso ?? '').toLowerCase().includes(term) ||
        (p.accion ?? '').toLowerCase().includes(term),
    );
  });

  userForm: FormGroup = this.fb.group({
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required, ecuadorPhoneValidator()]],
    // F6 fix: `rolId` y `organizationId` son UUIDs (string), no
    // números. El form no tenía `organizationId` antes — eso
    // impedía editar la organización de un user (el backend lo
    // aceptaba pero el form no lo podía cambiar).
    rolId: [null as string | null, Validators.required],
    organizationId: [null as string | null],
    // 2026-10-15-user-status-notif-channel (S1/S3) — both fields
    // default to safe values; the `isActive` toggle is reactive
    // (toggles fire `onToggleActive()`); the channel selector is
    // plain. We don't validate them here — the backend DTO
    // `@IsIn(['email','telegram'])` rejects bad strings with 400.
    isActive: [true],
    preferredNotificationChannel: ['email'],
  });

  campoInvalido(campo: string): boolean {
    const control = this.userForm.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  ngOnInit(): void {
    this.isLoading.set(true);

    // sc-340 (R4): `getPermissions()` already normalizes the wire
    // (flat array or envelope) onto `PermissionItem[]`, so the raw
    // `.data` unwrapping is gone from here.
    const permissionsReq = this.isAdminOrSuperadmin()
      ? this.usersService.getPermissions()
      : of([] as PermissionItem[]);

    const userReq = this.isEditing()
      ? this.usersService.getUserById(this.userId)
      : of(null as UserDetail | null);

    // F6 fix: agregamos `getOrganizations()` al forkJoin para
    // popular el dropdown de organización en el form. Antes el
    // form no tenía ese selector, así que editar un user con
    // `organization_id` mostraba el form sin forma de ver ni
    // cambiar la organización asignada.
    forkJoin([
      this.usersService.getRoles(),
      permissionsReq,
      userReq,
      this.usersService.getOrganizations(),
    ]).subscribe({
      next: ([roles, permissions, user, organizations]) => {
        this.roles.set(roles);
        // sc-340 (R5): normalize the intake onto the aligned
        // `PermissionItem` model. Idempotent for service-mapped
        // entries; fills `permisoId`/`nombre`/`recurso`/`accion`
        // for raw wire entries (`id`/`resource`/`action`) so the
        // panel below binds real identifiers and legible labels.
        this.allPermissions.set(permissions.map(toPermissionItem));
        this.organizations.set(organizations);

        if (user) {
          // 2026-10-16-resend-invitation (D4) — persistir el row
          // completo en `userData` para que signals derivados
          // (`hasPendingInvitation`) lean campos que NO viven en el
          // FormGroup.
          this.userData.set(user);
          if (user.avatar?.url) {
            this.avatarPreview.set(user.avatar.url);
          }

          // F6 fix: `permisoId` ahora es string (UUID), no number.
          const directIds = new Set<string>(
            user.permisosDirectos
              .filter((p: DirectPermission) => p.permitido)
              .map((p: DirectPermission) => p.permisoId),
          );
          this.directPermissionIds.set(directIds);
          this.originalDirectIds = new Set(directIds);

          this.userForm.patchValue({
            nombres: user.nombres,
            apellidos: user.apellidos,
            email: user.email,
            telefono: user.telefono,
            rolId: user.rol?.rolId ?? null,
            organizationId: user.organizationId ?? null,
            // 2026-10-15-user-status-notif-channel — load current
            // state into the form so the toggle and selector render
            // accurately. `user.isActive` is `undefined` for users
            // fetched pre-0033 (no column yet) — default to `true`
            // so we don't accidentally start a deactivation flow.
            // Same for `preferredNotificationChannel` — the DB default
            // is `'email'`, and we mirror that default here.
            isActive: user.isActive ?? true,
            preferredNotificationChannel: user.preferredNotificationChannel ?? 'email',
          });

          if (user.rol?.rolId && this.isAdminOrSuperadmin()) {
            this.loadRolePermissions(user.rol.rolId);
          }
        } else if (roles.length > 0) {
          this.userForm.patchValue({ rolId: roles[0].rolId });
          if (this.isAdminOrSuperadmin()) {
            this.loadRolePermissions(roles[0].rolId);
          }
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading form data:', err);
        this.toastService.error('Error al cargar los datos del formulario.', 'Error');
        this.isLoading.set(false);
      },
    });

    const rolIdChange = this.userForm
      .get('rolId')!
      .valueChanges.subscribe((rolId: string | null) => {
        if (rolId) {
          if (this.isAdminOrSuperadmin()) {
            this.loadRolePermissions(rolId);
          }
        } else {
          this.rolePermissions.set([]);
        }
      });

    this.subscriptions.add(rolIdChange);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * sc-340 (R2): `GET /api/roles/:id` carries permission UUIDs
   * (post-0051), not display strings. Resolve them against the
   * already-loaded `allPermissions` catalog so the role panel renders
   * `"<action> <resource>"` labels; orphan UUIDs show the explicit
   * unknown-permission marker instead of a raw id.
   */
  private loadRolePermissions(rolId: string): void {
    const sub = this.usersService.getRoleById(rolId).subscribe({
      next: (role) => {
        this.rolePermissions.set(
          resolveRolePermissionLabels(role.permisos ?? [], this.allPermissions()),
        );
      },
      error: (err) => {
        console.error('Error loading role permissions:', err);
        this.rolePermissions.set([]);
      },
    });
    this.subscriptions.add(sub);
  }

  onAvatarSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.pendingAvatarFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.avatarPreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  toggleDirectPerm(permisoId: string): void {
    this.directPermissionIds.update((current) => {
      const next = new Set(current);
      if (next.has(permisoId)) {
        next.delete(permisoId);
      } else {
        next.add(permisoId);
      }
      return next;
    });
  }

  /**
   * 2026-10-15-user-status-notif-channel (S3) — Master toggles the
   * active switch on the edit form. Deactivation is the destructive
   * direction: it invalidates the target's session on the next
   * authenticated request (the JWT guard filters `WHERE is_active =
   * TRUE` in `findAuthContextRow`). Spec S3 mandates a confirmation
   * dialog with a warning before the PATCH fires; we use the
   * existing `ConfirmDialogService` pattern (`onDelete` in the users
   * list is the reference). Reactivation proceeds without a dialog —
   * the `change` event of the underlying `<input type="checkbox">`
   * skips the prompt when the new state is `true`.
   *
   * Defense in depth — the backend service still rejects
   * self-deactivation with 403, so a Master that somehow targets
   * their own id gets the same outcome with or without the dialog.
   * We also disable the toggle visually via `[disabled]` in the
   * template when `isSelfEdit()`.
   */

  /**
   * 2026-10-16-resend-invitation (D4) — reenvía la invitación al
   * target actual llamando a `InvitationsService.invite()` (mismo
   * endpoint que el alta inicial; el backend permite múltiples
   * invitaciones pendientes para el mismo email y la guarda
   * SHADOW_USER_NOT_FOUND sigue permitiendo el flujo normal —
   * adminCreate persiste el shadow, así que reenviar siempre
   * encuentra el row).
   *
   * El botón sólo es visible cuando `isMaster() && isEditing() &&
   * hasPendingInvitation()` (gates en el template); el guard
   * defensivo `if (!user) return` cubre el caso borde de que el
   * signal aún no haya cargado el user (no debería pasar, pero
   * cuesta cero).
   *
   * `finalize()` libera el spinner en ambos paths (éxito y error)
   * — un solo lugar para el reset.
   */
  resendInvitation(): void {
    const user = this.userData();
    if (!user) return;
    this.isResending.set(true);
    this.invitationsService
      .invite({
        email: user.email,
        roleId: user.rol?.rolId ?? null,
        organizationId: user.organizationId ?? null,
      })
      .pipe(finalize(() => this.isResending.set(false)))
      .subscribe({
        next: () => this.toastService.success('Invitación reenviada correctamente.'),
        error: () => this.toastService.error('No se pudo reenviar la invitación.'),
      });
  }

  onToggleActive(event: Event): void {
    const target = event.target as HTMLInputElement;
    const nextActive = target.checked;

    if (nextActive) {
      // Reactivation — no dialog.
      this.userForm.patchValue({ isActive: true });
      return;
    }

    // Deactivation — open the confirmation dialog. The template binds
    // `target.checked` to the input directly via `[checked]`, so on
    // cancel we revert the input first and skip the form patch.
    target.checked = true;
    const dialog$ = this.confirmDialog.confirm({
      title: 'Desactivar usuario',
      message:
        'Al desactivar la cuenta, las sesiones activas del usuario se invalidarán en su próxima petición. Esta acción puede revertirse reactivando la cuenta desde el mismo formulario.',
      confirmText: 'Desactivar',
      cancelText: 'Cancelar',
      isDanger: true,
    });
    dialog$.subscribe((ok) => {
      if (ok) {
        target.checked = false;
        this.userForm.patchValue({ isActive: false });
      }
    });
  }

  private computeDirectPermissionsDiff(): { permisoId: string; permitido: boolean }[] {
    const current = this.directPermissionIds();
    const original = this.originalDirectIds;
    const all = this.allPermissions();

    const diff: { permisoId: string; permitido: boolean }[] = [];

    for (const perm of all) {
      const wasEnabled = original.has(perm.permisoId);
      const isEnabled = current.has(perm.permisoId);
      if (wasEnabled !== isEnabled) {
        diff.push({ permisoId: perm.permisoId, permitido: isEnabled });
      }
    }

    return diff;
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const form = this.userForm.value;
    // F6 fix: el `id` del usuario autenticado es UUID (string), no
    // número. Comparar con `===` entre strings; antes hacía
    // `Number(undefined) === NaN` siempre, así que el bloque de
    // `updateCurrentUser` nunca se ejecutaba.
    const currentUserId = this.authService.currentUser()?.id ?? '';

    if (this.isEditing()) {
      const directPermissions = this.computeDirectPermissionsDiff();

      // 2026-10-15-user-status-notif-channel — only Master sends
      // `isActive` (others can't toggle the field; spec S3). We also
      // skip the PATCH when the target is the caller themselves
      // (the service rejects with 403 anyway, but skipping avoids
      // a useless request and a confusing error toast).
      const sendIsActive = this.isMaster() && !this.isSelfEdit();
      const sendChannel = this.isMaster();

      const payload: Record<string, unknown> = {
        email: form.email,
        nombres: form.nombres,
        apellidos: form.apellidos,
        telefono: form.telefono,
        // F6 fix: `rolId` es UUID string. Antes hacía `Number(form.rolId)`
        // → `NaN` para un UUID, lo que rompía la actualización en el
        // backend (el DTO esperaba string).
        rolId: form.rolId,
        // F6 fix: organizationId se incluye para que el form
        // pueda cambiar la org. Si es `null`, el backend lo limpia.
        organizationId: form.organizationId ?? null,
        ...(sendIsActive ? { isActive: form.isActive } : {}),
        ...(sendChannel ? { preferredNotificationChannel: form.preferredNotificationChannel } : {}),
        ...(directPermissions.length > 0 ? { directPermissions } : {}),
      };

      const editSub = this.usersService
        .updateUser(this.userId, payload, this.pendingAvatarFile ?? undefined)
        .subscribe({
          next: (updatedUser) => {
            if (currentUserId === this.userId) {
              this.authService.updateCurrentUser({
                name: `${form.nombres} ${form.apellidos}`,
                email: form.email,
                avatar: updatedUser.avatar ?? null,
              });
            }
            this.toastService.success('Usuario actualizado correctamente.', 'Éxito');
            this.isSaving.set(false);
            this.goBack();
          },
          error: (err) => {
            console.error('Error updating user:', err.error ?? err);
            const msg = err.error?.message || 'Error al actualizar el usuario.';
            this.toastService.error(msg, 'Error');
            this.isSaving.set(false);
          },
        });
      this.subscriptions.add(editSub);
    } else {
      // F6 fix: `email` y `phone` (renombrado a `telefono` en el
      // payload español) ahora viajan al backend en el create. Antes
      // el DTO los aceptaba pero el form no los mandaba y el user
      // quedaba sin teléfono.
      const payload = {
        email: form.email,
        nombres: form.nombres,
        apellidos: form.apellidos,
        telefono: form.telefono,
        rolId: form.rolId,
        organizationId: form.organizationId ?? null,
      };

      const createSub = this.usersService
        .createUser(payload, this.pendingAvatarFile ?? undefined)
        .subscribe({
          next: () => {
            this.toastService.success('Usuario creado correctamente.', 'Éxito');
            this.isSaving.set(false);
            this.goBack();
          },
          error: (err) => {
            console.error('Error creating user:', err.error ?? err);
            const msg = err.error?.message || 'Error al crear el usuario.';
            this.toastService.error(msg, 'Error');
            this.isSaving.set(false);
          },
        });
      this.subscriptions.add(createSub);
    }
  }

  goBack(): void {
    if (this.isEditing()) {
      this.router.navigate(['../..'], { relativeTo: this.route });
    } else {
      this.router.navigate(['..'], { relativeTo: this.route });
    }
  }
}
