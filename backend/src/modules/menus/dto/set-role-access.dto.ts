import { IsBoolean } from 'class-validator';

/**
 * DTO for PUT /api/menu-options/:id/roles/:roleId — set access for a role.
 * Validations enforced by service (F5.5.1):
 *   - can_write without can_read ⇒ 422
 */
export class SetRoleAccessDto {
  @IsBoolean()
  canRead!: boolean;

  @IsBoolean()
  canWrite!: boolean;
}
