import { BadRequestException } from '@nestjs/common';

import { INVALID_CREDENTIAL_SHAPE } from './auth-errors';
import { LoginDto } from './dto/login.dto';

export type Credential =
  | { kind: 'device'; deviceUuid: string }
  | { kind: 'password'; email: string; password: string; deviceUuid: string | null };

/**
 * `resolveCredential` (T3.6 design D1/D2) — pure, table-testable. Dispatch
 * lives in the controller via this function, not in `AuthService`'s
 * signature, so the device path's diff stays "the tail moved into a
 * private method" (design D1).
 *
 * Exactly one of `{device_uuid}` / `{email,password}` must be present;
 * zero or both throw `400 INVALID_CREDENTIAL_SHAPE`. `email` alone or
 * `password` alone (without the other) is treated as "password shape
 * incomplete" — also 400, not a silent fallback to device.
 */
export function resolveCredential(dto: LoginDto): Credential {
  const hasDevice = !!dto.device_uuid;
  const hasEmail = !!dto.email;
  const hasPassword = !!dto.password;
  const hasPasswordShape = hasEmail || hasPassword;

  if (hasDevice && hasPasswordShape) {
    throw shapeError();
  }
  if (hasDevice) {
    return { kind: 'device', deviceUuid: dto.device_uuid! };
  }
  if (hasEmail && hasPassword) {
    return {
      kind: 'password',
      email: dto.email!,
      password: dto.password!,
      deviceUuid: dto.device_uuid ?? null,
    };
  }
  throw shapeError();
}

function shapeError(): BadRequestException {
  return new BadRequestException({
    code: INVALID_CREDENTIAL_SHAPE,
    message: 'Provide exactly one of { device_uuid } or { email, password }',
  });
}
