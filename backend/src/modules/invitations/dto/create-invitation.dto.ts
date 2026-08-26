import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsUUID()
  role_id!: string;

  @IsOptional()
  @IsUUID()
  organization_id?: string;
}
