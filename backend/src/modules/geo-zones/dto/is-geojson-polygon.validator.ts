import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Custom class-validator constraint (T3.8 design D7) instead of
 * `@ValidateNested()` + a `GeoJsonPolygonDto` class: with the global
 * `ValidationPipe` whitelist, a nested *class* would strip anything not
 * decorated — and `coordinates` is an arbitrarily deep raw array no DTO
 * class can usefully model. Keeping it a plain object means the payload
 * reaches PostGIS byte-identical.
 *
 * Only checks shape: `type` is Polygon/MultiPolygon and `coordinates` is a
 * non-empty array. Depth/winding/self-intersection is PostGIS's job
 * (ST_IsValid) — duplicating it here would be a second, drifting
 * implementation.
 */
@ValidatorConstraint({ name: 'isGeoJsonPolygon', async: false })
export class IsGeoJsonPolygonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }
    const candidate = value as { type?: unknown; coordinates?: unknown };
    if (candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') {
      return false;
    }
    return Array.isArray(candidate.coordinates) && candidate.coordinates.length > 0;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'polygon must be a GeoJSON Polygon or MultiPolygon object';
  }
}

export function IsGeoJsonPolygon(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsGeoJsonPolygonConstraint,
    });
  };
}
