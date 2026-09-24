"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.decodeTokenOrThrow = decodeTokenOrThrow;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const auth_errors_1 = require("./auth-errors");
const TOKEN_BYTES = 32;
function generateToken() {
    return (0, crypto_1.randomBytes)(TOKEN_BYTES).toString('base64url');
}
function decodeTokenOrThrow(token) {
    if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token)) {
        throw new common_1.BadRequestException({ code: auth_errors_1.INVALID_TOKEN, message: 'Malformed token' });
    }
    let decoded;
    try {
        decoded = Buffer.from(token, 'base64url');
    }
    catch {
        throw new common_1.BadRequestException({ code: auth_errors_1.INVALID_TOKEN, message: 'Malformed token' });
    }
    if (decoded.length !== TOKEN_BYTES) {
        throw new common_1.BadRequestException({ code: auth_errors_1.INVALID_TOKEN, message: 'Malformed token' });
    }
    return token;
}
//# sourceMappingURL=token-codec.js.map