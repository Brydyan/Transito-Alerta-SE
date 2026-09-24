"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLLBACK_DIR = exports.MIGRATIONS_DIR = void 0;
exports.listMigrations = listMigrations;
exports.rollbackPathFor = rollbackPathFor;
exports.checksumOf = checksumOf;
exports.readSql = readSql;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const REPO_ROOT = (0, path_1.join)(__dirname, '../../..');
exports.MIGRATIONS_DIR = (0, path_1.join)(REPO_ROOT, 'database/migrations');
exports.ROLLBACK_DIR = (0, path_1.join)(REPO_ROOT, 'database/rollback');
const MIGRATION_FILE_RE = /^([0-9]+)_(.+)\.sql$/;
function listMigrations(dir = exports.MIGRATIONS_DIR) {
    return (0, fs_1.readdirSync)(dir)
        .filter((fileName) => MIGRATION_FILE_RE.test(fileName))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((fileName) => {
        const [, version, name] = MIGRATION_FILE_RE.exec(fileName);
        return { version, name, fileName, path: (0, path_1.join)(dir, fileName) };
    });
}
function rollbackPathFor(migration, dir = exports.ROLLBACK_DIR) {
    const path = (0, path_1.join)(dir, `${migration.version}_${migration.name}.DOWN.sql`);
    return (0, fs_1.existsSync)(path) ? path : null;
}
function checksumOf(migration) {
    return (0, crypto_1.createHash)('sha256').update((0, fs_1.readFileSync)(migration.path)).digest('hex');
}
function readSql(migration) {
    return (0, fs_1.readFileSync)(migration.path, 'utf8');
}
//# sourceMappingURL=migration-files.js.map