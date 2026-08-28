import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { UsersService } from '../services/users.service';
import { User } from '../models/user.interface';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginationComponent],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdowns()',
  },
})
export class UserManagementComponent implements OnInit {
  private readonly usersService = inject(UsersService);
  readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly users = signal<User[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly totalPagesFromServer = signal(0);

  readonly openDropdownId = signal<number | null>(null);

  closeDropdowns(): void {
    this.openDropdownId.set(null);
  }

  toggleDropdown(userId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openDropdownId.update((id) => (id === userId ? null : userId));
  }

  readonly selectedIds = signal<Set<number>>(new Set());

  readonly isAllSelected = computed(() => {
    const visible = this.pagedUsers();
    return visible.length > 0 && visible.every((u) => this.selectedIds().has(u.usuarioId));
  });

  readonly isIndeterminate = computed(() => {
    const visible = this.pagedUsers();
    const selected = visible.filter((u) => this.selectedIds().has(u.usuarioId));
    return selected.length > 0 && selected.length < visible.length;
  });

  toggleAll(): void {
    const visible = this.pagedUsers();
    if (this.isAllSelected()) {
      this.selectedIds.update((s) => {
        const n = new Set(s);
        visible.forEach((u) => n.delete(u.usuarioId));
        return n;
      });
    } else {
      this.selectedIds.update((s) => {
        const n = new Set(s);
        visible.forEach((u) => n.add(u.usuarioId));
        return n;
      });
    }
  }

  toggleUser(userId: number): void {
    this.selectedIds.update((s) => {
      const n = new Set(s);
      if (n.has(userId)) {
        n.delete(userId);
      } else {
        n.add(userId);
      }
      return n;
    });
  }

  readonly searchTerm = signal('');

  readonly pageSizeOptions = [5, 10, 15];
  readonly pageSize = signal(5);
  readonly currentPage = signal(1);
  readonly totalItems = signal(0);
  readonly totalPages = signal(1);

  readonly pageNumbers = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  readonly pagedUsers = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) {
      return this.users();
    }
    return this.users().filter((u) => {
      const fullName = `${u.nombres} ${u.apellidos}`.toLowerCase();
      return (
        fullName.includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (u.rol?.nombre || '').toLowerCase().includes(term)
      );
    });
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.usersService.getUsers(this.currentPage(), this.pageSize()).subscribe({
      next: (response) => {
        this.users.set(response.data);
        this.totalItems.set(response.meta.total);
        this.totalPages.set(response.meta.ultimaPagina);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar usuarios:', err);
        this.errorMessage.set('No se pudieron cargar los usuarios.');
        this.isLoading.set(false);
      },
    });
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.selectedIds.set(new Set());
    this.loadUsers();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.selectedIds.set(new Set());
    this.loadUsers();
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    this.currentPage.set(1);
    this.loadUsers();
  }

  navigateToCreate(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  navigateToEdit(user: User): void {
    this.router.navigate([user.usuarioId, 'edit'], { relativeTo: this.route });
  }

  eliminarUsuario(user: User): void {
    this.dialogService
      .confirm({
        title: 'Confirmar eliminación',
        message: `¿Estás seguro de que deseas eliminar al usuario ${user.nombres} ${user.apellidos}? Esta acción no se puede deshacer.`,
        isDanger: true,
        confirmText: 'Eliminar',
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.isLoading.set(true);
          this.usersService.deleteUser(user.usuarioId).subscribe({
            next: () => {
              this.loadUsers();
              this.isLoading.set(false);
              this.toastService.success('Usuario eliminado correctamente', 'Éxito');
            },
            error: (err) => {
              console.error('Error al eliminar usuario:', err);
              const msg = err.error?.message || 'Error al eliminar el usuario.';
              this.toastService.error(msg, 'Error');
              this.isLoading.set(false);
            },
          });
        }
      });
  }
}
