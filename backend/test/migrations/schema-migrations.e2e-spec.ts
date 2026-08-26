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
 * Por eso las dos fixtures se arman UNA sola vez aquí y ningún test vuelve a
 * aplicar un rango. Son dos porque el backfill condicional de 0030 tiene
 * justamente dos comportamientos que hay que distinguir:
 *
 *   - `bare`: esquema vacío + sólo 0030 → el `WHERE EXISTS (… 'incidents')`
 *     no se cumple, el backfill NO inserta nada.
 *   - `full`: 0001–0029 + 0030 → el guard se cumple y el backfill marca las
 *     29 migraciones previas.
 */
describe('T7.1.A — schema_migrations table & tracking', () => {
  let bare: MigrationHarness;
  let full: MigrationHarness;

  beforeAll(async () => {
    bare = await MigrationHarness.start();
    await bare.applyVersion('0030');

    full = await MigrationHarness.start();
    await full.applyRange({ to: '0029' });
    await full.applyVersion('0030');
  }, 240_000);

  afterAll(async () => {
    await bare?.stop();
    await full?.stop();
  }, 120_000);

  describe('T7.1.A1 — tabla schema_migrations existe y tiene estructura correcta', () => {
    it('re-aplicar 0030 no lanza (CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING)', async () => {
      await expect(bare.applyVersion('0030')).resolves.not.toThrow();
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

  describe('T7.1.A2 — backfill condicional: marca 0001–0029 si el esquema ya existe', () => {
    it('backfill NO aplica sobre base vacía', async () => {
      // El guard de 0030 es la EXISTENCIA de la tabla `incidents`, no que
      // tenga filas. En `bare` nunca se creó, así que no inserta nada.
      const rows = await bare.rows<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(rows).toHaveLength(0);
    });

    it('backfill SÍ aplica cuando la tabla incidents existe', async () => {
      const rows = await full.rows<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );

      expect(rows.map((r) => r.version)).toEqual(
        Array.from({ length: 29 }, (_, i) => String(i + 1).padStart(4, '0')),
      );
    });
  });

  describe('T7.1.A3 — semántica del checksum de las filas backfilleadas', () => {
    // Las filas que inserta el backfill NO llevan el SHA-256 del fichero:
    // 0030 escribe el literal 'backfill' a propósito, porque esas migraciones
    // se aplicaron fuera del runner y su contenido en disco puede haber
    // cambiado legítimamente desde entonces. `run-migrations.ts` reconoce ese
    // centinela y salta la validación de drift para esas versiones.
    it('las filas backfilleadas llevan el centinela "backfill", no un SHA-256', async () => {
      const rows = await full.rows<{ version: string; checksum: string }>(
        `SELECT version, checksum FROM schema_migrations
          WHERE version <= '0029' ORDER BY version`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.checksum.trim()).toBe('backfill');
      }
    });

    it('el centinela es distinguible de un SHA-256 real del mismo fichero', async () => {
      const migration = listMigrations()[0]; // 0001

      const [stored] = await full.rows<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [migration.version],
      );

      const computed = checksumOf(migration);

      expect(computed).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.checksum.trim()).not.toBe(computed);
    });
  });

  describe('T7.1.A4 — inserción idempotente con ON CONFLICT DO NOTHING', () => {
    it('re-aplicar 0030 no duplica filas', async () => {
      const [before] = await full.rows<{ count: string }>(
        'SELECT COUNT(*) AS count FROM schema_migrations',
      );

      await full.applyVersion('0030');

      const [after] = await full.rows<{ count: string }>(
        'SELECT COUNT(*) AS count FROM schema_migrations',
      );

      expect(after.count).toBe(before.count);
    });
  });

  describe('T7.1.A5 — 0030 marca 0001–0029 pero no se registra a sí misma', () => {
    it('quedan exactamente 29 filas y ninguna es 0030', async () => {
      const rows = await full.rows<{ version: string }>('SELECT version FROM schema_migrations');

      // 0030 registra el rango 0001–0029; su propia fila la escribe el runner
      // (`run-migrations.ts`), no el fichero de migración.
      expect(rows).toHaveLength(29);
      expect(rows.map((r) => r.version)).not.toContain('0030');
    });
  });
});
