import { IsString, MinLength } from 'class-validator';

// See accept-invitation.dto.ts for why this is a literal, not AuthConfig-driven.
const PASSWORD_MIN_LENGTH = 12;

export class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  new_password!: string;
}
