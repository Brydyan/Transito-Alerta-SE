import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoleMatrix, RoleMatrixEntry } from '../../../../../core/services/menu-option.service';

export interface ScopeBlock {
  key: keyof RoleMatrix;
  label: string;
  entries: RoleMatrixEntry[];
}

/**
 * RoleMatrixComponent (F5.6.5) — displays role × (read, write) matrix
 * grouped by three scope blocks: platform, organization, public.
 *
 * Client-side validation: canWrite=true with canRead=false is blocked
 * in addition to the server's 422.
 */
@Component({
  selector: 'app-role-matrix',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="role-matrix space-y-4">
      @for (block of scopeBlocks(); track block.key) {
        <div class="scope-block">
          <h4 class="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">
            {{ block.label }}
          </h4>
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-border-subtle">
                <th class="text-left py-2 pr-4 text-slate-500 font-medium">Rol</th>
                <th class="text-center py-2 px-3 text-slate-500 font-medium w-20">Lectura</th>
                <th class="text-center py-2 px-3 text-slate-500 font-medium w-20">Escritura</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of block.entries; track entry.roleId) {
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="py-2 pr-4 text-slate-700">{{ entry.roleName }}</td>
                  <td class="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      [checked]="entry.canRead"
                      [disabled]="isDisabled()"
                      (change)="toggleAccess(entry.roleId, 'canRead', $any($event.target).checked)"
                      class="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                    />
                  </td>
                  <td class="text-center py-2 px-3">
                    <input
                      type="checkbox"
                      [checked]="entry.canWrite"
                      [disabled]="isDisabled() || !entry.canRead"
                      (change)="toggleAccess(entry.roleId, 'canWrite', $any($event.target).checked)"
                      class="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class RoleMatrixComponent {
  /** Role matrix from the API, grouped by scope. */
  readonly matrix = input.required<RoleMatrix>();

  /** True when a save is in progress — disables all checkboxes. */
  readonly saving = input<boolean>(false);

  /** Emits when a role's access is toggled. */
  readonly accessChange = output<{ roleId: string; canRead: boolean; canWrite: boolean }>();

  /** Whether the matrix is in saving state. */
  readonly isDisabled = computed(() => this.saving());

  /** Ordered scope blocks with labels. */
  readonly scopeBlocks = computed<ScopeBlock[]>(() => {
    const m = this.matrix();
    return [
      { key: 'platform', label: 'Plataforma', entries: m.platform },
      { key: 'organization', label: 'Organización', entries: m.organization },
      { key: 'public', label: 'Público', entries: m.public },
    ];
  });

  /**
   * Toggle a role's access. Client-side guard: canWrite cannot be
   * set to true if canRead is false.
   */
  toggleAccess(roleId: string, field: 'canRead' | 'canWrite', value: boolean): void {
    const m = this.matrix();
    const allEntries = [...m.platform, ...m.organization, ...m.public];
    const entry = allEntries.find((e) => e.roleId === roleId);
    if (!entry) return;

    const newCanRead = field === 'canRead' ? value : entry.canRead;
    let newCanWrite = field === 'canWrite' ? value : entry.canWrite;

    // When canRead is turned off, force canWrite off too (you can't write what you can't see)
    if (!newCanRead) {
      newCanWrite = false;
    }

    // Block: cannot explicitly set canWrite=true when canRead is false
    if (field === 'canWrite' && value && !newCanRead) return;

    this.accessChange.emit({
      roleId,
      canRead: newCanRead,
      canWrite: newCanWrite,
    });
  }
}
