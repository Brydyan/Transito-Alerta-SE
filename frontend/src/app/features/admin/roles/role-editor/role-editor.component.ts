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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RolesService } from '../services/roles.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import {
  RoleDetail,
  PermissionItem,
  PermissionGroup,
  PermissionWithState,
} from '../models/role-permission.interface';

@Component({
  selector: 'app-role-editor',
  imports: [CommonModule, FormsModule, PaginationComponent],
  templateUrl: './role-editor.component.html',
  styleUrl: './role-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rolesService = inject(RolesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  rolId = 0;
  private originalIds = new Set<number>();

  readonly role = signal<RoleDetail | null>(null);
  readonly allPermissions = signal<PermissionItem[]>([]);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly assignedIds = signal<Set<number>>(new Set());
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly searchTerm = signal('');

  // Paginación de módulos / recursos
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [5, 10, 15, 20];

  readonly groupedPermissions = computed((): PermissionGroup[] => {
    const perms = this.allPermissions();
    const assigned = this.assignedIds();
    const term = this.searchTerm().trim().toLowerCase();

    const grouped = new Map<string, PermissionWithState[]>();
    for (const p of perms) {
      if (!grouped.has(p.recurso)) grouped.set(p.recurso, []);
      grouped.get(p.recurso)!.push({
        permisoId: p.permisoId,
        nombre: p.nombre,
        descripcion: p.descripcion,
        accion: p.accion,
        assigned: assigned.has(p.permisoId),
      });
    }

    const groups: PermissionGroup[] = [];
    for (const [recurso, items] of grouped.entries()) {
      const filteredItems = term
        ? items.filter(
            (i) =>
              recurso.toLowerCase().includes(term) ||
              i.nombre.toLowerCase().includes(term) ||
              i.accion.toLowerCase().includes(term) ||
              (i.descripcion && i.descripcion.toLowerCase().includes(term)),
          )
        : items;

      if (filteredItems.length > 0) {
        const assignedCount = filteredItems.filter((p) => p.assigned).length;
        groups.push({
          recurso,
          items: filteredItems,
          allSelected: assignedCount === filteredItems.length && filteredItems.length > 0,
          indeterminate: assignedCount > 0 && assignedCount < filteredItems.length,
          assignedCount,
        });
      }
    }

    return groups.sort((a, b) => a.recurso.localeCompare(b.recurso));
  });

  // Módulos visibles en la página actual
  readonly pagedGroups = computed(() => {
    const groups = this.groupedPermissions();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return groups.slice(start, start + size);
  });

  readonly totalStats = computed(() => {
    const all = this.allPermissions();
    const assigned = this.assignedIds();
    return {
      total: all.length,
      assignedCount: assigned.size,
      groupsCount: this.groupedPermissions().length,
    };
  });

  readonly hasChanges = computed(() => {
    const current = this.assignedIds();
    if (current.size !== this.originalIds.size) return true;
    for (const id of current) {
      if (!this.originalIds.has(id)) return true;
    }
    return false;
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.rolId = Number(params.get('rolId'));
      this.resetState();
      this.load();
    });
  }

  private resetState(): void {
    this.role.set(null);
    this.allPermissions.set([]);
    this.assignedIds.set(new Set());
    this.expandedGroups.set(new Set());
    this.originalIds = new Set();
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  private load(): void {
    this.isLoading.set(true);

    this.rolesService.getAllPermissions().subscribe({
      next: (permissions) => {
        this.allPermissions.set(permissions);
        this.loadRoleDetail();
      },
      error: (err) => {
        console.error('Error al cargar catálogo de permisos:', err);
        const msg = err?.error?.message ?? 'No se pudo cargar el catálogo de permisos';
        this.toast.error(msg, 'Error');
        this.isLoading.set(false);
      },
    });
  }

  private loadRoleDetail(): void {
    this.rolesService.getRoleById(this.rolId).subscribe({
      next: (role) => {
        this.role.set(role);
        const ids = new Set((role.permisos || []).map((p) => p.permisoId));
        this.assignedIds.set(ids);
        this.originalIds = new Set(ids);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar detalle del rol:', err);
        const msg = err?.error?.message ?? 'No se pudo cargar el rol solicitado';
        this.toast.error(msg, 'Error');
        this.isLoading.set(false);
      },
    });
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.currentPage.set(1);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  togglePermission(permisoId: number): void {
    this.assignedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(permisoId)) next.delete(permisoId);
      else next.add(permisoId);
      return next;
    });
  }

  toggleGroup(group: PermissionGroup): void {
    const shouldSelect = !group.allSelected;
    this.assignedIds.update((ids) => {
      const next = new Set(ids);
      group.items.forEach((p) => {
        if (shouldSelect) next.add(p.permisoId);
        else next.delete(p.permisoId);
      });
      return next;
    });
  }

  toggleExpansion(recurso: string): void {
    this.expandedGroups.update((groups) => {
      const next = new Set(groups);
      if (next.has(recurso)) next.delete(recurso);
      else next.add(recurso);
      return next;
    });
  }

  expandAll(): void {
    const allKeys = new Set(this.groupedPermissions().map((g) => g.recurso));
    this.expandedGroups.set(allKeys);
  }

  collapseAll(): void {
    this.expandedGroups.set(new Set());
  }

  selectAllVisible(): void {
    this.assignedIds.update((ids) => {
      const next = new Set(ids);
      for (const group of this.pagedGroups()) {
        for (const item of group.items) {
          next.add(item.permisoId);
        }
      }
      return next;
    });
  }

  deselectAllVisible(): void {
    this.assignedIds.update((ids) => {
      const next = new Set(ids);
      for (const group of this.pagedGroups()) {
        for (const item of group.items) {
          next.delete(item.permisoId);
        }
      }
      return next;
    });
  }

  save(): void {
    const current = this.assignedIds();
    const permisosAsignar = [...current].filter((id) => !this.originalIds.has(id));
    const permisosRevocar = [...this.originalIds].filter((id) => !current.has(id));

    this.isSaving.set(true);
    this.rolesService.updateRole(this.rolId, { permisosAsignar, permisosRevocar }).subscribe({
      next: () => {
        this.originalIds = new Set(current);
        this.isSaving.set(false);
        this.toast.success('Permisos actualizados correctamente', 'Éxito');
      },
      error: () => {
        this.toast.error('Error al guardar los permisos', 'Error');
        this.isSaving.set(false);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
