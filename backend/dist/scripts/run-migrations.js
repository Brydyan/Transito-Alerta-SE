#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs_1 = require("fs");
const path_1 = require("path");
const migration_files_1 = require("./lib/migration-files");
async function main() {
    const args = process.argv.slice(2);
    const flag = args[0];
    try {
        if (flag === '--version') {
            console.log('run-migrations 1.0.0');
            process.exit(0);
        }
        if (flag === '--list') {
            printList();
            process.exit(0);
        }
        const client = new pg_1.Client({
            connectionString: process.env.DATABASE_URL ||
                `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'transito_alerta'}`,
        });
        await client.connect();
        try {
            const tableExists = await checkTableExists(client, 'schema_migrations');
            if (!tableExists) {
                console.error('ERROR: schema_migrations table does not exist.\n' +
                    'Prerequisite: migration 0030 must be applied first.\n' +
                    'Apply manually or run the bootstrap process.');
                process.exit(1);
            }
            if (flag === '--status') {
                await printStatus(client);
                process.exit(0);
            }
            if (flag === '--down') {
                const toVersion = args[1];
                if (!toVersion || args[2] !== undefined || !args[1].match(/^\d{4}$/)) {
                    console.error('ERROR: Usage: --down <version> (e.g. --down 0035)');
                    process.exit(1);
                }
                await rolldownMigrations(client, toVersion);
                process.exit(0);
            }
            await validateMigrations(client);
            process.exit(0);
        }
        finally {
            await client.end();
        }
    }
    catch (error) {
        console.error('ERROR:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
async function validateMigrations(client) {
    const migrations = (0, migration_files_1.listMigrations)();
    let errors = 0;
    for (const migration of migrations) {
        const result = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [migration.version]);
        if (result.rows.length === 0) {
            continue;
        }
        const storedChecksum = result.rows[0].checksum;
        const literal = storedChecksum.trim();
        if (literal === 'backfill' || literal === 'manual') {
            continue;
        }
        const actualChecksum = (0, migration_files_1.checksumOf)(migration);
        if (storedChecksum !== actualChecksum) {
            console.error(`DRIFT DETECTED: ${migration.version}_${migration.name}.sql\n` +
                `  Stored:  ${storedChecksum}\n` +
                `  Actual:  ${actualChecksum}\n` +
                `  File was edited after application. Restore from git or revert changes.`);
            errors++;
        }
    }
    if (errors > 0) {
        console.error(`\n${errors} checksum mismatches found.`);
        throw new Error('Validation failed');
    }
    else {
        console.log('✅ All checksums valid.');
    }
}
async function printStatus(client) {
    const migrations = (0, migration_files_1.listMigrations)();
    const applied = await client.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
    const appliedMap = new Map(applied.rows.map((r) => [r.version, r]));
    console.log('Version  Name                             Status           Applied At\n' +
        '-------  -------------------------------- ---------------  --------------------');
    for (const m of migrations) {
        const row = appliedMap.get(m.version);
        const status = row
            ? row.checksum.trim() === 'backfill'
                ? '[backfill]'
                : '✅ applied'
            : '⏳ pending';
        const appliedAt = row
            ? row.checksum.trim() === 'backfill'
                ? 'N/A'
                : new Date(row.applied_at).toISOString().substring(0, 19).replace('T', ' ')
            : 'N/A';
        console.log(`${m.version}  ${m.name.padEnd(32)}  ${status.padEnd(14)}  ${appliedAt}`);
    }
}
function printList() {
    const migrations = (0, migration_files_1.listMigrations)();
    console.log('Version  Name                             File\n' +
        '-------  -------------------------------- -----------------------------------------');
    for (const m of migrations) {
        const checksum = (0, migration_files_1.checksumOf)(m);
        console.log(`${m.version}  ${m.name.padEnd(32)}  ${m.fileName}`);
        console.log(`         SHA-256: ${checksum}`);
    }
}
async function checkTableExists(client, tableName) {
    const result = await client.query(`SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`, [tableName]);
    return result.rows[0]?.exists ?? false;
}
async function rolldownMigrations(client, targetVersion) {
    const migrations = (0, migration_files_1.listMigrations)();
    const appliedResult = await client.query('SELECT version FROM schema_migrations ORDER BY version DESC');
    const applied = new Set(appliedResult.rows.map((r) => r.version));
    const toRollback = migrations
        .filter((m) => applied.has(m.version) && m.version > targetVersion)
        .reverse();
    if (toRollback.length === 0) {
        console.log(`✅ Already at or before version ${targetVersion}.`);
        return;
    }
    console.log(`Rolling back ${toRollback.length} migration(s)...`);
    for (const migration of toRollback) {
        const downFile = (0, path_1.resolve)(__dirname, '../..', 'database', 'rollback', `${migration.version}_${migration.name}.DOWN.sql`);
        if (!(0, fs_1.existsSync)(downFile)) {
            throw new Error(`Rollback file not found: ${downFile}`);
        }
        const sql = (0, fs_1.readFileSync)(downFile, 'utf8');
        console.log(`  Rolling back ${migration.version}_${migration.name}...`);
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Rollback failed for ${migration.version}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    console.log(`✅ Rolled back to ${targetVersion}.`);
}
main().catch((error) => {
    console.error('FATAL:', error);
    process.exit(1);
});
//# sourceMappingURL=run-migrations.js.map