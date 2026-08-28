import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RolesService } from './services/roles.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { RoleListItem } from './models/role-permission.interface';

@Component({
  selector: 'app-roles',
  imports: [RouterOutlet, RouterLink, CommonModule],
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly toast = inject(ToastService);

  readonly roles = signal<RoleListItem[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.rolesService.getRoles().subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : ((res as { data: RoleListItem[] }).data ?? []);
        this.roles.set(list);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading roles:', err);
        const msg = err?.error?.message ?? `Error ${err?.status ?? ''} al cargar los roles`;
        this.errorMessage.set(msg);
        this.toast.error(msg, 'Error');
        this.isLoading.set(false);
      },
    });
  }
}
