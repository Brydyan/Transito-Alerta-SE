"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExactlyOneCredentialConstraint = void 0;
exports.ExactlyOneCredential = ExactlyOneCredential;
const class_validator_1 = require("class-validator");
let ExactlyOneCredentialConstraint = class ExactlyOneCredentialConstraint {
    validate(_value, args) {
        const obj = args.object;
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
    defaultMessage(_args) {
        return 'INVALID_CREDENTIAL_SHAPE';
    }
};
exports.ExactlyOneCredentialConstraint = ExactlyOneCredentialConstraint;
exports.ExactlyOneCredentialConstraint = ExactlyOneCredentialConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'exactlyOneCredential', async: false })
], ExactlyOneCredentialConstraint);
function ExactlyOneCredential(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            target: object.constructor,
            propertyName,
            options: validationOptions,
            constraints: [],
            validator: ExactlyOneCredentialConstraint,
        });
    };
}
//# sourceMappingURL=exactly-one-credential.validator.js.map