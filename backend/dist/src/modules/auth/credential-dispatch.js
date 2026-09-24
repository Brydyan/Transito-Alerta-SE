"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCredential = resolveCredential;
const common_1 = require("@nestjs/common");
const auth_errors_1 = require("./auth-errors");
function resolveCredential(dto) {
    const hasDevice = !!dto.device_uuid;
    const hasEmail = !!dto.email;
    const hasPassword = !!dto.password;
    const hasPasswordShape = hasEmail || hasPassword;
    if (hasDevice && hasPasswordShape) {
        throw shapeError();
    }
    if (hasDevice) {
        return { kind: 'device', deviceUuid: dto.device_uuid };
    }
    if (hasEmail && hasPassword) {
        return {
            kind: 'password',
            email: dto.email,
            password: dto.password,
            deviceUuid: dto.device_uuid ?? null,
        };
    }
    throw shapeError();
}
function shapeError() {
    return new common_1.BadRequestException({
        code: auth_errors_1.INVALID_CREDENTIAL_SHAPE,
        message: 'Provide exactly one of { device_uuid } or { email, password }',
    });
}
//# sourceMappingURL=credential-dispatch.js.map