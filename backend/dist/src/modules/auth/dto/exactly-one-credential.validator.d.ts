import { ValidationArguments, ValidationOptions, ValidatorConstraintInterface } from 'class-validator';
export declare class ExactlyOneCredentialConstraint implements ValidatorConstraintInterface {
    validate(_value: unknown, args: ValidationArguments): boolean;
    defaultMessage(_args: ValidationArguments): string;
}
export declare function ExactlyOneCredential(validationOptions?: ValidationOptions): (object: object, propertyName: string) => void;
