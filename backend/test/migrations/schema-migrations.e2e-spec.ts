import { MigrationHarness } from '../support/migration-harness';
import { checksumOf, listMigrations } from '../../scripts/lib/migration-files';

/**
 * T7.1 Fase A — tests de tracking de migraciones.
 *
 * `MigrationHarness.start()` levanta un contenedor Postgres nuevo en cada
 * llamada, así que cada fixture es una base realmente aislada. Eso importa:
 * `applyRange` ejecuta los ficheros tal cual, sin consultar
 * `schema_migrations`, de modo que volver a aplicar un rango sobre la misma
 * conexión revienta (`constraint "fk_organizations_zone" ... already exists`)
 * y deja la transacción abortada, arrastrando en cascada a todo lo que venga
 * después.
 *
 * Por eso la fixture se arma UNA sola vez aquí y ningún test vuelve a
 * aplicar un rango.
 *
 * `bare`: 0001–0020 + 0021 → el guard `WHERE EXISTS (… 'incidents')` SÍ
 * se cumple (incidents existe desde 0004) y el backfill marca las 20
 * migraciones previas.
 *
 * Nota: 0021 requiere que 0001–0020 ya existan en la base (crea comment_images
 * con FK a comments de 0005, entre otras dependencias). No puede aplicarse
 * sobre una base completamente vacía.
 *
 * Nota sobre la consolidación: en la cadena consolidada (0001–0031), 0021 es
 * quien crea schema_migrations y hace el backfill de 0001–0020. Ya no existe
 * un paso final que backfille 0001–0029 como hacía el antiguo 0030; el runner
 * (`run-migrations.ts`) registra cada versión cuando la aplica.
 */
describe('T7.1.A — schema_migrations table & tracking', () => {
  let bare: MigrationHarness;

  beforeAll(async () => {
    bare = await MigrationHarness.start();
    await bare.applyRange({ to: '0020' });
    await bare.applyVersion('0021');
  }, 240_000);

  afterAll(async () => {
    await bare?.stop();
  }, 120_000);

  describe('T7.1.A1 — tabla schema_migrations existe y tiene estructura correcta', () => {
    it('re-aplicar 0021 no lanza (CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING)', async () => {
      await expect(bare.applyVersion('0021')).resolves.not.toThrow();
    });

    it('schema_migrations existe con columnas version, name, checksum, applied_at', async () => {
      expect(await bare.tableExists('schema_migrations')).toBe(true);

      expect(await bare.columnExists('schema_migrations', 'version')).toBe(true);
      expect(await bare.columnExists('schema_migrations', 'name')).toBe(true);
      expect(await bare.columnExists('schema_migrations', 'checksum')).toBe(true);
      expect(await bare.columnExists('schema_migrations', 'applied_at')).toBe(true);
    });

    it('version es primary key', async () => {
      const rows = await bare.rows<{ constraint_name: string }>(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = 'public' AND table_name = 'schema_migrations'
           AND constraint_type = 'PRIMARY KEY'`,
      );

      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('T7.1.A2 — backfill condicional: marca migraciones previas si el esquema ya existe', () => {
    it('backfill SÍ aplica en bare (incidents existe desde 0004) y marca 0001–0020', async () => {
      // El guard de 0021 es la EXISTENCIA de la tabla `incidents`. En `bare`
      // se aplicaron 0001–0020 antes de 0021, así que incidents existe y el
      // backfill inserta las 20 migraciones previas.
      const rows = await bare.rows<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(rows.map((r) => r.version)).toEqual(
        Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(4, '0')),
      );
    });
  });

  describe('T7.1.A3 — semántica del checksum de las filas backfilleadas', () => {
    // Las filas que inserta el backfill NO llevan el SHA-256 del fichero:
    // 0021 escribe el literal 'backfill' a propósito, porque esas migraciones
    // se aplicaron fuera del runner y su contenido en disco puede haber
    // cambiado legítimamente desde entonces. `run-migrations.ts` reconoce ese
    // centinela y salta la validación de drift para esas versiones.
    it('las filas backfilleadas llevan el centinela "backfill", no un SHA-256', async () => {
      const rows = await bare.rows<{ version: string; checksum: string }>(
        `SELECT version, checksum FROM schema_migrations
          WHERE version <= '0020' ORDER BY version`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.checksum.trim()).toBe('backfill');
      }
    });

    it('el centinela es distinguible de un SHA-256 real del mismo fichero', async () => {
      const migration = listMigrations()[0]; // 0001

      const [stored] = await bare.rows<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [migration.version],
      );

      const computed = checksumOf(migration);

      expect(computed).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.checksum.trim()).not.toBe(computed);
    });
  });

  describe('T7.1.A4 — inserción idempotente con ON CONFLICT DO NOTHING', () => {
    it('re-aplicar 0021 no duplica filas', async () => {
      const [before] = await bare.rows<{ count: string }>(
        'SELECT COUNT(*) AS count FROM schema_migrations',
      );

      await bare.applyVersion('0021');

      const [after] = await bare.rows<{ count: string }>(
        'SELECT COUNT(*) AS count FROM schema_migrations',
      );

      expect(after.count).toBe(before.count);
    });
  });

  describe('T7.1.A5 — 0021 marca 0001–0020 pero no se registra a sí misma', () => {
    it('quedan exactamente 20 filas y ninguna es 0021', async () => {
      const rows = await bare.rows<{ version: string }>('SELECT version FROM schema_migrations');

      // 0021 registra el rango 0001–0020; su propia fila la escribe el runner
      // (`run-migrations.ts`), no el fichero de migración.
      expect(rows).toHaveLength(20);
      expect(rows.map((r) => r.version)).not.toContain('0021');
    });
  });
});
