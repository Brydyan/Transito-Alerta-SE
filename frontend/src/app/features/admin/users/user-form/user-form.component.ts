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
import { map } from 'rxjs/operators';
import { UsersService } from '../services/users.service';
import {
  Role,
  RolePermission,
  PermissionItem,
  DirectPermission,
  UserDetail,
} from '../models/user.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
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
  private readonly toastService = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  private readonly subscriptions = new Subscription();

  readonly userId = Number(this.route.snapshot.paramMap.get('id') ?? 0);
  readonly isEditing = computed(() => this.userId > 0);

  readonly isAdminOrSuperadmin = computed(() => {
    const role = this.authService.currentUser()?.roleName?.toLowerCase();
    return role === 'admin' || role === 'superadmin';
  });

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);

  readonly roles = signal<Role[]>([]);
  readonly rolePermissions = signal<RolePermission[]>([]);
  readonly allPermissions = signal<PermissionItem[]>([]);
  readonly directPermissionIds = signal<Set<number>>(new Set());

  readonly avatarPreview = signal<string | null>(null);
  readonly isUploadingAvatar = signal(false);

  private pendingAvatarFile: File | null = null;
  private originalDirectIds = new Set<number>();

  readonly roleSearch = signal('');
  readonly userPermSearch = signal('');

  readonly filteredRolePerms = computed(() => {
    const term = this.roleSearch().toLowerCase().trim();
    if (!term) return this.rolePermissions();
    return this.rolePermissions().filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.recurso.toLowerCase().includes(term) ||
        p.accion.toLowerCase().includes(term),
    );
  });

  readonly filteredAllPerms = computed(() => {
    const term = this.userPermSearch().toLowerCase().trim();
    if (!term) return this.allPermissions();
    return this.allPermissions().filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.recurso.toLowerCase().includes(term) ||
        p.accion.toLowerCase().includes(term),
    );
  });

  userForm: FormGroup = this.fb.group({
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required, ecuadorPhoneValidator()]],
    rolId: [null as number | null, Validators.required],
  });

  campoInvalido(campo: string): boolean {
    const control = this.userForm.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  ngOnInit(): void {
    this.isLoading.set(true);

    const permissionsReq = this.isAdminOrSuperadmin()
      ? this.usersService.getPermissions().pipe(map((res) => (Array.isArray(res) ? res : res.data)))
      : of([] as PermissionItem[]);

    const userReq = this.isEditing()
      ? this.usersService.getUserById(this.userId)
      : of(null as UserDetail | null);

    forkJoin([this.usersService.getRoles(), permissionsReq, userReq]).subscribe({
      next: ([roles, permissions, user]) => {
        this.roles.set(roles);
        this.allPermissions.set(permissions);

        if (user) {
          if (user.avatar?.url) {
            this.avatarPreview.set(user.avatar.url);
          }

          const directIds = new Set<number>(
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
      .valueChanges.subscribe((rolId: number | null) => {
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

  private loadRolePermissions(rolId: number): void {
    const sub = this.usersService.getRoleById(rolId).subscribe({
      next: (role) => {
        this.rolePermissions.set(role.permisos ?? []);
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

  toggleDirectPerm(permisoId: number): void {
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

  private computeDirectPermissionsDiff(): { permisoId: number; permitido: boolean }[] {
    const current = this.directPermissionIds();
    const original = this.originalDirectIds;
    const all = this.allPermissions();

    const diff: { permisoId: number; permitido: boolean }[] = [];

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
    // Capture current user ID at submit time — avoids stale read inside async callback
    const currentUserId = Number(this.authService.currentUser()?.id);

    if (this.isEditing()) {
      const directPermissions = this.computeDirectPermissionsDiff();

      const payload = {
        email: form.email,
        nombres: form.nombres,
        apellidos: form.apellidos,
        telefono: form.telefono,
        rolId: Number(form.rolId),
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
      const payload = {
        email: form.email,
        nombres: form.nombres,
        apellidos: form.apellidos,
        telefono: form.telefono,
        rolId: Number(form.rolId),
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
