import { IsEmail, IsOptional, IsString } from 'class-validator';

import { ExactlyOneCredential } from './exactly-one-credential.validator';

/**
 * T3.6 design D2 — one class, three optional fields. `{device_uuid}` alone
 * MUST remain valid (every pre-existing e2e test sends exactly that
 * shape); `{email,password}` alone is the new password-login shape. Zero
 * or both credential shapes are rejected by `@ExactlyOneCredential()`.
 *
 * `@ExactlyOneCredential()` is attached to a dedicated, always-undefined
 * `_credentialShape` pseudo-property rather than to `device_uuid` directly
 * — chaining it after `@IsOptional()` on a real field would make
 * class-validator SKIP the cross-field check whenever that exact field is
 * absent (e.g. every password login), which is precisely the case this
 * constraint must still run for. `_credentialShape` carries no
 * `@IsOptional()`, so it is always validated regardless of which shape was
 * sent. See `credential-dispatch.ts` for the runtime dispatch that mirrors
 * this same rule.
 */
export class LoginDto {
  @IsOptional()
  @IsString()
  device_uuid?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @ExactlyOneCredential()
  readonly _credentialShape?: never;
}
