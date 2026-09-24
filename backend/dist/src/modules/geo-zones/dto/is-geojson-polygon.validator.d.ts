import { ValidationArguments, ValidationOptions, ValidatorConstraintInterface } from 'class-validator';
export declare class IsGeoJsonPolygonConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean;
    defaultMessage(_args: ValidationArguments): string;
}
export declare function IsGeoJsonPolygon(validationOptions?: ValidationOptions): (object: object, propertyName: string) => void;
