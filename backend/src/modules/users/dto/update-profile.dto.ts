import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** T7.6 (0035) — E.164-ish: optional leading '+', 7-15 digits, matches `users.phone varchar(30)`. */
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone?: string;
}
