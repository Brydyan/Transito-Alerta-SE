import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface CredentialShapeCandidate {
  device_uuid?: unknown;
  email?: unknown;
  password?: unknown;
}

/**
 * Cross-field constraint (T3.6 design D2) — class-validator has no native
 * union-body validation, so this is the house-compatible way to require
 * "exactly one of `{device_uuid}` or `{email,password}`" on a single DTO
 * class with three optional fields (precedent: `IsGeoJsonPolygon`'s
 * `ValidatorConstraint` pattern). Attached to `device_uuid` as an anchor
 * property, but reads the WHOLE object via `args.object` — the standard
 * class-validator technique for cross-field checks.
 *
 * `{device_uuid}` alone MUST remain valid — every one of the 122
 * pre-existing e2e tests sends exactly that shape (design D2).
 *
 * This is defense-in-depth at the `ValidationPipe` layer; `resolveCredential`
 * (`credential-dispatch.ts`) re-checks the identical shape independently
 * and is the sole source of the typed `Credential` + the `{ code:
 * 'INVALID_CREDENTIAL_SHAPE' }` body the rest of the app's error
 * convention expects.
 */
@ValidatorConstraint({ name: 'exactlyOneCredential', async: false })
export class ExactlyOneCredentialConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CredentialShapeCandidate;
    const hasDevice = !!obj.device_uuid;
    const hasEmail = !!obj.email;
    const hasPassword = !!obj.password;
    const hasPasswordShape = hasEmail || hasPassword;

    if (hasDevice && hasPasswordShape) {
      return false;
    }
    if (hasDevice) {
      return true;
    }
    return hasEmail && hasPassword;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'INVALID_CREDENTIAL_SHAPE';
  }
}

export function ExactlyOneCredential(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: ExactlyOneCredentialConstraint,
    });
  };
}
