import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { SystemConfigService } from './services/system-config.service';
import { ISistemaConfig } from './interfaces/system-config.interface';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { TableSkeletonComponent } from '../../../shared/components/table-skeleton/table-skeleton.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-system-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TableSkeletonComponent,
    EmptyStateComponent,
  ],
  templateUrl: './system-config.component.html',
  styleUrl: './system-config.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemConfigComponent implements OnInit {
  private readonly configService = inject(SystemConfigService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  configs: ISistemaConfig[] = [];
  isLoading = false;
  searchQuery = '';

  // Selection
  selectedClaves = new Set<string>();

  // Dropdown menu
  openDropdownClave: string | null = null;

  // Modal
  isModalOpen = false;
  isEditing = false;
  isSaving = false;
  configForm!: FormGroup;
  selectedClave: string | null = null;

  ngOnInit(): void {
    this.initForm();
    this.loadConfigs();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.closeDropdowns();
    }
  }

  private initForm(): void {
    this.configForm = this.fb.group({
      clave: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_.-]+$/)]],
      valor: ['', [Validators.required]],
      descripcion: [''],
    });
  }

  loadConfigs(): void {
    this.isLoading = true;
    this.selectedClaves.clear();
    this.openDropdownClave = null;
    this.cdr.markForCheck();

    this.configService.getConfigs().subscribe({
      next: (data) => {
        this.configs = data;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoading = false;
        const msg = err?.error?.message || 'Error al cargar las configuraciones';
        this.toastService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
        this.cdr.markForCheck();
      },
    });
  }

  get filteredConfigs(): ISistemaConfig[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.configs;
    return this.configs.filter(
      (c) =>
        c.clave.toLowerCase().includes(q) ||
        c.valor.toLowerCase().includes(q) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(q)),
    );
  }

  // Selection Checkboxes
  get isAllSelected(): boolean {
    const visible = this.filteredConfigs;
    return visible.length > 0 && visible.every((c) => this.selectedClaves.has(c.clave));
  }

  get isIndeterminate(): boolean {
    const visible = this.filteredConfigs;
    const count = visible.filter((c) => this.selectedClaves.has(c.clave)).length;
    return count > 0 && count < visible.length;
  }

  toggleSelectAll(): void {
    const visible = this.filteredConfigs;
    if (this.isAllSelected) {
      visible.forEach((c) => this.selectedClaves.delete(c.clave));
    } else {
      visible.forEach((c) => this.selectedClaves.add(c.clave));
    }
    this.cdr.markForCheck();
  }

  toggleSelect(clave: string, event: Event): void {
    event.stopPropagation();
    if (this.selectedClaves.has(clave)) {
      this.selectedClaves.delete(clave);
    } else {
      this.selectedClaves.add(clave);
    }
    this.cdr.markForCheck();
  }

  isSelected(clave: string): boolean {
    return this.selectedClaves.has(clave);
  }

  // Dropdown Actions
  toggleDropdown(clave: string, event: Event): void {
    event.stopPropagation();
    this.openDropdownClave = this.openDropdownClave === clave ? null : clave;
    this.cdr.markForCheck();
  }

  closeDropdowns(): void {
    if (this.openDropdownClave !== null) {
      this.openDropdownClave = null;
      this.cdr.markForCheck();
    }
  }

  // Quick report style toggle helper
  isReportStyleConfig(config: ISistemaConfig): boolean {
    return config.clave === 'reporte.estilo';
  }

  toggleReportStyle(config: ISistemaConfig): void {
    this.closeDropdowns();
    const nextStyle = config.valor === 'modern' ? 'legacy' : 'modern';
    this.configService.updateConfig(config.clave, { valor: nextStyle }).subscribe({
      next: (updated) => {
        config.valor = updated.valor;
        config.updatedAt = updated.updatedAt;
        this.toastService.show(`Estilo de reportes cambiado a: ${nextStyle}`, 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error al actualizar el estilo de reporte';
        this.toastService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  openCreateModal(): void {
    this.isEditing = false;
    this.selectedClave = null;
    this.configForm.reset();
    this.configForm.get('clave')?.enable();
    this.isModalOpen = true;
    this.cdr.markForCheck();
  }

  openEditModal(config: ISistemaConfig): void {
    this.closeDropdowns();
    this.isEditing = true;
    this.selectedClave = config.clave;
    this.configForm.patchValue({
      clave: config.clave,
      valor: config.valor,
      descripcion: config.descripcion || '',
    });
    this.configForm.get('clave')?.disable();
    this.isModalOpen = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.configForm.reset();
    this.cdr.markForCheck();
  }

  saveConfig(): void {
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      return;
    }

    const formVal = this.configForm.getRawValue();
    this.isSaving = true;
    this.cdr.markForCheck();

    if (this.isEditing && this.selectedClave) {
      this.configService
        .updateConfig(this.selectedClave, {
          valor: formVal.valor,
          descripcion: formVal.descripcion,
        })
        .subscribe({
          next: () => {
            this.isSaving = false;
            this.isModalOpen = false;
            this.toastService.show('Configuración actualizada exitosamente', 'success');
            this.loadConfigs();
          },
          error: (err) => {
            this.isSaving = false;
            const msg = err?.error?.message || 'Error al actualizar configuración';
            this.toastService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
            this.cdr.markForCheck();
          },
        });
    } else {
      this.configService
        .createConfig({
          clave: formVal.clave,
          valor: formVal.valor,
          descripcion: formVal.descripcion,
        })
        .subscribe({
          next: () => {
            this.isSaving = false;
            this.isModalOpen = false;
            this.toastService.show('Configuración creada exitosamente', 'success');
            this.loadConfigs();
          },
          error: (err) => {
            this.isSaving = false;
            const msg = err?.error?.message || 'Error al crear configuración';
            this.toastService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
            this.cdr.markForCheck();
          },
        });
    }
  }

  deleteConfig(config: ISistemaConfig): void {
    this.closeDropdowns();
    this.dialogService
      .confirm({
        title: 'Eliminar Configuración',
        message: `¿Estás seguro de eliminar la variable "${config.clave}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        isDanger: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) {
          this.configService.deleteConfig(config.clave).subscribe({
            next: () => {
              this.toastService.show('Configuración eliminada', 'success');
              this.loadConfigs();
            },
            error: (err) => {
              const msg = err?.error?.message || 'Error al eliminar configuración';
              this.toastService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
            },
          });
        }
      });
  }
}
