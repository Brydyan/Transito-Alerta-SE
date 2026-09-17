import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RoleMatrix,
  RoleMatrixEntry,
} from '../../../../../core/services/menu-option.service';

/**
 * sc-334 admin-controles-enhancements Phase 4 (D2/R2/R7) — groups
 * entries by scope for the template to iterate. Field names match
 * design D2 and spec R2 (`{ scope, roles }`).
 */
export interface RoleGroup {
  /** Scope key in the wire (matches `RoleMatrix` field names). */
  scope: 'platform' | 'organization' | 'public';
  /** Display label, Spanish domain term (F2.3 mock). */
  label: string;
  /** Roles in this scope block. */
  roles: RoleMatrixEntry[];
}

/**
 * RoleMatrixComponent — admin role × (read, write) matrix grouped by
 * three scope blocks (Plataforma / Organización / Público).
 *
 * Design D2 / spec R2/R7: layout is three stacked blocks. Each block
 * shows roles in that scope with Read + Write checkboxes. The canWrite
 * invariant (write requires read) is enforced here AND server-side
 * (422 in `setRoleAccess`).
 */
@Component({
  selector: 'app-role-matrix',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './role-matrix.component.html',
  styleUrl: './role-matrix.component.css',
})
export class RoleMatrixComponent {
  /** Role matrix from the API. Nullable: parent component may not have loaded it yet. */
  readonly matrix = input<RoleMatrix | null>(null);

  /** True while a save is in progress — disables all checkboxes. */
  readonly saving = input<boolean>(false);

  /** Emits when a role's access is toggled. */
  readonly accessChanged = output<{ roleId: string; canRead: boolean; canWrite: boolean }>();

  /** Aggregate disabled state. */
  readonly isDisabled = computed(() => this.saving());

  /**
   * Three blocks (platform / organization / public) with their roles.
   * Returns [] when matrix is null so the template can `@for` cleanly.
   */
  readonly roleGroups = computed<RoleGroup[]>(() => {
    const m = this.matrix();
    if (!m) {
      return [];
    }
    return [
      { scope: 'platform', label: 'Plataforma', roles: m.platform },
      { scope: 'organization', label: 'Organización', roles: m.organization },
      { scope: 'public', label: 'Público', roles: m.public },
    ];
  });

  /**
   * Toggle a role's access. Client-side guard: canWrite cannot be
   * set to true if canRead is false; turning canRead off forces
   * canWrite off (you can't write what you can't see).
   */
  toggleAccess(roleId: string, field: 'canRead' | 'canWrite', value: boolean): void {
    const m = this.matrix();
    if (!m) {
      return;
    }
    const allEntries = [...m.platform, ...m.organization, ...m.public];
    const entry = allEntries.find((e) => e.roleId === roleId);
    if (!entry) {
      return;
    }

    const newCanRead = field === 'canRead' ? value : entry.canRead;
    let newCanWrite = field === 'canWrite' ? value : entry.canWrite;

    // R7 invariant: turning Read off forces Write off.
    if (!newCanRead) {
      newCanWrite = false;
    }

    // R7 invariant: cannot explicitly set Write=true when Read is false.
    if (field === 'canWrite' && value && !newCanRead) {
      return;
    }

    this.accessChanged.emit({
      roleId,
      canRead: newCanRead,
      canWrite: newCanWrite,
    });
  }
}
