"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSnakeCase = toSnakeCase;
exports.toSnakeCaseKeys = toSnakeCaseKeys;
function toSnakeCase(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}
function toSnakeCaseKeys(value) {
    if (Array.isArray(value)) {
        return value.map(toSnakeCaseKeys);
    }
    if (value === null || typeof value !== 'object' || isValueObject(value)) {
        return value;
    }
    return Object.entries(value).reduce((acc, [key, val]) => {
        acc[toSnakeCase(key)] = toSnakeCaseKeys(val);
        return acc;
    }, {});
}
function isValueObject(value) {
    return (value instanceof Date ||
        value instanceof RegExp ||
        value instanceof Map ||
        value instanceof Set ||
        Buffer.isBuffer(value));
}
//# sourceMappingURL=snake-case.js.map