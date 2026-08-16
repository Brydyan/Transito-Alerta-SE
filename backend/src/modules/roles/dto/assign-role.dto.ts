import { IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  user_id!: string;
}
