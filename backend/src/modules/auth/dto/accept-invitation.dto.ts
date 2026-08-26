import { IsOptional, IsString, MinLength } from 'class-validator';

// T3.6 task 5.2 — password floor pinned at 12 (spec: "a length floor").
// Kept as a literal, not read from AuthConfig, because class-validator
// decorators run at class-definition (import) time, before any
// ConfigService instance exists — the same constraint every other DTO in
// this codebase already lives with.
const PASSWORD_MIN_LENGTH = 12;

export class AcceptInvitationDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password!: string;

  /** T6.5 — optional: if present, writes termsAcceptedAt + termsVersion to the user row. */
  @IsOptional()
  @IsString()
  terms_version?: string;
}
