"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hex = sha256Hex;
exports.timingSafeEqualHex = timingSafeEqualHex;
const crypto_1 = require("crypto");
function sha256Hex(token) {
    return (0, crypto_1.createHash)('sha256').update(token, 'utf8').digest('hex');
}
function timingSafeEqualHex(a, b) {
    if (a === null || b === null) {
        return false;
    }
    const bufferA = Buffer.from(a, 'hex');
    const bufferB = Buffer.from(b, 'hex');
    if (bufferA.length !== bufferB.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(bufferA, bufferB);
}
//# sourceMappingURL=session-hash.js.map