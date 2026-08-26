#!/usr/bin/env ts-node

/**
 * T7.1 Fase B — CLI runner que valida migraciones aplicadas y detecta drift.
 *
 * Uso:
 *   npx ts-node scripts/run-migrations.ts [--status|--list|--version|--down]
 *
 * Modos:
 *   (default) — Valida que schema_migrations exista y que todos los checksums
 *              coincidan. EXIT 0 si OK, EXIT 1 si drift o prerequisitos faltan.
 *              NO APLICA NADA (es read-only).
 *   --status   — Muestra tabla de estado (versión, nombre, status, timestamp)
 *   --list     — Lista todas las migraciones disponibles en disco
 *   --version  — Muestra versión del runner (1.0.0)
 *   --down --to <version> — Revierte migraciones hasta <version> (inclusive)
 *
 * Validaciones:
 * - Requiere que schema_migrations tabla exista (0030 debe estar aplicada)
 * - Checksum mismatch = error operativo (archivo editado post-aplicación)
 * - Si migration pendiente la aplica (0030–0039 nuevas), pero no aquí en D7.1
 *
 * Exit codes:
 *   0 — Todo OK
 *   1 — Drift, prerequisito faltante, o error de conexión BD
 *   127 — Comando no soportado (ej. --unknown)
 */

import { Client } from 'pg';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { listMigrations, checksumOf, type MigrationFile } from './lib/migration-files';

async function main() {
  const args = process.argv.slice(2);
  const flag = args[0];

  try {
    // Determinar modo de operación
    if (flag === '--version') {
      console.log('run-migrations 1.0.0');
      process.exit(0);
    }

    if (flag === '--list') {
      printList();
      process.exit(0);
    }

    // Connect to DB (required for --status, --down y validación)
    const client = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'transito_alerta'}`,
    });

    await client.connect();

    try {
      // Prerequisito: schema_migrations debe existir (0030 aplicada)
      const tableExists = await checkTableExists(client, 'schema_migrations');
      if (!tableExists) {
        console.error(
          'ERROR: schema_migrations table does not exist.\n' +
            'Prerequisite: migration 0030 must be applied first.\n' +
            'Apply manually or run the bootstrap process.',
        );
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

      // Default: validar integridad (checksums)
      await validateMigrations(client);
      process.exit(0);
    } finally {
      await client.end();
    }
  } catch (error) {
    console.error('ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Valida que cada migración aplicada tenga checksum intacto.
 * Detecta ediciones post-aplicación.
 */
async function validateMigrations(client: Client): Promise<void> {
  const migrations = listMigrations();

  let errors = 0;

  for (const migration of migrations) {
    // Buscar en schema_migrations
    const result = await client.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE version = $1',
      [migration.version],
    );

    if (result.rows.length === 0) {
      // No aplicada aún, OK
      continue;
    }

    const storedChecksum = result.rows[0].checksum;

    // Backfill usa checksum literal 'backfill', saltar validación
    if (storedChecksum === 'backfill') {
      continue;
    }

    const actualChecksum = checksumOf(migration);

    if (storedChecksum !== actualChecksum) {
      console.error(
        `DRIFT DETECTED: ${migration.version}_${migration.name}.sql\n` +
          `  Stored:  ${storedChecksum}\n` +
          `  Actual:  ${actualChecksum}\n` +
          `  File was edited after application. Restore from git or revert changes.`,
      );
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} checksum mismatches found.`);
    throw new Error('Validation failed');
  } else {
    console.log('✅ All checksums valid.');
  }
}

/**
 * Muestra tabla de estado de cada migración.
 */
async function printStatus(client: Client): Promise<void> {
  const migrations = listMigrations();
  const applied = await client.query<{ version: string; name: string; applied_at: string }>(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
  );

  const appliedMap = new Map(applied.rows.map((r) => [r.version, r.applied_at]));

  console.log(
    'Version  Name                             Status           Applied At\n' +
      '-------  -------------------------------- ---------------  --------------------',
  );

  for (const m of migrations) {
    const timestamp = appliedMap.get(m.version);
    const status = timestamp
      ? timestamp === 'backfill'
        ? '[backfill]'
        : '✅ applied'
      : '⏳ pending';
    const appliedAt = timestamp && timestamp !== 'backfill' ? timestamp.substring(0, 19) : 'N/A';

    console.log(`${m.version}  ${m.name.padEnd(32)}  ${status.padEnd(14)}  ${appliedAt}`);
  }
}

/**
 * Lista todas las migraciones disponibles.
 */
function printList(): void {
  const migrations = listMigrations();

  console.log(
    'Version  Name                             File\n' +
      '-------  -------------------------------- -----------------------------------------',
  );

  for (const m of migrations) {
    const checksum = checksumOf(m);
    console.log(`${m.version}  ${m.name.padEnd(32)}  ${m.fileName}`);
    console.log(`         SHA-256: ${checksum}`);
  }
}

/**
 * Verifica si una tabla existe en public schema.
 */
async function checkTableExists(client: Client, tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );

  return result.rows[0]?.exists ?? false;
}

/**
 * Revierte migraciones hasta la versión especificada (inclusive).
 * Lee los archivos .DOWN.sql en orden inverso, ejecuta cada uno, y elimina la fila de schema_migrations.
 */
async function rolldownMigrations(client: Client, targetVersion: string): Promise<void> {
  const migrations = listMigrations();
  const appliedResult = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC',
  );
  const applied = new Set(appliedResult.rows.map((r) => r.version));

  // Filtrar migraciones aplicadas que están por encima del target (en orden inverso)
  const toRollback = migrations
    .filter((m) => applied.has(m.version) && m.version > targetVersion)
    .reverse();

  if (toRollback.length === 0) {
    console.log(`✅ Already at or before version ${targetVersion}.`);
    return;
  }

  console.log(`Rolling back ${toRollback.length} migration(s)...`);

  for (const migration of toRollback) {
    const downFile = resolve(
      __dirname,
      '..',
      'database',
      'rollback',
      `${migration.version}_${migration.name}.DOWN.sql`,
    );

    if (!existsSync(downFile)) {
      throw new Error(`Rollback file not found: ${downFile}`);
    }

    const sql = readFileSync(downFile, 'utf8');

    console.log(`  Rolling back ${migration.version}_${migration.name}...`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `Rollback failed for ${migration.version}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`✅ Rolled back to ${targetVersion}.`);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
